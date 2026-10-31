import importlib.util
from pathlib import Path
from contextlib import contextmanager
from types import SimpleNamespace
import unittest
spec=importlib.util.spec_from_file_location('integrated',Path(__file__).parent/'linux/probe-demo-os-integrated.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Tests(unittest.TestCase):
    def setUp(self):
        inv=m.module('inspect-demo-tenant-os-identity');self.plan=inv.identity_plan(inv.TRIAL);self.calls=[]
    @contextmanager
    def lock(self,identity):
        self.assertEqual(identity,self.plan['user']);self.calls.append('lock')
        try:yield
        finally:self.calls.append('unlock')
    def benign(self,command,timeout):
        self.assertEqual(command,('/usr/bin/true',));self.assertEqual(timeout,5);self.calls.append('benign');return SimpleNamespace(returncode=0)
    def test_integrated_pipeline_real_gate_then_simulated_context_and_benign_commands(self):
        result=m.pipeline(self.plan,self.lock,lambda:self.calls.append('sql_negative'),lambda _:True,self.benign)
        self.assertEqual(result,{'gate':1,'forbidden':0,'context':2,'benign':2,'record':1})
        self.assertEqual(self.calls,['lock','sql_negative','unlock','lock','benign','benign','unlock'])
    def test_uncertain_sql_probe_never_reaches_positive_path(self):
        def sql():raise RuntimeError('unconfirmed')
        with self.assertRaises(RuntimeError):m.pipeline(self.plan,self.lock,sql,lambda _:True,self.benign)
        self.assertNotIn('benign',self.calls);self.assertEqual(self.calls,['lock','unlock'])
    def test_collision_never_calls_sql_or_commands(self):
        with self.assertRaises(RuntimeError):m.pipeline(self.plan,self.lock,lambda:self.calls.append('sql'),lambda _:False,self.benign)
        self.assertEqual(self.calls,['lock','unlock'])
    def test_sql_unit_has_fixed_credential_and_no_effect_scope(self):
        args=m.sql_command()
        self.assertIn('--property=LoadCredential=os-executor-sql-password:'+str(m.SECRET),args)
        self.assertIn('--property=DynamicUser=yes',args);self.assertIn('--property=CapabilityBoundingSet=',args)
        self.assertNotIn('--stdin-check',args)

if __name__=='__main__':unittest.main()
