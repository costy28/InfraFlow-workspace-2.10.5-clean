#!/usr/bin/env python3
"""Native effects only under a private /run fixture. SQL context is simulated."""
from contextlib import contextmanager
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import time

def load(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

CHILD="""import importlib.util,json,pathlib,sys
p=json.loads(sys.stdin.buffer.read(4097));root=pathlib.Path(sys.argv[2])
if set(p)!={'entry','expected'} or not str(p['entry']['path']).startswith(str(root)+'/'):raise RuntimeError()
if any(not k.startswith(str(root)+'/') for k in p['expected']):raise RuntimeError()
s=importlib.util.spec_from_file_location('exe',pathlib.Path(sys.argv[1])/'tenant-directory-executor.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
print(json.dumps(m._mkdir(p['entry'],p['expected']),separators=(',',':')))
"""

def integrated(root,lost=False,expired=False):
    trial=('22222222-2222-4222-8222-222222222222' if lost else '33333333-3333-4333-8333-333333333333' if expired else '11111111-1111-4111-8111-111111111111')
    plan=load('tenant-directory-plan').plan(trial,60001,60002);fixture=root/trial;fixture.mkdir(mode=0o700)
    mapped={}
    for e in plan['directories']:
        storage=e['path'].startswith('/var/lib/');prefix='/var/lib/infraflow-demo-tenants' if storage else '/etc/infraflow-demo-tenants'
        mapped[e['path']]={**e,'path':str(fixture/('storage' if storage else 'config'))+e['path'][len(prefix):]}
    expected={e['path']:e for e in mapped.values()};runner=load('tenant-directory-owned-runner');journal=load('tenant-directory-journal')
    calls=[];checks=[]
    approval={'jobId':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','trialId':trial,'intentId':'cccccccc-cccc-4ccc-8ccc-cccccccccccc','priorOsIntentId':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','attemptId':'dddddddd-dddd-4ddd-8ddd-dddddddddddd','generation':5,'jobRevision':10,'uid':60001,'gid':60002,'localRootApproved':True}
    evidence={'jobId':approval['jobId'],'osIntentId':approval['priorOsIntentId'],'jobRevision':6,'generation':3,'uid':60001,'gid':60002}
    def context():
        checks.append(1);return {**{k:v for k,v in approval.items() if k!='localRootApproved'},'storageRoot':'/var/lib/infraflow-demo-tenants/'+trial,'configRoot':'/etc/infraflow-demo-tenants/'+trial,'validForMs':14999 if expired else 30000,'contextReady':True,'executionAllowed':False}
    def run(entry,timeout):
        calls.append(entry['path'])
        raw=json.dumps({'entry':mapped[entry['path']],'expected':expected},separators=(',',':')).encode()
        r=runner._capture_owned([sys.executable,'-c',CHILD,str(Path(__file__).resolve().parent),str(fixture)],raw,timeout)
        if lost:raise RuntimeError('simulated_response_lost_after_effect')
        return r
    guard=load('tenant-directory-context-guard');lock=load('tenant-os-execution-guard').identity_lock
    try:
        guard.guarded_run(plan,approval,context,lambda identity:lock(root/'locks',identity),
            lambda p:{'trialId':trial,'directories':[{'path':e['path'],'status':'absent'} for e in p['directories']],'executionAllowed':False},
            lambda p:journal.create_new(root/'journals',p,evidence),run)
        if lost or expired:raise RuntimeError('unexpected_success')
    except RuntimeError as error:
        if not (lost or expired) or str(error)!='directories_unconfirmed_no_retry_review_required':raise
    review=journal.inspect_for_review(root/'journals',trial)
    if review['resumeAllowed'] is not False:raise RuntimeError('unexpected_resume')
    if expired:
        if calls or len(checks)!=1 or review['lastStage']!='review_required':raise RuntimeError('context_gate_failed')
    elif lost:
        if len(calls)!=1 or not Path(mapped[calls[0]]['path']).is_dir() or review['lastStage']!='review_required':raise RuntimeError('uncertain_not_preserved')
    else:
        if len(calls)!=8 or len(checks)!=8 or review['lastStage']!='completed':raise RuntimeError('integrated_flow_incomplete')
        for e in mapped.values():
            s=Path(e['path']).lstat()
            if (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))!=(e['uid'],e['gid'],int(e['mode'],8)):raise RuntimeError('observed_policy_failed')

def timeout_tree(root):
    runner=load('tenant-directory-owned-runner');pidfile=root/'descendant.pid';spawned=[];killed=[]
    code="import subprocess,sys,time;from pathlib import Path;p=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)']);Path(sys.argv[1]).write_text(str(p.pid));time.sleep(60)"
    def popen(*args,**kw):
        child=subprocess.Popen(*args,**kw);spawned.append(child.pid);return child
    def killpg(pid,sig):killed.append(pid);os.killpg(pid,sig)
    try:runner._capture_owned([sys.executable,'-c',code,str(pidfile)],b'{}',5,popen,killpg)
    except RuntimeError:pass
    else:raise RuntimeError('timeout_not_enforced')
    if len(spawned)!=1 or killed!=spawned or not pidfile.is_file():raise RuntimeError('owned_group_not_confirmed')
    pid=int(pidfile.read_text());proc=Path('/proc')/str(pid)/'stat'
    for _ in range(20):
        try:state=proc.read_text().rsplit(')',1)[1].split()[0]
        except FileNotFoundError:return
        if state=='Z':return # dead, awaiting init reap, never kill a PID by name
        time.sleep(.05)
    raise RuntimeError('descendant_still_live_review_required')

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or os.getegid()!=0 or sys.argv[1:]!=['--probe-confirmed']:sys.exit('ROOT_LINUX_EXPLICIT_CANARY_REQUIRED')
    try:
        with tempfile.TemporaryDirectory(prefix='infraflow-directory-runner-',dir='/run') as tmp:
            root=Path(tmp);os.chmod(root,0o700);(root/'journals').mkdir(mode=0o700);(root/'locks').mkdir(mode=0o700)
            integrated(root);integrated(root,expired=True);integrated(root,lost=True);timeout_tree(root)
        if root.exists():raise RuntimeError('fixture_cleanup_failed')
        print('DIRECTORY_RUNNER_NATIVE_GUARD_JOURNAL_OK\nDIRECTORY_RUNNER_EXPIRED_CONTEXT_NO_EFFECT_OK\nDIRECTORY_RUNNER_LOST_RESPONSE_PRESERVED_OK\nDIRECTORY_RUNNER_OWNED_TREE_TIMEOUT_OK\nDIRECTORY_RUNNER_CANARY_CLEANUP_OK\nALL_SQL_SIMULATED_TEMPORARY_PATHS_ONLY_NO_ACCOUNT_NO_SERVICE_RESTART')
    except Exception:
        print('DIRECTORY_RUNNER_CANARY_UNCONFIRMED_NO_AUTOMATIC_RETRY');raise SystemExit(1)
if __name__=='__main__':main()
