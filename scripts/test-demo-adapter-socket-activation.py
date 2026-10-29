import importlib.util
from pathlib import Path,PurePosixPath
import unittest
from unittest.mock import patch

def load(name,file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).parent/'linux'/file)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

probe=load('activation_probe','probe-demo-adapter-socket-activation.py')
child=load('activation_child','adapter-activation-canary-check.py')

class ActivationTests(unittest.TestCase):
    def test_non_linux_no_changes(self):
        with patch.object(probe.sys,'platform','win32'),patch.object(probe.tempfile,'mkdtemp') as mkdir:
            with self.assertRaises(SystemExit):probe.main()
            mkdir.assert_not_called()

    def test_transient_socket_command_no_wait_pipe_or_real_credential(self):
        args=probe.command(PurePosixPath('/run/infraflow-adapter-activation-probe-test'))
        for value in ['--socket-property=ListenStream='+probe.SOCKET,'--socket-property=SocketMode=0660',
                      '--socket-property=SocketGroup=infraflow-demo-worker','--socket-property=Backlog=1',
                      '--property=User=infraflow-demo-adapter-review','--property=PrivateNetwork=yes',
                      '--property=KillMode=control-group']:
            self.assertIn(value,args)
        self.assertNotIn('--wait',args);self.assertNotIn('--pipe',args)
        self.assertTrue(any(a.startswith('--property=LoadCredential=adapter-canary:') for a in args))
        self.assertFalse(any('password' in a for a in args))

    def test_paths_agree(self):
        self.assertEqual(child.SOCKET,probe.SOCKET)
        self.assertEqual(child.DIRECTORY,'/run/credentials/'+probe.BASE+'.service')
        self.assertEqual(probe.FILES[0],'adapter-activation-canary-check.py')

    def test_unit_state_fail_closed(self):
        self.assertFalse(probe.absent({}));self.assertFalse(probe.stopped({}))
        self.assertTrue(probe.absent({'LoadState':'not-found'}))
        self.assertFalse(probe.stopped({'LoadState':'loaded','ActiveState':'active'}))

    def test_cleanup_namespace_only(self):
        for path in [Path('/run'),Path('/etc/infraflow-demo-platform'),Path('/run/unrelated')]:
            with self.assertRaises(RuntimeError):probe.cleanup(path)

    def test_child_uses_canary_not_real_backend(self):
        code=(Path(__file__).parent/'linux/adapter-activation-canary-check.py').read_text(encoding='utf-8')
        self.assertIn('consumer=lambda _:dict(receipt)',code)
        self.assertIn("os.environ.get('LISTEN_PID')",code)
        self.assertNotIn('adapter-consume-stdin',code)
        self.assertNotIn('subprocess',code)

if __name__=='__main__':unittest.main()
