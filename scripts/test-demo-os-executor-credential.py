import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('prepare',Path(__file__).parent/'linux/prepare-demo-os-executor-credential.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
    def test_dynamic_user_no_persistent_account_or_root_service(self):
        for mode in (False,True):
            args=m.command(mode)
            self.assertIn('--property=DynamicUser=yes',args)
            self.assertIn('--property=ProtectSystem=strict',args)
            self.assertIn('--property=CapabilityBoundingSet=',args)
            self.assertNotIn('--property=User=root',args)
            self.assertNotIn('--property=PrivateNetwork=yes',args)
        self.assertIn('--stdin-check',m.command(True))
        self.assertFalse(any('LoadCredential' in x for x in m.command(True)))
        self.assertIn('--property=LoadCredential=os-executor-sql-password:'+str(m.SECRET),m.command())
    def test_only_new_source_and_release(self):
        self.assertEqual(m.SECRET.name,'os-executor.password')
        self.assertEqual(m.RELEASE.name,'os-executor-sql-check-v1')
        self.assertEqual(set(m.FILES),{'os-executor-sql-check.js','os-executor-credential-probe.js'})
    def test_non_linux_no_password_prompt(self):
        with patch.object(m.sys,'platform','win32'),patch.object(m.getpass,'getpass') as prompt:
            with self.assertRaises(SystemExit):m.main()
            prompt.assert_not_called()
    def test_support_strict_ascii_password_confirmation(self):
        m.support().validate_password('x'*20,'x'*20)
        for a,b in [('short','short'),('ș'*20,'ș'*20),('x'*20,'y'*20)]:
            with self.assertRaises(RuntimeError):m.support().validate_password(a,b)
if __name__=='__main__':unittest.main()
