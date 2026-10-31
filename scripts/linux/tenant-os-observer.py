#!/usr/bin/env python3
"""Read-only post-effect policy check; never adopts an existing account or prints shadow data."""
import importlib.util
from pathlib import Path
import re
import subprocess

def inventory():
    spec=importlib.util.spec_from_file_location('inventory',Path(__file__).with_name('inspect-demo-tenant-os-identity.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def observe(plan,run=subprocess.run,exists=lambda p:p.exists() or p.is_symlink()):
    if plan!=inventory().identity_plan(plan.get('trialId')):raise RuntimeError('os_observation_refused')
    def read(database):
        r=run(['/usr/bin/getent',database,plan['user']],capture_output=True,text=True,timeout=5,
              env={'PATH':'/usr/bin:/bin','LC_ALL':'C'})
        lines=r.stdout.splitlines()
        if r.returncode or r.stderr or len(lines)!=1:raise RuntimeError()
        return lines[0].split(':')
    try:
        user=read('passwd');group=read('group');shadow=read('shadow')
        if len(user)!=7 or len(group)!=4 or len(shadow)!=9:raise RuntimeError()
        if any(row[0]!=plan['user'] for row in (user,group,shadow)):raise RuntimeError()
        if user[1]!='x' or group[1]!='x' or group[3]!='':raise RuntimeError()
        if user[5:]!=[plan['home'],plan['shell']]:raise RuntimeError()
        # An empty or usable password hash is never considered locked.
        if not shadow[1].startswith(('!','*')):raise RuntimeError()
        values=(user[2],user[3],group[2])
        if any(not re.fullmatch('[1-9][0-9]{0,9}',v) for v in values):raise RuntimeError()
        uid,gid,group_gid=map(int,values)
        if uid>=2147483647 or gid>=2147483647 or gid!=group_gid:raise RuntimeError()
        r=run(['/usr/bin/id','-G',plan['user']],capture_output=True,text=True,timeout=5,
              env={'PATH':'/usr/bin:/bin','LC_ALL':'C'})
        if r.returncode or r.stderr or r.stdout.split()!=[str(gid)]:raise RuntimeError()
        if exists(Path(plan['home'])):raise RuntimeError()
        return {'uid':uid,'gid':gid,'policyVerified':True}
    except Exception:
        raise RuntimeError('os_observation_unconfirmed_review_required') from None
