import importlib.util
from pathlib import Path
from unittest.mock import Mock
import unittest

spec=importlib.util.spec_from_file_location('ports',Path(__file__).with_name('os-pilot-bound-ports.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
REQUEST={'jobId':'00f612ed-a8ac-4688-a26f-679760eee0be','trialId':'b1100b43-48d0-42fa-8a1d-73b1286f8242','expectedJobRevision':5,'localRootApproved':True}

class Tests(unittest.TestCase):
    def test_full_flow_and_each_lost_response(self):
        fixture_spec=importlib.util.spec_from_file_location('fixture',Path(__file__).parents[1]/'test-demo-os-pilot-orchestrator.py')
        fixture=importlib.util.module_from_spec(fixture_spec);fixture_spec.loader.exec_module(fixture)
        for fail in (None,'intent','prepare','accept','context','report','release'):
            ports,calls,events,private=fixture.Tests().ports()
            closed=[];wire=[];binding={}
            class Pipe:
                def __init__(self,role):self.role=role
                def call(self,action,p):
                    wire.append((self.role,action))
                    if action==fail:raise RuntimeError('lost_response')
                    if action=='init':
                        if self.role=='executor':binding.update(p['binding'])
                        return {'initialized':True}
                    if action=='claim':
                        value=ports['claim'](p)
                        binding.update({'jobId':p['jobId'],'trialId':REQUEST['trialId'],'intentId':private['intentId'],'generation':value['generation'],'jobRevision':value['jobRevision']})
                        return value
                    if action in ('intent','release'):return ports[action](p)
                    if action=='prepare':return ports[action](binding,p['leaseToken'],p['delegationToken'])
                    if action=='accept':return ports[action](binding,p['delegationToken'])
                    if action=='context':return {'contextReady':True}
                    if action=='report':return ports[action](binding,p['delegationToken'],{k:p[k] for k in ('outcome','uid','gid')})
                    raise AssertionError(action)
                def close(self):closed.append(self.role)
            def host(b,context):
                self.assertEqual(context(),{'contextReady':True})
                return ports['host'](b,None)
            if fail:
                with self.assertRaisesRegex(RuntimeError,'review_required'):m.run(REQUEST,ports['inventory'],ports['journal'],host,Pipe)
                self.assertEqual(sum(a==fail for _,a in wire),1)
                self.assertEqual(wire[-1][1],fail)
                self.assertEqual(events[-1]['stage'],'review_required')
            else:
                result=m.run(REQUEST,ports['inventory'],ports['journal'],host,Pipe)
                self.assertEqual(result['jobRevision'],7);self.assertFalse(result['activationPerformed'])
            self.assertEqual(closed,['executor','worker'] if any(r=='executor' for r,a in wire) else ['worker'])
    def test_inventory_refusal_never_opens_sql(self):
        factory=Mock();journal=Mock()
        with self.assertRaises(RuntimeError):m.run(REQUEST,lambda _:False,journal,Mock(),factory)
        factory.assert_not_called();journal.assert_not_called()
    def test_durable_bootstrap_failure_never_opens_sql(self):
        factory=Mock()
        with self.assertRaises(RuntimeError):m.run(REQUEST,lambda _:True,Mock(side_effect=RuntimeError()),Mock(),factory)
        factory.assert_not_called()
    def test_initialization_failure_closes_owned_child_without_claim(self):
        child=Mock();child.call.side_effect=RuntimeError('unconfirmed');factory=Mock(return_value=child)
        with self.assertRaises(RuntimeError):m.run(REQUEST,lambda _:True,Mock(),Mock(),factory)
        self.assertEqual(child.call.call_count,1)
        self.assertEqual(child.call.call_args.args[0],'init')
        child.close.assert_called_once()
    def test_lost_claim_never_accepts_or_runs_host_or_compensates(self):
        child=Mock();child.call.side_effect=[{'initialized':True},RuntimeError()]
        journal=Mock();host=Mock();factory=Mock(return_value=child)
        with self.assertRaisesRegex(RuntimeError,'review_required'):m.run(REQUEST,lambda _:True,journal,host,factory)
        self.assertEqual([c.args[0] for c in child.call.call_args_list],['init','claim'])
        factory.assert_called_once_with('worker');host.assert_not_called();child.close.assert_called_once()

if __name__=='__main__':unittest.main()
