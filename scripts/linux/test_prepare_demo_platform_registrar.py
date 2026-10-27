import importlib.util
from pathlib import Path
import unittest

PATH = Path(__file__).with_name('prepare-demo-platform-registrar.py')
spec = importlib.util.spec_from_file_location('prepare_registrar', PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class PreparationTests(unittest.TestCase):
    def test_existing_password_exact_confirmation_and_format(self):
        module.validate_password('fixture-password-1234', 'fixture-password-1234')
        for password, again in [('short', 'short'), ('fixture-password-1234', 'different'), ('x'*129, 'x'*129), ('fixture-password-1234\n', 'fixture-password-1234\n')]:
            with self.assertRaises(ValueError):
                module.validate_password(password, again)

    def test_transient_command_uses_loadcredential_no_secret_value(self):
        args = module.probe_command()
        self.assertIn('--unit=infraflow-registrar-check', args)
        self.assertIn('--property=LoadCredential=registrar-password:'+str(module.SECRET), args)
        self.assertNotIn('--property=User=root', args)
        self.assertNotIn('restart', args)

    def test_all_probe_sources_exist_and_no_registration_handler_is_packaged(self):
        root = PATH.parents[2] / 'server/demo-platform'
        for name in module.FILES:
            self.assertTrue((root / name).is_file(), name)
        self.assertNotIn('service.js', module.FILES)
        self.assertNotIn('trial-registration.js', module.FILES)

    def test_source_never_modifies_logins_or_restarts_services(self):
        source = PATH.read_text(encoding='utf-8')
        self.assertIn('os.O_EXCL | os.O_NOFOLLOW', source)
        self.assertNotIn('sqlcmd', source)
        self.assertNotIn('systemctl', source)
        probe = (PATH.parents[2] / 'server/demo-platform/registrar-credential-probe.js').read_text()
        self.assertNotIn('.queue(', probe)

if __name__ == '__main__':
    unittest.main()
