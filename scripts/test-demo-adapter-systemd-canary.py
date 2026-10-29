import importlib.util
from pathlib import Path, PurePosixPath
import stat
from types import SimpleNamespace
import unittest
from unittest.mock import patch

def load(name,file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).parent/'linux'/file)
    value=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

probe=load('canary_probe','probe-demo-adapter-systemd-canary.py')
child=load('canary_check','adapter-systemd-canary-check.py')

class CanaryTests(unittest.TestCase):
    def test_non_linux_has_no_side_effects(self):
        with patch.object(probe.sys,'platform','win32'),patch.object(probe.tempfile,'mkdtemp') as create:
            with self.assertRaises(SystemExit):probe.main()
            create.assert_not_called()

    def test_metadata_only_exact_root_acl_or_private_service(self):
        def info(uid=0,gid=0,mode=0o440,nlink=1,size=32):
            return SimpleNamespace(st_mode=stat.S_IFREG|mode,st_uid=uid,st_gid=gid,st_nlink=nlink,st_size=size)
        self.assertTrue(child.valid_metadata(info()))
        self.assertTrue(child.valid_metadata(info(uid=993,gid=984,mode=0o400)))
        for value in [info(uid=994),info(gid=984),info(mode=0o640),info(mode=0o444),info(nlink=2),info(size=31),info(mode=0o4440)]:
            self.assertFalse(child.valid_metadata(value))

    def test_fixed_unit_private_canary_network_isolated_no_password_args(self):
        args=probe.command(PurePosixPath('/run/infraflow-adapter-credential-probe-test'))
        self.assertIn('--unit=infraflow-demo-adapter-credential-check.service',args)
        self.assertIn('--property=User=infraflow-demo-adapter-review',args)
        self.assertIn('--property=PrivateNetwork=yes',args)
        self.assertIn('--property=KillMode=control-group',args)
        self.assertIn('--property=LoadCredential=adapter-canary:/run/infraflow-adapter-credential-probe-test/private/canary',args)
        self.assertEqual(len(probe.CANARY),32)
        self.assertEqual(probe.CANARY,child.CANARY)
        self.assertFalse(any('password' in x for x in args))

    def test_cleanup_refuses_unrelated_directories(self):
        for path in [Path('/run'),Path('/etc/infraflow-demo-platform'),Path('/run/unrelated')]:
            with self.assertRaises(RuntimeError):probe.cleanup(path)

    def test_state_fail_closed(self):
        for text,expected in [('LoadState=not-found\nActiveState=inactive\n','absent'),
                             ('LoadState=loaded\nActiveState=active\n','uncertain'),
                             ('LoadState=loaded\nActiveState=inactive\n','stopped'),('', 'uncertain')]:
            with patch.object(probe.subprocess,'run',return_value=SimpleNamespace(stdout=text)):
                self.assertEqual(probe.state(),expected)

if __name__=='__main__':unittest.main()
