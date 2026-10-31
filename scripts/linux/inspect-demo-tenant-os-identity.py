#!/usr/bin/env python3
"""Read-only NSS inventory for the fixed pilot. Never invokes account mutations."""
import json
import os
import re
import stat
import subprocess
import sys
import uuid

TRIAL='b1100b43-48d0-42fa-8a1d-73b1286f8242'
JOB='00f612ed-a8ac-4688-a26f-679760eee0be'

def identity_plan(trial):
    if type(trial) is not str or str(uuid.UUID(trial))!=trial:raise ValueError('invalid_trial')
    name='ift_'+trial.replace('-','')[:28]
    if not re.fullmatch(r'ift_[a-f0-9]{28}',name):raise ValueError('invalid_identity')
    return {'trialId':trial,'user':name,'group':name,'home':'/nonexistent',
            'shell':'/usr/sbin/nologin','systemAccount':True,'createHome':False,
            'supplementaryGroups':[],'passwordLoginAllowed':False,'executionAllowed':False}

def classify(database,name,result):
    if result.returncode==2 and result.stdout=='' and result.stderr=='':return 'absent'
    if result.returncode!=0 or result.stderr or not result.stdout:raise RuntimeError('inventory_unconfirmed')
    lines=result.stdout.splitlines()
    fields=lines[0].split(':')
    if len(lines)!=1 or len(fields)!=(7 if database=='passwd' else 4) or fields[0]!=name:
        raise RuntimeError('inventory_ambiguous')
    # Password fields, existing account properties and group members never leave this parser.
    return 'exists_requires_review'

def inspect(plan,run=subprocess.run):
    if plan!=identity_plan(plan.get('trialId')):raise ValueError('plan_mismatch')
    result={}
    for database in ('passwd','group'):
        response=run(['/usr/bin/getent',database,plan['user']],capture_output=True,text=True,timeout=5,
                     env={'PATH':'/usr/bin:/bin','LC_ALL':'C'})
        result[database]=classify(database,plan['user'],response)
    return {'jobId':JOB,'trialId':plan['trialId'],'identity':plan['user'],
            'userStatus':result['passwd'],'groupStatus':result['group'],
            'resourcesAbsent':all(v=='absent' for v in result.values()),'executionAllowed':False}

def main():
    if sys.platform!='linux' or sys.argv[1:]!=['--inspect-only']:
        sys.exit('LINUX_INSPECT_ONLY_REQUIRED')
    try:
        for path in ('/usr/bin/getent','/usr/sbin/nologin'):
            info=os.lstat(path)
            if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:raise RuntimeError()
        report=inspect(identity_plan(TRIAL))
        print(json.dumps(report,separators=(',',':')))
        if not report['resourcesAbsent']:
            print('TENANT_OS_IDENTITY_COLLISION_REVIEW_REQUIRED');sys.exit(1)
        print('TENANT_OS_IDENTITY_INVENTORY_OK\nNO_ACCOUNT_CREATED_NO_SQL_NO_RESTART')
    except Exception:
        print('TENANT_OS_IDENTITY_INVENTORY_UNCONFIRMED');sys.exit(1)

if __name__=='__main__':main()
