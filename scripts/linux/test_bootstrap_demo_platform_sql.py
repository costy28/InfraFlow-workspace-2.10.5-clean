import importlib.util
import pathlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('bootstrap', pathlib.Path(__file__).with_name('bootstrap-demo-platform-sql.py'))
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)


class BootstrapTests(unittest.TestCase):
    def test_password_and_literal(self):
        self.assertTrue(bootstrap.valid_password("Ab9!" * 8))
        for value in ('short', 'x' * 129, 'x' * 20 + '\n', 'x' * 20 + '\0'):
            self.assertFalse(bootstrap.valid_password(value))
        self.assertEqual(bootstrap.literal("a'b"), "N'a''b'")

    def test_password_not_in_arguments_or_parent_env(self):
        with patch.object(bootstrap.subprocess, 'run') as run:
            bootstrap.query('private-test-password', 'SELECT 1;')
        args, options = run.call_args
        self.assertNotIn('private-test-password', repr(args))
        self.assertEqual(options['env']['SQLCMDPASSWORD'], 'private-test-password')
        self.assertEqual(options['input'], 'SELECT 1;\nGO\n')
        self.assertIn('-x', args[0])

    def test_arbitrary_target_refused(self):
        with patch.object(bootstrap.subprocess, 'run') as run:
            with self.assertRaises(ValueError):
                bootstrap.query('test', 'SELECT 1;', database='INFRAFLOW_DEMO')
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
