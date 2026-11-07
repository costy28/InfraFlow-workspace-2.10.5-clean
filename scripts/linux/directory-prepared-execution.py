"""Execute/report a fresh prepared attempt using explicit trusted root ports only.

No claim, release, activation, CLI or default effect transport. Existing released
attempts cannot pass the fresh-context checks enforced by guarded_run.
"""
import importlib.util
from pathlib import Path

def load(name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def execute(binding,evidence,token,execution_parent,report_parent,approved,ports):
    if approved is not True:raise RuntimeError('local_root_approval_required')
    keys={'pipe_factory','lock','inventory','runner','clock'}
    if type(ports) is not dict or set(ports)!=keys or not all(callable(p) for p in ports.values()):raise RuntimeError('trusted_execution_ports_required')
    journal_module=load('tenant-directory-execution-journal');b=journal_module.binding(binding)
    policy=load('tenant-directory-plan').plan(b['trialId'],b['uid'],b['gid'])
    journal_module.manifest(policy,evidence,b)
    import re
    if type(token) is not str or not re.fullmatch('[0-9a-f]{64}',token):raise RuntimeError('attempt_token_refused')
    pipe=None
    try:
        # A newly initialized executor pipe binds all context/report calls to b.
        pipe=ports['pipe_factory']()
        initialized=pipe.call('init',{'binding':b})
        if type(initialized) is not dict or set(initialized)!={'initialized','invocationId'} or initialized['initialized'] is not True or type(initialized['invocationId']) is not str or not re.fullmatch('[0-9a-f]{32}',initialized['invocationId']):raise RuntimeError('executor_init_unconfirmed')
        if pipe.call('check',{})!={'ok':True}:raise RuntimeError('executor_metadata_unconfirmed')
        snapshot=ports['inventory'](policy)
        expected={'trialId':b['trialId'],'directories':[{'path':r['path'],'status':'absent'} for r in policy['directories']],'executionAllowed':False}
        if snapshot!=expected:raise RuntimeError('all_directories_must_be_absent')
        def inventory(p):
            current=ports['inventory'](p)
            if current!=expected:raise RuntimeError('directory_inventory_changed')
            return current
        result=load('tenant-directory-context-guard').guarded_run(policy,{**b,'localRootApproved':True},
            lambda:pipe.call('context',{'attemptToken':token}),ports['lock'],inventory,
            lambda p:journal_module.create_new(execution_parent,p,evidence,b),ports['runner'],ports['clock'])
        if result!={'trialId':b['trialId'],'status':'directories_observed_requires_review','activationPerformed':False}:raise RuntimeError('execution_unconfirmed')
        submit=load('tenant-directory-report-submit');requested,confirmed=submit.durable_ports(report_parent,b)
        receipt=submit.submit(execution_parent,b,token,requested,confirmed,pipe.call)
        return {'jobId':b['jobId'],'attemptId':b['attemptId'],'status':'directories_reported_requires_review','activationPerformed':False,'resumeAllowed':False,'confirmedCount':receipt['confirmedCount']}
    except Exception:raise RuntimeError('prepared_execution_unconfirmed_no_retry_no_release') from None
    finally:
        if pipe is not None:
            try:pipe.close()
            except Exception:raise RuntimeError('executor_close_unconfirmed_requires_review') from None
