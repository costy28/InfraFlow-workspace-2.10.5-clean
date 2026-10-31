#!/usr/bin/env python3
"""Existing SQL password, root-only source, temporary DynamicUser metadata probes."""
import getpass
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import sys

SECRET=Path('/etc/infraflow-demo-platform/os-executor.password')
RELEASE=Path('/opt/infraflow-demo-platform/releases/os-executor-sql-check-v1')
DRIVER=Path('/opt/infraflow-demo-platform/releases/sql-reader-v1/node_modules')
UNITS=('infraflow-demo-os-sql-input-check.service','infraflow-demo-os-sql-check.service')
USERS=('infraflow-os-sql-input','infraflow-os-sql-check')
FILES=('os-executor-sql-check.js','os-executor-credential-probe.js')

def support():
    spec=importlib.util.spec_from_file_location('credential_support',Path(__file__).with_name('prepare-demo-adapter-review-credential.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def command(input_mode=False):
    unit=UNITS[0 if input_mode else 1];user=USERS[0 if input_mode else 1]
    args=['/usr/bin/systemd-run','--quiet','--wait','--pipe','--collect','--unit='+unit,
          '--property=DynamicUser=yes','--property=User='+user,'--property=Group='+user,
          '--property=SupplementaryGroups=','--property=NoNewPrivileges=yes','--property=ProtectSystem=strict',
          '--property=ProtectHome=yes','--property=PrivateTmp=yes','--property=PrivateDevices=yes',
          '--property=RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6',
          '--property=IPAddressDeny=any','--property=IPAddressAllow=localhost',
          '--property=CapabilityBoundingSet=','--property=KillMode=control-group',
          '--property=MemoryMax=256M','--property=TasksMax=64','--property=RuntimeMaxSec=30s']
    if not input_mode:args+=['--property=LoadCredential=os-executor-sql-password:'+str(SECRET)]
    args+=['/usr/local/bin/node',str(RELEASE/'os-executor-credential-probe.js')]
    if input_mode:args+=['--stdin-check']
    return args

def preflight(helper):
    for target in (SECRET,RELEASE):
        helper.safe(target.parent)
        if not target.parent.is_dir() or os.path.lexists(target):raise RuntimeError('target_exists_or_parent_missing')
    helper.safe(DRIVER)
    if not (DRIVER/'mssql/package.json').is_file():raise RuntimeError('driver_missing')
    for unit in UNITS:
        r=subprocess.run(['/usr/bin/systemctl','show',unit,'--no-pager','-p','LoadState'],capture_output=True,text=True,timeout=5)
        if r.stdout.strip()!='LoadState=not-found':raise RuntimeError('probe_unit_exists')
    for user in USERS:
        for database in ('passwd','group'):
            r=subprocess.run(['/usr/bin/getent',database,user],capture_output=True,text=True,timeout=5)
            if r.returncode!=2 or r.stdout or r.stderr:raise RuntimeError('dynamic_identity_not_free')

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or sys.argv[1:]!=['--prepare-confirmed'] or not sys.stdin.isatty():
        sys.exit('LINUX_ROOT_INTERACTIVE_AND_CONFIRMATION_REQUIRED')
    stage='preflight fara scrieri'
    try:
        helper=support();preflight(helper)
        source=Path(__file__).resolve().parents[2]/'server/demo-platform';data={}
        for name in FILES:
            path=source/name;info=path.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or info.st_size>100000:raise RuntimeError('source_invalid')
            data[name]=path.read_bytes()
            subprocess.run(['/usr/local/bin/node','--check',str(path)],check=True,capture_output=True,timeout=10)
        stage='confirmare parola SQL existenta fara scrieri'
        password=getpass.getpass('Parola SQL EXISTENTA infraflow_demo_os_executor (NU SA): ')
        again=getpass.getpass('Repeta parola SQL executor: ')
        helper.validate_password(password,again)
        stage='pregatire cod fara credentiala'
        RELEASE.mkdir(mode=0o755);os.chown(RELEASE,0,0);os.chmod(RELEASE,0o755)
        for name,value in data.items():helper.secure_write(RELEASE/name,value,0o644)
        helper.secure_write(RELEASE/'package.json',b'{"private":true,"type":"commonjs"}\n',0o644)
        (RELEASE/'node_modules').symlink_to(DRIVER,target_is_directory=True)
        stage='verificare parola SQL prin identitate temporara fara fisier secret'
        r=subprocess.run(command(True),input=password.encode('ascii'),capture_output=True,timeout=40)
        if r.returncode or r.stdout.split()!=[b'OS_EXECUTOR_SQL_INPUT_OK']:raise RuntimeError('sql_input_check_failed')
        stage='scriere credentiala root-only'
        helper.secure_write(SECRET,password.encode('ascii'),0o600)
        del password,again
        stage='verificare LoadCredential si drepturi SQL fara RPC'
        r=subprocess.run(command(),capture_output=True,text=True,timeout=40)
        if r.returncode or r.stdout.split()!=['OS_EXECUTOR_CREDENTIAL_SQL_OK']:raise RuntimeError('systemd_check_failed')
        print('OS_EXECUTOR_CREDENTIAL_SQL_OK\nOS_EXECUTOR_SECRET_PREPARED\nNO_DELEGATION_NO_RESULT_NO_JOB_NO_EXISTING_SERVICE_RESTART')
    except Exception as error:
        allowed={'target_exists_or_parent_missing','driver_missing','probe_unit_exists','dynamic_identity_not_free','source_invalid','password_format_invalid','sql_input_check_failed','systemd_check_failed','unsafe_path'}
        code=str(error) if type(error) is RuntimeError and str(error) in allowed else 'preparation_step_failed'
        print('Oprit la etapa: '+stage+'\nCod diagnostic: '+code)
        print('Nu relua automat. Fisierele partial create sunt pastrate; parola SQL nu a fost schimbata.')
        sys.exit(1)

if __name__=='__main__':main()
