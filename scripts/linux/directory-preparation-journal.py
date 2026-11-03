"""Durable single prepare attempt. No default SQL/OS effects, resume or deletion."""
import hashlib
import importlib.util
from pathlib import Path
import os
import re

def helper():
    spec=importlib.util.spec_from_file_location('private_journal',Path(__file__).with_name('os-pilot-journal.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def bootstrap(value):
    h=helper()
    if type(value) is not dict or set(value)!={'format','binding','leaseToken','attemptToken'} or value['format']!='infraflow-directory-prepare-v1':raise RuntimeError('prepare_bootstrap_refused')
    b=value['binding']
    if type(b) is not dict or set(b)!={'jobId','trialId','intentId','priorOsIntentId','attemptId','generation','jobRevision','uid','gid'}:raise RuntimeError('prepare_binding_refused')
    for k in ('jobId','trialId','intentId','priorOsIntentId','attemptId'):
        if type(b[k]) is not str or not h.UUID.fullmatch(b[k]):raise RuntimeError('prepare_binding_refused')
    if len({b['intentId'],b['priorOsIntentId'],b['attemptId']})!=3:raise RuntimeError('prepare_binding_refused')
    for k in ('generation','jobRevision','uid','gid'):
        if not h.positive(b[k]):raise RuntimeError('prepare_binding_refused')
    for k in ('leaseToken','attemptToken'):
        if type(value[k]) is not str or not re.fullmatch('[0-9a-f]{64}',value[k]):raise RuntimeError('prepare_token_refused')
    if value['leaseToken']==value['attemptToken']:raise RuntimeError('prepare_token_refused')
    return h.canonical(value)

def transition(previous,stage):
    allowed={None:('created',),'created':('prepare_requested','review_required'),'prepare_requested':('prepared','review_required'),'prepared':(), 'review_required':()}
    if stage not in allowed.get(previous,()):raise RuntimeError('prepare_journal_transition_refused')

def create_new(parent,value):
    h=helper();raw=bootstrap(value);h.safe_directory(parent,True)
    directory=parent/value['binding']['attemptId'];directory.mkdir(mode=0o700)
    os.chown(directory,0,0);os.chmod(directory,0o700)
    fd=os.open(parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)
    h.write_exclusive(directory,'bootstrap.json',value)
    journal=Journal(directory,raw,h);journal.append('created');return journal

class Journal:
    def __init__(self,directory,raw,h):
        self.directory=directory;self.raw=raw;self.h=h;self.previous=None;self.stage=None;self.sequence=0;self.digest=hashlib.sha256(raw).hexdigest();self.broken=False
    def append(self,stage):
        if self.broken:raise RuntimeError('prepare_journal_broken')
        try:
            if self.h.canonical(self.h.read_private(self.directory,'bootstrap.json'))!=self.raw:raise RuntimeError()
            if self.previous is not None and self.h.read_private(self.directory,f'{self.sequence:06d}.json')!=self.previous:raise RuntimeError()
            transition(self.stage,stage)
            record={'sequence':self.sequence+1,'stage':stage,'previousHash':self.digest}
            record['eventHash']=hashlib.sha256(self.h.canonical(record)).hexdigest()
            self.h.write_exclusive(self.directory,f'{self.sequence+1:06d}.json',record)
            self.previous=record;self.sequence+=1;self.stage=stage;self.digest=record['eventHash']
        except Exception:
            self.broken=True;raise RuntimeError('prepare_journal_unconfirmed') from None

def run_once(value,ports):
    """Caller supplies already-bound lease/intent; no claim/release or directory port."""
    bootstrap(value)
    if type(ports) is not dict or set(ports)!={'journal','prepare'} or not all(callable(v) for v in ports.values()):raise RuntimeError('prepare_ports_refused')
    # Canonical copy prevents the journal port mutating the bound input.
    import json
    private=json.loads(bootstrap(value));journal=ports['journal'](json.loads(bootstrap(private)))
    try:
        journal.append('prepare_requested')
        b=private['binding'];r=ports['prepare'](dict(b),{'leaseToken':private['leaseToken'],'attemptToken':private['attemptToken']})
        expected={**b,'storageRoot':'/var/lib/infraflow-demo-tenants/'+b['trialId'],'configRoot':'/etc/infraflow-demo-tenants/'+b['trialId'],'state':'prepared','executionAllowed':False}
        if type(r) is not dict or set(r)!=set(expected) or any(type(r[k]) is not type(v) or r[k]!=v for k,v in expected.items()):raise RuntimeError()
        journal.append('prepared')
        return {'attemptId':b['attemptId'],'status':'prepared_requires_review','executionAllowed':False,'resumeAllowed':False}
    except Exception:
        try:journal.append('review_required')
        except Exception:pass
        raise RuntimeError('directory_prepare_review_required') from None
