import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('creator',Path(__file__).parent/'linux/create-demo-platform-adapter-review-login.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class AdapterLoginTests(unittest.TestCase):
    def test_password_confirmation_ascii_and_distinct(self):
        module.validate_password('Aa9!'+'x'*20,'Aa9!'+'x'*20,'different')
        for p,a,admin in [('short','short','other'),('x'*20,'y'*20,'other'),('ș'*20,'ș'*20,'other'),('x'*20,'x'*20,'x'*20)]:
            with self.assertRaises(RuntimeError):module.validate_password(p,a,admin)

    def test_sql_fixed_target_guard_and_transaction_no_side_effect_commands(self):
        sql=module.creation_sql("Aa9!'"+'x'*20)
        self.assertIn("N'Aa9!''",sql)
        self.assertIn('CREATE LOGIN [infraflow_demo_adapter_review]',sql)
        self.assertIn('BEGIN TRY BEGIN TRANSACTION',sql)
        self.assertIn('adapter_identity_exists_stop',sql)
        self.assertIn('ROLLBACK',sql)
        self.assertNotIn('EXEC platform.provision_lease_command',sql)
        self.assertNotIn('EXEC platform.adapter_review_ticket_command',sql)
        self.assertIn('012_adapter_review_tickets_v1',sql)

    def test_no_linux_no_prompt(self):
        with patch.object(module.sys,'platform','win32'),patch.object(module.getpass,'getpass') as prompt:
            with self.assertRaises(SystemExit):module.main()
            prompt.assert_not_called()

    def test_sqlcmd_password_not_in_arguments(self):
        with patch.object(module.subprocess,'run') as run:
            module.query('not-a-real-secret','SELECT 1;',module.LOGIN)
            args,kwargs=run.call_args
            self.assertNotIn('not-a-real-secret',args[0]);self.assertNotIn('-P',args[0])
            self.assertEqual(kwargs['env']['SQLCMDPASSWORD'],'not-a-real-secret')
            self.assertNotIn('shell',kwargs)

if __name__=='__main__':unittest.main()
