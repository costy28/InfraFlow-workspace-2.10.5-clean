#!/usr/bin/env python3
"""Fixed broker handshake + metadata + shutdown. No prepare action."""
import importlib.util
import os
from pathlib import Path
import pwd
import stat
import subprocess
import sys

RELEASE=Path('/opt/infraflow-demo-platform/releases/directory-preparation-broker-v1')
DRIVER=Path('/opt/infraflow-demo-platform/releases/sql-reader-v1/node_modules')
SECRET=Path('/etc/infraflow-demo-platform/lease-sql.password')
UNIT='infraflow-demo-directory-preparer.service'
FILES=('directory-preparation-sql-broker.js','directory-preparation-rpc-client.js','worker-directory-sql-check.js')

def load(name,file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def preflight(helper):
    helper.safe(RELEASE.parent);helper.safe(SECRET.parent);helper.safe(DRIVER)
    if not RELEASE.parent.is_dir() or os.path.lexists(RELEASE):raise RuntimeError('release_exists_or_parent_missing')
    s=SECRET.lstat()
    if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_gid!=0 or stat.S_IMODE(s.st_mode)!=0o600 or s.st_nlink!=1 or not 16<=s.st_size<=128:raise RuntimeError('secret_metadata_requires_review')
    u=pwd.getpwnam('infraflow-demo-worker')
    if (u.pw_uid,u.pw_gid,u.pw_dir,u.pw_shell)!=(994,985,'/nonexistent','/usr/sbin/nologin'):raise RuntimeError('worker_identity_requires_review')
    if not (DRIVER/'mssql/package.json').is_file():raise RuntimeError('driver_missing')
    r=subprocess.run(['/usr/bin/systemctl','show',UNIT,'--no-pager','-p','LoadState'],capture_output=True,text=True,timeout=5)
    if r.stdout.strip()!='LoadState=not-found':raise RuntimeError('unit_exists')

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or sys.argv[1:] not in (['--preflight-only'],['--stage-and-probe-confirmed']):sys.exit('LINUX_ROOT_EXPLICIT_MODE_REQUIRED')
    stage='preflight fara scrieri sau citire parola'
    try:
        helper=load('support','prepare-demo-adapter-review-credential.py');preflight(helper)
        source=Path(__file__).resolve().parents[2]/'server/demo-platform';data={}
        for name in FILES:
            path=source/name;s=path.lstat()
            if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_size>100000:raise RuntimeError('source_invalid')
            data[name]=path.read_bytes()
            subprocess.run(['/usr/local/bin/node','--check',str(path)],check=True,capture_output=True,timeout=10)
        ipc=load('directory_ipc','directory-preparation-sql-ipc.py')
        if ipc.RELEASE!=RELEASE or set(ipc.PROFILES)!={'preparer'}:raise RuntimeError('ipc_profile_requires_review')
        if sys.argv[1:] == ['--preflight-only']:
            print('DIRECTORY_BROKER_PREFLIGHT_OK\nNO_SQL_NO_SECRET_READ_NO_WRITE');return
        stage='pregatire broker separat'
        RELEASE.mkdir(mode=0o755);os.chown(RELEASE,0,0);os.chmod(RELEASE,0o755)
        for name,value in data.items():helper.secure_write(RELEASE/name,value,0o644)
        helper.secure_write(RELEASE/'package.json',b'{"private":true,"type":"commonjs"}\n',0o644)
        (RELEASE/'node_modules').symlink_to(DRIVER,target_is_directory=True)
        stage='handshake si metadate systemd fara RPC'
        pipe=ipc.SqlPipe('preparer')
        try:
            # Synthetic binding is only parsed; no job/trial is queried or changed.
            binding={'jobId':'10000000-0000-0000-0000-000000000001','trialId':'20000000-0000-0000-0000-000000000002',
                'intentId':'30000000-0000-0000-0000-000000000003','priorOsIntentId':'40000000-0000-0000-0000-000000000004',
                'attemptId':'50000000-0000-0000-0000-000000000005','generation':4,'jobRevision':8,'uid':992,'gid':983}
            pipe.call('init',{'binding':binding})
            if pipe.call('check',{})!={'ok':True}:raise RuntimeError('metadata_probe_unconfirmed')
        finally:pipe.close()
        print('DIRECTORY_BROKER_SYSTEMD_METADATA_OK\nDIRECTORY_BROKER_PIPE_CLOSED\nNO_PREPARE_NO_JOB_NO_DIRECTORY_NO_EXISTING_SERVICE_RESTART')
    except Exception as error:
        allowed={'release_exists_or_parent_missing','secret_metadata_requires_review','worker_identity_requires_review','driver_missing','unit_exists','source_invalid','ipc_profile_requires_review','metadata_probe_unconfirmed','unsafe_path','directory_sql_stop_requires_review','directory_sql_pipe_unconfirmed'}
        code=str(error) if type(error) is RuntimeError and str(error) in allowed else 'broker_probe_failed'
        print('Oprit la etapa: '+stage+'\nCod diagnostic: '+code+'\nNu relua automat. Codul partial pregatit ramane pentru verificare.')
        sys.exit(1)

if __name__=='__main__':main()
