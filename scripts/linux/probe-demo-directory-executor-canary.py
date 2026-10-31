#!/usr/bin/env python3
"""Native descriptor/journal canary under one private /run directory; no tenant/SQL effects."""
import importlib.util
import os
from pathlib import Path
import stat
import sys
import tempfile

def load(name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def scenario(root,trial,lost=False):
    planner=load('tenant-directory-plan');exe=load('tenant-directory-executor');journal=load('tenant-directory-journal')
    value=planner.plan(trial,60001,60002);fixture=root/trial;fixture.mkdir(mode=0o700)
    parent=root/'journals'
    evidence={'jobId':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','osIntentId':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','jobRevision':7,'generation':3,'uid':60001,'gid':60002}
    mapped={};calls=[]
    for row in value['directories']:
        path=row['path'];prefix='/var/lib/infraflow-demo-tenants' if path.startswith('/var/lib/') else '/etc/infraflow-demo-tenants'
        mapped[path]={**row,'path':str(fixture/('storage' if path.startswith('/var/lib/') else 'config'))+path[len(prefix):]}
    expected={row['path']:row for row in mapped.values()}
    def create(row):
        calls.append(row['path']);result=exe._mkdir(mapped[row['path']],expected)
        if lost:raise RuntimeError('simulated_lost_response')
        return result
    ports={'inventory':lambda p:{'trialId':trial,'directories':[{'path':r['path'],'status':'absent'} for r in p['directories']],'executionAllowed':False},
           'journal':lambda p:journal.create_new(parent,p,evidence),'authorize':lambda *_:True,'create':create}
    try:
        exe.run_plan(value,ports)
        if lost:raise RuntimeError('unexpected_success')
    except RuntimeError as error:
        if not lost or str(error)!='directories_unconfirmed_no_retry_review_required':raise
    review=journal.inspect_for_review(parent,trial)
    if review['resumeAllowed'] is not False:raise RuntimeError('resume_enabled')
    if lost:
        if len(calls)!=1 or review['lastStage']!='review_required' or not Path(mapped[calls[0]]['path']).is_dir():raise RuntimeError('lost_response_not_preserved')
        return
    if len(calls)!=8 or review['lastStage']!='completed' or review['directoriesConfirmed']!=8:raise RuntimeError('flow_incomplete')
    for row in mapped.values():
        s=Path(row['path']).lstat()
        if (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))!=(row['uid'],row['gid'],int(row['mode'],8)):raise RuntimeError('policy_not_observed')
    # Existing paths and symlink leaves never adopted, chmodded or followed.
    row=mapped[value['directories'][0]['path']]
    try:exe._mkdir(row,expected)
    except FileExistsError:pass
    else:raise RuntimeError('existing_adopted')
    link=fixture/'collision';link.symlink_to('/etc',target_is_directory=True)
    try:exe._mkdir({**row,'path':str(link)},expected)
    except FileExistsError:pass
    else:raise RuntimeError('symlink_followed')

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or os.getegid()!=0 or sys.argv[1:]!=['--probe-confirmed']:sys.exit('ROOT_LINUX_EXPLICIT_CANARY_REQUIRED')
    try:
        with tempfile.TemporaryDirectory(prefix='infraflow-dir-executor-canary-',dir='/run') as tmp:
            root=Path(tmp);os.chmod(root,0o700);(root/'journals').mkdir(mode=0o700)
            scenario(root,'11111111-1111-4111-8111-111111111111')
            print('DIRECTORY_NATIVE_DESCRIPTOR_POLICY_AND_JOURNAL_OK\nDIRECTORY_EXISTING_AND_SYMLINK_REFUSED_OK')
            scenario(root,'22222222-2222-4222-8222-222222222222',True)
            print('DIRECTORY_LOST_RESPONSE_PRESERVED_NO_RETRY_OK')
        if root.exists():raise RuntimeError('cleanup_failed')
        print('DIRECTORY_CANARY_CLEANUP_OK\nTEMPORARY_PATHS_ONLY_NO_ACCOUNT_NO_SQL_NO_EXISTING_SERVICE_RESTART')
    except Exception:
        print('DIRECTORY_CANARY_UNCONFIRMED_NO_AUTOMATIC_RETRY');raise SystemExit(1)

if __name__=='__main__':main()
