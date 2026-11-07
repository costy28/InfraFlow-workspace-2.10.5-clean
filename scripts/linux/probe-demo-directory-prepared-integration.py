"""Native journals and lock; simulated SQL, inventory and directory effects."""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import time

def load(name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or os.getegid()!=0 or sys.argv[1:]!=['--probe-confirmed']:raise RuntimeError('mode_refused')
    coordinator=load('directory-prepared-execution');h=load('os-pilot-journal');locks=load('tenant-os-execution-guard')
    b={'jobId':'10000000-0000-0000-0000-000000000001','trialId':'20000000-0000-0000-0000-000000000002','intentId':'30000000-0000-0000-0000-000000000003','priorOsIntentId':'40000000-0000-0000-0000-000000000004','attemptId':'50000000-0000-0000-0000-000000000005','generation':5,'jobRevision':10,'uid':60001,'gid':60002}
    evidence={'jobId':b['jobId'],'osIntentId':b['priorOsIntentId'],'generation':3,'jobRevision':6,'uid':b['uid'],'gid':b['gid']}
    with tempfile.TemporaryDirectory(prefix='infraflow-prepared-integration-',dir='/run') as tmp:
        root=Path(tmp);os.chmod(root,0o700)
        for case in ('success','expired','lost'):
            base=root/case;base.mkdir(mode=0o700)
            execution=base/'execution';reports=base/'reports';lockroot=base/'locks'
            for p in (execution,reports,lockroot):p.mkdir(mode=0o700)
            events=[];effects=[]
            class Pipe:
                closed=False
                def call(self,action,payload):
                    events.append(action)
                    if action=='init':
                        if payload!={'binding':b}:raise RuntimeError('binding_changed')
                        return {'initialized':True,'invocationId':'a'*32}
                    if action=='check':return {'ok':True}
                    if action=='context':
                        # Context can only be requested after its durable OS event.
                        n=len(effects)*2+1
                        row=h.read_private(execution/b['attemptId'],f'{n:06d}.json')
                        if row['stage']!='mkdir_requested':raise RuntimeError('request_not_durable')
                        return {**b,'storageRoot':'/var/lib/infraflow-demo-tenants/'+b['trialId'],'configRoot':'/etc/infraflow-demo-tenants/'+b['trialId'],'validForMs':14999 if case=='expired' else 30000,'contextReady':True,'executionAllowed':False}
                    if action=='report':
                        request=h.read_private(reports/b['attemptId'],'bootstrap.json')
                        if request['report']['journalDigest']!=payload['journalDigest']:raise RuntimeError('report_not_durable')
                        if case=='lost':raise TimeoutError()
                        return {**{k:b[k] for k in ('jobId','trialId','intentId','priorOsIntentId','attemptId','generation','jobRevision')},'outcome':'observed_created','confirmedCount':8,'journalDigest':payload['journalDigest'],'executionAllowed':False,'reconciliationRequired':True}
                    raise RuntimeError('unexpected_action')
                def close(self):self.closed=True
            pipe=Pipe()
            def runner(entry,timeout):
                if timeout!=5 or events[-1]!='context':raise RuntimeError('effect_order')
                effects.append(entry['path']);return {k:entry[k] for k in ('uid','gid','mode')}|{'device':1,'inode':len(effects)}
            def inventory(policy):return {'trialId':b['trialId'],'directories':[{'path':e['path'],'status':'absent'} for e in policy['directories']],'executionAllowed':False}
            ports={'pipe_factory':lambda:pipe,'lock':lambda identity:locks.identity_lock(lockroot,identity),'inventory':inventory,'runner':runner,'clock':time.monotonic}
            failed=False
            try:result=coordinator.execute(b,evidence,'a'*64,execution,reports,True,ports)
            except RuntimeError:failed=True
            if not pipe.closed or failed!=(case!='success'):raise RuntimeError('coordinator_outcome')
            if case=='expired':
                if effects or 'report' in events or (reports/b['attemptId']).exists():raise RuntimeError('expired_context_effect')
            else:
                if len(effects)!=8 or events.count('context')!=8 or events.count('report')!=1:raise RuntimeError('flow_count')
                confirmed=reports/b['attemptId']/'000001.json'
                if confirmed.exists()!=(case=='success'):raise RuntimeError('confirmation_outcome')
                if case=='success':h.read_private(confirmed.parent,confirmed.name)
                # Re-entry must stop at the existing execution journal before effects/report.
                before=(len(effects),events.count('report'))
                try:coordinator.execute(b,evidence,'a'*64,execution,reports,True,ports)
                except RuntimeError:pass
                else:raise RuntimeError('repeat_allowed')
                if before!=(len(effects),events.count('report')):raise RuntimeError('repeat_effect')
        print('PREPARED_NATIVE_JOURNAL_REPORT_ORDER_OK')
        print('PREPARED_NATIVE_EXPIRED_CONTEXT_NO_EFFECT_OK')
        print('PREPARED_NATIVE_LOST_REPORT_NO_RETRY_OK')
    if root.exists():raise RuntimeError('cleanup_unconfirmed')
    print('PREPARED_NATIVE_CANARY_CLEANUP_OK')
    print('SQL_INVENTORY_EFFECTS_SIMULATED_NO_TENANT_DIRECTORY_NO_SERVICE_RESTART')

if __name__=='__main__':
    try:main()
    except Exception:
        print('PREPARED_NATIVE_CANARY_UNCONFIRMED_STOP_NO_RETRY',file=sys.stderr);sys.exit(1)
