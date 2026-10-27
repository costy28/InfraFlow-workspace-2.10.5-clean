import importlib.util
from pathlib import Path
import unittest
from unittest import mock

PATH = Path(__file__).with_name('install-demo-platform-operator-registry.py')
spec = importlib.util.spec_from_file_location('registry_installer', PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class RegistryInstallerTests(unittest.TestCase):
    def test_release_and_dropin_are_new_and_rollback_target_is_existing_http(self):
        self.assertEqual(module.PREVIOUS.name, 'operator-http-v1')
        self.assertEqual(module.RELEASE.name, 'operator-http-v2')
        self.assertEqual(module.DROPIN.name, '41-operator-registry.conf')
        self.assertIn('https://operator.infraflow.ro', module.dropin_text())
        self.assertNotIn('LoadCredential=', module.dropin_text())

    def test_all_sources_exist_and_registry_module_is_included(self):
        for name in module.FILES:
            self.assertTrue((PATH.parents[2] / 'server/demo-platform' / name).is_file(), name)
        self.assertIn('trial-list.js', module.FILES)

    def test_rollback_only_removes_new_dropin_and_restarts_platform(self):
        with mock.patch.object(module, 'DROPIN') as dropin, mock.patch.object(module, 'run') as run, mock.patch.object(module, 'health') as health:
            module.rollback()
            dropin.unlink.assert_called_once_with()
            self.assertEqual(run.call_args_list, [mock.call('systemctl', 'daemon-reload'), mock.call('systemctl', 'restart', 'infraflow-demo-platform')])
            self.assertEqual(health.call_count, 2)

    def test_installation_has_no_password_prompt_sql_or_tenant_activation(self):
        source = PATH.read_text(encoding='utf-8')
        for forbidden in ('getpass', 'input(', 'sqlcmd', '/opt/infraflow/app', 'queue_trial', 'activate_trial'):
            self.assertNotIn(forbidden, source)
        self.assertIn("fetch('/operator/trials', public=True)[0] != 401", source)

if __name__ == '__main__':
    unittest.main()
