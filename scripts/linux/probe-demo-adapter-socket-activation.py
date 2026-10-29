#!/usr/bin/env python3
"""Temporary systemd socket/service canary. No SQL, real secrets or permanent units."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import tempfile

BASE='infraflow-demo-adapter-activation-check'
SOCKET='/run/'+BASE+'.sock'
FILES=('adapter-activation-canary-check.py','adapter-systemd-canary-check.py','adapter-review-socket.py')

def load(file):
    spec=importlib.util.spec_from_file_location('activation_support',Path(__file__).with_name(file))
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def unit_state(suffix):
    r=subprocess.run(['/usr/bin/systemctl','show',BASE+suffix,'--no-pager','-p','LoadState','-p','ActiveState'],capture_output=True,text=True,timeout=5)
    return dict(line.split('=',1) for line in r.stdout.splitlines() if '=' in line)

def absent(value):return value.get('LoadState')=='not-found'
def stopped(value):return absent(value) or value.get('ActiveState') in ('inactive','failed')

def command(directory):
    return ['/usr/bin/systemd-run','--quiet','--collect','--unit='+BASE,
            '--socket-property=ListenStream='+SOCKET,'--socket-property=SocketUser=root',
            '--socket-property=SocketGroup=infraflow-demo-worker','--socket-property=SocketMode=0660',
            '--socket-property=Accept=no','--socket-property=Backlog=1',
            '--socket-property=CollectMode=inactive-or-failed',
            '--property=Type=exec','--property=User=infraflow-demo-adapter-review',
            '--property=Group=infraflow-demo-adapter-review','--property=SupplementaryGroups=',
            '--property=NoNewPrivileges=yes','--property=ProtectSystem=strict','--property=ProtectHome=yes',
            '--property=PrivateTmp=yes','--property=PrivateDevices=yes','--property=PrivateNetwork=yes',
            '--property=RestrictAddressFamilies=AF_UNIX','--property=CapabilityBoundingSet=',
            '--property=KillMode=control-group','--property=MemoryMax=64M','--property=TasksMax=16',
            '--property=RuntimeMaxSec=45s',
            '--property=LoadCredential=adapter-canary:'+str(directory/'private/canary'),
            '/usr/bin/python3','-B',str(directory/FILES[0]),str(directory/'private/canary')]

def call_as(client,uid,gid,payload):
    r,w=os.pipe()
    pid=os.fork()
    if pid==0:
        os.close(r)
        try:
            value=client(SOCKET,uid,gid,payload)
            os.write(w,json.dumps(value).encode('ascii'))
            code=0
        except Exception:code=1
        finally:os.close(w)
        os._exit(code)
    os.close(w)
    try:
        _,status=os.waitpid(pid,0)
        if not os.WIFEXITED(status) or os.WEXITSTATUS(status)!=0:raise RuntimeError()
        data=os.read(r,4097)
        if len(data)>4096:raise RuntimeError()
        return json.loads(data)
    finally:
        os.close(r)
        try:
            waited,_=os.waitpid(pid,os.WNOHANG)
            if waited==0:
                os.kill(pid,signal.SIGKILL)
                os.waitpid(pid,0)
        except ChildProcessError:pass

def cleanup(directory):
    if directory.parent!=Path('/run') or not directory.name.startswith('infraflow-adapter-activation-probe-'):
        raise RuntimeError()
    for parent in (directory,directory/'private'):
        info=parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0:raise RuntimeError()
    for path in [directory/'private/canary',*(directory/name for name in FILES)]:
        info=path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_nlink!=1:raise RuntimeError()
        path.unlink()
    socket=Path(SOCKET)
    if socket.exists() or socket.is_symlink():
        info=socket.lstat()
        if not stat.S_ISSOCK(info.st_mode) or info.st_uid!=0:raise RuntimeError()
        socket.unlink()
    (directory/'private').rmdir()
    directory.rmdir()

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or sys.argv[1:]!=['--activation-probe-confirmed']:
        sys.exit('LINUX_ROOT_AND_ACTIVATION_CONFIRMATION_REQUIRED')
    import pwd
    adapter=pwd.getpwnam('infraflow-demo-adapter-review');worker=pwd.getpwnam('infraflow-demo-worker');nobody=pwd.getpwnam('nobody')
    if (adapter.pw_uid,adapter.pw_gid,adapter.pw_dir,adapter.pw_shell)!=(993,984,'/nonexistent','/usr/sbin/nologin') or (worker.pw_uid,worker.pw_gid,worker.pw_dir,worker.pw_shell)!=(994,985,'/nonexistent','/usr/sbin/nologin') or nobody.pw_uid in (0,993,994) or nobody.pw_gid==985:
        sys.exit('ACTIVATION_IDENTITIES_REQUIRE_REVIEW')
    if not absent(unit_state('.socket')) or not absent(unit_state('.service')) or os.path.lexists(SOCKET):
        sys.exit('ACTIVATION_RESOURCES_EXIST_NO_CHANGES')
    info=os.lstat('/run')
    if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:sys.exit('ACTIVATION_PARENT_REFUSED')
    canary=load('probe-demo-adapter-systemd-canary.py')
    kernel=load('probe-demo-adapter-channel-kernel.py')
    source=Path(__file__).parent
    data={}
    for name in FILES:
        path=source/name
        if path.is_symlink() or not path.is_file():sys.exit('ACTIVATION_SOURCE_REFUSED')
        data[name]=path.read_bytes()
    directory=Path(tempfile.mkdtemp(prefix='infraflow-adapter-activation-probe-',dir='/run'))
    started=False;success=False
    try:
        os.chmod(directory,0o755);(directory/'private').mkdir(mode=0o700)
        canary.write_new(directory/'private/canary',canary.CANARY,0o600)
        for name,value in data.items():canary.write_new(directory/name,value,0o444)
        r=subprocess.run(command(directory),capture_output=True,text=True,timeout=15)
        if r.returncode!=0:raise RuntimeError()
        started=True
        if unit_state('.socket').get('ActiveState')!='active' or unit_state('.service').get('ActiveState')!='inactive':raise RuntimeError()
        print('SYSTEMD_SOCKET_LAZY_START_OK',flush=True)
        value=call_as(kernel.child_client,994,985,kernel.REQUEST)
        if value!={'ok':True,'receipt':kernel.RECEIPT}:raise RuntimeError()
        print('SYSTEMD_ACTIVATED_WORKER_CANARY_OK',flush=True)
        if unit_state('.service').get('ActiveState')!='active':raise RuntimeError()
        if call_as(kernel.child_client,0,0,kernel.REQUEST)!={'ok':False,'code':'review_unconfirmed'}:raise RuntimeError()
        print('SYSTEMD_SOCKET_ROOT_DENIED_OK',flush=True)
        if call_as(kernel.child_client,nobody.pw_uid,nobody.pw_gid,kernel.REQUEST)!={'permissionDenied':True}:raise RuntimeError()
        print('SYSTEMD_SOCKET_DAC_DENIED_OK',flush=True)
        success=True
    except Exception:print('SYSTEMD_ACTIVATION_PROBE_UNCONFIRMED',flush=True)
    finally:
        try:
            if started:
                subprocess.run(['/usr/bin/systemctl','stop',BASE+'.socket',BASE+'.service'],check=True,capture_output=True,timeout=15)
            if not stopped(unit_state('.socket')) or not stopped(unit_state('.service')):raise RuntimeError()
            cleanup(directory)
            print('SYSTEMD_ACTIVATION_CLEANUP_OK',flush=True)
        except Exception:
            success=False
            print('SYSTEMD_ACTIVATION_CLEANUP_REQUIRES_REVIEW',flush=True)
    if not success:sys.exit(1)
    print('NO_SQL_NO_REAL_SECRETS_NO_EXISTING_SERVICE_RESTART')

if __name__=='__main__':main()
