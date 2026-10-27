"""Pure tests: no SQL connection, prompts, login creation or filesystem writes."""
import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('lease_login', Path(__file__).parent/'linux/create-demo-platform-lease-login.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class LeaseLoginTests(unittest.TestCase):
    def test_creation_guard_transaction_and_password_escaping(self):
        sql = module.creation_sql("fixture'password-1234")
        self.assertIn("PASSWORD=N'fixture''password-1234'", sql)
        self.assertIn('BEGIN TRANSACTION', sql)
        self.assertIn('IF XACT_STATE()<>0 ROLLBACK', sql)
        self.assertIn('lease_identity_exists_stop', sql)
        self.assertIn('007_provision_leases_v1', sql)
        self.assertNotIn('ALTER LOGIN', sql)
        self.assertNotIn('DROP LOGIN', sql)
        self.assertNotIn('execution_ready=1', sql)

    def test_preflight_and_verification_are_read_only(self):
        for sql in [module.preflight_sql(), module.verification_sql()]:
            self.assertNotIn('CREATE LOGIN', sql)
            self.assertNotIn('GRANT ', sql)
            self.assertNotIn('EXEC platform.', sql)
        self.assertIn('ORIGINAL_LOGIN()', module.verification_sql())
        self.assertIn('HAS_DBACCESS', module.verification_sql())

    def test_transport_keeps_password_out_of_argv_and_captures_outputs(self):
        with patch.object(module.subprocess, 'run') as run:
            module.query('private-fixture', 'SELECT 1;')
            args, kwargs = run.call_args
            self.assertNotIn('private-fixture', args[0])
            self.assertEqual(kwargs['env']['SQLCMDPASSWORD'], 'private-fixture')
            self.assertEqual(kwargs['stdout'], subprocess.PIPE)
            self.assertEqual(kwargs['stderr'], subprocess.PIPE)
            self.assertEqual(kwargs['timeout'], 40)

    def test_marker_failure_is_generic_and_no_retry(self):
        with patch.object(module, 'query', return_value=subprocess.CompletedProcess([], 1, 'private', 'private')) as query:
            with self.assertRaisesRegex(RuntimeError, '^sql_step_not_confirmed$'):
                module.require('fixture', 'SELECT 1;', 'EXPECTED')
            self.assertEqual(query.call_count, 1)
        with self.assertRaises(ValueError):
            module.query('fixture', 'SELECT 1;', 'arbitrary')


if __name__ == '__main__':
    unittest.main()
