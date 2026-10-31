#!/usr/bin/env python3
"""Filesystem journal and orchestrator canary: every SQL/OS effect port is simulated."""
import importlib.util
import errno
import json
import os
from pathlib import Path
import stat
import sys
import tempfile

def module(name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def simulated_ports(parent,fail_host=False):
    journal=module('os-pilot-journal');calls=[]
    def base(b):return {k:b[k] for k in ('jobId','intentId','generation','jobRevision')}|{'executionAllowed':False}
    def host(*args):
        calls.append('host')
        if fail_host:raise RuntimeError('simulated lost host response')
        return {'uid':10001,'gid':10002,'policyVerified':True}
    def report(b,t,r):calls.append('report');return base(b)|r|{'reconciliationRequired':True}
    def release(p):calls.append('release');return {'jobId':p['jobId'],'generation':p['generation'],'jobRevision':p['expectedJobRevision']+1,'leaseExpiresAt':None,'executionAllowed':False}
    return {'inventory':lambda _:True,'journal':lambda b:journal.create_new_journal(parent,b),
        'claim':lambda p:{'jobId':p['jobId'],'generation':1,'jobRevision':p['expectedJobRevision']+1,'leaseExpiresAt':'2026-10-31T12:00:00.000','executionAllowed':False},
        'intent':lambda p:{k:p[k] for k in ('jobId','generation','intentId','step')}|{'state':'intent_recorded','executionAllowed':False},
        'prepare':lambda b,*_:base(b)|{'state':'prepared','resourceKey':'ift_'+b['trialId'].replace('-','')[:28]},
        'accept':lambda b,*_:base(b)|{'trialId':b['trialId'],'state':'accepted','resourceKey':'ift_'+b['trialId'].replace('-','')[:28],'nextGate':'durable_result_and_reconciliation_protocol'},
        'host':host,'report':report,'release':release},calls

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or os.getegid()!=0 or sys.argv[1:]!=['--probe-confirmed']:sys.exit('LINUX_ROOT_EXPLICIT_CANARY_REQUIRED')
    try:
        run=Path('/run');s=run.lstat()
        if not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError()
        j=module('os-pilot-journal');flow=module('os-pilot-orchestrator')
        with tempfile.TemporaryDirectory(prefix='infraflow-pilot-journal-probe-',dir='/run') as tmp:
            parent=Path(tmp);os.chmod(parent,0o700)
            if parent.parent!=run or parent.is_symlink():raise RuntimeError()
            b={'format':'infraflow-os-pilot-v1','jobId':'dddddddd-dddd-4ddd-8ddd-dddddddddddd','trialId':'11111111-1111-4111-8111-111111111111','intentId':'22222222-2222-4222-8222-222222222222','expectedJobRevision':0,'leaseToken':'1'*64,'delegationToken':'2'*64}
            ledger=j.create_new_journal(parent,b);ledger.append('claim_requested')
            r=j.inspect_for_review(parent,b['jobId'])
            if r['lastStage']!='claim_requested' or r['resumeAllowed'] is not False or r['reviewRequired'] is not True or 'Token' in json.dumps(r):raise RuntimeError()
            try:j.create_new_journal(parent,b);raise RuntimeError('duplicate accepted')
            except FileExistsError:pass
            folder=parent/b['jobId'];source=folder/'bootstrap.json';bad=folder/'999999.json'
            bad.symlink_to(source)
            try:
                try:j.read_private(folder,bad.name);raise RuntimeError('symlink accepted')
                except OSError as error:
                    if error.errno!=errno.ELOOP:raise
            finally:bad.unlink()
            os.link(source,bad)
            try:
                try:j.read_private(folder,bad.name);raise RuntimeError('hardlink accepted')
                except RuntimeError as error:
                    if str(error)!='journal_file_refused':raise
            finally:bad.unlink()
            print('OS_PILOT_JOURNAL_PRIVATE_APPEND_ONLY_OK\nOS_PILOT_JOURNAL_DUPLICATE_LINKS_DENIED_OK')
            j.write_exclusive(folder,'000003.json',{'incomplete':True})
            try:j.inspect_for_review(parent,b['jobId']);raise RuntimeError('partial event accepted')
            except RuntimeError as error:
                if str(error) not in ('journal_file_refused','journal_chain_refused'):raise
            print('OS_PILOT_JOURNAL_PARTIAL_EVENT_DENIED_OK')
            request={'jobId':'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','trialId':b['trialId'],'expectedJobRevision':0,'localRootApproved':True}
            ports,calls=simulated_ports(parent);result=flow.run_pilot(request,ports)
            r=j.inspect_for_review(parent,request['jobId'])
            if result['activationPerformed'] is not False or r['attemptCompleted'] is not True or r['resumeAllowed'] is not False or calls!=['host','report','release']:raise RuntimeError()
            print('OS_PILOT_SIMULATED_PORTS_DURABLE_FLOW_OK')
            request['jobId']='ffffffff-ffff-4fff-8fff-ffffffffffff';ports,calls=simulated_ports(parent,True)
            try:flow.run_pilot(request,ports);raise RuntimeError('lost response accepted')
            except RuntimeError as error:
                if str(error)!='os_pilot_unconfirmed_review_required':raise
            r=j.inspect_for_review(parent,request['jobId'])
            if r['lastStage']!='review_required' or calls!=['host'] or r['resumeAllowed'] is not False:raise RuntimeError()
            print('OS_PILOT_INTERRUPTION_NO_RETRY_NO_COMPENSATION_OK')
        if parent.exists():raise RuntimeError()
        print('OS_PILOT_JOURNAL_CANARY_CLEANUP_OK\nALL_EFFECT_PORTS_SIMULATED_NO_SQL_NO_ACCOUNT_NO_EXISTING_SERVICE_RESTART')
    except Exception:
        print('OS_PILOT_JOURNAL_CANARY_UNCONFIRMED_NO_AUTOMATIC_RETRY');sys.exit(1)

if __name__=='__main__':main()
