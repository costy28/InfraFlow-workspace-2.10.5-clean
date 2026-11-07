"""Attempt-bound execution journal and strict read-only SQL report projection."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path

def load(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def binding(value):
    h=load('os-pilot-journal')
    if type(value) is not dict or set(value)!={'jobId','trialId','intentId','priorOsIntentId','attemptId','generation','jobRevision','uid','gid'}:raise RuntimeError('execution_binding_refused')
    for k in ('jobId','trialId','intentId','priorOsIntentId','attemptId'):
        if type(value[k]) is not str or not h.UUID.fullmatch(value[k]):raise RuntimeError('execution_binding_refused')
    if len({value[k] for k in ('intentId','priorOsIntentId','attemptId')})!=3:raise RuntimeError('execution_binding_refused')
    for k in ('generation','jobRevision','uid','gid'):
        if not h.positive(value[k]):raise RuntimeError('execution_binding_refused')
    return dict(value)
def manifest(policy,evidence,b):
    b=binding(b);h=load('os-pilot-journal');p=load('tenant-directory-plan').plan(b['trialId'],b['uid'],b['gid'])
    if type(policy) is not dict or policy!=p:raise RuntimeError('execution_policy_refused')
    if type(evidence) is not dict or set(evidence)!={'jobId','osIntentId','jobRevision','generation','uid','gid'}:raise RuntimeError('execution_evidence_refused')
    for k in ('jobRevision','generation','uid','gid'):
        if not h.positive(evidence[k]):raise RuntimeError('execution_evidence_refused')
    if evidence['jobId']!=b['jobId'] or evidence['osIntentId']!=b['priorOsIntentId'] or evidence['uid']!=b['uid'] or evidence['gid']!=b['gid'] or evidence['jobRevision']>=b['jobRevision'] or evidence['generation']>=b['generation']:raise RuntimeError('execution_evidence_refused')
    return json.loads(h.canonical({'format':'infraflow-directory-execution-v2','policy':p,'evidence':evidence,'binding':b}))
def create_new(parent,policy,evidence,b):
    value=manifest(policy,evidence,b);h=load('os-pilot-journal');h.safe_directory(parent,True)
    directory=parent/value['binding']['attemptId'];directory.mkdir(mode=0o700);os.chown(directory,0,0);os.chmod(directory,0o700)
    fd=os.open(parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)
    h.write_exclusive(directory,'bootstrap.json',value)
    return load('tenant-directory-journal').Journal(directory,value,h)
def project(value,events,expected):
    """Pure strict projection. Does not authorize execution or send SQL."""
    b=binding(expected);h=load('os-pilot-journal');old=load('tenant-directory-journal')
    if type(value) is not dict or set(value)!={'format','policy','evidence','binding'} or value['format']!='infraflow-directory-execution-v2':raise RuntimeError('execution_manifest_refused')
    if value!=manifest(value['policy'],value['evidence'],b):raise RuntimeError('execution_manifest_binding_refused')
    if type(events) is not list or len(events)!=17:raise RuntimeError('execution_journal_not_complete')
    previous=hashlib.sha256(h.canonical(value)).hexdigest();state=(0,False,False);observations=[];seen=set()
    for n,r in enumerate(events,1):
        if type(r) is not dict or set(r)!={'sequence','stage','details','previousHash','eventHash'} or type(r['sequence']) is not int or r['sequence']!=n or r['previousHash']!=previous:raise RuntimeError('execution_chain_refused')
        expected_stage='completed' if n==17 else 'mkdir_requested' if n%2 else 'mkdir_observed'
        if r['stage']!=expected_stage:raise RuntimeError('execution_observations_required')
        raw={k:r[k] for k in ('sequence','stage','details','previousHash')}
        if r['eventHash']!=hashlib.sha256(h.canonical(raw)).hexdigest():raise RuntimeError('execution_chain_refused')
        state=old.transition(state,r['stage'],r['details'],value['policy']);previous=r['eventHash']
        if r['stage']=='mkdir_observed':
            d=r['details']
            if any(type(d[k]) is not int or not 0<=d[k]<=18446744073709551615 for k in ('device','inode')) or d['inode']==0:raise RuntimeError('execution_uint64_refused')
            pair=(d['device'],d['inode'])
            if pair in seen:raise RuntimeError('execution_duplicate_inode_refused')
            seen.add(pair);observations.append({'ordinal':d['index'],'uid':d['uid'],'gid':d['gid'],'mode':d['mode'],'device':str(d['device']),'inode':str(d['inode'])})
    if state!=(8,False,True):raise RuntimeError('execution_journal_not_complete')
    return {'outcome':'observed_created','journalDigest':previous,'observations':observations}
def read_report(parent,expected):
    b=binding(expected);h=load('os-pilot-journal');directory=parent/b['attemptId']
    value=h.read_private(directory,'bootstrap.json')
    names=sorted(p.name for p in directory.iterdir() if p.name!='bootstrap.json')
    if names!=[f'{i:06d}.json' for i in range(1,18)]:raise RuntimeError('execution_journal_not_complete')
    events=[h.read_private(directory,name) for name in names]
    result=project(value,events,b)
    if h.read_private(directory,'bootstrap.json')!=value or h.read_private(directory,names[-1])!=events[-1] or sorted(p.name for p in directory.iterdir() if p.name!='bootstrap.json')!=names:raise RuntimeError('execution_journal_changed_requires_review')
    return result
