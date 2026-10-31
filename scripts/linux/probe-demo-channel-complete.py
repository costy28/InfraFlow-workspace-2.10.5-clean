#!/usr/bin/env python3
"""Explicit one-shot diagnostic SQL mutation through the staged Unix channel."""
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

UNIT='infraflow-demo-channel-cycle.service'
SECRET=Path('/etc/infraflow-demo-platform/lease-sql.password')

def support():
    spec=importlib.util.spec_from_file_location('mount_support',Path(__file__).with_name('probe-demo-adapter-channel-mount.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def worker_command():
    return ['/usr/bin/systemd-run','--quiet','--wait','--pipe','--collect','--unit='+UNIT,
            '--property=Type=exec','--property=User=infraflow-demo-worker','--property=Group=infraflow-demo-worker',
            '--property=SupplementaryGroups=','--property=NoNewPrivileges=yes','--property=ProtectSystem=strict',
            '--property=ProtectHome=yes','--property=PrivateTmp=yes','--property=PrivateDevices=yes',
            '--property=CapabilityBoundingSet=','--property=RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6',
            '--property=IPAddressDeny=any','--property=IPAddressAllow=localhost',
            '--property=MemoryMax=256M','--property=TasksMax=64','--property=KillMode=control-group',
            '--property=RuntimeMaxSec=45s','--property=LoadCredential=lease-sql-password:'+str(SECRET),
            '/usr/local/bin/node','/opt/infraflow-demo-platform/releases/adapter-channel-v1/channel-review-probe.js',
            '--run-channel-review-confirmed']

def validate_output(raw):
    lines=raw.splitlines()
    if len(lines)!=2 or lines[1]!='CHANNEL_REVIEW_CYCLE_OK':raise RuntimeError()
    r=json.loads(lines[0])
    if r!={'jobId':'00f612ed-a8ac-4688-a26f-679760eee0be','generation':2,'jobRevision':5,
           'status':'channel_checked_and_released','executionAllowed':False}:raise RuntimeError()
    if type(r['executionAllowed']) is not bool or type(r['generation']) is not int or type(r['jobRevision']) is not int:raise RuntimeError()

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or sys.argv[1:]!=['--complete-cycle-confirmed']:
        sys.exit('LINUX_ROOT_COMPLETE_CYCLE_CONFIRMATION_REQUIRED')
    m=support();adapter=False;worker_attempted=False;attempted=False;success=False;clean=True
    try:
        import pwd
        for name,uid,gid in [('infraflow-demo-adapter-review',993,984),('infraflow-demo-worker',994,985)]:
            u=pwd.getpwnam(name)
            if (u.pw_uid,u.pw_gid,u.pw_dir,u.pw_shell)!=(uid,gid,'/nonexistent','/usr/sbin/nologin'):raise RuntimeError()
        m.check_release();m.safe(SECRET,True)
        s=SECRET.lstat()
        if s.st_gid!=0 or stat.S_IMODE(s.st_mode)!=0o600 or not 16<=s.st_size<=128:raise RuntimeError()
        if os.path.lexists(m.SOCKET):raise RuntimeError()
        for unit in (m.BASE+'.socket',m.BASE+'.service',UNIT):
            if m.state(unit).get('LoadState')!='not-found':raise RuntimeError()
        attempted=True
        args=[x.replace('--property=RuntimeMaxSec=30s','--property=RuntimeMaxSec=90s') for x in m.command()]
        subprocess.run(args,check=True,capture_output=True,timeout=15);adapter=True
        m.root_request()
        if m.state(m.BASE+'.service').get('ActiveState')!='active':raise RuntimeError()
        worker_attempted=True
        result=subprocess.run(worker_command(),capture_output=True,text=True,timeout=55)
        if result.returncode or len(result.stdout)>2048:raise RuntimeError()
        validate_output(result.stdout)
        print('WORKER_UNIX_ADAPTER_SQL_CYCLE_OK',flush=True);success=True
    except Exception:
        print('COMPLETE_CHANNEL_UNCONFIRMED_NO_AUTOMATIC_RETRY',flush=True)
        if worker_attempted:print('SQL_STATE_REVIEW_REQUIRED_LEASE_INTENT_TICKET_MAY_EXIST',flush=True)
    finally:
        try:
            if worker_attempted and m.state(UNIT).get('LoadState')!='not-found':
                subprocess.run(['/usr/bin/systemctl','stop',UNIT],check=True,capture_output=True,timeout=15)
            if adapter:
                subprocess.run(['/usr/bin/systemctl','stop',m.BASE+'.socket',m.BASE+'.service'],check=True,capture_output=True,timeout=15)
                for unit in (m.BASE+'.socket',m.BASE+'.service',UNIT):
                    s=m.state(unit)
                    if s.get('LoadState')!='not-found' and s.get('ActiveState') not in ('inactive','failed'):raise RuntimeError()
                if os.path.lexists(m.SOCKET):raise RuntimeError()
                print('COMPLETE_CHANNEL_TRANSIENT_UNITS_STOPPED',flush=True)
            elif attempted:raise RuntimeError()
        except Exception:
            clean=False;print('TRANSIENT_CLEANUP_REQUIRES_REVIEW',flush=True)
    if not success or not clean:sys.exit(1)
    print('EXECUTION_DISABLED_NO_TENANT_CREATED_NO_EXISTING_SERVICE_RESTART')

if __name__=='__main__':main()
