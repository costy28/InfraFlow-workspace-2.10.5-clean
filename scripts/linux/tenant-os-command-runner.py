#!/usr/bin/env python3
"""Owned-process runner. No CLI; production port accepts exactly the canonical two commands."""
import importlib.util
import os
from pathlib import Path
import signal
import subprocess
import sys
from types import SimpleNamespace

def executor():
    spec=importlib.util.spec_from_file_location('tenant_executor',Path(__file__).with_name('tenant-os-executor.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def _run_owned(command,timeout,popen=subprocess.Popen,killpg=os.killpg if hasattr(os,'killpg') else None):
    """Internal trusted argv only. Timeout kills only the group created by this Popen."""
    if type(timeout) is not int or not 1<=timeout<=5 or killpg is None:raise RuntimeError('owned_runner_config_refused')
    child=None
    try:
        child=popen(command,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                    start_new_session=True,close_fds=True,env={'PATH':'/usr/sbin:/usr/bin:/bin','LC_ALL':'C'})
        try:return SimpleNamespace(returncode=child.wait(timeout=timeout))
        except BaseException as error:
            try:killpg(child.pid,getattr(signal,'SIGKILL',9))
            except ProcessLookupError:pass
            child.wait(timeout=3)
            if isinstance(error,subprocess.TimeoutExpired):raise RuntimeError('os_command_timeout_review_required') from None
            raise RuntimeError('os_command_unconfirmed_review_required') from None
    except RuntimeError:raise
    except Exception:raise RuntimeError('os_command_unconfirmed_review_required') from None

def create_command_runner(plan):
    m=executor();allowed=m.commands(plan)
    def run(command,timeout):
        if sys.platform!='linux' or os.geteuid()!=0 or type(command) is not tuple or command not in allowed or type(timeout) is not int or timeout!=5:
            raise RuntimeError('os_command_refused')
        m.safe_binary(command[0])
        return _run_owned(command,5)
    return run
