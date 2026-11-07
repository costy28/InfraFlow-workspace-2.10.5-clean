"""Native request/confirmation persistence; all transport and observations simulated."""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile

def load(name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def refused(fn):
    try:fn()
    except (RuntimeError,OSError):return
    raise RuntimeError('refusal_missing')

def main():
    if sys.argv[1:]!=['--probe-confirmed'] or sys.platform!='linux' or os.geteuid()!=0 or os.getegid()!=0:raise RuntimeError('root_linux_confirmation_required')
    m=load('tenant-directory-report-submit');j=load('tenant-directory-execution-journal');h=load('os-pilot-journal');planner=load('tenant-directory-plan')
    b={'jobId':'10000000-0000-0000-0000-000000000001','trialId':'20000000-0000-0000-0000-000000000002','intentId':'30000000-0000-0000-0000-000000000003','priorOsIntentId':'40000000-0000-0000-0000-000000000004','attemptId':'50000000-0000-0000-0000-000000000005','generation':5,'jobRevision':10,'uid':60001,'gid':60002}
    with tempfile.TemporaryDirectory(prefix='infraflow-report-submit-',dir='/run') as tmp:
        root=Path(tmp);os.chmod(root,0o700)
        execution=root/'execution';execution.mkdir(mode=0o700)
        evidence={'jobId':b['jobId'],'osIntentId':b['priorOsIntentId'],'generation':3,'jobRevision':6,'uid':b['uid'],'gid':b['gid']}
        policy=planner.plan(b['trialId'],b['uid'],b['gid']);journal=j.create_new(execution,policy,evidence,b)
        for i,row in enumerate(policy['directories']):
            journal.append('mkdir_requested',{'index':i})
            journal.append('mkdir_observed',{'index':i,**{k:row[k] for k in ('uid','gid','mode')},'device':1,'inode':100+i})
        journal.append('completed',{})
        for case in ('success','lost','wrong','confirm_disk'):
            parent=root/case;parent.mkdir(mode=0o700);requested,confirmed=m.durable_ports(parent,b);calls=[]
            def send(action,payload):
                calls.append(action)
                stored=h.read_private(parent/b['attemptId'],'bootstrap.json')
                if stored['report']['journalDigest']!=payload['journalDigest'] or 'attemptToken' in str(stored):raise RuntimeError('request_not_durable')
                if case=='lost':raise TimeoutError()
                receipt={**{k:b[k] for k in ('jobId','trialId','intentId','priorOsIntentId','attemptId','generation','jobRevision')},'outcome':'observed_created','confirmedCount':8,'journalDigest':payload['journalDigest'],'executionAllowed':False,'reconciliationRequired':True}
                if case=='wrong':receipt['generation']+=1
                return receipt
            def fail_confirm(value):raise OSError('simulated_disk_failure')
            invoke=lambda:m.submit(execution,b,'a'*64,requested,fail_confirm if case=='confirm_disk' else confirmed,send)
            if case=='success':
                invoke();h.read_private(parent/b['attemptId'],'000001.json')
            else:
                refused(invoke)
                if (parent/b['attemptId']/'000001.json').exists():raise RuntimeError('unexpected_confirmation')
            # Recreate ports as after a process restart: persisted gate must refuse.
            req2,conf2=m.durable_ports(parent,b)
            refused(lambda:m.submit(execution,b,'a'*64,req2,conf2,send))
            if calls!=['report']:raise RuntimeError('duplicate_transport_call')
        print('REPORT_NATIVE_DURABLE_BEFORE_SEND_OK')
        print('REPORT_NATIVE_LOST_RESPONSE_NO_RETRY_OK')
        print('REPORT_NATIVE_WRONG_RECEIPT_NO_CONFIRM_OK')
        print('REPORT_NATIVE_CONFIRM_DISK_FAILURE_NO_RETRY_OK')
    if root.exists():raise RuntimeError('cleanup_unconfirmed')
    print('REPORT_NATIVE_CANARY_CLEANUP_OK')
    print('SIMULATED_TRANSPORT_NO_SQL_NO_TENANT_DIRECTORY_NO_SERVICE_RESTART')

if __name__=='__main__':
    try:main()
    except Exception:
        print('REPORT_NATIVE_CANARY_UNCONFIRMED',file=sys.stderr);sys.exit(1)
