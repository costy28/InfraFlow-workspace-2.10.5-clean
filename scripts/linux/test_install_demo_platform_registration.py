import importlib.util
from pathlib import Path
import unittest
from unittest import mock

PATH = Path(__file__).with_name('install-demo-platform-registration.py')
spec = importlib.util.spec_from_file_location('registration_installer', PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class RegistrationInstallerTests(unittest.TestCase):
    def test_scoped_release_opt_in_and_loadcredential(self):
        self.assertEqual(module.PREVIOUS.name, 'operator-http-v2')
        self.assertEqual(module.RELEASE.name, 'operator-registration-v1')
        self.assertEqual(module.DROPIN.name, '42-operator-registration.conf')
        text = module.dropin_text()
        self.assertIn('INFRAFLOW_DEMO_PLATFORM_REGISTRAR=1', text)
        self.assertIn('LoadCredential=registrar-password:/etc/infraflow-demo-platform/registrar.password', text)
        self.assertNotIn('SQLCMDPASSWORD', text)

    def test_all_sources_exist_and_include_command_modules(self):
        for name in module.FILES:
            self.assertTrue((PATH.parents[2] / 'server/demo-platform' / name).is_file(), name)
        for name in ('trial-registration.js', 'trial-registrar.js', 'registrar-runtime.js'):
            self.assertIn(name, module.FILES)

    def test_rollback_only_new_dropin_and_private_service(self):
        with mock.patch.object(module, 'DROPIN') as dropin, mock.patch.object(module, 'run') as run, mock.patch.object(module, 'health') as health:
            module.rollback()
            dropin.unlink.assert_called_once_with()
            self.assertEqual(run.call_args_list, [mock.call('systemctl', 'daemon-reload'), mock.call('systemctl', 'restart', 'infraflow-demo-platform')])
            self.assertEqual(health.call_count, 2)

    def test_no_registration_post_password_prompt_or_sql_script(self):
        source = PATH.read_text(encoding='utf-8')
        for forbidden in ('getpass', 'input(', 'sqlcmd', '/opt/infraflow/app', "method='POST'", 'queue_trial_by_operator'):
            self.assertNotIn(forbidden, source)
        self.assertIn("fetch('/operator/trials/register', public=True)[0] != 405", source)
        self.assertIn('--registration-ui-confirmed', source)

if __name__ == '__main__':
    unittest.main()
