"""Root-only append-only directory attempt. No resume, compensation, or SQL authority."""
import hashlib
import importlib.util
import os
from pathlib import Path

def load(name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def transition(state,stage,details,policy):
    index,pending,terminal=state
    if terminal or type(details) is not dict:raise RuntimeError('directory_journal_transition_refused')
    keys={'mkdir_requested':{'index'},'mkdir_observed':{'index','uid','gid','mode','device','inode'},'shared_verified':{'index'},'review_required':{'index'},'completed':set()}
    if stage not in keys or set(details)!=keys[stage]:raise RuntimeError('directory_journal_event_refused')
    if stage=='completed':
        if index!=len(policy['directories']) or pending:raise RuntimeError('directory_journal_incomplete')
        return (index,False,True)
    if type(details['index']) is not int or details['index']!=index:raise RuntimeError('directory_journal_index_refused')
    if stage=='review_required':return (index,pending,True)
    if index>=len(policy['directories']):raise RuntimeError('directory_journal_index_refused')
    entry=policy['directories'][index]
    if stage=='shared_verified':
        if pending or entry['kind']!='shared_parent':raise RuntimeError('directory_journal_transition_refused')
        return (index+1,False,False)
    if stage=='mkdir_requested':
        if pending:raise RuntimeError('directory_journal_duplicate_request')
        return (index,True,False)
    if not pending or any(type(details[k]) is not type(entry[k]) or details[k]!=entry[k] for k in ('uid','gid','mode')) or any(type(details[k]) is not int or details[k]<0 for k in ('device','inode')) or details['inode']==0:raise RuntimeError('directory_journal_receipt_refused')
    return (index+1,False,False)

def create_new(parent,policy,evidence):
    helper=load('os-pilot-journal');planner=load('tenant-directory-plan')
    if type(policy) is not dict or policy!=planner.plan(policy.get('trialId'),policy.get('uid'),policy.get('gid')):raise RuntimeError('directory_policy_refused')
    if type(evidence) is not dict or set(evidence)!={'jobId','osIntentId','jobRevision','generation','uid','gid'}:raise RuntimeError('prior_evidence_refused')
    for key in ('jobId','osIntentId'):
        if type(evidence[key]) is not str or not helper.UUID.fullmatch(evidence[key]):raise RuntimeError('prior_evidence_refused')
    for key in ('jobRevision','generation','uid','gid'):
        if not helper.positive(evidence[key]):raise RuntimeError('prior_evidence_refused')
    if any(evidence[k]!=policy[k] for k in ('uid','gid')):raise RuntimeError('prior_evidence_refused')
    helper.safe_directory(parent,True);directory=parent/policy['trialId']
    directory.mkdir(mode=0o700);os.chown(directory,0,0);os.chmod(directory,0o700)
    fd=os.open(parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)
    manifest={'format':'infraflow-tenant-directories-v1','policy':policy,'evidence':evidence}
    helper.write_exclusive(directory,'bootstrap.json',manifest)
    return Journal(directory,manifest,helper)

class Journal:
    def __init__(self,directory,manifest,helper):
        self.directory=directory;self.manifest=manifest;self.helper=helper;self.state=(0,False,False);self.sequence=0
        self.last_hash=hashlib.sha256(helper.canonical(manifest)).hexdigest();self.last=None;self.broken=False
    def append(self,stage,details):
        if self.broken:raise RuntimeError('directory_journal_broken')
        try:
            h=self.helper
            if h.canonical(h.read_private(self.directory,'bootstrap.json'))!=h.canonical(self.manifest):raise RuntimeError()
            if self.last is not None and h.canonical(h.read_private(self.directory,f'{self.sequence:06d}.json'))!=h.canonical(self.last):raise RuntimeError()
            new=transition(self.state,stage,details,self.manifest['policy'])
            value={'sequence':self.sequence+1,'stage':stage,'details':dict(details),'previousHash':self.last_hash}
            value['eventHash']=hashlib.sha256(h.canonical(value)).hexdigest()
            h.write_exclusive(self.directory,f'{self.sequence+1:06d}.json',value)
            self.state=new;self.sequence+=1;self.last_hash=value['eventHash'];self.last=value
        except Exception:
            self.broken=True;raise RuntimeError('directory_journal_unconfirmed') from None

def inspect_for_review(parent,trial):
    h=load('os-pilot-journal');planner=load('tenant-directory-plan')
    if type(trial) is not str or not h.UUID.fullmatch(trial):raise RuntimeError('directory_trial_refused')
    directory=parent/trial;manifest=h.read_private(directory,'bootstrap.json')
    if type(manifest) is not dict or set(manifest)!={'format','policy','evidence'} or manifest['format']!='infraflow-tenant-directories-v1':raise RuntimeError('directory_manifest_refused')
    p=manifest['policy']
    if type(p) is not dict or p!=planner.plan(p.get('trialId'),p.get('uid'),p.get('gid')) or p['trialId']!=trial:raise RuntimeError('directory_manifest_refused')
    previous=hashlib.sha256(h.canonical(manifest)).hexdigest();state=(0,False,False);last=None
    names=sorted(x.name for x in directory.iterdir() if x.name!='bootstrap.json')
    if not names or len(names)>18:raise RuntimeError('directory_journal_incomplete')
    for index,name in enumerate(names,1):
        if name!=f'{index:06d}.json':raise RuntimeError('directory_journal_incomplete')
        r=h.read_private(directory,name)
        if type(r) is not dict or set(r)!={'sequence','stage','details','previousHash','eventHash'} or type(r['sequence']) is not int or r['sequence']!=index or r['previousHash']!=previous:raise RuntimeError('directory_journal_chain_refused')
        value={k:r[k] for k in ('sequence','stage','details','previousHash')}
        if r['eventHash']!=hashlib.sha256(h.canonical(value)).hexdigest():raise RuntimeError('directory_journal_chain_refused')
        state=transition(state,r['stage'],r['details'],p);previous=r['eventHash'];last=r['stage']
    return {'trialId':trial,'lastStage':last,'directoriesConfirmed':state[0],'eventCount':len(names),'resumeAllowed':False,'reviewRequired':True}
