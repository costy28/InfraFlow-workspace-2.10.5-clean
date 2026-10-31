#!/usr/bin/env python3
"""Explicit metadata-only probe. Never invokes claim, accept, intent or report RPCs."""
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import sys

FILES=('os-pilot-sql-broker.js','worker-os-control-sql.js','provision-lease-client.js',
       'provision-lease-command.js','os-delegation-rpc-client.js',
       'worker-os-delegation-sql-check.js','os-executor-context-sql-check.js')
DRIVER=Path('/opt/infraflow-demo-platform/releases/sql-reader-v1/node_modules')
JOB='00f612ed-a8ac-4688-a26f-679760eee0be'
TRIAL='b1100b43-48d0-42fa-8a1d-73b1286f8242'
INTENT='00000000-0000-0000-0000-000000000001'

def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value

def preflight(ipc,helper):
    helper.safe(ipc.RELEASE.parent);helper.safe(DRIVER)
    if os.path.lexists(ipc.RELEASE):raise RuntimeError('release_exists')
    for unit,user,secret in ipc.PROFILES.values():
        helper.safe(Path(secret));s=Path(secret).lstat()
        if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_gid!=0 or s.st_nlink!=1 or stat.S_IMODE(s.st_mode)!=0o600 or not 16<=s.st_size<=128:raise RuntimeError('secret_metadata')
        r=subprocess.run(['/usr/bin/systemctl','show',unit,'-p','LoadState','--value'],capture_output=True,text=True,timeout=5)
        if r.stdout.strip()!='not-found':raise RuntimeError('unit_exists')
    import pwd,grp
    if pwd.getpwnam('infraflow-demo-worker').pw_uid!=994 or grp.getgrnam('infraflow-demo-worker').gr_gid!=985:raise RuntimeError('worker_identity')
    for db in ('passwd','group'):
        r=subprocess.run(['/usr/bin/getent',db,'infraflow-os-pilot-exec'],capture_output=True,text=True,timeout=5)
        if r.returncode!=2 or r.stdout or r.stderr:raise RuntimeError('dynamic_identity_exists')
    if not (DRIVER/'mssql/package.json').is_file():raise RuntimeError('driver_missing')

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or sys.argv[1:] not in (['--check-only'],['--probe-confirmed']):sys.exit('LINUX_ROOT_EXPLICIT_MODE_REQUIRED')
    stage='preflight';pipes=[]
    try:
        ipc=module('os-pilot-sql-ipc');helper=module('prepare-demo-adapter-review-credential')
        preflight(ipc,helper)
        if sys.argv[1:]==['--check-only']:
            print('OS_SQL_BROKERS_PREFLIGHT_OK\nNO_SQL_NO_SECRET_READ_NO_WRITE');return
        stage='staging'
        source=Path(__file__).resolve().parents[2]/'server/demo-platform';data={}
        for name in FILES:
            p=source/name;s=p.lstat()
            if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_size>100000:raise RuntimeError('source_invalid')
            data[name]=p.read_bytes();subprocess.run(['/usr/local/bin/node','--check',str(p)],capture_output=True,check=True,timeout=10)
        ipc.RELEASE.mkdir(mode=0o755)
        os.chown(ipc.RELEASE,0,0);os.chmod(ipc.RELEASE,0o755)
        for name,value in data.items():helper.secure_write(ipc.RELEASE/name,value,0o644)
        helper.secure_write(ipc.RELEASE/'package.json',b'{"private":true,"type":"commonjs"}\n',0o644)
        (ipc.RELEASE/'node_modules').symlink_to(DRIVER,target_is_directory=True)
        for role in ('worker','executor'):
            stage=role+'_metadata'
            pipe=ipc.SqlPipe(role);pipes.append(pipe)
            payload={'jobId':JOB,'trialId':TRIAL,'intentId':INTENT,'expectedJobRevision':5} if role=='worker' else {'binding':{'jobId':JOB,'trialId':TRIAL,'intentId':INTENT,'generation':3,'jobRevision':6}}
            pipe.call('init',payload);pipe.call('check',{})
            print('OS_SQL_'+role.upper()+'_METADATA_OK')
            stage=role+'_cross_role_refusal'
            try:pipe.call('accept' if role=='worker' else 'claim',{})
            except RuntimeError:
                if not pipe.rejected:raise RuntimeError('cross_role_refusal_unconfirmed')
            else:raise RuntimeError('cross_role_accepted')
            # Refusal poisons the session; EOF closes it without any compensating RPC.
            pipe.close()
            print('OS_SQL_'+role.upper()+'_CROSS_ROLE_REFUSED')
        stage='cleanup_verification'
        for unit,_,_ in ipc.PROFILES.values():
            r=subprocess.run(['/usr/bin/systemctl','show',unit,'-p','ActiveState','--value'],capture_output=True,text=True,timeout=5)
            if r.stdout.strip() not in ('inactive','failed'):raise RuntimeError('unit_not_stopped')
        print('OS_SQL_BROKERS_STOPPED\nNO_JOB_NO_SQL_WRITE_NO_ACCOUNT_NO_EXISTING_SERVICE_RESTART')
    except Exception:
        print('OS_SQL_BROKERS_UNCONFIRMED_STAGE='+stage)
        print('NO_AUTOMATIC_RETRY_REVIEW_REQUIRED');sys.exitCode=1
    finally:
        failed=False
        for pipe in pipes:
            try:pipe.close()
            except Exception:failed=True
        if failed:print('OS_SQL_BROKER_CLEANUP_REQUIRES_REVIEW');sys.exitCode=1
    if getattr(sys,'exitCode',0):raise SystemExit(1)

if __name__=='__main__':main()
