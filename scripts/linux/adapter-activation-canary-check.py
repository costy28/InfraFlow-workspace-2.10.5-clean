#!/usr/bin/env python3
"""Socket-activated canary receiver; never imports SQL or the real credential bridge."""
import importlib.util
import os
from pathlib import Path
import socket
import stat
import sys

SOCKET='/run/infraflow-demo-adapter-activation-check.sock'
DIRECTORY='/run/credentials/infraflow-demo-adapter-activation-check.service'

def load(name,file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file))
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def main():
    if sys.platform!='linux' or len(sys.argv)!=2 or os.getuid()!=993 or os.getgid()!=984 or any(g!=984 for g in os.getgroups()):
        raise RuntimeError()
    if os.environ.get('LISTEN_PID')!=str(os.getpid()) or os.environ.get('LISTEN_FDS')!='1' or os.environ.get('CREDENTIALS_DIRECTORY')!=DIRECTORY:
        raise RuntimeError()
    source=Path(sys.argv[1])
    if source.name!='canary' or source.parent.name!='private' or source.parent.parent.parent!=Path('/run') or not source.parent.parent.name.startswith('infraflow-adapter-activation-probe-'):
        raise RuntimeError()
    flags=os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK
    try:
        fd=os.open(source,flags)
    except PermissionError:
        pass
    else:
        os.close(fd)
        raise RuntimeError()
    canary=load('canary','adapter-systemd-canary-check.py')
    fd=os.open(DIRECTORY+'/adapter-canary',flags)
    try:
        if not canary.valid_metadata(os.fstat(fd)) or os.read(fd,33)!=canary.CANARY:
            raise RuntimeError()
    finally:
        os.close(fd)
    info=os.lstat(SOCKET)
    if not stat.S_ISSOCK(info.st_mode) or info.st_uid!=0 or info.st_gid!=985 or stat.S_IMODE(info.st_mode)!=0o660:
        raise RuntimeError()
    channel=load('channel','adapter-review-socket.py')
    receipt={'jobId':'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','intentId':'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
             'generation':1,'jobRevision':1,'step':'os_identity','operation':'consume','executionAllowed':False}
    listener=socket.socket(fileno=3)
    if listener.family!=socket.AF_UNIX or listener.type!=socket.SOCK_STREAM or listener.getsockname()!=SOCKET:
        raise RuntimeError()
    while True:
        conn,_=listener.accept()
        with conn:
            channel.handle(conn,consumer=lambda _:dict(receipt))

if __name__=='__main__':
    try:main()
    except Exception:sys.exit('ACTIVATION_CANARY_UNCONFIRMED')
