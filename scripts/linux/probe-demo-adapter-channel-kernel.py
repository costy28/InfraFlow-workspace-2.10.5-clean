#!/usr/bin/env python3
"""Ephemeral Linux AF_UNIX/SO_PEERCRED probe. No SQL, credentials or systemd changes."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import socket
import stat
import sys
import tempfile

REQUEST = {'intentId':'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ticketToken':'ab'*32}
RECEIPT = {'jobId':'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','intentId':REQUEST['intentId'],
           'generation':1,'jobRevision':1,'step':'os_identity','operation':'consume','executionAllowed':False}

def load_channel():
    spec=importlib.util.spec_from_file_location('review_channel',Path(__file__).with_name('adapter-review-socket.py'))
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def child_client(path, uid, gid, payload):
    if uid != 0:
        os.setgroups([])
        os.setgid(gid)
        os.setuid(uid)
    raw=bytearray()
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as conn:
        conn.settimeout(3)
        try:
            conn.connect(path)
        except PermissionError:
            return {'permissionDenied':True}
        try:
            conn.sendall(json.dumps(payload).encode('ascii'))
            conn.shutdown(socket.SHUT_WR)
        except (BrokenPipeError,ConnectionResetError):
            pass  # A denied peer may receive its refusal before finishing its write.
        try:
            while True:
                chunk=conn.recv(4096)
                if not chunk:
                    break
                raw.extend(chunk)
                if len(raw)>4096:
                    raise RuntimeError()
        except ConnectionResetError:
            if not raw:
                raise
    return json.loads(raw)

def exchange(listener,path,uid,gid,payload,channel,expect_connection=True):
    read_fd,write_fd=os.pipe()
    pid=os.fork()
    if pid==0:
        os.close(read_fd)
        listener.close()
        try:
            result=child_client(path,uid,gid,payload)
            os.write(write_fd,json.dumps(result).encode('ascii'))
            code=0
        except Exception:
            code=1
        finally:
            os.close(write_fd)
        os._exit(code)
    os.close(write_fd)
    try:
        if expect_connection:
            conn,_=listener.accept()
            with conn:
                # Canary response only. Never invokes the SQL/credential bridge.
                channel.handle(conn,consumer=lambda _:dict(RECEIPT))
        _,status=os.waitpid(pid,0)
        if not os.WIFEXITED(status) or os.WEXITSTATUS(status)!=0:
            raise RuntimeError()
        raw=os.read(read_fd,4097)
        if len(raw)>4096:
            raise RuntimeError()
        return json.loads(raw)
    finally:
        os.close(read_fd)
        try:
            waited,_=os.waitpid(pid,os.WNOHANG)
            if waited==0:
                os.kill(pid,signal.SIGKILL)
                os.waitpid(pid,0)
        except ChildProcessError:
            pass

def cleanup(directory,path):
    root=Path('/run')
    if directory.parent!=root or not directory.name.startswith('infraflow-adapter-channel-probe-') or directory.is_symlink():
        raise RuntimeError()
    info=directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0:
        raise RuntimeError()
    if path.exists() or path.is_symlink():
        info=path.lstat()
        if path.parent!=directory or not stat.S_ISSOCK(info.st_mode) or info.st_uid!=0:
            raise RuntimeError()
        path.unlink()
    directory.rmdir()  # No recursive deletion. Unexpected files require review.

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or sys.argv[1:]!=['--kernel-probe-confirmed']:
        sys.exit('LINUX_ROOT_AND_EXPLICIT_KERNEL_PROBE_REQUIRED')
    import pwd
    worker=pwd.getpwnam('infraflow-demo-worker')
    nobody=pwd.getpwnam('nobody')
    if (worker.pw_uid,worker.pw_gid,worker.pw_dir,worker.pw_shell)!=(994,985,'/nonexistent','/usr/sbin/nologin') or nobody.pw_uid in (0,994) or nobody.pw_gid==985:
        sys.exit('KERNEL_PROBE_IDENTITY_REVIEW_REQUIRED')
    info=os.lstat('/run')
    if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:
        sys.exit('KERNEL_PROBE_PARENT_REFUSED')
    channel=load_channel()
    directory=Path(tempfile.mkdtemp(prefix='infraflow-adapter-channel-probe-',dir='/run'))
    path=directory/'review.sock'
    success=False
    try:
        os.chown(directory,0,985)
        os.chmod(directory,0o750)
        with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as listener:
            listener.bind(str(path))
            os.chown(path,0,985)
            os.chmod(path,0o660)
            listener.listen(1)
            listener.settimeout(4)
            result=exchange(listener,str(path),994,985,REQUEST,channel)
            if result!={'ok':True,'receipt':RECEIPT}:
                raise RuntimeError()
            print('KERNEL_PEER_WORKER_ALLOWED_OK',flush=True)
            result=exchange(listener,str(path),0,0,REQUEST,channel)
            if result!={'ok':False,'code':'review_unconfirmed'}:
                raise RuntimeError()
            print('KERNEL_PEER_ROOT_DENIED_OK',flush=True)
            result=exchange(listener,str(path),nobody.pw_uid,nobody.pw_gid,REQUEST,channel,False)
            if result!={'permissionDenied':True}:
                raise RuntimeError()
            print('KERNEL_SOCKET_DAC_DENIED_OK',flush=True)
            result=exchange(listener,str(path),994,985,{**REQUEST,'leaseToken':'cd'*32},channel)
            if result!={'ok':False,'code':'review_unconfirmed'}:
                raise RuntimeError()
            print('KERNEL_MALFORMED_REQUEST_DENIED_OK',flush=True)
        success=True
    except Exception:
        print('KERNEL_CHANNEL_PROBE_UNCONFIRMED',flush=True)
    finally:
        try:
            cleanup(directory,path)
            print('KERNEL_PROBE_CLEANUP_OK',flush=True)
        except Exception:
            print('KERNEL_PROBE_CLEANUP_REQUIRES_REVIEW',flush=True)
            success=False
    if not success:
        sys.exit(1)
    print('NO_SQL_NO_CREDENTIALS_NO_SERVICE_RESTART')

if __name__=='__main__':
    main()
