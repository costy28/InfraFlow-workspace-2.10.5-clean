#!/usr/bin/env python3
"""Canary for process-tree timeout. Never invokes account tools or SQL."""
import fcntl
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import time

def runner():
    spec=importlib.util.spec_from_file_location('owned_runner',Path(__file__).with_name('tenant-os-command-runner.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def child(directory):
    p=Path(directory)
    if p.parent!=Path('/run') or not p.name.startswith('infraflow-owned-runner-probe-') or p.is_symlink():raise RuntimeError()
    s=p.stat()
    if s.st_uid!=0 or stat.S_IMODE(s.st_mode)!=0o700:raise RuntimeError()
    fd=os.open(p/'tree.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    # The forked child retains the lock description. Killing only its parent
    # would leave it locked and the outer canary would fail.
    pid=os.fork()
    if pid==0:
        marker=os.open(p/'child.ready',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        os.write(marker,b'ready');os.close(marker)
        time.sleep(20);os._exit(0)
    time.sleep(20)

def main():
    if sys.platform!='linux' or os.geteuid()!=0:sys.exit('LINUX_ROOT_REQUIRED')
    if len(sys.argv)==3 and sys.argv[1]=='--child-tree':child(sys.argv[2]);return
    if sys.argv[1:]!=['--probe-confirmed']:sys.exit('EXPLICIT_CANARY_CONFIRMATION_REQUIRED')
    try:
        run=Path('/run');s=run.lstat()
        if not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError()
        m=runner()
        # Successful benign command, without a shell or inherited environment.
        if m._run_owned(('/usr/bin/true',),5).returncode!=0:raise RuntimeError()
        print('OS_OWNED_RUNNER_SUCCESS_OK')
        with tempfile.TemporaryDirectory(prefix='infraflow-owned-runner-probe-',dir='/run') as tmp:
            directory=Path(tmp);os.chmod(directory,0o700)
            if directory.parent!=run or directory.is_symlink():raise RuntimeError()
            started=time.monotonic()
            try:
                m._run_owned((sys.executable,'-B',str(Path(__file__).resolve()),'--child-tree',str(directory)),2)
                raise RuntimeError('timeout_not_observed')
            except RuntimeError as error:
                if str(error)!='os_command_timeout_review_required':raise
            if time.monotonic()-started>6 or not (directory/'child.ready').is_file():raise RuntimeError()
            fd=os.open(directory/'tree.lock',os.O_RDWR|os.O_NOFOLLOW)
            try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            finally:os.close(fd)
            print('OS_OWNED_RUNNER_TREE_TIMEOUT_OK')
        if directory.exists():raise RuntimeError()
        print('OS_OWNED_RUNNER_CANARY_CLEANUP_OK\nNO_SQL_NO_CREDENTIALS_NO_ACCOUNT_NO_EXISTING_SERVICE_RESTART')
    except Exception:
        print('OS_OWNED_RUNNER_CANARY_UNCONFIRMED_NO_AUTOMATIC_RETRY');sys.exit(1)

if __name__=='__main__':main()
