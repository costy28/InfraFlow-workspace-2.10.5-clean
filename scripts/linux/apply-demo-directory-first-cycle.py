#!/usr/bin/env python3
"""Fixed SQL-only pilot. No tenant directory executor, resume or automatic retry."""
import getpass
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import stat
import subprocess
import sys

RELEASE=Path('/opt/infraflow-demo-platform/releases/directory-cycle-pilot-v1')
BROKER=Path('/opt/infraflow-demo-platform/releases/directory-cycle-broker-v1')
JOURNAL=Path('/var/lib/infraflow-demo-directory-cycle')
SECRET=Path('/etc/infraflow-demo-platform/lease-sql.password')
UNIT='infraflow-demo-directory-cycle.service'
JOB='00f612ed-a8ac-4688-a26f-679760eee0be'
REQUEST={'jobId':JOB,'trialId':'b1100b43-48d0-42fa-8a1d-73b1286f8242','priorOsIntentId':'40f385e6-c722-429a-a8fe-46c6119c4834','uid':992,'gid':983,'expectedJobRevision':7,'localRootApproved':True}
FILES=('directory-cycle-journal.py','directory-cycle-orchestrator.py','directory-cycle-bound-ports.py','directory-cycle-sql-ipc.py','os-pilot-journal.py','probe-demo-tenant-directories.py','tenant-directory-plan.py')
BROKER_FILES={'directory-cycle-service.js','directory-cycle-sql-broker.js','worker-directory-control-sql.js','provision-lease-client.js','provision-lease-command.js','directory-preparation-rpc-client.js','worker-directory-sql-check.js','directory-preparation-sql-broker.js'}
SQLCMD='/opt/mssql-tools18/bin/sqlcmd'

def load(directory,name):
    spec=importlib.util.spec_from_file_location(name,directory/(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def safe(path,private=False):
    for p in (path,*path.parents):
        s=p.lstat()
        if stat.S_ISLNK(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('path_requires_review')
    if private and (not path.is_dir() or path.stat().st_gid!=0 or stat.S_IMODE(path.stat().st_mode)!=0o700):raise RuntimeError('path_requires_review')
def inventory(source):
    # Existing inspector validates NSS, completed OS journal and absence of eight paths.
    probe=load(source,'probe-demo-tenant-directories');old=sys.argv
    try:
        sys.argv=[str(source/'probe-demo-tenant-directories.py'),'--inspect-only'];probe.main()
    finally:sys.argv=old
    return True
def preflight(source):
    for p in (RELEASE.parent,JOURNAL.parent,BROKER,SECRET.parent):safe(p)
    for p in (RELEASE,JOURNAL):
        if os.path.lexists(p):raise RuntimeError('existing_cycle_requires_review')
    s=SECRET.lstat()
    if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_gid!=0 or s.st_nlink!=1 or stat.S_IMODE(s.st_mode)!=0o600 or not 16<=s.st_size<=128:raise RuntimeError('secret_metadata_requires_review')
    u=pwd.getpwnam('infraflow-demo-worker')
    if (u.pw_uid,u.pw_gid,u.pw_dir,u.pw_shell)!=(994,985,'/nonexistent','/usr/sbin/nologin'):raise RuntimeError('worker_identity_requires_review')
    r=subprocess.run(['/usr/bin/systemctl','show',UNIT,'--no-pager','-p','LoadState'],capture_output=True,text=True,timeout=5)
    if r.stdout.strip()!='LoadState=not-found':raise RuntimeError('unit_exists')
    manifest=json.loads((source/'directory-cycle-broker-sha256.json').read_text(encoding='ascii'))
    if type(manifest) is not dict or set(manifest)!=BROKER_FILES:raise RuntimeError('broker_manifest_refused')
    for name,digest in manifest.items():
        p=BROKER/name;safe(p);s=p.lstat()
        if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_size>100000 or hashlib.sha256(p.read_bytes()).hexdigest()!=digest:raise RuntimeError('broker_changed_requires_review')
    driver=Path('/opt/infraflow-demo-platform/releases/sql-reader-v1/node_modules');safe(driver)
    if not (BROKER/'node_modules').is_symlink() or (BROKER/'node_modules').resolve()!=driver:raise RuntimeError('driver_link_requires_review')
    ipc=load(source,'directory-cycle-sql-ipc')
    if ipc.RELEASE!=BROKER or ipc.PROFILES!={'cycle':(UNIT,'infraflow-demo-worker',str(SECRET))}:raise RuntimeError('ipc_profile_requires_review')
    inventory(source);data={}
    for name in FILES:
        p=source/name;s=p.lstat()
        if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_size>100000:raise RuntimeError('source_invalid')
        raw=p.read_bytes();compile(raw,str(p),'exec');data[name]=raw
    return data
def sql_checks(source,password):
    for name,marker in (('preflight-demo-directory-first-cycle.sql','DIRECTORY_CYCLE_FINAL_SQL_PREFLIGHT_OK'),('verify-demo-worker-directory-scope.sql','WORKER_DIRECTORY_SCOPE_VERIFIED')):
        sql=(source/name).read_text(encoding='utf8')
        r=subprocess.run([SQLCMD,'-S','tcp:127.0.0.1,1433','-U','sa','-d','INFRAFLOW_DEMO_PLATFORM','-C','-l','5','-t','30','-b','-x','-h','-1'],
            input=sql+'\nGO\n',text=True,encoding='utf8',capture_output=True,timeout=40,
            env={'PATH':'/usr/local/bin:/usr/bin:/bin','LANG':'C.UTF-8','SQLCMDPASSWORD':password})
        if r.returncode or marker not in r.stdout.split():raise RuntimeError('sql_preflight_unconfirmed')
def create_private(path):
    path.mkdir(mode=0o700);os.chown(path,0,0);os.chmod(path,0o700)
    fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)
def apply(data):
    create_private(RELEASE);create_private(JOURNAL)
    for name,raw in data.items():
        fd=os.open(RELEASE/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb') as f:os.fchown(f.fileno(),0,0);os.fchmod(f.fileno(),0o600);f.write(raw);f.flush();os.fsync(f.fileno())
    fd=os.open(RELEASE,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)
    journal=load(RELEASE,'directory-cycle-journal');ipc=load(RELEASE,'directory-cycle-sql-ipc')
    result=load(RELEASE,'directory-cycle-bound-ports').run(dict(REQUEST),lambda req:req==REQUEST and inventory(RELEASE),lambda private:journal.create_new(JOURNAL,private),lambda:ipc.SqlPipe('cycle'))
    review=journal.inspect_for_review(JOURNAL,JOB)
    if review['lastStage']!='released' or review['eventCount']!=9 or result['jobRevision']!=9 or result['generation']!=4 or result['executionAllowed'] is not False:raise RuntimeError('cycle_result_requires_review')
    print('DIRECTORY_FIRST_SQL_CYCLE_RECORDED_REQUIRES_REVIEW')
    print(json.dumps(result,separators=(',',':')))
    print('NO_TENANT_DIRECTORY_NO_DATABASE_NO_ACTIVATION_NO_AUTOMATIC_RETRY')
def main():
    if sys.platform!='linux' or os.geteuid()!=0 or os.getegid()!=0 or sys.argv[1:] not in (['--check-only'],['--apply-confirmed']):sys.exit('ROOT_LINUX_EXPLICIT_MODE_REQUIRED')
    stage='preflight OS si cod'
    try:
        source=Path(__file__).resolve().parent;data=preflight(source)
        if sys.argv[1:]==['--check-only']:
            print('DIRECTORY_FIRST_CYCLE_PACKAGE_PREFLIGHT_OK\nNO_SQL_NO_SECRET_READ_NO_WRITE');return
        if not sys.stdin.isatty():raise RuntimeError('interactive_confirmation_required')
        print('Ciclu SQL real: claim, intent, prepare, release. Fara directoare tenant sau activare.')
        if input('Tasteaza exact '+JOB+' pentru confirmare: ')!=JOB:raise RuntimeError('confirmation_refused')
        stage='SQL preflight numai citire';password=getpass.getpass('Parola SA actuala pentru verificarea finala (nu este salvata): ')
        sql_checks(source,password);del password
        # Recheck OS and exclusive destinations after the interactive pause.
        data=preflight(source);stage='SQL cycle; orice incertitudine necesita review'
        apply(data)
    except (Exception,SystemExit):
        print('DIRECTORY_FIRST_CYCLE_UNCONFIRMED_STAGE='+stage+'\nDO_NOT_RETRY_DO_NOT_DELETE_REVIEW_SQL_AND_PRIVATE_JOURNAL');raise SystemExit(1)
if __name__=='__main__':main()
