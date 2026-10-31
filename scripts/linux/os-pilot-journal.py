#!/usr/bin/env python3
"""Root-only append-only pilot state. Never resumes effects or deletes a partial journal."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat

STAGES=('created','claim_requested','claimed','intent_requested','intent_recorded','delegation_requested','delegation_prepared',
        'accept_requested','accepted','host_requested','host_observed','result_requested','result_recorded','release_requested','released')
UUID=re.compile('[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=True).encode('ascii')
def positive(value):return type(value) is int and 0<value<2147483647
def validate_bootstrap(value):
    keys={'format','jobId','trialId','intentId','expectedJobRevision','leaseToken','delegationToken'}
    if type(value) is not dict or set(value)!=keys or value['format']!='infraflow-os-pilot-v1':raise ValueError('journal_bootstrap_refused')
    for key in ('jobId','trialId','intentId'):
        if type(value[key]) is not str or not UUID.fullmatch(value[key]):raise ValueError('journal_bootstrap_refused')
    if type(value['expectedJobRevision']) is not int or not 0<=value['expectedJobRevision']<=2147483643:raise ValueError('journal_bootstrap_refused')
    for key in ('leaseToken','delegationToken'):
        if type(value[key]) is not str or not re.fullmatch('[0-9a-f]{64}',value[key]):raise ValueError('journal_bootstrap_refused')
    if value['leaseToken']==value['delegationToken']:raise ValueError('journal_bootstrap_refused')
    return dict(value)

def event(previous,stage,details,bootstrap_hash='0'*64):
    if type(bootstrap_hash) is not str or not re.fullmatch('[0-9a-f]{64}',bootstrap_hash):raise ValueError('journal_binding_refused')
    last=previous['stage'] if previous else None
    if stage=='review_required':
        if last in (None,'review_required','released'):raise ValueError('journal_transition_refused')
    elif stage not in STAGES or (STAGES.index(stage)!=(STAGES.index(last)+1 if last in STAGES else 0)) or last=='review_required':
        raise ValueError('journal_transition_refused')
    expected={'claimed':{'generation','jobRevision'},'host_observed':{'uid','gid'},'released':{'jobRevision'},'review_required':{'failedStage'}}.get(stage,set())
    if type(details) is not dict or set(details)!=expected:raise ValueError('journal_details_refused')
    for key,value in details.items():
        if key=='failedStage':
            if value not in STAGES:raise ValueError('journal_details_refused')
        elif not positive(value):raise ValueError('journal_details_refused')
    record={'sequence':previous['sequence']+1 if previous else 1,'stage':stage,'details':dict(details),
            'previousHash':previous['eventHash'] if previous else bootstrap_hash}
    record['eventHash']=hashlib.sha256(canonical(record)).hexdigest()
    return record

def safe_directory(path,private=False):
    if os.name!='posix' or os.geteuid()!=0 or os.getegid()!=0:raise RuntimeError('root_posix_required')
    for item in (path,*path.parents):
        s=item.lstat()
        if not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('journal_path_refused')
    if private:
        s=path.lstat()
        if s.st_gid!=0 or stat.S_IMODE(s.st_mode)!=0o700:raise RuntimeError('journal_path_refused')

def write_exclusive(directory,name,value):
    if name!='bootstrap.json' and (type(name) is not str or not re.fullmatch(r'[0-9]{6}\.json',name)):raise RuntimeError('journal_filename_refused')
    safe_directory(directory,True)
    raw=canonical(value)
    if len(raw)>4096:raise RuntimeError('journal_payload_refused')
    fd=os.open(directory/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_CLOEXEC,0o600)
    with os.fdopen(fd,'wb') as stream:
        os.fchown(stream.fileno(),0,0);os.fchmod(stream.fileno(),0o600)
        stream.write(raw);stream.flush();os.fsync(stream.fileno())
    d=os.open(directory,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:os.fsync(d)
    finally:os.close(d)

def read_private(directory,name):
    if name!='bootstrap.json' and (type(name) is not str or not re.fullmatch(r'[0-9]{6}\.json',name)):raise RuntimeError('journal_filename_refused')
    safe_directory(directory,True)
    fd=os.open(directory/name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC)
    try:
        s=os.fstat(fd)
        if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_gid!=0 or s.st_nlink!=1 or stat.S_IMODE(s.st_mode)!=0o600 or not 1<=s.st_size<=4096:
            raise RuntimeError('journal_file_refused')
        with os.fdopen(fd,'rb',closefd=False) as stream:raw=stream.read(4097)
        value=json.loads(raw)
        if raw!=canonical(value):raise RuntimeError('journal_file_refused')
        return value
    finally:os.close(fd)

class Journal:
    def __init__(self,directory,previous,bootstrap_hash):self.directory=directory;self.previous=previous;self.bootstrap_hash=bootstrap_hash;self.broken=False
    def append(self,stage,details=None):
        if self.broken:raise RuntimeError('journal_unconfirmed')
        try:
            if hashlib.sha256(canonical(read_private(self.directory,'bootstrap.json'))).hexdigest()!=self.bootstrap_hash:raise RuntimeError('journal_binding_refused')
            if self.previous is not None and canonical(read_private(self.directory,f"{self.previous['sequence']:06d}.json"))!=canonical(self.previous):raise RuntimeError('journal_chain_refused')
            value=event(self.previous,stage,{} if details is None else details,self.bootstrap_hash)
            write_exclusive(self.directory,f"{value['sequence']:06d}.json",value)
            self.previous=value
        except Exception:
            self.broken=True;raise RuntimeError('journal_unconfirmed') from None

def create_new_journal(parent,bootstrap):
    value=validate_bootstrap(bootstrap);safe_directory(parent,True)
    directory=parent/value['jobId']
    directory.mkdir(mode=0o700) # Existing/partial/completed job always requires review.
    os.chown(directory,0,0);os.chmod(directory,0o700)
    d=os.open(parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:os.fsync(d)
    finally:os.close(d)
    write_exclusive(directory,'bootstrap.json',value)
    journal=Journal(directory,None,hashlib.sha256(canonical(value)).hexdigest());journal.append('created');return journal

def inspect_for_review(parent,job_id):
    if type(job_id) is not str or not UUID.fullmatch(job_id):raise RuntimeError('journal_binding_refused')
    safe_directory(parent,True);directory=parent/job_id
    bootstrap=validate_bootstrap(read_private(directory,'bootstrap.json'))
    if bootstrap['jobId']!=job_id:raise RuntimeError('journal_binding_refused')
    names=sorted(p.name for p in directory.iterdir() if p.name!='bootstrap.json')
    if not names or len(names)>len(STAGES)+1:raise RuntimeError('journal_incomplete_requires_review')
    previous=None
    for index,name in enumerate(names,1):
        if name!=f'{index:06d}.json':raise RuntimeError('journal_incomplete_requires_review')
        value=read_private(directory,name)
        if type(value) is not dict or set(value)!={'sequence','stage','details','previousHash','eventHash'}:raise RuntimeError('journal_file_refused')
        if type(value['sequence']) is not int or value['sequence']!=index:raise RuntimeError('journal_chain_refused')
        if canonical(value)!=canonical(event(previous,value['stage'],value['details'],hashlib.sha256(canonical(bootstrap)).hexdigest())):raise RuntimeError('journal_chain_refused')
        previous=value
    return {'jobId':job_id,'trialId':bootstrap['trialId'],'intentId':bootstrap['intentId'],
            'lastStage':previous['stage'],'eventCount':len(names),'resumeAllowed':False,'attemptCompleted':previous['stage']=='released','reviewRequired':True}
