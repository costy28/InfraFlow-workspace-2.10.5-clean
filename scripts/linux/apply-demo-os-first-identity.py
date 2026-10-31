#!/usr/bin/env python3
"""Fixed first identity only. Requires explicit interactive root approval; never resumes."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

RELEASE=Path('/opt/infraflow-demo-platform/releases/os-pilot-first-identity-v1')
BROKER=Path('/opt/infraflow-demo-platform/releases/os-pilot-sql-broker-v1')
JOURNAL=Path('/var/lib/infraflow-demo-os-pilot')
LOCKS=Path('/run/infraflow-demo-os-pilot-locks')
REQUEST={'jobId':'00f612ed-a8ac-4688-a26f-679760eee0be','trialId':'b1100b43-48d0-42fa-8a1d-73b1286f8242','expectedJobRevision':5,'localRootApproved':True}
IDENTITY='ift_b1100b4348d042fa8a1d73b1286f'
FILES=('os-pilot-orchestrator.py','os-pilot-journal.py','os-pilot-bound-ports.py','os-pilot-host-port.py',
       'os-pilot-sql-ipc.py','tenant-os-executor.py','tenant-os-execution-guard.py','tenant-os-command-runner.py',
       'tenant-os-observer.py','inspect-demo-tenant-os-identity.py','preflight-demo-os-pilot-final.py')

def module(directory,name):
    s=importlib.util.spec_from_file_location(name,directory/(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def safe(path,private=False):
    for p in (path,*path.parents):
        s=p.lstat()
        if stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('path_refused')
    if private and (not path.is_dir() or stat.S_IMODE(path.stat().st_mode)!=0o700 or path.stat().st_gid!=0):raise RuntimeError('private_path_refused')

def preflight(source):
    for path in (RELEASE.parent,JOURNAL.parent,LOCKS.parent,BROKER):safe(path)
    for path in (RELEASE,JOURNAL,LOCKS):
        if os.path.lexists(path):raise RuntimeError('existing_attempt_requires_review')
    # Bind existing, already-probed broker bytes to this release, not mutable caller configuration.
    manifest_path=source/'os-pilot-broker-sha256.json'
    manifest=json.loads(manifest_path.read_text(encoding='ascii'))
    expected={'os-pilot-sql-broker.js','worker-os-control-sql.js','provision-lease-client.js','provision-lease-command.js',
              'os-delegation-rpc-client.js','worker-os-delegation-sql-check.js','os-executor-context-sql-check.js'}
    if type(manifest) is not dict or set(manifest)!=expected:raise RuntimeError('broker_manifest_refused')
    for name,digest in manifest.items():
        p=BROKER/name;safe(p);s=p.lstat()
        if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_size>100000 or hashlib.sha256(p.read_bytes()).hexdigest()!=digest:raise RuntimeError('broker_changed_requires_review')
    import pwd,grp
    u=pwd.getpwnam('infraflow-demo-worker');g=grp.getgrnam('infraflow-demo-worker')
    if (u.pw_uid,u.pw_gid,u.pw_dir,u.pw_shell,g.gr_gid)!=(994,985,'/nonexistent','/usr/sbin/nologin',985):raise RuntimeError('worker_identity_refused')
    for secret in ('lease-sql.password','os-executor.password'):
        p=Path('/etc/infraflow-demo-platform')/secret;safe(p);s=p.lstat()
        if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_gid!=0 or stat.S_IMODE(s.st_mode)!=0o600 or not 16<=s.st_size<=128:raise RuntimeError('secret_metadata_refused')
    check=module(source,'preflight-demo-os-pilot-final')
    old=sys.argv
    try:
        sys.argv=[str(source/'preflight-demo-os-pilot-final.py'),'--check-only'];check.main()
    finally:sys.argv=old
    result={}
    for name in FILES:
        p=source/name;s=p.lstat()
        if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_size>100000:raise RuntimeError('source_refused')
        data=p.read_bytes();compile(data,str(p),'exec');result[name]=data
    return result

def write_new(path,data):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as f:
        os.fchown(f.fileno(),0,0);os.fchmod(f.fileno(),0o600);f.write(data);f.flush();os.fsync(f.fileno())

def apply(data):
    # No deletions on any failure: even pre-claim partial paths are reviewed manually.
    for path in (RELEASE,JOURNAL,LOCKS):
        path.mkdir(mode=0o700);os.chown(path,0,0);os.chmod(path,0o700)
        fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        try:os.fsync(fd)
        finally:os.close(fd)
    for name,value in data.items():write_new(RELEASE/name,value)
    fd=os.open(RELEASE,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)
    safe(RELEASE,True);safe(JOURNAL,True);safe(LOCKS,True)
    inv=module(RELEASE,'inspect-demo-tenant-os-identity');journal=module(RELEASE,'os-pilot-journal')
    host=module(RELEASE,'os-pilot-host-port').create_host(dict(REQUEST),LOCKS)
    result=module(RELEASE,'os-pilot-bound-ports').run(dict(REQUEST),
        lambda trial:trial==REQUEST['trialId'] and inv.inspect(inv.identity_plan(trial))['resourcesAbsent'] is True,
        lambda private:journal.create_new_journal(JOURNAL,private),host)
    review=journal.inspect_for_review(JOURNAL,REQUEST['jobId'])
    if review['lastStage']!='released' or not review['attemptCompleted'] or result['status']!='identity_recorded_requires_review' or result['activationPerformed'] is not False:raise RuntimeError('pilot_result_unconfirmed')
    print('FIRST_OS_IDENTITY_RECORDED_REQUIRES_REVIEW')
    print(json.dumps(result,separators=(',',':')))
    print('NO_TENANT_DATABASE_NO_ERP_START_NO_ACTIVATION_NO_AUTOMATIC_RETRY')

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or os.getegid()!=0 or sys.argv[1:] not in (['--check-only'],['--apply-confirmed']):sys.exit('ROOT_LINUX_EXPLICIT_MODE_REQUIRED')
    stage='preflight'
    try:
        data=preflight(Path(__file__).resolve().parent)
        if sys.argv[1:]==['--check-only']:
            print('FIRST_OS_IDENTITY_PACKAGE_PREFLIGHT_OK\nNO_SQL_NO_SECRET_READ_NO_WRITE');return
        if not sys.stdin.isatty():raise RuntimeError('interactive_confirmation_required')
        print('Creare permanenta utilizator/grup pilot fara login. Fara baza tenant sau activare.')
        if input('Tasteaza exact '+IDENTITY+' pentru confirmare: ')!=IDENTITY:raise RuntimeError('confirmation_refused')
        stage='prima incercare OS si SQL; rezultat incert necesita reconciliere'
        apply(data)
    except (Exception,SystemExit):
        print('FIRST_OS_IDENTITY_UNCONFIRMED_STAGE='+stage)
        print('DO_NOT_RETRY_DO_NOT_DELETE_REVIEW_SQL_AND_PRIVATE_JOURNAL');raise SystemExit(1)

if __name__=='__main__':main()
