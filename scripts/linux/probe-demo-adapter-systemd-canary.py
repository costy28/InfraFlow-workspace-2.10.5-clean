#!/usr/bin/env python3
"""Transient systemd canary credential probe; no SQL, real secrets or persistent unit."""
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile

UNIT='infraflow-demo-adapter-credential-check.service'
CANARY=b'InfraFlow-systemd-canary-v1'.ljust(32,b'.')

def state():
    r=subprocess.run(['/usr/bin/systemctl','show',UNIT,'--no-pager','-p','LoadState','-p','ActiveState'],
                     capture_output=True,text=True,timeout=5)
    values=dict(line.split('=',1) for line in r.stdout.splitlines() if '=' in line)
    if values.get('LoadState')=='not-found':
        return 'absent'
    if values.get('ActiveState') in ('inactive','failed'):
        return 'stopped'
    return 'uncertain'

def command(directory):
    return ['/usr/bin/systemd-run','--quiet','--wait','--pipe','--collect',
            '--unit='+UNIT,'--property=User=infraflow-demo-adapter-review',
            '--property=Group=infraflow-demo-adapter-review','--property=SupplementaryGroups=',
            '--property=NoNewPrivileges=yes','--property=ProtectSystem=strict',
            '--property=ProtectHome=yes','--property=PrivateTmp=yes','--property=PrivateDevices=yes',
            '--property=PrivateNetwork=yes','--property=RestrictAddressFamilies=AF_UNIX',
            '--property=CapabilityBoundingSet=','--property=KillMode=control-group',
            '--property=MemoryMax=64M','--property=TasksMax=16','--property=RuntimeMaxSec=20s',
            '--property=LoadCredential=adapter-canary:'+str(directory/'private/canary'),
            '/usr/bin/python3','-B',str(directory/'check.py'),str(directory/'private/canary')]

def write_new(path,data,mode):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    with os.fdopen(fd,'wb') as stream:
        os.fchmod(stream.fileno(),mode)
        stream.write(data)

def cleanup(directory):
    if directory.parent!=Path('/run') or not directory.name.startswith('infraflow-adapter-credential-probe-'):
        raise RuntimeError()
    info=directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0:
        raise RuntimeError()
    private=directory/'private'
    if private.exists() or private.is_symlink():
        info=private.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0:
            raise RuntimeError()
    for path in [directory/'private/canary',directory/'check.py']:
        if path.exists() or path.is_symlink():
            info=path.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_nlink!=1:
                raise RuntimeError()
            path.unlink()
    if private.exists():
        info=private.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0:
            raise RuntimeError()
        private.rmdir()
    directory.rmdir()

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or sys.argv[1:]!=['--canary-probe-confirmed']:
        sys.exit('LINUX_ROOT_AND_CANARY_CONFIRMATION_REQUIRED')
    import pwd
    identity=pwd.getpwnam('infraflow-demo-adapter-review')
    if (identity.pw_uid,identity.pw_gid,identity.pw_dir,identity.pw_shell)!=(993,984,'/nonexistent','/usr/sbin/nologin'):
        sys.exit('ADAPTER_IDENTITY_REVIEW_REQUIRED')
    if state()!='absent':
        sys.exit('CANARY_UNIT_EXISTS_STOP_NO_CHANGES')
    info=os.lstat('/run')
    if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:
        sys.exit('CANARY_PARENT_REFUSED')
    source=Path(__file__).with_name('adapter-systemd-canary-check.py')
    if source.is_symlink() or not source.is_file():
        sys.exit('CANARY_SOURCE_REFUSED')
    data=source.read_bytes()
    directory=Path(tempfile.mkdtemp(prefix='infraflow-adapter-credential-probe-',dir='/run'))
    success=False
    try:
        os.chmod(directory,0o755)
        (directory/'private').mkdir(mode=0o700)
        write_new(directory/'private/canary',CANARY,0o600)
        write_new(directory/'check.py',data,0o444)
        r=subprocess.run(command(directory),capture_output=True,text=True,timeout=30)
        if r.returncode!=0 or r.stdout.split()!=['ADAPTER_SYSTEMD_CANARY_OK']:
            raise RuntimeError()
        print('ADAPTER_SYSTEMD_CANARY_OK',flush=True)
        success=True
    except Exception:
        print('ADAPTER_SYSTEMD_PROBE_UNCONFIRMED',flush=True)
    finally:
        try:
            if state() not in ('absent','stopped'):
                raise RuntimeError()
            cleanup(directory)
            print('ADAPTER_CANARY_CLEANUP_OK',flush=True)
        except Exception:
            print('ADAPTER_CANARY_CLEANUP_REQUIRES_REVIEW',flush=True)
            success=False
    if not success:
        sys.exit(1)
    print('NO_SQL_NO_REAL_SECRETS_NO_EXISTING_SERVICE_RESTART')

if __name__=='__main__':
    main()
