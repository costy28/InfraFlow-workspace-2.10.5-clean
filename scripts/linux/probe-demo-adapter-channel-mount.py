#!/usr/bin/env python3
"""Mount the staged real receiver temporarily. Root peer is denied before SQL."""
import hashlib
import json
import os
from pathlib import Path
import socket
import stat
import subprocess
import sys

BASE='infraflow-demo-adapter-review'
SOCKET=Path('/run/infraflow-demo-adapter-review.sock')
RELEASE=Path('/opt/infraflow-demo-platform/releases/adapter-channel-v1')
SECRET=Path('/etc/infraflow-demo-platform/adapter-review.password')
FILES=('adapter-ticket-client.js','adapter-ticket-sql.js','adapter-channel-client.js',
       'adapter-consume-stdin.js','provision-lease-runtime.js','provision-lease-sql.js',
       'provision-lease-command.js','provision-lease-client.js','channel-review-sql.js',
       'channel-review-cycle.js','channel-review-probe.js','adapter-review-socket.py')

def state(unit):
    result=subprocess.run(['/usr/bin/systemctl','show',unit,'--no-pager','-p','LoadState','-p','ActiveState'],
                          capture_output=True,text=True,timeout=5)
    return dict(line.split('=',1) for line in result.stdout.splitlines() if '=' in line)

def safe(path,regular=False):
    for item in (path,*path.parents):
        info=item.lstat()
        if stat.S_ISLNK(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:raise RuntimeError()
        if item==path and regular and (not stat.S_ISREG(info.st_mode) or info.st_nlink!=1):raise RuntimeError()

def check_release():
    safe(RELEASE);safe(Path('/run'));safe(SECRET,True)
    info=SECRET.lstat()
    if stat.S_IMODE(info.st_mode)!=0o600 or info.st_gid!=0 or not 16<=info.st_size<=128:raise RuntimeError()
    manifest_file=RELEASE/'stage-manifest.json';safe(manifest_file,True)
    manifest=json.loads(manifest_file.read_text(encoding='ascii'))
    if type(manifest) is not dict or set(manifest)!=set(FILES):raise RuntimeError()
    for name in FILES:
        file=RELEASE/name;safe(file,True)
        if hashlib.sha256(file.read_bytes()).hexdigest()!=manifest[name]:raise RuntimeError()
    safe(RELEASE/'package.json',True)
    if (RELEASE/'package.json').read_bytes()!=b'{"private":true,"type":"commonjs"}\n':raise RuntimeError()
    driver=Path('/opt/infraflow-demo-platform/releases/sql-reader-v1/node_modules')
    if not (RELEASE/'node_modules').is_symlink() or os.readlink(RELEASE/'node_modules')!=str(driver):raise RuntimeError()
    safe(driver)

def command():
    return ['/usr/bin/systemd-run','--quiet','--collect','--unit='+BASE,
            '--socket-property=ListenStream='+str(SOCKET),'--socket-property=SocketUser=root',
            '--socket-property=SocketGroup=infraflow-demo-worker','--socket-property=SocketMode=0660',
            '--socket-property=Accept=no','--socket-property=Backlog=1','--socket-property=RemoveOnStop=yes',
            '--socket-property=CollectMode=inactive-or-failed',
            '--property=Type=exec','--property=User=infraflow-demo-adapter-review',
            '--property=Group=infraflow-demo-adapter-review','--property=SupplementaryGroups=',
            '--property=NoNewPrivileges=yes','--property=ProtectSystem=strict','--property=ProtectHome=yes',
            '--property=PrivateTmp=yes','--property=PrivateDevices=yes','--property=CapabilityBoundingSet=',
            '--property=RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6',
            '--property=IPAddressDeny=any','--property=IPAddressAllow=localhost',
            '--property=KillMode=control-group','--property=MemoryMax=128M','--property=TasksMax=32',
            '--property=RuntimeMaxSec=30s',
            '--property=LoadCredential=adapter-sql-password:'+str(SECRET),
            '/usr/bin/python3','-B',str(RELEASE/'adapter-review-socket.py'),'--serve-review-only']

def root_request():
    # Unauthorized kernel peer: send no request/ticket at all.
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as client:
        client.settimeout(5);client.connect(str(SOCKET))
        client.shutdown(socket.SHUT_WR)
        raw=b''
        while True:
            chunk=client.recv(1024)
            if not chunk:break
            raw+=chunk
            if len(raw)>1024:raise RuntimeError()
    if json.loads(raw)!= {'ok':False,'code':'review_unconfirmed'}:raise RuntimeError()

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or sys.argv[1:]!=['--mount-probe-confirmed']:
        sys.exit('LINUX_ROOT_MOUNT_PROBE_CONFIRMATION_REQUIRED')
    started=False;attempted=False;success=False
    try:
        import pwd
        for name,uid,gid in [('infraflow-demo-adapter-review',993,984),('infraflow-demo-worker',994,985)]:
            u=pwd.getpwnam(name)
            if (u.pw_uid,u.pw_gid,u.pw_dir,u.pw_shell)!=(uid,gid,'/nonexistent','/usr/sbin/nologin'):raise RuntimeError()
        check_release()
        if os.path.lexists(SOCKET):raise RuntimeError()
        for unit in (BASE+'.socket',BASE+'.service','infraflow-demo-channel-cycle.service'):
            if state(unit).get('LoadState')!='not-found':raise RuntimeError()
        attempted=True
        subprocess.run(command(),check=True,capture_output=True,timeout=15)
        started=True
        if state(BASE+'.socket').get('ActiveState')!='active' or state(BASE+'.service').get('ActiveState')!='inactive':raise RuntimeError()
        print('REAL_ADAPTER_SOCKET_LAZY_START_OK',flush=True)
        root_request()
        if state(BASE+'.service').get('ActiveState')!='active':raise RuntimeError()
        print('REAL_ADAPTER_ROOT_PEER_DENIED_OK',flush=True)
        success=True
    except Exception:
        print('ADAPTER_MOUNT_PROBE_UNCONFIRMED',flush=True)
    finally:
        if started:
            try:
                subprocess.run(['/usr/bin/systemctl','stop',BASE+'.socket',BASE+'.service'],check=True,capture_output=True,timeout=15)
                for unit in (BASE+'.socket',BASE+'.service'):
                    s=state(unit)
                    if s.get('LoadState')!='not-found' and s.get('ActiveState')!='inactive':raise RuntimeError()
                if os.path.lexists(SOCKET):raise RuntimeError()
                print('REAL_ADAPTER_MOUNT_CLEANUP_OK',flush=True)
            except Exception:
                success=False;print('MOUNT_CLEANUP_REQUIRES_REVIEW_NO_AUTOMATIC_RETRY',flush=True)
        elif attempted:
            print('PARTIAL_TRANSIENT_UNITS_REQUIRE_REVIEW_NO_AUTOMATIC_RETRY',flush=True)
        else:
            print('PREFLIGHT_FAILED_NO_UNIT_CREATED',flush=True)
    if not success:sys.exit(1)
    print('NO_SQL_RPC_NO_JOB_NO_TICKET_NO_EXISTING_SERVICE_RESTART')

if __name__=='__main__':main()
