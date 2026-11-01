#!/usr/bin/env python3
"""Stage a separate five-RPC metadata checker; reuse existing root credential."""
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import sys

SECRET=Path('/etc/infraflow-demo-platform/lease-sql.password')
RELEASE=Path('/opt/infraflow-demo-platform/releases/worker-directory-check-v1')
DRIVER=Path('/opt/infraflow-demo-platform/releases/sql-reader-v1/node_modules')
UNIT='infraflow-demo-worker-directory-check.service'
USER='infraflow-worker-dir-check'
FILES=('worker-directory-sql-check.js','worker-directory-credential-probe.js')

def support():
    spec=importlib.util.spec_from_file_location('support',Path(__file__).with_name('prepare-demo-adapter-review-credential.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def command():
    return ['/usr/bin/systemd-run','--quiet','--wait','--pipe','--collect','--unit='+UNIT,
        '--property=DynamicUser=yes','--property=User='+USER,'--property=Group='+USER,
        '--property=SupplementaryGroups=','--property=NoNewPrivileges=yes','--property=ProtectSystem=strict',
        '--property=ProtectHome=yes','--property=PrivateTmp=yes','--property=PrivateDevices=yes',
        '--property=RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6',
        '--property=IPAddressDeny=any','--property=IPAddressAllow=localhost',
        '--property=CapabilityBoundingSet=','--property=KillMode=control-group',
        '--property=MemoryMax=256M','--property=TasksMax=64','--property=RuntimeMaxSec=30s',
        '--property=LoadCredential=worker-directory-sql-password:'+str(SECRET),
        '/usr/local/bin/node',str(RELEASE/'worker-directory-credential-probe.js')]

def preflight(helper):
    helper.safe(RELEASE.parent);helper.safe(SECRET.parent);helper.safe(DRIVER)
    if not RELEASE.parent.is_dir() or os.path.lexists(RELEASE):raise RuntimeError('release_exists_or_parent_missing')
    info=SECRET.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_gid!=0 or stat.S_IMODE(info.st_mode)!=0o600 or info.st_nlink!=1 or not 16<=info.st_size<=128:
        raise RuntimeError('secret_metadata_requires_review')
    if not (DRIVER/'mssql/package.json').is_file():raise RuntimeError('driver_missing')
    r=subprocess.run(['/usr/bin/systemctl','show',UNIT,'--no-pager','-p','LoadState'],capture_output=True,text=True,timeout=5)
    if r.returncode or r.stdout.strip()!='LoadState=not-found':raise RuntimeError('unit_exists')
    for database in ('passwd','group'):
        r=subprocess.run(['/usr/bin/getent',database,USER],capture_output=True,text=True,timeout=5)
        if r.returncode!=2 or r.stdout or r.stderr:raise RuntimeError('dynamic_identity_not_free')

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or sys.argv[1:] not in (['--preflight-only'],['--stage-and-probe-confirmed']):
        sys.exit('LINUX_ROOT_EXPLICIT_MODE_REQUIRED')
    stage='preflight fara scrieri sau citire parola'
    try:
        helper=support();preflight(helper)
        source=Path(__file__).resolve().parents[2]/'server/demo-platform';data={}
        for name in FILES:
            path=source/name;info=path.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or info.st_size>100000:raise RuntimeError('source_invalid')
            data[name]=path.read_bytes()
            subprocess.run(['/usr/local/bin/node','--check',str(path)],check=True,capture_output=True,timeout=10)
        if sys.argv[1:] == ['--preflight-only']:
            print('WORKER_DIRECTORY_CHECK_PREFLIGHT_OK\nNO_SQL_NO_SECRET_READ_NO_WRITE');return
        stage='pregatire checker separat'
        RELEASE.mkdir(mode=0o755);os.chown(RELEASE,0,0);os.chmod(RELEASE,0o755)
        for name,value in data.items():helper.secure_write(RELEASE/name,value,0o644)
        helper.secure_write(RELEASE/'package.json',b'{"private":true,"type":"commonjs"}\n',0o644)
        (RELEASE/'node_modules').symlink_to(DRIVER,target_is_directory=True)
        stage='systemd autentificare si metadate fara RPC'
        r=subprocess.run(command(),capture_output=True,text=True,timeout=40)
        if r.returncode or r.stdout.split()!=['WORKER_DIRECTORY_CREDENTIAL_SQL_OK']:raise RuntimeError('metadata_probe_unconfirmed')
        print('WORKER_DIRECTORY_FIVE_RPC_METADATA_OK\nNO_JOB_NO_RPC_NO_DIRECTORY_NO_EXISTING_SERVICE_RESTART')
    except Exception as error:
        allowed={'release_exists_or_parent_missing','secret_metadata_requires_review','driver_missing','unit_exists','dynamic_identity_not_free','source_invalid','metadata_probe_unconfirmed','unsafe_path'}
        code=str(error) if type(error) is RuntimeError and str(error) in allowed else 'probe_step_failed'
        print('Oprit la etapa: '+stage+'\nCod diagnostic: '+code+'\nNu relua automat. Codul partial pregatit ramane pentru verificare.')
        sys.exit(1)

if __name__=='__main__':main()
