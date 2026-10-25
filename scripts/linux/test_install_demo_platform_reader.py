import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('installer', Path(__file__).with_name('install-demo-platform-reader.py'))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallerTests(unittest.TestCase):
    def test_existing_file_or_link_refused(self):
        path = unittest.mock.Mock()
        path.exists.return_value = True
        with self.assertRaises(RuntimeError):
            installer.absent(path)
        path.exists.return_value = False
        path.is_symlink.return_value = True
        with self.assertRaises(RuntimeError):
            installer.absent(path)

    def test_symlink_parent_refused(self):
        path = unittest.mock.Mock()
        path.parents = []
        path.is_symlink.return_value = True
        with self.assertRaises(RuntimeError):
            installer.safe_parent(path)

    def test_non_linux_refused_before_mutations(self):
        with patch.object(installer.sys, 'platform', 'win32'), patch.object(installer, 'run') as run:
            with self.assertRaises(SystemExit):
                installer.main()
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
