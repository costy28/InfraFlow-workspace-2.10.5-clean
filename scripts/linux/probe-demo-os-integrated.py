#!/usr/bin/env python3
"""Real negative SQL gate plus explicitly simulated positive path with benign commands."""
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile

RELEASE=Path('/opt/infraflow-demo-platform/releases/os-integrated-check-v1')
SECRET=Path('/etc/infraflow-demo-platform/os-executor.password')
DRIVER=Path('/opt/infraflow-demo-platform/releases/sql-reader-v1/node_modules')
UNIT='infraflow-demo-os-integrated-sql.service'
USER='infraflow-os-int-check'

def module(name):
    spec=importlib.util.spec_from_file_location(name.replace('-','_'),Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def sql_command():
    return ['/usr/bin/systemd-run','--quiet','--wait','--pipe','--collect','--unit='+UNIT,
        '--property=DynamicUser=yes','--property=User='+USER,'--property=Group='+USER,
        '--property=SupplementaryGroups=','--property=NoNewPrivileges=yes','--property=ProtectSystem=strict',
        '--property=ProtectHome=yes','--property=PrivateTmp=yes','--property=PrivateDevices=yes',
        '--property=RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6','--property=IPAddressDeny=any',
        '--property=IPAddressAllow=localhost','--property=CapabilityBoundingSet=','--property=KillMode=control-group',
        '--property=MemoryMax=256M','--property=TasksMax=64','--property=RuntimeMaxSec=30s',
        '--property=LoadCredential=os-executor-sql-password:'+str(SECRET),
        '/usr/local/bin/node',str(RELEASE/'os-integrated-negative-probe.js')]

def preflight(helper):
    helper.safe(RELEASE.parent);helper.safe(SECRET);helper.safe(DRIVER)
    if os.path.lexists(RELEASE):raise RuntimeError('release_exists')
    s=SECRET.lstat()
    if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_gid!=0 or s.st_nlink!=1 or stat.S_IMODE(s.st_mode)!=0o600 or not 16<=s.st_size<=128:raise RuntimeError('secret_metadata_invalid')
    if not (DRIVER/'mssql/package.json').is_file():raise RuntimeError('driver_missing')
    r=subprocess.run(['/usr/bin/systemctl','show',UNIT,'--no-pager','-p','LoadState'],capture_output=True,text=True,timeout=5)
    if r.stdout.strip()!='LoadState=not-found':raise RuntimeError('unit_exists')
    for db in ('passwd','group'):
        r=subprocess.run(['/usr/bin/getent',db,USER],capture_output=True,text=True,timeout=5)
        if r.returncode!=2 or r.stdout or r.stderr:raise RuntimeError('dynamic_identity_exists')

def pipeline(plan,lock,sql_gate,inventory,benign_run):
    guard=module('tenant-os-execution-guard');exe=module('tenant-os-executor')
    approval={'jobId':'00f612ed-a8ac-4688-a26f-679760eee0be','trialId':plan['trialId'],
        'intentId':'00000000-0000-0000-0000-000000000000','generation':3,'jobRevision':6,
        'resourceKey':plan['user'],'localRootApproved':True}
    called={'gate':0,'forbidden':0,'context':0,'benign':0,'record':0}
    def negative_context():
        sql_gate();called['gate']+=1;raise RuntimeError('expected_real_sql_refusal')
    def forbidden(*args,**kwargs):called['forbidden']+=1;raise RuntimeError('effect_forbidden')
    try:
        guard.guarded_execute(plan,approval,negative_context,lock,inventory,forbidden,forbidden,forbidden)
        raise RuntimeError('negative_gate_not_enforced')
    except RuntimeError as error:
        if str(error)!='os_effect_refused_no_command' or called['gate']!=1 or called['forbidden']!=0:raise
    def simulated_context():
        called['context']+=1
        return {**{k:v for k,v in approval.items() if k!='localRootApproved'},'validForMs':30000,'contextReady':True,'executionAllowed':False}
    def harmless(command,timeout):
        if command not in exe.commands(plan) or timeout!=5:raise RuntimeError()
        called['benign']+=1
        return benign_run(('/usr/bin/true',),timeout)
    def simulated_observe(plan):return {'uid':10001,'gid':10002,'policyVerified':True}
    def simulated_record(*args):called['record']+=1
    result=guard.guarded_execute(plan,approval,simulated_context,lock,inventory,harmless,simulated_observe,simulated_record)
    if result['outcome']!='observed_created' or called!={'gate':1,'forbidden':0,'context':2,'benign':2,'record':1}:raise RuntimeError('pipeline_unconfirmed')
    return called

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or sys.argv[1:] not in (['--check-only'],['--probe-confirmed']):sys.exit('LINUX_ROOT_EXPLICIT_MODE_REQUIRED')
    stage='preflight'
    try:
        helper=module('prepare-demo-adapter-review-credential');preflight(helper)
        exe=module('tenant-os-executor');inv=module('inspect-demo-tenant-os-identity');plan=inv.identity_plan(inv.TRIAL)
        exe.check_tools()
        if not inv.inspect(plan)['resourcesAbsent']:raise RuntimeError('tenant_collision')
        if sys.argv[1:] == ['--check-only']:
            print('OS_INTEGRATED_PREFLIGHT_OK\nNO_SQL_NO_SECRET_READ_NO_ACCOUNT_NO_RESTART');return
        stage='staging cod read-only'
        source=Path(__file__).resolve().parents[2]/'server/demo-platform';data={}
        for name in ('os-executor-context-sql-check.js','os-integrated-negative-probe.js'):
            path=source/name;s=path.lstat()
            if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_size>100000:raise RuntimeError('source_invalid')
            data[name]=path.read_bytes();subprocess.run(['/usr/local/bin/node','--check',str(path)],check=True,capture_output=True,timeout=10)
        RELEASE.mkdir(mode=0o755);os.chown(RELEASE,0,0);os.chmod(RELEASE,0o755)
        for name,value in data.items():helper.secure_write(RELEASE/name,value,0o644)
        helper.secure_write(RELEASE/'package.json',b'{"private":true,"type":"commonjs"}\n',0o644)
        (RELEASE/'node_modules').symlink_to(DRIVER,target_is_directory=True)
        def sql_gate():
            r=subprocess.run(sql_command(),capture_output=True,text=True,timeout=40)
            if r.returncode or r.stdout.split()!=['OS_INTEGRATED_REAL_SQL_NEGATIVE_GATE_OK']:raise RuntimeError('sql_gate_unconfirmed')
        stage='proba integrata fara efecte de cont'
        guard=module('tenant-os-execution-guard');runner=module('tenant-os-command-runner')
        run=Path('/run');s=run.lstat()
        if not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('unsafe_run_path')
        with tempfile.TemporaryDirectory(prefix='infraflow-os-integrated-',dir='/run') as tmp:
            directory=Path(tmp);os.chmod(directory,0o700)
            pipeline(plan,lambda identity:guard.identity_lock(directory,identity),sql_gate,
                     lambda current:inv.inspect(current)['resourcesAbsent'],runner._run_owned)
        if directory.exists():raise RuntimeError('cleanup_unconfirmed')
        if not inv.inspect(plan)['resourcesAbsent']:raise RuntimeError('tenant_collision')
        print('OS_INTEGRATED_REAL_SQL_NEGATIVE_GATE_OK\nOS_INTEGRATED_NEGATIVE_PATH_NO_COMMAND_OK')
        print('OS_SIMULATED_CONTEXT_GUARD_BENIGN_RUNNER_OK\nOS_INTEGRATED_CANARY_CLEANUP_OK')
        print('NO_SQL_WRITE_NO_ACCOUNT_NO_EXISTING_SERVICE_RESTART')
    except Exception:
        print('OS_INTEGRATED_PROBE_UNCONFIRMED_STAGE='+stage+'\nNu relua automat; codul partial ramane pentru verificare.')
        sys.exit(1)

if __name__=='__main__':main()
