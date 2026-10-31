#!/usr/bin/env python3
"""Restricted OS command port. CLI is check-only; host authority is not installed."""
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

def inventory_module():
    spec=importlib.util.spec_from_file_location('identity_inventory',Path(__file__).with_name('inspect-demo-tenant-os-identity.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def commands(plan):
    m=inventory_module()
    if plan!=m.identity_plan(plan.get('trialId')):raise ValueError('identity_plan_refused')
    name=plan['user']
    return (('/usr/sbin/groupadd','--system',name),
            ('/usr/sbin/useradd','--system','--no-user-group','--gid',name,
             '--home-dir','/nonexistent','--no-create-home','--shell','/usr/sbin/nologin',
             '--no-log-init',name))

def safe_binary(path):
    for item in (Path(path),*Path(path).parents):
        info=item.lstat()
        if stat.S_ISLNK(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:raise RuntimeError('unsafe_binary')
        if str(item)==path and (not stat.S_ISREG(info.st_mode) or not info.st_mode&0o111):raise RuntimeError('unsafe_binary')

def check_tools(run=subprocess.run,validate=safe_binary):
    options={'/usr/sbin/groupadd':('--system',),'/usr/sbin/useradd':('--system','--no-user-group','--gid','--home-dir','--no-create-home','--shell','--no-log-init')}
    for file in ('/usr/bin/getent','/usr/sbin/nologin',*options):validate(file)
    for file,required in options.items():
        r=run([file,'--help'],capture_output=True,text=True,timeout=5,env={'PATH':'/usr/sbin:/usr/bin:/bin','LC_ALL':'C'})
        if r.returncode!=0 or any(flag not in r.stdout for flag in required):raise RuntimeError('required_option_missing')

def execute_with_ports(plan,authorize,inventory,run,observe,record):
    """Not wired to CLI. Trusted ports only; no default process runner or authority.

    A future privileged service must serialize effects and obtain live, explicit
    host authority before each command. Existing executionAllowed=false receipts
    are rejected. SQL authority transport and serialization are not supplied here.
    """
    steps=commands(plan)
    if not all(callable(p) for p in (authorize,inventory,run,observe,record)):raise ValueError('trusted_ports_required')
    started=False
    try:
        if inventory(plan) is not True:raise RuntimeError()
        for stage,cmd in zip(('group','user'),steps):
            permit=authorize(stage,plan)
            if type(permit) is not dict or set(permit)!={'identity','stage','executionAllowed'} or permit!={'identity':plan['user'],'stage':stage,'executionAllowed':True} or type(permit['executionAllowed']) is not bool:
                raise RuntimeError()
            started=True
            result=run(cmd)
            if result.returncode!=0:raise RuntimeError()
        observation=observe(plan)
        if type(observation) is not dict or set(observation)!={'uid','gid','policyVerified'} or observation['policyVerified'] is not True:
            raise RuntimeError()
        for key in ('uid','gid'):
            if type(observation[key]) is not int or not 0<observation[key]<2147483647:raise RuntimeError()
        record('observed_created',observation['uid'],observation['gid'])
        return {'outcome':'observed_created','reconciliationRequired':True}
    except Exception:
        # Never repeat an effect, adopt an existing identity, or remove a partial group.
        # If result recording failed after a possible commit, do not send a second report.
        raise RuntimeError('os_effect_unconfirmed_review_required' if started else 'os_effect_refused_no_command') from None

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or sys.argv[1:]!=['--check-only']:
        sys.exit('LINUX_ROOT_CHECK_ONLY_REQUIRED')
    try:
        m=inventory_module();plan=m.identity_plan(m.TRIAL)
        check_tools()
        r=m.inspect(plan)
        if not r['resourcesAbsent']:raise RuntimeError()
        print(json.dumps({'identity':plan['user'],'commandCount':len(commands(plan)),
                         'toolsVerified':True,'resourcesAbsent':True,'executionAllowed':False},separators=(',',':')))
        print('OS_EXECUTOR_CHECK_ONLY_OK\nNO_ACCOUNT_NO_GROUP_CREATED_NO_SQL_NO_RESTART')
    except Exception:
        print('OS_EXECUTOR_CHECK_UNCONFIRMED_NO_AUTOMATIC_RETRY');sys.exit(1)

if __name__=='__main__':main()
