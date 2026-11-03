import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

def load(file):
    spec=importlib.util.spec_from_file_location(file,Path(__file__).with_name(file+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
wiring=load('directory-cycle-bound-ports');j=load('directory-cycle-journal')
REQUEST={'jobId':'10000000-0000-0000-0000-000000000001','trialId':'20000000-0000-0000-0000-000000000002','priorOsIntentId':'40000000-0000-0000-0000-000000000004','uid':992,'gid':983,'expectedJobRevision':7,'localRootApproved':True}

class Tests(unittest.TestCase):
    def fixture(self,fail=None):
        stages=[];calls=[];state={};test=self
        class Journal:
            def append(self,stage,details=None):
                if fail=='journal_'+stage:raise RuntimeError('durability')
                j.event(state.get('last'),stage,details or {},'0'*64)
                state['last']={'sequence':len(stages)+1,'stage':stage,'eventHash':'0'*64};stages.append(stage)
        class Pipe:
            def call(self,action,p):
                calls.append(action)
                if action=='init':state['init']=p;return {'initialized':True,'invocationId':'a'*32}
                expected={'claim':'claim_requested','intent':'intent_requested','prepare':'prepare_requested','release':'release_requested'}
                test.assertEqual(stages[-1],expected[action])
                if fail==action:raise RuntimeError('lost response')
                base=state['init']
                if action in ('claim','release'):return {'jobId':base['jobId'],'generation':4,'jobRevision':8 if action=='claim' else 9,'leaseExpiresAt':'2026-11-01T12:00:00.000' if action=='claim' else None,'executionAllowed':False}
                if action=='intent':return {'jobId':base['jobId'],'generation':4,'intentId':base['intentId'],'step':'tenant_directories','state':'intent_recorded','executionAllowed':False}
                return {**{k:v for k,v in base.items() if k!='expectedJobRevision'},'generation':4,'jobRevision':8,'storageRoot':'/var/lib/infraflow-demo-tenants/'+base['trialId'],'configRoot':'/etc/infraflow-demo-tenants/'+base['trialId'],'state':'prepared','executionAllowed':False}
            def close(self):calls.append('close')
        def journal(private):state['private']=private;stages.append('created');state['last']={'sequence':1,'stage':'created','eventHash':'0'*64};return Journal()
        def factory():test.assertEqual(stages,['created']);return Pipe()
        return stages,calls,state,journal,factory
    def test_full_bound_flow_durable_before_effect(self):
        stages,calls,state,journal,factory=self.fixture()
        r=wiring.run(dict(REQUEST),lambda r:True,journal,factory)
        self.assertEqual(calls,['init','claim','intent','prepare','release','close']);self.assertEqual(stages,list(j.STAGES));self.assertFalse(r['executionAllowed']);self.assertFalse(r['resumeAllowed']);self.assertNotIn('leaseToken',r)
    def test_lost_response_stops_without_compensation(self):
        for failure in ('claim','intent','prepare','release'):
            stages,calls,state,journal,factory=self.fixture(failure)
            with self.assertRaisesRegex(RuntimeError,'review_required'):wiring.run(dict(REQUEST),lambda r:True,journal,factory)
            self.assertEqual(calls.count(failure),1);self.assertEqual(calls[-1],'close');self.assertEqual(stages[-1],'review_required')
            if failure!='release':self.assertNotIn('release',calls)
    def test_failed_journal_request_prevents_matching_rpc(self):
        for action in ('claim','intent','prepare','release'):
            stages,calls,state,journal,factory=self.fixture('journal_'+action+'_requested')
            with self.assertRaises(RuntimeError):wiring.run(dict(REQUEST),lambda r:True,journal,factory)
            self.assertNotIn(action,calls)
    def test_inventory_denial_no_child(self):
        stages,calls,state,journal,factory=self.fixture()
        with self.assertRaises(RuntimeError):wiring.run(dict(REQUEST),lambda r:False,journal,factory)
        self.assertEqual(calls,[]);self.assertEqual(stages,[])
    def test_native_journal_and_secret_free_review(self):
        if os.name!='posix' or os.geteuid()!=0:self.skipTest('root Linux required')
        with tempfile.TemporaryDirectory(prefix='infraflow-dir-cycle-',dir='/run') as root:
            os.chmod(root,0o700);p=Path(root);stages,calls,state,unused,factory=self.fixture()
            def journal(private):
                state['private']=private;stages.append('created');real=j.create_new(p,private);state['real']=real
                class ObservedJournal:
                    def append(self,stage,details=None):
                        real.append(stage,details);stages.append(stage)
                return ObservedJournal()
            result=wiring.run(dict(REQUEST),lambda r:True,journal,factory)
            real=state['real'];private=state['private']
            self.assertEqual(result['status'],'sql_prepared_released_requires_review')
            self.assertEqual(calls,['init','claim','intent','prepare','release','close'])
            review=j.inspect_for_review(p,REQUEST['jobId']);self.assertEqual(review['eventCount'],9);self.assertEqual(review['lastStage'],'released');self.assertFalse(review['resumeAllowed']);self.assertNotIn('leaseToken',str(review))
            with self.assertRaises(FileExistsError):j.create_new(p,private)
            for f in real.directory.iterdir():self.assertEqual(f.stat().st_mode&0o777,0o600)

if __name__=='__main__':unittest.main()
