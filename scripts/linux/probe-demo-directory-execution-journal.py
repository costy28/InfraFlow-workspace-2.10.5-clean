"""Native private-file canary. Observations simulated; no SQL or tenant effects."""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile

def load(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def refused(fn):
    try:fn()
    except (RuntimeError,OSError):return
    raise RuntimeError('negative_case_not_refused')

def main():
    if sys.argv[1:]!=['--probe-confirmed'] or sys.platform!='linux' or os.geteuid()!=0 or os.getegid()!=0:
        raise RuntimeError('root_linux_confirmation_required')
    m=load('tenant-directory-execution-journal');p=load('tenant-directory-plan')
    b={'jobId':'10000000-0000-0000-0000-000000000001','trialId':'20000000-0000-0000-0000-000000000002','intentId':'30000000-0000-0000-0000-000000000003','priorOsIntentId':'40000000-0000-0000-0000-000000000004','attemptId':'50000000-0000-0000-0000-000000000005','generation':5,'jobRevision':10,'uid':60001,'gid':60002}
    evidence={'jobId':b['jobId'],'osIntentId':b['priorOsIntentId'],'generation':3,'jobRevision':6,'uid':b['uid'],'gid':b['gid']}
    policy=p.plan(b['trialId'],b['uid'],b['gid'])
    with tempfile.TemporaryDirectory(prefix='infraflow-execution-journal-',dir='/run') as tmp:
        root=Path(tmp);os.chmod(root,0o700)
        journal=m.create_new(root,policy,evidence,b)
        refused(lambda:m.read_report(root,b))
        refused(lambda:m.create_new(root,policy,evidence,b))
        for index,row in enumerate(policy['directories']):
            journal.append('mkdir_requested',{'index':index})
            journal.append('mkdir_observed',{'index':index,**{k:row[k] for k in ('uid','gid','mode')},'device':1,'inode':18446744073709551615-index})
        journal.append('completed',{})
        report=m.read_report(root,b)
        if len(report['observations'])!=8 or report['observations'][0]['inode']!='18446744073709551615':raise RuntimeError('projection_unconfirmed')
        print('EXECUTION_JOURNAL_NATIVE_READBACK_OK')
        refused(lambda:m.read_report(root,{**b,'jobRevision':11}))
        print('EXECUTION_JOURNAL_ATTEMPT_REUSE_DENIED_OK')
        event=journal.directory/'000002.json';alias=root/'alias';os.link(event,alias)
        refused(lambda:m.read_report(root,b));alias.unlink()
        event.chmod(0o644);refused(lambda:m.read_report(root,b));event.chmod(0o600)
        event.rename(root/'saved');event.symlink_to(root/'saved')
        refused(lambda:m.read_report(root,b));event.unlink();(root/'saved').rename(event)
        print('EXECUTION_JOURNAL_LINK_MODE_DENIED_OK')
        last=journal.directory/'000017.json';last.rename(root/'last')
        refused(lambda:m.read_report(root,b));(root/'last').rename(last)
        print('EXECUTION_JOURNAL_PARTIAL_DENIED_OK')
    if root.exists():raise RuntimeError('cleanup_unconfirmed')
    print('EXECUTION_JOURNAL_CANARY_CLEANUP_OK')
    print('SIMULATED_OBSERVATIONS_NO_SQL_NO_TENANT_DIRECTORY_NO_SERVICE_RESTART')

if __name__=='__main__':
    try:main()
    except Exception:
        print('EXECUTION_JOURNAL_CANARY_UNCONFIRMED',file=sys.stderr);sys.exit(1)
