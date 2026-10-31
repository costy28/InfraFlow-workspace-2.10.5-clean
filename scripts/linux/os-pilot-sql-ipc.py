#!/usr/bin/env python3
"""Root coordinator's bounded private pipe client for two fixed systemd SQL services."""
import json
import os
from pathlib import Path
import selectors
import re
import subprocess
import time

RELEASE=Path('/opt/infraflow-demo-platform/releases/os-pilot-sql-broker-v1')
PROFILES={
    'worker':('infraflow-demo-os-pilot-worker.service','infraflow-demo-worker','/etc/infraflow-demo-platform/lease-sql.password'),
    'executor':('infraflow-demo-os-pilot-executor.service','infraflow-os-pilot-exec','/etc/infraflow-demo-platform/os-executor.password')}

def command(role):
    if role not in PROFILES:raise RuntimeError('pilot_sql_role_refused')
    unit,user,secret=PROFILES[role]
    args=['/usr/bin/systemd-run','--quiet','--wait','--pipe','--collect','--unit='+unit,
        '--property=User='+user,'--property=Group='+user,'--property=SupplementaryGroups=',
        '--property=NoNewPrivileges=yes','--property=ProtectSystem=strict','--property=ProtectHome=yes',
        '--property=PrivateTmp=yes','--property=PrivateDevices=yes','--property=RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6',
        '--property=IPAddressDeny=any','--property=IPAddressAllow=localhost','--property=CapabilityBoundingSet=',
        '--property=KillMode=control-group','--property=MemoryMax=256M','--property=TasksMax=64','--property=RuntimeMaxSec=120s',
        '--property=LoadCredential=sql-password:'+secret]
    if role=='executor':args.append('--property=DynamicUser=yes')
    return args+['/usr/local/bin/node',str(RELEASE/'os-pilot-sql-broker.js'),'--'+role]

class SqlPipe:
    def __init__(self,role):
        if os.name!='posix' or os.geteuid()!=0:raise RuntimeError('root_posix_required')
        self.role=role;self.sequence=0;self.broken=False;self.closed=False;self.invocation=None
        r=subprocess.run(['/usr/bin/systemctl','show',PROFILES[role][0],'--no-pager','-p','LoadState'],capture_output=True,text=True,timeout=5)
        if r.stdout.strip()!='LoadState=not-found':raise RuntimeError('pilot_sql_unit_exists')
        self.child=subprocess.Popen(command(role),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
            bufsize=0,close_fds=True,start_new_session=True,env={'PATH':'/usr/local/bin:/usr/sbin:/usr/bin:/bin','LC_ALL':'C'})
        os.set_blocking(self.child.stdin.fileno(),False);os.set_blocking(self.child.stdout.fileno(),False)
    def call(self,action,payload):
        if self.closed or self.broken:raise RuntimeError('pilot_sql_pipe_unconfirmed')
        self.sequence+=1;deadline=time.monotonic()+25
        try:
            raw=json.dumps({'id':self.sequence,'action':action,'payload':payload},separators=(',',':'),allow_nan=False).encode('utf8')+b'\n'
            if len(raw)>4096:raise RuntimeError()
            offset=0;buffer=bytearray()
            with selectors.DefaultSelector() as selector:
                selector.register(self.child.stdin,selectors.EVENT_WRITE)
                while offset<len(raw):
                    remaining=deadline-time.monotonic()
                    if remaining<=0 or not selector.select(remaining):raise RuntimeError()
                    try:n=os.write(self.child.stdin.fileno(),raw[offset:])
                    except BlockingIOError:continue
                    if n<=0:raise RuntimeError()
                    offset+=n
                selector.unregister(self.child.stdin);selector.register(self.child.stdout,selectors.EVENT_READ)
                while b'\n' not in buffer:
                    remaining=deadline-time.monotonic()
                    if remaining<=0 or not selector.select(remaining):raise RuntimeError()
                    try:chunk=os.read(self.child.stdout.fileno(),4096)
                    except BlockingIOError:continue
                    if not chunk:raise RuntimeError()
                    buffer.extend(chunk)
                    if len(buffer)>4096:raise RuntimeError()
            line,extra=buffer.split(b'\n',1)
            if extra:raise RuntimeError()
            result=json.loads(line.decode('utf8'))
            if type(result) is not dict or set(result)!={'id','ok','value'} or type(result['id']) is not int or result['id']!=self.sequence or result['ok'] is not True:raise RuntimeError()
            if action=='init':
                value=result['value']
                if type(value) is not dict or set(value)!={'initialized','invocationId'} or value['initialized'] is not True or type(value['invocationId']) is not str or not re.fullmatch('[0-9a-f]{32}',value['invocationId']):raise RuntimeError()
                self.invocation=value['invocationId']
            return result['value']
        except Exception:
            self.broken=True;raise RuntimeError('pilot_sql_pipe_unconfirmed') from None
    def close(self):
        if self.closed:return
        try:
            if not self.broken:self.call('shutdown',{})
        finally:
            self.closed=True
            for stream in (self.child.stdin,self.child.stdout):
                try:stream.close()
                except Exception:pass
            try:self.child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                # Never stop a replacement or an unconfirmed unit by name alone.
                r=subprocess.run(['/usr/bin/systemctl','show',PROFILES[self.role][0],'--value','-p','InvocationID'],capture_output=True,text=True,timeout=5)
                if self.invocation is None or r.stdout.strip()!=self.invocation:
                    self.child.kill();self.child.wait(timeout=3)
                    raise RuntimeError('pilot_sql_stop_requires_review')
                r=subprocess.run(['/usr/bin/systemctl','stop',PROFILES[self.role][0]],capture_output=True,timeout=10)
                try:self.child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.child.kill();self.child.wait(timeout=3)
                if r.returncode:raise RuntimeError('pilot_sql_stop_requires_review')
