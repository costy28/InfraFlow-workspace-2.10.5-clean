import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('creator',Path(__file__).parent/'linux/create-demo-platform-os-executor-login.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
    def test_fixed_profile_only_two_rpcs_and_no_review_identity(self):
        for sql in [m.preflight_sql(),m.creation_sql("Aa9!test'synthetic-password"),m.verification_sql(),m.scope_sql()]:
            self.assertNotIn('infraflow_demo_adapter_review',sql)
            self.assertNotIn('read_adapter_resource_review',sql)
            self.assertIn('infraflow_demo_os_executor',sql)
            self.assertIn('accept_os_identity_delegation',sql)
            self.assertIn('record_os_identity_result',sql)
        self.assertIn('016_os_identity_results_v1',m.preflight_sql())
        self.assertIn("test''synthetic",m.creation_sql("Aa9!test'synthetic-password"))
        password='Aa9!infraflow_demo_adapter_review'
        self.assertIn("N'"+password+"'",m.creation_sql(password))
    def test_no_login_reuse_and_no_role_or_direct_data_grants(self):
        sql=m.creation_sql('Aa9!synthetic-password')
        self.assertIn('BEGIN TRY BEGIN TRANSACTION',sql);self.assertIn('ROLLBACK',sql)
        self.assertIn('adapter_identity_exists_stop',sql)
        self.assertNotIn('ALTER ROLE',sql)
        self.assertIn('DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::platform',sql)
        self.assertEqual(sql.count('GRANT EXECUTE ON OBJECT::platform.'),2)
    def test_non_linux_no_password_prompt(self):
        with patch.object(m.sys,'platform','win32'),patch.object(m.getpass,'getpass') as prompt:
            with self.assertRaises(SystemExit):m.main()
            prompt.assert_not_called()
    def test_secret_is_not_argv_or_printed_on_sql_failure(self):
        with patch.object(m.subprocess,'run') as run:
            m.query('private-secret','SELECT 1',m.LOGIN)
        args=run.call_args.args[0]
        self.assertNotIn('private-secret',args);self.assertNotIn('-P',args)
        self.assertTrue(run.call_args.kwargs['capture_output'])
if __name__=='__main__':unittest.main()
