#!/usr/bin/env python3
"""Real root journal/lock/guard/owned benign runner, simulated SQL/NSS. No account tools."""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace

def module(name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def scenario(parent,job,fail=None):
    journal=module('os-pilot-journal');bound=module('os-pilot-bound-ports')
    hostmod=module('os-pilot-host-port');inv=module('inspect-demo-tenant-os-identity')
    guard=module('tenant-os-execution-guard');runner=module('tenant-os-command-runner')
    trial='11111111-1111-4111-8111-111111111111';plan=inv.identity_plan(trial)
    request={'jobId':job,'trialId':trial,'expectedJobRevision':0,'localRootApproved':True}
    calls=[];closed=[];binding={};private={};benign=[]
    def harmless(command,timeout):
        if command not in module('tenant-os-executor').commands(plan) or timeout!=5:raise RuntimeError('unexpected_command')
        benign.append(True)
        return runner._run_owned(('/usr/bin/true',),5)
    def observe(_):
        if fail=='observation':raise RuntimeError('simulated_observation_failure')
        return {'uid':10001,'gid':10002,'policyVerified':True}
    # Explicitly replace only effect/inventory ports. The actual guard and lock are retained.
    modules={'inspect-demo-tenant-os-identity':SimpleNamespace(identity_plan=inv.identity_plan,inspect=lambda _:{'resourcesAbsent':True}),
             'tenant-os-execution-guard':guard,'tenant-os-command-runner':SimpleNamespace(create_command_runner=lambda _:harmless),
             'tenant-os-observer':SimpleNamespace(observe=observe)}
    hostmod.module=modules.__getitem__
    host=hostmod.create_host(request,parent)
    def base():return {k:binding[k] for k in ('jobId','intentId','generation','jobRevision')}|{'executionAllowed':False}
    class Pipe:
        def __init__(self,role):self.role=role
        def call(self,action,p):
            calls.append((self.role,action))
            if action=='init':
                if self.role=='executor':binding.update(p['binding'])
                return {'initialized':True}
            if action=='claim':
                binding.update({'jobId':job,'trialId':trial,'intentId':private['intentId'],'generation':1,'jobRevision':1})
                return {'jobId':job,'generation':1,'jobRevision':1,'leaseExpiresAt':'2026-10-31T12:00:00.000','executionAllowed':False}
            if action=='intent':return {k:p[k] for k in ('jobId','generation','intentId','step')}|{'state':'intent_recorded','executionAllowed':False}
            if action=='prepare':return base()|{'resourceKey':plan['user'],'state':'prepared'}
            if action=='accept':return base()|{'trialId':trial,'resourceKey':plan['user'],'state':'accepted','nextGate':'durable_result_and_reconciliation_protocol'}
            if action=='context':
                if fail=='context':raise RuntimeError('simulated_context_failure')
                return dict(binding)|{'resourceKey':plan['user'],'validForMs':30000,'contextReady':True,'executionAllowed':False}
            if action=='report':return base()|{k:p[k] for k in ('outcome','uid','gid')}|{'reconciliationRequired':True}
            if action=='release':return {'jobId':job,'generation':1,'jobRevision':2,'leaseExpiresAt':None,'executionAllowed':False}
            raise RuntimeError('unexpected_action')
        def close(self):closed.append(self.role)
    def ledger(value):
        private.update(value);return journal.create_new_journal(parent,value)
    try:
        result=bound.run(request,lambda _:True,ledger,host,Pipe)
        if fail or result['activationPerformed'] is not False:raise RuntimeError('unexpected_success')
    except RuntimeError as error:
        if not fail or str(error)!='os_pilot_unconfirmed_review_required':raise
    review=journal.inspect_for_review(parent,job)
    if closed!=['executor','worker'] or review['resumeAllowed'] is not False:raise RuntimeError('cleanup_unconfirmed')
    if fail:
        if review['lastStage']!='review_required' or any(a in ('report','release') for _,a in calls):raise RuntimeError('compensation_detected')
    elif review['lastStage']!='released' or len(benign)!=2:raise RuntimeError('flow_unconfirmed')
    if fail=='context' and benign:raise RuntimeError('negative_gate_failed')
    if fail=='observation' and len(benign)!=2:raise RuntimeError('observation_path_unconfirmed')

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or os.getegid()!=0 or sys.argv[1:]!=['--probe-confirmed']:sys.exit('ROOT_LINUX_EXPLICIT_CANARY_REQUIRED')
    try:
        with tempfile.TemporaryDirectory(prefix='infraflow-assembled-canary-',dir='/run') as tmp:
            parent=Path(tmp);os.chmod(parent,0o700)
            scenario(parent,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
            print('OS_ASSEMBLED_BENIGN_DURABLE_FLOW_OK')
            scenario(parent,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','context')
            print('OS_ASSEMBLED_CONTEXT_REFUSAL_NO_COMMAND_OK')
            scenario(parent,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','observation')
            print('OS_ASSEMBLED_OBSERVATION_FAILURE_NO_COMPENSATION_OK')
        if parent.exists():raise RuntimeError('cleanup_failed')
        print('OS_ASSEMBLED_CANARY_CLEANUP_OK\nSIMULATED_SQL_NSS_NO_ACCOUNT_NO_EXISTING_SERVICE_RESTART')
    except Exception:
        print('OS_ASSEMBLED_CANARY_UNCONFIRMED_NO_AUTOMATIC_RETRY');raise SystemExit(1)

if __name__=='__main__':main()
