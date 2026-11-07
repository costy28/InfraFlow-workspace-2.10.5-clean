"""One read-only context RPC for the fixed, released pilot attempt. Never report."""
import hashlib
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import sys

JOB='00f612ed-a8ac-4688-a26f-679760eee0be'
TRIAL='b1100b43-48d0-42fa-8a1d-73b1286f8242'
INTENT='4754bdb4-d245-4315-8f65-956e84eba68c'
ATTEMPT='6e108f09-fb63-46f0-8ec8-151dd4db1dd5'
PRIOR='40f385e6-c722-429a-a8fe-46c6119c4834'
PARENT=Path('/var/lib/infraflow-demo-directory-cycle')
RELEASE=Path('/opt/infraflow-demo-platform/releases/directory-executor-broker-v1')
FILES=('directory-executor-sql-broker.js','directory-executor-rpc-client.js','directory-executor-sql-check.js','worker-directory-sql-check.js','directory-preparation-rpc-client.js')

def load(name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def preflight():
    h=load('os-pilot-journal');h.safe_directory(RELEASE);h.safe_directory(PARENT,True);h.safe_directory(PARENT/JOB,True)
    source=Path(__file__).resolve().parents[2]/'server/demo-platform'
    for name in FILES:
        target=RELEASE/name;s=target.lstat()
        if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_nlink!=1 or s.st_mode&0o022 or s.st_size>100000:raise RuntimeError('release_refused')
        if hashlib.sha256(target.read_bytes()).digest()!=hashlib.sha256((source/name).read_bytes()).digest():raise RuntimeError('release_digest_refused')
    s=(PARENT/JOB/'bootstrap.json').lstat()
    if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_gid!=0 or stat.S_IMODE(s.st_mode)!=0o600 or s.st_nlink!=1:raise RuntimeError('journal_metadata_refused')
    r=subprocess.run(['/usr/bin/systemctl','show','infraflow-demo-directory-executor.service','--no-pager','-p','LoadState'],capture_output=True,text=True,timeout=5)
    if r.returncode or r.stdout.strip()!='LoadState=not-found':raise RuntimeError('unit_exists')

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or os.getegid()!=0 or sys.argv[1:] not in (['--preflight-only'],['--probe-confirmed']):raise RuntimeError('mode_refused')
    preflight()
    if sys.argv[1:] == ['--preflight-only']:
        print('RELEASED_CONTEXT_PREFLIGHT_OK\nNO_SQL_NO_SECRET_READ_NO_WRITE');return
    h=load('os-pilot-journal');cycle=load('directory-cycle-journal')
    review=cycle.inspect_for_review(PARENT,JOB)
    if review['lastStage']!='released' or review['eventCount']!=9 or review['attemptId']!=ATTEMPT:raise RuntimeError('prior_cycle_not_released')
    private=h.read_private(PARENT/JOB,'bootstrap.json')
    expected={'jobId':JOB,'trialId':TRIAL,'intentId':INTENT,'priorOsIntentId':PRIOR,'attemptId':ATTEMPT,'uid':992,'gid':983,'expectedJobRevision':7}
    if any(type(private[k]) is not type(v) or private[k]!=v for k,v in expected.items()):raise RuntimeError('prior_binding_refused')
    binding={k:v for k,v in expected.items() if k!='expectedJobRevision'};binding.update(generation=4,jobRevision=8)
    ipc=load('directory-executor-sql-ipc');pipe=ipc.SqlPipe('executor')
    try:
        pipe.call('init',{'binding':binding})
        if pipe.call('check',{})!={'ok':True}:raise RuntimeError('metadata_unconfirmed')
        print('RELEASED_CONTEXT_BROKER_METADATA_OK')
        try:pipe.call('context',{'attemptToken':private['attemptToken']})
        except RuntimeError:
            if not pipe.rejected:raise RuntimeError('transport_failure_not_explicit_refusal') from None
        else:raise RuntimeError('released_context_unexpectedly_allowed')
    finally:pipe.close()
    print('RELEASED_CONTEXT_BROKER_REFUSED_OK')
    print('RELEASED_CONTEXT_PIPE_CLOSED')
    print('NO_REPORT_NO_SQL_WRITE_NO_TENANT_DIRECTORY_NO_EXISTING_SERVICE_RESTART')

if __name__=='__main__':
    try:main()
    except Exception:
        print('RELEASED_CONTEXT_PROBE_UNCONFIRMED_STOP_NO_RETRY',file=sys.stderr);sys.exit(1)
