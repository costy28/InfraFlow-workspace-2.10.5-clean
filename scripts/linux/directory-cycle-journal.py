"""Root-private durable SQL-only cycle; existing attempts are never resumed."""
import hashlib
import importlib.util
import os
from pathlib import Path
import re

STAGES=('created','claim_requested','claimed','intent_requested','intent_recorded','prepare_requested','prepared','release_requested','released')
def helper():
    spec=importlib.util.spec_from_file_location('journal_helper',Path(__file__).with_name('os-pilot-journal.py'))
    h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h);return h
def validate(value):
    h=helper()
    keys={'format','jobId','trialId','intentId','priorOsIntentId','attemptId','uid','gid','expectedJobRevision','leaseToken','attemptToken'}
    if type(value) is not dict or set(value)!=keys or value['format']!='infraflow-directory-cycle-v1':raise RuntimeError('cycle_bootstrap_refused')
    for k in ('jobId','trialId','intentId','priorOsIntentId','attemptId'):
        if type(value[k]) is not str or not h.UUID.fullmatch(value[k]):raise RuntimeError('cycle_binding_refused')
    if len({value[k] for k in ('intentId','priorOsIntentId','attemptId')})!=3:raise RuntimeError('cycle_binding_refused')
    for k in ('uid','gid'):
        if not h.positive(value[k]):raise RuntimeError('cycle_binding_refused')
    if type(value['expectedJobRevision']) is not int or not 0<=value['expectedJobRevision']<=2147483643:raise RuntimeError('cycle_binding_refused')
    for k in ('leaseToken','attemptToken'):
        if type(value[k]) is not str or not re.fullmatch('[0-9a-f]{64}',value[k]):raise RuntimeError('cycle_token_refused')
    if value['leaseToken']==value['attemptToken']:raise RuntimeError('cycle_token_refused')
    return h.canonical(value)
def event(last,stage,details,digest):
    prior=last['stage'] if last else None
    if stage=='review_required':
        if prior in (None,'review_required','released'):raise RuntimeError('cycle_terminal')
    elif stage not in STAGES or STAGES.index(stage)!=(STAGES.index(prior)+1 if prior in STAGES else 0) or prior=='review_required':raise RuntimeError('cycle_transition_refused')
    expected={'claimed':{'generation','jobRevision'},'released':{'jobRevision'},'review_required':{'failedStage'}}.get(stage,set())
    if type(details) is not dict or set(details)!=expected:raise RuntimeError('cycle_details_refused')
    for k,v in details.items():
        if k=='failedStage':
            if v not in STAGES:raise RuntimeError('cycle_details_refused')
        elif not helper().positive(v):raise RuntimeError('cycle_details_refused')
    r={'sequence':last['sequence']+1 if last else 1,'stage':stage,'details':dict(details),'previousHash':last['eventHash'] if last else digest}
    r['eventHash']=hashlib.sha256(helper().canonical(r)).hexdigest();return r
class Journal:
    def __init__(self,directory,raw):self.directory=directory;self.raw=raw;self.digest=hashlib.sha256(raw).hexdigest();self.last=None;self.broken=False
    def append(self,stage,details=None):
        if self.broken:raise RuntimeError('cycle_journal_broken')
        try:
            h=helper()
            if h.canonical(h.read_private(self.directory,'bootstrap.json'))!=self.raw:raise RuntimeError()
            if self.last and h.read_private(self.directory,f"{self.last['sequence']:06d}.json")!=self.last:raise RuntimeError()
            r=event(self.last,stage,{} if details is None else details,self.digest)
            h.write_exclusive(self.directory,f"{r['sequence']:06d}.json",r);self.last=r
        except Exception:
            self.broken=True;raise RuntimeError('cycle_journal_unconfirmed') from None
def create_new(parent,value):
    raw=validate(value);h=helper();h.safe_directory(parent,True)
    directory=parent/value['jobId'];directory.mkdir(mode=0o700);os.chown(directory,0,0);os.chmod(directory,0o700)
    fd=os.open(parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)
    h.write_exclusive(directory,'bootstrap.json',value);j=Journal(directory,raw);j.append('created');return j
def inspect_for_review(parent,job):
    h=helper()
    if type(job) is not str or not h.UUID.fullmatch(job):raise RuntimeError('cycle_job_refused')
    d=parent/job;v=h.read_private(d,'bootstrap.json');raw=validate(v)
    if v['jobId']!=job:raise RuntimeError('cycle_job_refused')
    names=sorted(p.name for p in d.iterdir() if p.name!='bootstrap.json')
    if not 1<=len(names)<=10:raise RuntimeError('cycle_journal_incomplete')
    last=None;digest=hashlib.sha256(raw).hexdigest()
    for n,name in enumerate(names,1):
        if name!=f'{n:06d}.json':raise RuntimeError('cycle_journal_incomplete')
        r=h.read_private(d,name)
        if type(r) is not dict or set(r)!={'sequence','stage','details','previousHash','eventHash'} or type(r['sequence']) is not int or r['sequence']!=n or r!=event(last,r['stage'],r['details'],digest):raise RuntimeError('cycle_journal_chain_refused')
        last=r
    return {'jobId':job,'attemptId':v['attemptId'],'lastStage':last['stage'],'eventCount':len(names),'resumeAllowed':False,'reviewRequired':True}
