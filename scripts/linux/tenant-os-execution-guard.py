#!/usr/bin/env python3
"""Host serialization and live SQL context gate; no CLI or default effect ports."""
from contextlib import contextmanager
import importlib.util
import math
import os
from pathlib import Path
import stat
import time

def executor():
    spec=importlib.util.spec_from_file_location('tenant_executor',Path(__file__).with_name('tenant-os-executor.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

@contextmanager
def identity_lock(directory,identity):
    """Root-only precreated directory. Keep lock inode; never unlink on unlock."""
    import fcntl
    if os.geteuid()!=0 or not isinstance(directory,Path):raise RuntimeError('host_lock_refused')
    if len(identity)!=32 or not identity.startswith('ift_') or any(c not in '0123456789abcdef' for c in identity[4:]):raise RuntimeError('host_lock_refused')
    for p in (directory,*directory.parents):
        s=p.lstat()
        if not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('host_lock_refused')
    if stat.S_IMODE(directory.stat().st_mode)!=0o700:raise RuntimeError('host_lock_refused')
    fd=os.open(directory/(identity+'.lock'),os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW|os.O_CLOEXEC|os.O_NONBLOCK,0o600)
    try:
        s=os.fstat(fd)
        if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_gid!=0 or s.st_nlink!=1 or stat.S_IMODE(s.st_mode)!=0o600:raise RuntimeError('host_lock_refused')
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise RuntimeError('host_identity_busy') from None
        yield
    finally:os.close(fd)

def guarded_execute(plan,approval,context,lock,inventory,run,observe,record,clock=time.monotonic):
    """Trusted root approval and ports only; context false is not host authority.

    Caller holds ownership of the SQL delegation, obtains explicit local approval,
    and supplies a context port bound to its private credential/token transport.
    No browser/worker supplied executionAllowed field is accepted as approval.
    """
    expected={'jobId','trialId','intentId','generation','jobRevision','resourceKey','localRootApproved'}
    if type(approval) is not dict or set(approval)!=expected or approval['localRootApproved'] is not True:
        raise RuntimeError('local_root_approval_required')
    m=executor();canonical=m.inventory_module().identity_plan(approval['trialId'])
    if plan!=canonical or approval['resourceKey']!=plan['user']:raise RuntimeError('host_binding_refused')
    # Reuse canonical UUID validation, including job/intent identifiers.
    import re
    for key in ('jobId','trialId','intentId'):
        if type(approval[key]) is not str or not re.fullmatch('[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',approval[key]):raise RuntimeError('host_binding_refused')
    for key in ('generation','jobRevision'):
        if type(approval[key]) is not int or approval[key]<1 or approval[key]>2147483647:raise RuntimeError('host_binding_refused')
    bound=dict(approval);deadline=None
    def authorize(stage,current_plan):
        nonlocal deadline
        start=clock();r=context();end=clock()
        if not all(type(v) in (float,int) and math.isfinite(v) for v in (start,end)) or end<start:raise RuntimeError('context_clock_refused')
        keys={'jobId','trialId','intentId','generation','jobRevision','resourceKey','validForMs','contextReady','executionAllowed'}
        if type(r) is not dict or set(r)!=keys or r['contextReady'] is not True or r['executionAllowed'] is not False:
            raise RuntimeError('context_receipt_refused')
        for key in ('jobId','trialId','intentId','generation','jobRevision','resourceKey'):
            if type(r[key]) is not type(bound[key]) or r[key]!=bound[key]:raise RuntimeError('context_binding_refused')
        if type(r['validForMs']) is not int or not 15000<=r['validForMs']<=60000 or r['validForMs']-(end-start)*1000<12000:
            raise RuntimeError('context_budget_insufficient')
        deadline=start+r['validForMs']/1000
        # Local root gate plus a fresh bound context, not a rewritten SQL receipt.
        return {'identity':current_plan['user'],'stage':stage,'executionAllowed':True}
    def bounded_run(command):
        now=clock()
        if type(now) not in (float,int) or not math.isfinite(now) or deadline is None or deadline-now<7:
            raise RuntimeError('context_budget_insufficient')
        # Trusted runner must enforce this timeout and terminate its owned process
        # tree on expiry. No runner is installed or selected by this module.
        return run(command,timeout=5)
    with lock(plan['user']):
        return m.execute_with_ports(plan,authorize,inventory,bounded_run,observe,record)
