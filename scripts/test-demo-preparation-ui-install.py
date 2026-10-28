"""Installer contracts, no Linux/service mutations."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('prep_ui', Path(__file__).parent/'linux/install-demo-platform-preparation-ui.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InstallTests(unittest.TestCase):
    def test_explicit_opt_in_single_existing_credential_and_fixed_private_release(self):
        text = module.dropin_text()
        self.assertIn('Environment=INFRAFLOW_DEMO_PLATFORM_PREPARER=1', text)
        self.assertIn('LoadCredential=preparer-password:/etc/infraflow-demo-platform/preparer.password', text)
        self.assertIn('operator-preparation-v1/service.js', text)
        self.assertNotIn('operator-auth.key', text)
        self.assertEqual(len(module.FILES), len(set(module.FILES)))

    def test_health_checks_do_not_submit_prepare(self):
        def fetch(route, public=False):
            if route == '/operator':
                return 200, b'register-form prepare-form', {'Cache-Control': 'no-store'}
            return {'/operator/session': 401, '/operator/trials': 401, '/operator/trials/prepare': 405, '/health/ready': 503}[route], b'', {}
        with patch.object(module.base, 'health') as health, patch.object(module.base, 'fetch', side_effect=fetch) as request:
            module.check_runtime(True)
            self.assertEqual(health.call_count, 4)
            self.assertTrue(all('method' not in call.kwargs for call in request.call_args_list))

    def test_rollback_only_exact_new_dropin_and_private_service(self):
        dropin = Mock()
        with patch.object(module, 'DROPIN', dropin), patch.object(module.base, 'run') as run, patch.object(module, 'check_runtime') as check:
            module.rollback()
            dropin.unlink.assert_called_once_with()
            self.assertEqual(run.call_args_list[1].args, ('/usr/bin/systemctl', 'restart', 'infraflow-demo-platform'))
            check.assert_called_once_with(False)


if __name__ == '__main__':
    unittest.main()
