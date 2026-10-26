import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest import mock

PATH = Path(__file__).with_name('install-demo-platform-operator-runtime.py')
spec = importlib.util.spec_from_file_location('operator_installer', PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class InstallerTests(unittest.TestCase):
    def test_dropin_uses_credentials_not_secret_environment(self):
        text = module.dropin_text()
        self.assertEqual(text.count('LoadCredential='), 3)
        self.assertIn('Environment=INFRAFLOW_DEMO_PLATFORM_OPERATOR=1', text)
        self.assertIn('/releases/operator-runtime-v1/service.js', text.replace('\\', '/'))
        self.assertNotIn('User=root', text)
        self.assertNotIn('SetCredential=', text)

    def test_secret_write_exclusive_and_private(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'secret'
            # Windows checks exclusive creation only; real O_NOFOLLOW/mode need Linux acceptance.
            with mock.patch.object(module.os, 'O_NOFOLLOW', getattr(module.os, 'O_NOFOLLOW', 0), create=True):
                module.secure_write(path, b'fixture-only')
                self.assertEqual(path.read_bytes(), b'fixture-only')
                with self.assertRaises(FileExistsError):
                    module.secure_write(path, b'overwrite')
            self.assertEqual(path.read_bytes(), b'fixture-only')

    def test_no_sa_sql_or_erp_commands(self):
        source = PATH.read_text(encoding='utf-8')
        self.assertNotIn('sqlcmd', source)
        self.assertNotIn("'restart', 'infraflow'", source)
        self.assertNotIn('/opt/infraflow/app', source)
        self.assertIn("'restart', NAME", source)
        self.assertIn('OPERATOR_SERVICE_CREDENTIALS_OK', source)

if __name__ == '__main__':
    unittest.main()
