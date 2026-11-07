"""Fresh context before every effect. No CLI, default runner or SQL authority."""
import importlib.util
import math
from pathlib import Path
import re
import time

def load(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def timestamp(value):
    if type(value) not in (int,float) or not math.isfinite(value):raise RuntimeError('directory_clock_refused')
    return value
def guarded_run(policy,approval,context,lock,inventory,journal,run,clock=time.monotonic):
    """Trusted root ports; run must enforce timeout and own its child process tree.

    SQL executionAllowed remains false. Local approval is separate and cannot
    come from a browser/worker. This module never selects a default mkdir runner.
    """
    keys={'jobId','trialId','intentId','priorOsIntentId','attemptId','generation','jobRevision','uid','gid','localRootApproved'}
    if type(approval) is not dict or set(approval)!=keys or approval['localRootApproved'] is not True:raise RuntimeError('directory_root_approval_required')
    bound={k:approval[k] for k in keys if k!='localRootApproved'}
    for k in ('jobId','trialId','intentId','priorOsIntentId','attemptId'):
        if type(bound[k]) is not str or not re.fullmatch('[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',bound[k]):raise RuntimeError('directory_binding_refused')
    if len({bound[k] for k in ('intentId','priorOsIntentId','attemptId')})!=3:raise RuntimeError('directory_binding_refused')
    for k in ('generation','jobRevision','uid','gid'):
        if type(bound[k]) is not int or not 0<bound[k]<2147483647:raise RuntimeError('directory_binding_refused')
    canonical=load('tenant-directory-plan').plan(bound['trialId'],bound['uid'],bound['gid'])
    if type(policy) is not dict or policy!=canonical:raise RuntimeError('directory_policy_refused')
    if not all(callable(p) for p in (context,lock,inventory,journal,run,clock)):raise RuntimeError('directory_trusted_ports_required')
    used=set();broken=False
    def create(entry):
        nonlocal broken
        if broken:raise RuntimeError('directory_guard_broken')
        try:
            if type(entry) is not dict or entry not in canonical['directories'] or entry['path'] in used:raise RuntimeError('directory_entry_refused')
            # Called by run_plan only after the durable mkdir_requested event.
            start=timestamp(clock());r=context();end=timestamp(clock())
            expected={**bound,'storageRoot':'/var/lib/infraflow-demo-tenants/'+bound['trialId'],'configRoot':'/etc/infraflow-demo-tenants/'+bound['trialId'],'contextReady':True,'executionAllowed':False}
            if type(r) is not dict or set(r)!=set(expected)|{'validForMs'} or any(type(r[k]) is not type(v) or r[k]!=v for k,v in expected.items()):raise RuntimeError('directory_context_refused')
            if end<start or type(r['validForMs']) is not int or not 15000<=r['validForMs']<=60000 or r['validForMs']-(end-start)*1000<12000:raise RuntimeError('directory_context_budget_insufficient')
            deadline=start+r['validForMs']/1000;before=timestamp(clock())
            if before<end or deadline-before<7:raise RuntimeError('directory_context_budget_insufficient')
            used.add(entry['path'])
            result=run(dict(entry),timeout=5)
            after=timestamp(clock())
            # A late operation may have happened: preserve it, never retry/report success.
            if after<before or after-before>5 or deadline-after<2:raise RuntimeError('directory_effect_deadline_uncertain')
            return result
        except Exception:
            broken=True;raise RuntimeError('directory_context_effect_unconfirmed') from None
    with lock(canonical['identity']):
        return load('tenant-directory-executor').run_plan(canonical,{'inventory':inventory,'journal':journal,'authorize':lambda index,entry:True,'create':create})
