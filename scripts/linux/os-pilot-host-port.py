"""Explicit root host-port assembly. No CLI and no account creation during construction."""
import importlib.util
import os
from pathlib import Path
import sys

def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def create_host(request,lock_directory):
    if sys.platform!='linux' or os.geteuid()!=0:raise RuntimeError('root_linux_required')
    if type(request) is not dict or set(request)!={'jobId','trialId','expectedJobRevision','localRootApproved'} or request['localRootApproved'] is not True:
        raise RuntimeError('explicit_local_approval_required')
    if type(request['expectedJobRevision']) is not int or not 0<=request['expectedJobRevision']<=2147483643:raise RuntimeError('host_request_refused')
    if not isinstance(lock_directory,Path):raise RuntimeError('host_lock_refused')
    fixed=dict(request)
    inv=module('inspect-demo-tenant-os-identity');guard=module('tenant-os-execution-guard')
    observer=module('tenant-os-observer');runner=module('tenant-os-command-runner')
    plan=inv.identity_plan(fixed['trialId']);command=runner.create_command_runner(plan)
    used=False
    def host(binding,context):
        nonlocal used
        if used:raise RuntimeError('host_attempt_already_used')
        used=True
        if type(binding) is not dict or set(binding)!={'jobId','trialId','intentId','generation','jobRevision'} or binding['jobId']!=fixed['jobId'] or binding['trialId']!=fixed['trialId'] or type(binding['jobRevision']) is not int or binding['jobRevision']!=fixed['expectedJobRevision']+1 or not callable(context):
            raise RuntimeError('host_binding_refused')
        observed={};recorded=[]
        def observe(p):
            value=observer.observe(p);observed.update(value);return value
        def record(outcome,uid,gid):
            if recorded or outcome!='observed_created' or observed!={'uid':uid,'gid':gid,'policyVerified':True}:raise RuntimeError('host_observation_refused')
            # Local receipt only: the orchestrator journals before the SQL report.
            recorded.append(True)
        result=guard.guarded_execute(plan,{**binding,'resourceKey':plan['user'],'localRootApproved':True},
            context,lambda name:guard.identity_lock(lock_directory,name),
            lambda p:inv.inspect(p)['resourcesAbsent'] is True,command,observe,record)
        if result!={'outcome':'observed_created','reconciliationRequired':True} or recorded!=[True]:raise RuntimeError('host_result_unconfirmed')
        return dict(observed)
    return host
