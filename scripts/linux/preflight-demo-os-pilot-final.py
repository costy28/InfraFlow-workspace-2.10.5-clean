#!/usr/bin/env python3
"""Read-only OS/NSS readiness for the fixed first pilot. No SQL or credential reads."""
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import sys

def module(name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or os.getegid()!=0 or sys.argv[1:]!=['--check-only']:sys.exit('ROOT_LINUX_CHECK_ONLY_REQUIRED')
    stage='tools'
    try:
        inv=module('inspect-demo-tenant-os-identity');exe=module('tenant-os-executor');obs=module('tenant-os-observer')
        exe.check_tools();exe.safe_binary('/usr/bin/id')
        stage='NSS'
        plan=inv.identity_plan(inv.TRIAL)
        if not inv.inspect(plan)['resourcesAbsent']:raise RuntimeError()
        # Real absent NSS must never be mistaken for a successful observation.
        try:obs.observe(plan)
        except RuntimeError as error:
            if str(error)!='os_observation_unconfirmed_review_required':raise
        else:raise RuntimeError('absent_identity_observed')
        print('OS_PILOT_REAL_NSS_ABSENT_AND_OBSERVER_REFUSAL_OK')
        stage='paths'
        for p in (Path('/var/lib/infraflow-demo-tenants')/inv.TRIAL,Path('/etc/infraflow-demo-tenants')/inv.TRIAL,
                  Path('/var/lib/infraflow-demo-os-pilot'),Path('/run/infraflow-demo-os-pilot-locks')):
            if os.path.lexists(p):raise RuntimeError('path_exists_requires_review')
        if os.path.lexists(plan['home']):raise RuntimeError('home_exists_requires_review')
        stage='units'
        units=('infraflow-demo-os-pilot-worker.service','infraflow-demo-os-pilot-executor.service',
               'infraflow-trial-'+inv.TRIAL.replace('-','')+'.service')
        for unit in units:
            r=subprocess.run(['/usr/bin/systemctl','show',unit,'--value','-p','LoadState'],capture_output=True,text=True,timeout=5)
            if r.stdout.strip()!='not-found':raise RuntimeError('unit_exists_requires_review')
        print('OS_PILOT_FINAL_OS_PREFLIGHT_OK\nNO_SQL_NO_SECRET_READ_NO_ACCOUNT_NO_WRITE_NO_RESTART')
    except Exception:
        print('OS_PILOT_FINAL_PREFLIGHT_UNCONFIRMED_STAGE='+stage);raise SystemExit(1)

if __name__=='__main__':main()
