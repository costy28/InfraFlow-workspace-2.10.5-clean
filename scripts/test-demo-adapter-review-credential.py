import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('prepare',Path(__file__).parent/'linux/prepare-demo-adapter-review-credential.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class CredentialTests(unittest.TestCase):
    def test_password_exact_ascii_confirmation(self):
        module.validate_password('x'*20,'x'*20)
        for a,b in [('short','short'),('ș'*20,'ș'*20),('x'*20,'y'*20)]:
            with self.assertRaises(RuntimeError):module.validate_password(a,b)

    def test_non_linux_no_prompt_or_writes(self):
        with patch.object(module.sys,'platform','win32'),patch.object(module.getpass,'getpass') as prompt:
            with self.assertRaises(SystemExit):module.main()
            prompt.assert_not_called()

    def test_absolute_runuser_no_secret_argv(self):
        args=module.input_command()
        self.assertEqual(args[0],'/usr/sbin/runuser')
        self.assertIn('infraflow-demo-adapter-review',args)
        self.assertEqual(args[-1],'--stdin-check')
        self.assertNotIn('shell',args)

    def test_systemd_unit_reads_only_own_credential(self):
        args=module.probe_command()
        self.assertIn('--unit=infraflow-demo-adapter-sql-check.service',args)
        self.assertIn('--property=User=infraflow-demo-adapter-review',args)
        self.assertIn('--property=LoadCredential=adapter-sql-password:'+str(module.SECRET),args)
        self.assertFalse(any('lease-sql.password' in a or 'operator-auth.key' in a for a in args))
        self.assertIn('--property=KillMode=control-group',args)

if __name__=='__main__':unittest.main()
