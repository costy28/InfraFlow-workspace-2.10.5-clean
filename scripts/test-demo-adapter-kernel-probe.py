import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('probe',Path(__file__).parent/'linux/probe-demo-adapter-channel-kernel.py')
probe=importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)

class KernelProbeSafetyTests(unittest.TestCase):
    def test_non_linux_refused_without_side_effects(self):
        with patch.object(probe.sys,'platform','win32'),patch.object(probe.tempfile,'mkdtemp') as create:
            with self.assertRaises(SystemExit):probe.main()
            create.assert_not_called()

    def test_cleanup_outside_fixed_run_namespace_refused(self):
        for target in [Path('/etc/infraflow-demo-platform'),Path('/run'),Path('/run/unrelated')]:
            with self.assertRaises(RuntimeError):probe.cleanup(target,target/'review.sock')

    def test_only_canary_backend_no_sql_or_subprocess_or_service_mutation(self):
        source=(Path(__file__).parent/'linux/probe-demo-adapter-channel-kernel.py').read_text(encoding='utf-8')
        self.assertIn('consumer=lambda _:dict(RECEIPT)',source)
        for forbidden in ['subprocess.run(', 'systemctl ', 'sqlcmd', 'rmtree(', 'useradd', 'groupadd']:
            self.assertNotIn(forbidden,source)

if __name__=='__main__':unittest.main()
