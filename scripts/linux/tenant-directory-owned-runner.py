"""Owned child and process group, one fixed canonical mkdir. No default authority."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys

def trusted(path):
    for p in (path,*path.parents):
        s=p.lstat()
        if stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('directory_runner_path_refused')
    s=path.lstat()
    if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1:raise RuntimeError('directory_runner_path_refused')
def _capture_owned(command,raw,timeout,popen=subprocess.Popen,killpg=os.killpg if hasattr(os,'killpg') else None):
    if type(timeout) is not int or timeout!=5 or type(raw) is not bytes or len(raw)>4096 or killpg is None:raise RuntimeError('directory_runner_config_refused')
    child=None
    try:
        child=popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,start_new_session=True,close_fds=True,
                    env={'PATH':'/usr/bin:/bin','LC_ALL':'C'})
        try:
            out,_=child.communicate(input=raw,timeout=timeout)
        except BaseException:
            try:killpg(child.pid,getattr(signal,'SIGKILL',9))
            except ProcessLookupError:pass
            child.communicate(timeout=3)
            raise RuntimeError('directory_child_timeout_or_interrupt_requires_review') from None
        if child.returncode!=0 or len(out)>2048:raise RuntimeError('directory_child_unconfirmed_requires_review')
        r=json.loads(out)
        if type(r) is not dict or set(r)!={'uid','gid','mode','device','inode'}:raise RuntimeError()
        for k in ('uid','gid','device','inode'):
            if type(r[k]) is not int or r[k]<0:raise RuntimeError()
        if not r['inode'] or type(r['mode']) is not str:raise RuntimeError()
        return r
    except Exception:raise RuntimeError('directory_owned_effect_unconfirmed_no_retry') from None
    finally:
        if child:
            for stream in (child.stdin,child.stdout):
                if stream:
                    try:stream.close()
                    except Exception:pass
def create_runner(plan,child_file):
    if sys.platform!='linux' or os.geteuid()!=0 or os.getegid()!=0 or not isinstance(child_file,Path) or child_file.name!='tenant-directory-child.py':raise RuntimeError('directory_runner_root_required')
    spec=importlib.util.spec_from_file_location('policy',Path(__file__).with_name('tenant-directory-plan.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    canonical=m.plan(plan.get('trialId'),plan.get('uid'),plan.get('gid'))
    if type(plan) is not dict or plan!=canonical:raise RuntimeError('directory_runner_plan_refused')
    python=Path(sys.executable).resolve()
    def run(entry,timeout):
        for p in (python,child_file,child_file.with_name('tenant-directory-plan.py'),child_file.with_name('tenant-directory-executor.py')):trusted(p)
        if type(entry) is not dict or entry not in canonical['directories'] or type(timeout) is not int or timeout!=5:raise RuntimeError('directory_runner_entry_refused')
        index=canonical['directories'].index(entry)
        raw=json.dumps({'plan':canonical,'index':index},separators=(',',':'),allow_nan=False).encode('ascii')
        return _capture_owned([str(python),str(child_file),'--mkdir'],raw,5)
    return run
