import importlib.util
from contextlib import contextmanager
from pathlib import Path
import unittest

def load(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
guard=load('tenant-directory-context-guard');planner=load('tenant-directory-plan')
APPROVAL={'jobId':'10000000-0000-0000-0000-000000000001','trialId':'20000000-0000-0000-0000-000000000002','intentId':'30000000-0000-0000-0000-000000000003','priorOsIntentId':'40000000-0000-0000-0000-000000000004','attemptId':'50000000-0000-0000-0000-000000000005','generation':5,'jobRevision':10,'uid':992,'gid':983,'localRootApproved':True}

class Tests(unittest.TestCase):
    def fixture(self,change=None,late=False):
        p=planner.plan(APPROVAL['trialId'],992,983);events=[];calls=[];ticks=[0];state={'locked':False}
        @contextmanager
        def lock(identity):
            self.assertEqual(identity,p['identity']);state['locked']=True
            try:yield
            finally:state['locked']=False
        class Journal:
            def append(self,stage,details):events.append(stage)
        def context():
            self.assertTrue(state['locked']);self.assertEqual(events[-1],'mkdir_requested');calls.append('context')
            r={k:v for k,v in APPROVAL.items() if k!='localRootApproved'}
            r.update(storageRoot='/var/lib/infraflow-demo-tenants/'+p['trialId'],configRoot='/etc/infraflow-demo-tenants/'+p['trialId'],validForMs=30000,contextReady=True,executionAllowed=False)
            if change:change(r,ticks)
            return r
        def run(entry,timeout):
            self.assertEqual(timeout,5);self.assertEqual(calls[-1],'context');calls.append('effect')
            if late:ticks[0]+=6
            return {k:entry[k] for k in ('uid','gid','mode')}|{'device':1,'inode':len(calls)}
        def clock():ticks[0]+=.01;return ticks[0]
        return p,events,calls,state,dict(context=context,lock=lock,inventory=lambda p:{'trialId':p['trialId'],'directories':[{'path':e['path'],'status':'absent'} for e in p['directories']],'executionAllowed':False},journal=lambda p:Journal(),run=run,clock=clock)
    def test_each_effect_has_fresh_context_after_durable_request(self):
        p,events,calls,state,ports=self.fixture();r=guard.guarded_run(p,dict(APPROVAL),**ports)
        self.assertEqual(calls,['context','effect']*8);self.assertEqual(events,['mkdir_requested','mkdir_observed']*8+['completed']);self.assertFalse(r['activationPerformed']);self.assertFalse(state['locked'])
    def test_stale_changed_or_expired_context_prevents_effect(self):
        for change in (lambda r,t:r.update(jobRevision=8),lambda r,t:r.update(attemptId=APPROVAL['intentId']),lambda r,t:r.update(executionAllowed=True),lambda r,t:r.update(validForMs=14999),lambda r,t:r.update(uid=True),lambda r,t:t.__setitem__(0,t[0]+20)):
            p,events,calls,state,ports=self.fixture(change)
            with self.assertRaisesRegex(RuntimeError,'no_retry'):guard.guarded_run(p,dict(APPROVAL),**ports)
            self.assertEqual(calls,['context']);self.assertEqual(events,['mkdir_requested','review_required']);self.assertFalse(state['locked'])
    def test_late_effect_is_uncertain_and_never_retried(self):
        p,events,calls,state,ports=self.fixture(late=True)
        with self.assertRaises(RuntimeError):guard.guarded_run(p,dict(APPROVAL),**ports)
        self.assertEqual(calls,['context','effect']);self.assertEqual(events,['mkdir_requested','review_required'])
    def test_local_approval_cannot_be_replaced_by_sql_execution_flag(self):
        p,events,calls,state,ports=self.fixture()
        with self.assertRaises(RuntimeError):guard.guarded_run(p,{**APPROVAL,'localRootApproved':False},**ports)
        self.assertEqual(calls,[]);self.assertEqual(events,[])
    def test_failed_durable_request_never_requests_context(self):
        p,events,calls,state,ports=self.fixture()
        class BadJournal:
            def append(self,*args):raise RuntimeError('fsync')
        ports['journal']=lambda p:BadJournal()
        with self.assertRaises(RuntimeError):guard.guarded_run(p,dict(APPROVAL),**ports)
        self.assertEqual(calls,[])

if __name__=='__main__':unittest.main()
