import importlib.util
from pathlib import Path
import unittest
from unittest import mock

PATH = Path(__file__).with_name('install-demo-platform-operator-http.py')
spec = importlib.util.spec_from_file_location('http_installer', PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class HttpInstallerTests(unittest.TestCase):
    def test_config_scoped_to_approved_origin_and_new_release(self):
        text = module.dropin_text()
        self.assertIn('https://operator.infraflow.ro', text)
        self.assertIn('INFRAFLOW_DEMO_PLATFORM_HTTP=1', text)
        self.assertIn('INFRAFLOW_DEMO_PLATFORM_PROXY=loopback-https', text)
        self.assertIn('operator-http-v1', text)
        self.assertNotIn('LoadCredential=', text)  # Inherit verified credentials, never overwrite them.

    def test_package_files_include_ui_and_runtime(self):
        root = PATH.parents[2] / 'server/demo-platform'
        for name in module.FILES:
            self.assertTrue((root / name).is_file(), name)
        self.assertIn('operator-ui/app.js', module.FILES)
        self.assertIn('operator-auth.js', module.FILES)

    def test_rollback_removes_only_own_dropin_and_restarts_only_private_service(self):
        with mock.patch.object(module, 'DROPIN') as dropin, mock.patch.object(module, 'run') as run, mock.patch.object(module, 'health') as health:
            module.rollback()
            dropin.unlink.assert_called_once_with()
            self.assertEqual(run.call_args_list, [mock.call('systemctl', 'daemon-reload'), mock.call('systemctl', 'restart', 'infraflow-demo-platform')])
            self.assertEqual(health.call_count, 2)

    def test_no_credential_prompt_no_sql_commands(self):
        source = PATH.read_text(encoding='utf-8')
        for forbidden in ('getpass', 'sqlcmd', 'input(', '/opt/infraflow/app', "'restart', 'infraflow'"):
            self.assertNotIn(forbidden, source)
        self.assertIn('--access-protection-confirmed', source)

if __name__ == '__main__':
    unittest.main()
