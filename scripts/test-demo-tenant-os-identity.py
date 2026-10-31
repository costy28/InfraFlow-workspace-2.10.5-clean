import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('inventory',Path(__file__).parent/'linux/inspect-demo-tenant-os-identity.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
    def test_canonical_resource_binding_and_noninteractive_account(self):
        p=m.identity_plan(m.TRIAL)
        self.assertEqual(p['user'],'ift_b1100b4348d042fa8a1d73b1286f')
        self.assertEqual(len(p['user']),32);self.assertFalse(p['executionAllowed'])
        self.assertEqual(p['shell'],'/usr/sbin/nologin');self.assertFalse(p['createHome'])
        for trial in [m.TRIAL.upper(),'../etc/passwd',m.TRIAL+' ',None]:
            with self.assertRaises((ValueError,AttributeError)):m.identity_plan(trial)
    def test_nss_absence_and_exact_fixed_read_only_commands(self):
        calls=[]
        def run(cmd,**kwargs):
            calls.append((cmd,kwargs));return SimpleNamespace(returncode=2,stdout='',stderr='')
        r=m.inspect(m.identity_plan(m.TRIAL),run)
        self.assertTrue(r['resourcesAbsent']);self.assertFalse(r['executionAllowed'])
        self.assertEqual([c[0][:2] for c in calls],[['/usr/bin/getent','passwd'],['/usr/bin/getent','group']])
        self.assertTrue(all('shell' not in c[1] for c in calls))
    def test_existing_account_is_collision_never_adopted_or_secret_disclosed(self):
        name=m.identity_plan(m.TRIAL)['user']
        for db,line in [('passwd',name+':secret:1001:1001::/home/x:/bin/bash\n'),('group',name+':secret:1001:members\n')]:
            status=m.classify(db,name,SimpleNamespace(returncode=0,stdout=line,stderr=''))
            self.assertEqual(status,'exists_requires_review');self.assertNotIn('secret',status)
    def test_nss_errors_or_ambiguous_results_fail_closed(self):
        name=m.identity_plan(m.TRIAL)['user']
        for response in [SimpleNamespace(returncode=1,stdout='',stderr=''),SimpleNamespace(returncode=2,stdout='',stderr='failure'),SimpleNamespace(returncode=0,stdout='',stderr=''),SimpleNamespace(returncode=0,stdout='wrong:x:1:1::/:/bin/sh\n',stderr='')]:
            with self.assertRaises(RuntimeError):m.classify('passwd',name,response)
    def test_arbitrary_plan_never_reaches_getent(self):
        with patch.object(m.subprocess,'run') as run:
            with self.assertRaises(ValueError):m.inspect({**m.identity_plan(m.TRIAL),'user':'root'},run)
            run.assert_not_called()
    def test_non_linux_exits_without_inspection(self):
        with patch.object(m.sys,'platform','win32'),patch.object(m,'inspect') as inspect:
            with self.assertRaises(SystemExit):m.main()
            inspect.assert_not_called()
if __name__=='__main__':unittest.main()
