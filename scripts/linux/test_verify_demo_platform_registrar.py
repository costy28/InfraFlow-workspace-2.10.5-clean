import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest import mock

PATH = Path(__file__).with_name('verify-demo-platform-registrar.py')
spec = importlib.util.spec_from_file_location('registrar_verifier', PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class RegistrarVerifierTests(unittest.TestCase):
    def test_fixed_login_secret_only_in_child_environment(self):
        password = 'Fixture-only-password-123!'
        with mock.patch.object(module.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, 'REGISTRAR_LOGIN_SCOPE_VERIFIED\n', '')) as run:
            module.verify(password)
            args = run.call_args.args[0]
            self.assertEqual(args[args.index('-U')+1], 'infraflow_demo_registrar')
            self.assertNotIn(password, repr(args))
            self.assertNotIn(password, run.call_args.kwargs['input'])
            self.assertEqual(run.call_args.kwargs['env']['SQLCMDPASSWORD'], password)
            self.assertIn('-b', args)

    def test_bad_format_never_starts_sqlcmd(self):
        with mock.patch.object(module.subprocess, 'run') as run:
            for password in ('short', 'a'*129, 'fixture-password-1234\n'):
                with self.assertRaises(ValueError):
                    module.verify(password)
            run.assert_not_called()

    def test_failed_or_ambiguous_output_is_not_confirmed(self):
        for returncode, output in ((1, 'REGISTRAR_LOGIN_SCOPE_VERIFIED'), (0, ''), (0, 'REGISTRAR_LOGIN_SCOPE_VERIFIED extra')):
            with mock.patch.object(module.subprocess, 'run', return_value=subprocess.CompletedProcess([], returncode, output, 'sensitive-error')):
                with self.assertRaisesRegex(RuntimeError, '^registrar_verification_failed$'):
                    module.verify('Fixture-only-password-123!')

    def test_verification_contains_no_procedure_execution_or_mutation(self):
        import re
        self.assertFalse(re.search(r'\b(EXEC|EXECUTE|GRANT|DENY|REVOKE|CREATE|ALTER|DROP|BACKUP|RESTORE)\s', module.SQL, re.I))
        self.assertIn('ORIGINAL_LOGIN()', module.SQL)
        self.assertIn('platform.queue_trial_by_operator', module.SQL)
        self.assertIn('platform.operator_command_audit', module.SQL)

if __name__ == '__main__':
    unittest.main()
