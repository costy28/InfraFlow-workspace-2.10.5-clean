#!/usr/bin/env python3
"""Disposable kernel lock canary only. No SQL, NSS or account commands."""
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile

IDENTITY='ift_b1100b4348d042fa8a1d73b1286f'
def guard():
    spec=importlib.util.spec_from_file_location('guard',Path(__file__).with_name('tenant-os-execution-guard.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def child(directory):
    p=Path(directory)
    if p.parent!=Path('/run') or not p.name.startswith('infraflow-os-lock-probe-'):raise RuntimeError()
    try:
        with guard().identity_lock(p,IDENTITY):print('LOCK_AVAILABLE')
    except RuntimeError as error:
        if str(error)!='host_identity_busy':raise
        print('LOCK_BUSY')

def main():
    if sys.platform!='linux' or os.geteuid()!=0:sys.exit('LINUX_ROOT_REQUIRED')
    if len(sys.argv)==3 and sys.argv[1]=='--child-contend':child(sys.argv[2]);return
    if sys.argv[1:]!=['--probe-confirmed']:sys.exit('EXPLICIT_CANARY_CONFIRMATION_REQUIRED')
    try:
        run=Path('/run');s=run.lstat()
        if not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError()
        with tempfile.TemporaryDirectory(prefix='infraflow-os-lock-probe-',dir='/run') as tmp:
            directory=Path(tmp);os.chmod(directory,0o700)
            if directory.parent!=run or directory.is_symlink():raise RuntimeError()
            m=guard();file=directory/(IDENTITY+'.lock')
            def contend(expected):
                r=subprocess.run([sys.executable,'-B',str(Path(__file__).resolve()),'--child-contend',str(directory)],capture_output=True,text=True,timeout=5)
                if r.returncode or r.stdout.split()!=[expected]:raise RuntimeError()
            with m.identity_lock(directory,IDENTITY):
                inode=file.stat().st_ino;contend('LOCK_BUSY')
            print('OS_HOST_CONCURRENT_LOCK_DENIED_OK')
            contend('LOCK_AVAILABLE')
            if not file.is_file() or file.stat().st_ino!=inode:raise RuntimeError()
            print('OS_HOST_LOCK_RELEASE_SAME_INODE_OK')
            bad=directory/('ift_'+'0'*28+'.lock')
            bad.symlink_to(file)
            try:
                with m.identity_lock(directory,'ift_'+'0'*28):raise RuntimeError('unsafe_lock_accepted')
            except OSError:pass
            finally:bad.unlink()
            print('OS_HOST_LOCK_SYMLINK_DENIED_OK')
            os.link(file,bad)
            try:
                try:
                    with m.identity_lock(directory,'ift_'+'0'*28):raise RuntimeError('unsafe_lock_accepted')
                except RuntimeError as error:
                    if str(error)!='host_lock_refused':raise
            finally:bad.unlink()
            print('OS_HOST_LOCK_HARDLINK_DENIED_OK')
        if directory.exists():raise RuntimeError()
        print('OS_HOST_LOCK_CANARY_CLEANUP_OK\nNO_SQL_NO_CREDENTIALS_NO_ACCOUNT_NO_EXISTING_SERVICE_RESTART')
    except Exception:
        print('OS_HOST_LOCK_CANARY_UNCONFIRMED_NO_AUTOMATIC_RETRY');sys.exit(1)

if __name__=='__main__':main()
