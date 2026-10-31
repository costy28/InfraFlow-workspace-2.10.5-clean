import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock,patch
import unittest

spec=importlib.util.spec_from_file_location('host',Path(__file__).with_name('os-pilot-host-port.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
REQUEST={'jobId':'00f612ed-a8ac-4688-a26f-679760eee0be','trialId':'b1100b43-48d0-42fa-8a1d-73b1286f8242','expectedJobRevision':5,'localRootApproved':True}
BINDING={k:REQUEST[k] for k in ('jobId','trialId')}|{'intentId':'11111111-1111-1111-1111-111111111111','generation':3,'jobRevision':6}

class Tests(unittest.TestCase):
    def create(self,guard_error=False):
        plan={'user':'ift_test'};self.commands=Mock();self.context=Mock();self.observation={'uid':992,'gid':983,'policyVerified':True}
        def guard(p,approval,context,lock,inventory,command,observe,record):
            self.assertTrue(approval['localRootApproved']);self.assertEqual(approval['resourceKey'],p['user'])
            if guard_error:raise RuntimeError('uncertain')
            context();self.assertTrue(inventory(p));value=observe(p);record('observed_created',value['uid'],value['gid'])
            return {'outcome':'observed_created','reconciliationRequired':True}
        mods={'inspect-demo-tenant-os-identity':SimpleNamespace(identity_plan=lambda _:plan,inspect=lambda _:{'resourcesAbsent':True}),
              'tenant-os-execution-guard':SimpleNamespace(guarded_execute=guard,identity_lock=Mock()),
              'tenant-os-observer':SimpleNamespace(observe=lambda _:dict(self.observation)),
              'tenant-os-command-runner':SimpleNamespace(create_command_runner=lambda _:self.commands)}
        with patch.object(m.sys,'platform','linux'),patch.object(m.os,'geteuid',return_value=0,create=True),patch.object(m,'module',side_effect=mods.__getitem__):
            return m.create_host(REQUEST,Path('/private-locks'))
    def test_construction_has_no_effect_and_observation_returns_to_orchestrator(self):
        host=self.create();self.commands.assert_not_called()
        self.assertEqual(host(BINDING,self.context),self.observation);self.context.assert_called_once()
        with self.assertRaisesRegex(RuntimeError,'already_used'):host(BINDING,self.context)
    def test_wrong_binding_refused_before_guard(self):
        host=self.create()
        with self.assertRaisesRegex(RuntimeError,'binding_refused'):host(BINDING|{'jobRevision':7},self.context)
        self.context.assert_not_called();self.commands.assert_not_called()
    def test_uncertainty_consumes_local_attempt_without_retry(self):
        host=self.create(True)
        with self.assertRaises(RuntimeError):host(BINDING,self.context)
        with self.assertRaisesRegex(RuntimeError,'already_used'):host(BINDING,self.context)
        self.commands.assert_not_called()

if __name__=='__main__':unittest.main()
