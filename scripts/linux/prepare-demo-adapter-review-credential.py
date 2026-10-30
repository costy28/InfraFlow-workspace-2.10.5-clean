#!/usr/bin/env python3
"""Stage existing adapter SQL credential after native verification, then systemd metadata probe."""
import getpass
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

SECRET=Path('/etc/infraflow-demo-platform/adapter-review.password')
RELEASE=Path('/opt/infraflow-demo-platform/releases/adapter-sql-check-v1')
DRIVER=Path('/opt/infraflow-demo-platform/releases/sql-reader-v1/node_modules')
UNIT='infraflow-demo-adapter-sql-check.service'
FILES=('package.json','adapter-ticket-client.js','adapter-ticket-sql.js','adapter-review-credential-probe.js')

def safe(path):
    for item in (path,*path.parents):
        if item.is_symlink():raise RuntimeError('unsafe_path')
        if item.exists():
            s=item.stat()
            if s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('unsafe_path')

def secure_write(path,data,mode):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    with os.fdopen(fd,'wb') as stream:
        os.fchown(stream.fileno(),0,0);os.fchmod(stream.fileno(),mode)
        stream.write(data);stream.flush();os.fsync(stream.fileno())

def validate_password(password,again):
    if password!=again or not re.fullmatch(r'[\x20-\x7e]{16,128}',password):raise RuntimeError('password_format_invalid')

def input_command():
    return ['/usr/sbin/runuser','-u','infraflow-demo-adapter-review','--','/usr/local/bin/node',
            str(RELEASE/'adapter-review-credential-probe.js'),'--stdin-check']

def probe_command():
    return ['/usr/bin/systemd-run','--quiet','--wait','--pipe','--collect','--unit='+UNIT,
            '--property=User=infraflow-demo-adapter-review','--property=Group=infraflow-demo-adapter-review',
            '--property=SupplementaryGroups=','--property=NoNewPrivileges=yes','--property=ProtectSystem=strict',
            '--property=ProtectHome=yes','--property=PrivateTmp=yes','--property=PrivateDevices=yes',
            '--property=RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6',
            '--property=IPAddressDeny=any','--property=IPAddressAllow=localhost',
            '--property=CapabilityBoundingSet=','--property=KillMode=control-group',
            '--property=MemoryMax=256M','--property=TasksMax=64','--property=RuntimeMaxSec=30s',
            '--property=LoadCredential=adapter-sql-password:'+str(SECRET),
            '/usr/local/bin/node',str(RELEASE/'adapter-review-credential-probe.js')]

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or sys.argv[1:]!=['--prepare-confirmed'] or not sys.stdin.isatty():
        sys.exit('LINUX_ROOT_INTERACTIVE_AND_CONFIRMATION_REQUIRED')
    stage='preflight fara scrieri'
    try:
        import pwd
        u=pwd.getpwnam('infraflow-demo-adapter-review')
        if (u.pw_uid,u.pw_gid,u.pw_dir,u.pw_shell)!=(993,984,'/nonexistent','/usr/sbin/nologin'):raise RuntimeError('identity_requires_review')
        for target in (SECRET,RELEASE):
            safe(target.parent)
            if not target.parent.is_dir() or target.exists() or target.is_symlink():raise RuntimeError('target_exists_or_parent_missing')
        safe(DRIVER)
        if not (DRIVER/'mssql/package.json').is_file():raise RuntimeError('driver_missing')
        state=subprocess.run(['/usr/bin/systemctl','show',UNIT,'--no-pager','-p','LoadState'],capture_output=True,text=True,timeout=5)
        if state.stdout.strip()!='LoadState=not-found':raise RuntimeError('probe_unit_exists')
        source=Path(__file__).resolve().parents[2]/'server/demo-platform'
        data={}
        for name in FILES:
            file=source/name
            if file.is_symlink() or not stat.S_ISREG(file.lstat().st_mode):raise RuntimeError('source_invalid')
            data[name]=file.read_bytes()
            if name.endswith('.js'):
                subprocess.run(['/usr/local/bin/node','--check',str(file)],check=True,capture_output=True,timeout=10)
        stage='confirmare parola existenta fara scrieri'
        password=getpass.getpass('Parola SQL EXISTENTA infraflow_demo_adapter_review (NU SA/worker): ')
        again=getpass.getpass('Repeta parola SQL adaptor: ')
        validate_password(password,again)
        stage='pregatire fisiere proba fara credentiala'
        RELEASE.mkdir(mode=0o755);os.chown(RELEASE,0,0);os.chmod(RELEASE,0o755)
        for name,value in data.items():secure_write(RELEASE/name,value,0o644)
        (RELEASE/'node_modules').symlink_to(DRIVER,target_is_directory=True)
        stage='verificare SQL sub identitatea adaptorului fara fisier parola'
        result=subprocess.run(input_command(),input=password.encode('ascii'),capture_output=True,timeout=25,
                              env={'PATH':'/usr/local/bin:/usr/bin:/bin'})
        if result.returncode or result.stdout.split()!=[b'ADAPTER_REVIEW_SQL_INPUT_OK']:raise RuntimeError('sql_input_check_failed')
        stage='scriere credentiala root-only'
        secure_write(SECRET,password.encode('ascii'),0o600)
        del password,again
        stage='verificare credentiala systemd si metadate SQL'
        result=subprocess.run(probe_command(),capture_output=True,text=True,timeout=40)
        if result.returncode or result.stdout.split()!=['ADAPTER_REVIEW_CREDENTIAL_SQL_OK']:raise RuntimeError('systemd_check_failed')
        print('ADAPTER_REVIEW_CREDENTIAL_SQL_OK\nADAPTER_REVIEW_SECRET_PREPARED\nNO_JOB_NO_TICKET_NO_EXISTING_SERVICE_RESTART')
    except Exception as error:
        allowed={'unsafe_path','identity_requires_review','target_exists_or_parent_missing','driver_missing','probe_unit_exists','source_invalid','password_format_invalid','sql_input_check_failed','systemd_check_failed'}
        code=str(error) if type(error) is RuntimeError and str(error) in allowed else 'preparation_step_failed'
        print('Oprit la etapa: '+stage+'\nCod diagnostic: '+code)
        print('Nu relua automat. Fisierele partial create sunt pastrate; parola SQL nu a fost schimbata.')
        sys.exit(1)

if __name__=='__main__':main()
