import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('login', Path(__file__).with_name('create-demo-directory-executor-login.py'))
login = importlib.util.module_from_spec(spec)
spec.loader.exec_module(login)


class DirectoryLoginTests(unittest.TestCase):
    def test_fixed_atomic_profile(self):
        sql = login.creation_sql("Example_Only_91'password")
        self.assertIn("PASSWORD=N'Example_Only_91''password'", sql)
        self.assertIn('BEGIN TRANSACTION', sql)
        self.assertIn('IF XACT_STATE()<>0 ROLLBACK', sql)
        self.assertIn('queued', sql)
        self.assertNotIn('infraflow_demo_adapter_review', sql)
        grants = [s.strip() for s in sql.splitlines() if s.strip().startswith('GRANT EXECUTE')]
        self.assertEqual(len(grants), 2)
        self.assertIn('platform.verify_tenant_directory_context', grants[0])
        self.assertIn('platform.record_tenant_directory_result', grants[1])
        self.assertIn('DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::platform', sql)

    def test_verification_metadata_only(self):
        sql = login.verification_sql()
        self.assertIn("ORIGINAL_LOGIN()<>N'infraflow_demo_directory_executor'", sql)
        self.assertIn('sys.fn_my_permissions', sql)
        self.assertIn("HAS_DBACCESS(N'INFRAFLOW_DEMO')", sql)
        self.assertNotIn('EXEC platform.', sql)
        self.assertNotIn('GRANT ', sql)

    def test_password_policy_and_transport(self):
        base = login.template()
        for password, again in [('short', 'short'), ('valid_password_123', 'different'), ('a'*15+'\n', 'a'*15+'\n')]:
            with self.assertRaises(RuntimeError):
                base.validate_password(password, again, 'admin')
        with patch.object(login.subprocess, 'run') as run:
            login.query('example-secret', 'SELECT 1', login.LOGIN)
            args, kw = run.call_args
            self.assertNotIn('example-secret', args[0])
            self.assertNotIn('-P', args[0])
            self.assertEqual(kw['env']['SQLCMDPASSWORD'], 'example-secret')
            self.assertTrue(kw['capture_output'])
        with self.assertRaises(ValueError):
            login.query('unused', 'SELECT 1', 'arbitrary')


if __name__ == '__main__':
    unittest.main()
