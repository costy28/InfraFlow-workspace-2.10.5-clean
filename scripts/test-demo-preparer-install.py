"""Pure preparer installer tests; no SQL, systemd, prompts or writes."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).parent/'linux'/name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


login = load('create-demo-platform-preparer-login.py')
prepare = load('prepare-demo-platform-preparer.py')


class InstallTests(unittest.TestCase):
    def test_generated_sql_atomic_fixed_identity_escaped_and_no_alter(self):
        sql = login.creation_sql("fixture'password-1234")
        self.assertIn("PASSWORD=N'fixture''password-1234'", sql)
        self.assertIn('CREATE LOGIN [infraflow_demo_preparer]', sql)
        self.assertIn('IF XACT_STATE()<>0 ROLLBACK', sql)
        self.assertNotIn('ALTER LOGIN', sql)
        self.assertNotIn('DROP LOGIN', sql)
        self.assertNotIn('EXEC platform.request_provision_job', login.verification_sql())
        self.assertIn('preparer_identity_exists_stop', login.preflight_sql())

    def test_password_not_in_argv_and_sql_errors_captured(self):
        with patch.object(login.subprocess, 'run') as run:
            run.return_value.returncode = 1
            run.return_value.stdout = 'private'
            with self.assertRaisesRegex(RuntimeError, '^sql_step_not_confirmed$'):
                login.require('private-password', 'SELECT 1;', 'MARKER')
            args, kwargs = run.call_args
            self.assertNotIn('private-password', args[0])
            self.assertEqual(kwargs['env']['SQLCMDPASSWORD'], 'private-password')
            self.assertEqual(run.call_count, 1)

    def test_credential_probe_unit_fixed_and_no_restart(self):
        args = prepare.probe_command()
        self.assertIn('--unit=infraflow-preparer-check', args)
        self.assertIn('--property=LoadCredential=preparer-password:/etc/infraflow-demo-platform/preparer.password', args)
        self.assertIn('--property=ProtectSystem=strict', args)
        self.assertNotIn('systemctl', args)
        self.assertEqual(len(prepare.FILES), 5)

    def test_password_format(self):
        prepare.validate_password('fixture-password-1234', 'fixture-password-1234')
        for p in ['short', 'é'*20, 'a'*129, 'fixture-password-1234\n']:
            with self.assertRaises(ValueError):
                prepare.validate_password(p, p)


if __name__ == '__main__':
    unittest.main()
