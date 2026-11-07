"""Coordinator wiring tests only; effects, files, context guard and SQL mocked."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock,patch

def load(name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
m=load('directory-prepared-execution');fixture=load('test-demo-directory-execution-report')
class Tests(unittest.TestCase):
    def scenario(self,failure=None):
        b=fixture.B;value,_=fixture.fixture();pipe=Mock();events=[]
        def call(action,payload):
            events.append(action)
            if action=='init':return {'initialized':True,'invocationId':'a'*32}
            if action=='check':return {'ok':True}
            raise AssertionError('unexpected real transport action')
        pipe.call.side_effect=call
        def guard(*args):
            events.append('guard')
            if failure=='guard':raise RuntimeError()
            return {'trialId':b['trialId'],'status':'directories_observed_requires_review','activationPerformed':False}
        def submit(*args):
            events.append('report')
            if failure=='report':raise RuntimeError()
            return {'confirmedCount':8}
        inventory=lambda p:{'trialId':b['trialId'],'directories':[{'path':r['path'],'status':'absent'} for r in p['directories']],'executionAllowed':False}
        if failure=='existing':inventory=lambda p:{}
        ports={'pipe_factory':lambda:pipe,'lock':Mock(),'inventory':inventory,'runner':Mock(),'clock':Mock()}
        original=m.load
        def modules(n):
            if n=='tenant-directory-context-guard':return SimpleNamespace(guarded_run=guard)
            if n=='tenant-directory-report-submit':return SimpleNamespace(durable_ports=lambda *a:(Mock(),Mock()),submit=submit)
            return original(n)
        with patch.object(m,'load',side_effect=modules):
            if failure:
                with self.assertRaises(RuntimeError):m.execute(b,value['evidence'],'a'*64,Path('unused'),Path('unused2'),True,ports)
            else:self.assertFalse(m.execute(b,value['evidence'],'a'*64,Path('unused'),Path('unused2'),True,ports)['activationPerformed'])
        pipe.close.assert_called_once();return events
    def test_order(self):self.assertEqual(self.scenario(),['init','check','guard','report'])
    def test_guard_failure_no_report(self):self.assertEqual(self.scenario('guard'),['init','check','guard'])
    def test_report_failure_no_release_retry(self):self.assertEqual(self.scenario('report'),['init','check','guard','report'])
    def test_existing_paths_no_guard(self):self.assertEqual(self.scenario('existing'),['init','check'])
    def test_no_approval_no_transport(self):
        with self.assertRaises(RuntimeError):m.execute(None,None,None,None,None,False,{})
if __name__=='__main__':unittest.main()
