"""Pure installer contract tests. No writes or systemd execution."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('lease_prepare', Path(__file__).parent/'linux/prepare-demo-platform-lease.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PrepareTests(unittest.TestCase):
    def test_password_existing_exact_ascii_no_newline(self):
        module.validate_password('fixture-password-1234', 'fixture-password-1234')
        for value in ['short', 'fixture-password-1234\n', 'é'*20, 'x'*129]:
            with self.assertRaises(ValueError):
                module.validate_password(value, value)
        with self.assertRaises(ValueError):
            module.validate_password('a'*20, 'b'*20)

    def test_transient_unit_credential_hardening_without_existing_service_restart(self):
        args = module.probe_command()
        self.assertEqual(args[0], '/usr/bin/systemd-run')
        for item in ['--wait', '--pipe', '--collect', '--unit=infraflow-demo-lease-check',
                     '--property=NoNewPrivileges=yes', '--property=ProtectSystem=strict',
                     '--property=ProtectHome=yes', '--property=CapabilityBoundingSet=']:
            self.assertIn(item, args)
        self.assertIn('--property=LoadCredential=lease-sql-password:/etc/infraflow-demo-platform/lease-sql.password', args)
        self.assertEqual(args[-1], '/opt/infraflow-demo-platform/releases/lease-check-v1/lease-systemd-probe.js')
        self.assertNotIn('systemctl', args)

    def test_payload_allowlist_no_installer_database_mutations(self):
        self.assertEqual(len(module.FILES), 6)
        source = Path(module.__file__).read_text(encoding='utf-8')
        self.assertNotIn('CREATE LOGIN', source)
        self.assertNotIn('ALTER LOGIN', source)
        self.assertNotIn('getenv(', source)
        self.assertIn('os.O_EXCL | os.O_NOFOLLOW', source)
        self.assertIn('os.fsync', source)


if __name__ == '__main__':
    unittest.main()
