#!/usr/bin/env python3
"""Read-only directory inventory bound to the completed first OS journal and live NSS."""
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys

FIRST=Path('/opt/infraflow-demo-platform/releases/os-pilot-first-identity-v1')
TRIAL='b1100b43-48d0-42fa-8a1d-73b1286f8242'
JOB='00f612ed-a8ac-4688-a26f-679760eee0be'
INTENT='40f385e6-c722-429a-a8fe-46c6119c4834'

def module(directory,name):
    s=importlib.util.spec_from_file_location(name,directory/(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def trusted(path):
    for p in (path,*path.parents):
        s=p.lstat()
        if stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('untrusted_code')

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or os.getegid()!=0 or sys.argv[1:]!=['--inspect-only']:sys.exit('ROOT_LINUX_INSPECT_ONLY_REQUIRED')
    try:
        for name in ('inspect-demo-tenant-os-identity.py','tenant-os-observer.py','os-pilot-journal.py'):trusted(FIRST/name)
        inv=module(FIRST,'inspect-demo-tenant-os-identity')
        observed=module(FIRST,'tenant-os-observer').observe(inv.identity_plan(TRIAL))
        if observed!={'uid':992,'gid':983,'policyVerified':True}:raise RuntimeError('identity_changed')
        review=module(FIRST,'os-pilot-journal').inspect_for_review(Path('/var/lib/infraflow-demo-os-pilot'),JOB)
        if review!={'jobId':JOB,'trialId':TRIAL,'intentId':INTENT,'lastStage':'released','eventCount':15,'resumeAllowed':False,'attemptCompleted':True,'reviewRequired':True}:raise RuntimeError('journal_changed')
        policy=module(Path(__file__).resolve().parent,'tenant-directory-plan')
        value=policy.plan(TRIAL,observed['uid'],observed['gid'])
        report=policy.inspect(value)
        print('TENANT_DIRECTORIES_PRIOR_OS_EVIDENCE_OK')
        print(json.dumps({'policy':value,'inventory':report},separators=(',',':')))
        print('TENANT_DIRECTORIES_INVENTORY_OK\nNO_DIRECTORY_CREATED_NO_SQL_NO_SECRET_OUTPUT_NO_RESTART')
    except Exception:
        print('TENANT_DIRECTORIES_INVENTORY_UNCONFIRMED_REVIEW_REQUIRED');raise SystemExit(1)

if __name__=='__main__':main()
