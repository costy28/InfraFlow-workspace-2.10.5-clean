import importlib.util
from pathlib import Path
from unittest.mock import Mock
import unittest

def load(name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
m=load('tenant-directory-executor');planner=load('tenant-directory-plan');j=load('tenant-directory-journal')

class Tests(unittest.TestCase):
    def setup_ports(self,fail=None):
        policy=planner.plan('b1100b43-48d0-42fa-8a1d-73b1286f8242',992,983);events=[];calls=[];state=(0,False,False)
        class Journal:
            def append(self,stage,details):
                nonlocal state
                if stage==fail:raise RuntimeError('disk')
                state=j.transition(state,stage,details,policy);events.append(stage)
        def create(entry):
            self.assertEqual(events[-1],'mkdir_requested');calls.append(entry['path'])
            if fail=='create':raise RuntimeError('uncertain')
            return {k:entry[k] for k in ('uid','gid','mode')}|{'device':1,'inode':len(calls)}
        return policy,{'inventory':lambda p:{'trialId':p['trialId'],'directories':[{'path':e['path'],'status':'absent'} for e in p['directories']],'executionAllowed':False},'journal':lambda _:Journal(),'authorize':lambda *_:True,'create':create},events,calls
    def test_success_has_durable_requests_before_all_eight_effects(self):
        p,ports,events,calls=self.setup_ports();r=m.run_plan(p,ports)
        self.assertEqual(len(calls),8);self.assertEqual(events,['mkdir_requested','mkdir_observed']*8+['completed']);self.assertFalse(r['activationPerformed'])
    def test_failed_request_never_runs_effect(self):
        p,ports,events,calls=self.setup_ports('mkdir_requested')
        with self.assertRaisesRegex(RuntimeError,'no_retry'):m.run_plan(p,ports)
        self.assertEqual(calls,[])
    def test_uncertain_effect_and_failed_observation_never_retry(self):
        for failure in ('create','mkdir_observed'):
            p,ports,events,calls=self.setup_ports(failure)
            with self.assertRaisesRegex(RuntimeError,'no_retry'):m.run_plan(p,ports)
            self.assertEqual(len(calls),1)
    def test_refused_authority_prevents_effect(self):
        p,ports,events,calls=self.setup_ports();ports['authorize']=lambda *_:False
        with self.assertRaises(RuntimeError):m.run_plan(p,ports)
        self.assertEqual(calls,[]);self.assertEqual(events,['review_required'])
    def test_journal_transition_rejects_duplicate_and_false_receipts(self):
        p,*_=self.setup_ports();s=j.transition((0,False,False),'mkdir_requested',{'index':0},p)
        with self.assertRaises(RuntimeError):j.transition(s,'mkdir_requested',{'index':0},p)
        with self.assertRaises(RuntimeError):j.transition(s,'mkdir_observed',{'index':0,'uid':992,'gid':983,'mode':'0777','device':1,'inode':1},p)

if __name__=='__main__':unittest.main()
