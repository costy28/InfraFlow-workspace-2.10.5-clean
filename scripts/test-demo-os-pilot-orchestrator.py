import importlib.util
from pathlib import Path
import unittest

def load(name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).parent/'linux'/(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
m=load('os-pilot-orchestrator');j=load('os-pilot-journal')
REQUEST={'jobId':'00f612ed-a8ac-4688-a26f-679760eee0be','trialId':'b1100b43-48d0-42fa-8a1d-73b1286f8242','expectedJobRevision':5,'localRootApproved':True}
class Tests(unittest.TestCase):
    def ports(self,fail=None,journal_fail=None,mutate=None):
        calls=[];events=[];private={};previous=None
        class Journal:
            def append(self,stage,details=None):
                nonlocal previous
                if stage==journal_fail:raise OSError('private failure')
                previous=j.event(previous,stage,details or {});events.append(previous)
        def journal(value):
            nonlocal previous
            private.update(value);j.validate_bootstrap(value);calls.append('journal');previous=j.event(None,'created',{});return Journal()
        def wrap(name,fn):
            def call(*args):
                calls.append(name)
                if name==fail:raise RuntimeError('private '+private.get('leaseToken',''))
                value=fn(*args)
                return mutate(name,value) if mutate else value
            return call
        def base(b):return {k:b[k] for k in ('jobId','intentId','generation','jobRevision')}|{'executionAllowed':False}
        ports={'inventory':lambda _:True,'journal':journal,
            'claim':wrap('claim',lambda p:{'jobId':p['jobId'],'generation':3,'jobRevision':6,'leaseExpiresAt':'2026-10-31T12:00:00.000','executionAllowed':False}),
            'intent':wrap('intent',lambda p:{k:p[k] for k in ('jobId','generation','intentId','step')}|{'state':'intent_recorded','executionAllowed':False}),
            'prepare':wrap('prepare',lambda b,*_ :base(b)|{'state':'prepared','resourceKey':'ift_'+b['trialId'].replace('-','')[:28]}),
            'accept':wrap('accept',lambda b,*_:base(b)|{'trialId':b['trialId'],'state':'accepted','resourceKey':'ift_'+b['trialId'].replace('-','')[:28],'nextGate':'durable_result_and_reconciliation_protocol'}),
            'host':wrap('host',lambda *_:{'uid':992,'gid':983,'policyVerified':True}),
            'report':wrap('report',lambda b,t,r:base(b)|r|{'reconciliationRequired':True}),
            'release':wrap('release',lambda p:{'jobId':p['jobId'],'generation':p['generation'],'jobRevision':p['expectedJobRevision']+1,'leaseExpiresAt':None,'executionAllowed':False})}
        return ports,calls,events,private
    def test_success_is_durable_before_requests_and_never_activation(self):
        ports,calls,events,private=self.ports();result=m.run_pilot(REQUEST,ports)
        self.assertEqual(calls,['journal','claim','intent','prepare','accept','host','report','release'])
        self.assertEqual([e['stage'] for e in events],list(j.STAGES[1:]))
        self.assertEqual(result['jobRevision'],7);self.assertFalse(result['activationPerformed']);self.assertFalse(result['executionAllowed'])
        self.assertNotIn(private['leaseToken'],str(result));self.assertNotIn(private['delegationToken'],str(events))
    def test_each_uncertain_stage_stops_no_retry_compensating_release_or_second_report(self):
        for stage in ('claim','intent','prepare','accept','host','report','release'):
            ports,calls,events,private=self.ports(fail=stage)
            with self.assertRaisesRegex(RuntimeError,'^os_pilot_unconfirmed_review_required$') as error:m.run_pilot(REQUEST,ports)
            self.assertEqual(calls.count(stage),1);self.assertEqual(calls[-1],stage);self.assertEqual(events[-1]['stage'],'review_required')
            self.assertNotIn(private['leaseToken'],str(error.exception))
    def test_failed_durable_request_never_calls_corresponding_port(self):
        for event,port in [('claim_requested','claim'),('intent_requested','intent'),('delegation_requested','prepare'),('accept_requested','accept'),('host_requested','host'),('result_requested','report'),('release_requested','release')]:
            ports,calls,events,_=self.ports(journal_fail=event)
            with self.assertRaises(RuntimeError):m.run_pilot(REQUEST,ports)
            self.assertNotIn(port,calls)
    def test_receipt_binding_or_authority_refused_before_host(self):
        for target,key,value in [('claim','jobRevision',99),('intent','generation',True),('prepare','resourceKey','root'),('accept','executionAllowed',True)]:
            ports,calls,events,_=self.ports(mutate=lambda stage,r:r|{key:value} if stage==target else r)
            with self.assertRaises(RuntimeError):m.run_pilot(REQUEST,ports)
            self.assertNotIn('host',calls)
    def test_without_root_approval_no_journal_or_rpc(self):
        ports,calls,_,_=self.ports()
        with self.assertRaises(RuntimeError):m.run_pilot(REQUEST|{'localRootApproved':False},ports)
        self.assertEqual(calls,[])
    def test_journal_exists_refuses_before_claim(self):
        ports,calls,_,_=self.ports()
        def existing(_):raise FileExistsError('existing')
        ports['journal']=existing
        with self.assertRaises(FileExistsError):m.run_pilot(REQUEST,ports)
        self.assertEqual(calls,[])
if __name__=='__main__':unittest.main()
