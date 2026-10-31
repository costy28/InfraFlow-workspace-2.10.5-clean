#!/usr/bin/env python3
"""Stage immutable review-only code. No SQL, secrets, units, accounts or jobs modified."""
import ast
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

RELEASE=Path('/opt/infraflow-demo-platform/releases/adapter-channel-v1')
DRIVER=Path('/opt/infraflow-demo-platform/releases/sql-reader-v1/node_modules')
JS=('adapter-ticket-client.js','adapter-ticket-sql.js','adapter-channel-client.js',
    'adapter-consume-stdin.js','provision-lease-runtime.js','provision-lease-sql.js',
    'provision-lease-command.js','provision-lease-client.js','channel-review-sql.js',
    'channel-review-cycle.js','channel-review-probe.js')
UNITS=('infraflow-demo-adapter-review.socket','infraflow-demo-adapter-review.service',
       'infraflow-demo-channel-cycle.service')

def safe(path):
    for item in (path,*path.parents):
        info=item.lstat()
        if stat.S_ISLNK(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:
            raise RuntimeError()

def files(root):
    data={}
    for name in JS:
        path=root/'server/demo-platform'/name
        info=path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or info.st_size>100000:
            raise RuntimeError()
        data[name]=path.read_bytes()
        subprocess.run(['/usr/local/bin/node','--check',str(path)],check=True,capture_output=True,timeout=10)
    path=root/'scripts/linux/adapter-review-socket.py'
    info=path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or info.st_size>100000:
        raise RuntimeError()
    data[path.name]=path.read_bytes()
    ast.parse(data[path.name])
    return data

def write_new(path,data):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o644)
    with os.fdopen(fd,'wb') as stream:
        os.fchown(stream.fileno(),0,0);os.fchmod(stream.fileno(),0o644)
        stream.write(data);stream.flush();os.fsync(stream.fileno())

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or sys.argv[1:]!=['--stage-confirmed']:
        sys.exit('LINUX_ROOT_STAGE_CONFIRMATION_REQUIRED')
    writing=False
    try:
        import pwd
        for name,uid,gid in [('infraflow-demo-worker',994,985),('infraflow-demo-adapter-review',993,984)]:
            u=pwd.getpwnam(name)
            if (u.pw_uid,u.pw_gid,u.pw_dir,u.pw_shell)!=(uid,gid,'/nonexistent','/usr/sbin/nologin'):
                raise RuntimeError()
        safe(RELEASE.parent);safe(DRIVER)
        if os.path.lexists(RELEASE) or os.path.lexists('/run/infraflow-demo-adapter-review.sock'):
            raise RuntimeError()
        if not (DRIVER/'mssql/package.json').is_file():raise RuntimeError()
        for unit in UNITS:
            r=subprocess.run(['/usr/bin/systemctl','show',unit,'--no-pager','-p','LoadState'],capture_output=True,text=True,timeout=5)
            if r.stdout.strip()!='LoadState=not-found':raise RuntimeError()
        data=files(Path(__file__).resolve().parents[2])
        # No credential material or executable hooks in the generated manifest.
        manifest={name:hashlib.sha256(value).hexdigest() for name,value in data.items()}
        writing=True
        RELEASE.mkdir(mode=0o755);os.chown(RELEASE,0,0);os.chmod(RELEASE,0o755)
        for name,value in data.items():write_new(RELEASE/name,value)
        write_new(RELEASE/'package.json',b'{"private":true,"type":"commonjs"}\n')
        write_new(RELEASE/'stage-manifest.json',json.dumps(manifest,sort_keys=True).encode('ascii'))
        (RELEASE/'node_modules').symlink_to(DRIVER,target_is_directory=True)
        for name,value in data.items():
            safe(RELEASE/name)
            if (RELEASE/name).read_bytes()!=value:raise RuntimeError()
        print('ADAPTER_CHANNEL_FILES_STAGED\nNO_SQL_NO_CREDENTIAL_CHANGE_NO_UNIT_NO_JOB_NO_RESTART')
    except Exception:
        print('CHANNEL_STAGE_UNCONFIRMED')
        print('PARTIAL_RELEASE_PRESERVED_NO_AUTOMATIC_RETRY' if writing else 'PREFLIGHT_FAILED_NO_RELEASE_CREATED')
        sys.exit(1)

if __name__=='__main__':main()
