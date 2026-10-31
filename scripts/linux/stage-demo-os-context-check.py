#!/usr/bin/env python3
"""Versioned metadata-only checker, using the existing root-owned credential."""
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import sys

SECRET=Path('/etc/infraflow-demo-platform/os-executor.password')
RELEASE=Path('/opt/infraflow-demo-platform/releases/os-executor-context-check-v1')
DRIVER=Path('/opt/infraflow-demo-platform/releases/sql-reader-v1/node_modules')
UNIT='infraflow-demo-os-context-check.service'
USER='infraflow-os-context-check'
FILES=('os-executor-context-sql-check.js','os-executor-context-credential-probe.js')

def support():
    spec=importlib.util.spec_from_file_location('credential_support',Path(__file__).with_name('prepare-demo-adapter-review-credential.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def preflight(helper):
    helper.safe(RELEASE.parent);helper.safe(SECRET);helper.safe(DRIVER)
    if os.path.lexists(RELEASE) or not RELEASE.parent.is_dir():raise RuntimeError('release_exists_or_parent_missing')
    s=SECRET.lstat()
    if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_gid!=0 or s.st_nlink!=1 or stat.S_IMODE(s.st_mode)!=0o600 or not 16<=s.st_size<=128:
        raise RuntimeError('secret_metadata_invalid')
    if not (DRIVER/'mssql/package.json').is_file():raise RuntimeError('driver_missing')
    r=subprocess.run(['/usr/bin/systemctl','show',UNIT,'--no-pager','-p','LoadState'],capture_output=True,text=True,timeout=5)
    if r.stdout.strip()!='LoadState=not-found':raise RuntimeError('probe_unit_exists')
    for database in ('passwd','group'):
        r=subprocess.run(['/usr/bin/getent',database,USER],capture_output=True,text=True,timeout=5)
        if r.returncode!=2 or r.stdout or r.stderr:raise RuntimeError('dynamic_identity_not_free')

def command():
    return ['/usr/bin/systemd-run','--quiet','--wait','--pipe','--collect','--unit='+UNIT,
        '--property=DynamicUser=yes','--property=User='+USER,'--property=Group='+USER,
        '--property=SupplementaryGroups=','--property=NoNewPrivileges=yes','--property=ProtectSystem=strict',
        '--property=ProtectHome=yes','--property=PrivateTmp=yes','--property=PrivateDevices=yes',
        '--property=RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6','--property=IPAddressDeny=any',
        '--property=IPAddressAllow=localhost','--property=CapabilityBoundingSet=','--property=KillMode=control-group',
        '--property=MemoryMax=256M','--property=TasksMax=64','--property=RuntimeMaxSec=30s',
        '--property=LoadCredential=os-executor-sql-password:'+str(SECRET),
        '/usr/local/bin/node',str(RELEASE/'os-executor-context-credential-probe.js')]

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or sys.argv[1:] not in (['--check-only'],['--stage-confirmed']):
        sys.exit('LINUX_ROOT_AND_EXPLICIT_MODE_REQUIRED')
    stage='preflight fara citirea secretului'
    try:
        helper=support();preflight(helper)
        if sys.argv[1:] == ['--check-only']:
            print('OS_CONTEXT_CHECK_DESTINATIONS_OK\nNO_SQL_NO_SECRET_READ_NO_WRITE');return
        source=Path(__file__).resolve().parents[2]/'server/demo-platform';data={}
        for name in FILES:
            p=source/name;s=p.lstat()
            if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_size>100000:raise RuntimeError('source_invalid')
            data[name]=p.read_bytes()
            subprocess.run(['/usr/local/bin/node','--check',str(p)],check=True,capture_output=True,timeout=10)
        stage='staging verificator nou'
        RELEASE.mkdir(mode=0o755);os.chown(RELEASE,0,0);os.chmod(RELEASE,0o755)
        for name,value in data.items():helper.secure_write(RELEASE/name,value,0o644)
        helper.secure_write(RELEASE/'package.json',b'{"private":true,"type":"commonjs"}\n',0o644)
        (RELEASE/'node_modules').symlink_to(DRIVER,target_is_directory=True)
        stage='verificare trei RPC prin metadate systemd'
        r=subprocess.run(command(),capture_output=True,text=True,timeout=40)
        if r.returncode or r.stdout.split()!=['OS_EXECUTOR_CONTEXT_CREDENTIAL_SQL_OK']:raise RuntimeError('systemd_check_failed')
        print('OS_EXECUTOR_CONTEXT_CREDENTIAL_SQL_OK\nOS_CONTEXT_CHECKER_STAGED\nNO_RPC_NO_JOB_NO_OS_ACCOUNT_NO_EXISTING_SERVICE_RESTART')
    except Exception as error:
        allowed={'release_exists_or_parent_missing','secret_metadata_invalid','driver_missing','probe_unit_exists','dynamic_identity_not_free','source_invalid','systemd_check_failed','unsafe_path'}
        code=str(error) if type(error) is RuntimeError and str(error) in allowed else 'context_checker_step_failed'
        print('Oprit la etapa: '+stage+'\nCod diagnostic: '+code+'\nNu relua automat. Fisierele partiale sunt pastrate; credentiala existenta nu a fost modificata.')
        sys.exit(1)

if __name__=='__main__':main()
