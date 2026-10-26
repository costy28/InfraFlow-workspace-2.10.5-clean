import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('identities', Path(__file__).with_name('create-demo-platform-command-logins.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class Tests(unittest.TestCase):
    def test_scope_and_secret_transport(self):
        with patch.object(m.subprocess, 'run') as run:
            m.query('secret-value', 'SELECT 1;')
        args, opts = run.call_args
        self.assertNotIn('secret-value', repr(args))
        self.assertEqual(opts['env']['SQLCMDPASSWORD'], 'secret-value')
        self.assertIn('-x', args[0])
        with self.assertRaises(ValueError):
            m.query('x', 'SELECT 1;', 'infraflow')

    def test_grants_are_procedure_only_and_transactional(self):
        sql = m.creation_sql(("test'1", 'test2'))
        self.assertIn("N'test''1'", sql)
        self.assertEqual(sql.count('GRANT EXECUTE ON OBJECT::'), 2)
        self.assertEqual(sql.count('DENY EXECUTE ON OBJECT::'), 2)
        self.assertEqual(sql.count('DENY SELECT,INSERT,UPDATE,DELETE'), 2)
        self.assertIn('ROLLBACK', sql)
        self.assertNotIn('db_owner', sql)

    def test_negative_probe_cannot_create_trials(self):
        for i in (0, 1):
            sql = m.verification_sql(i)
            self.assertIn('NULL,NULL', sql)
            self.assertIn('ERROR_NUMBER()<>229', sql)
            self.assertNotIn('INSERT platform.trials', sql)

    def test_password_validation(self):
        with patch.object(m.getpass, 'getpass', side_effect=['x' * 20, 'y' * 20]):
            with self.assertRaisesRegex(RuntimeError, 'password_mismatch'):
                m.read_new_password('test', ())


if __name__ == '__main__':
    unittest.main()
