"""Installer checks without service changes, copies or filesystem writes."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch, Mock

spec = importlib.util.spec_from_file_location('compat', Path(__file__).parent/'linux/install-demo-platform-prepare-compat.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CompatTests(unittest.TestCase):
    def test_minimal_patch_and_dropin_preserve_existing_credentials(self):
        self.assertEqual(module.PATCHED, ('operator-auth.js', 'operator-store.js', 'operator-sql-client.js'))
        text = module.dropin_text()
        self.assertEqual(text.count('ExecStart='), 2)
        self.assertIn('operator-prepare-compat-v1/service.js', text)
        self.assertNotIn('LoadCredential=', text)
        self.assertNotIn('Environment=', text)

    def test_checks_existing_ui_gates_and_readiness(self):
        def fetch(route, public=False):
            if route == '/operator':
                return 200, b'register-form', {'Cache-Control': 'no-store'}
            return (503 if route == '/health/ready' else 401), b'', {}
        with patch.object(module.base, 'health') as health, patch.object(module.base, 'fetch', side_effect=fetch):
            module.check_runtime()
            self.assertEqual(health.call_count, 3)
        with patch.object(module.base, 'health'), patch.object(module.base, 'fetch', return_value=(200, b'', {})):
            with self.assertRaises(RuntimeError):
                module.check_runtime()

    def test_rollback_removes_exact_new_dropin_and_restarts_only_platform(self):
        dropin = Mock()
        with patch.object(module, 'DROPIN', dropin), patch.object(module.base, 'run') as run, patch.object(module, 'check_runtime') as check:
            module.rollback()
            dropin.unlink.assert_called_once_with()
            self.assertEqual(run.call_args_list[1].args, ('/usr/bin/systemctl', 'restart', 'infraflow-demo-platform'))
            self.assertEqual(run.call_count, 2)
            check.assert_called_once_with()


if __name__ == '__main__':
    unittest.main()
