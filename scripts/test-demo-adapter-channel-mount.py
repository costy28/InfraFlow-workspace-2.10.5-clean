import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from contextlib import ExitStack,redirect_stdout
import io

spec=importlib.util.spec_from_file_location('mount',Path(__file__).parent/'linux/probe-demo-adapter-channel-mount.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class MountTests(unittest.TestCase):
    def test_non_linux_refuses_before_resources(self):
        with patch.object(m.sys,'platform','win32'),patch.object(m,'check_release') as check,patch.object(m.subprocess,'run') as run:
            with self.assertRaises(SystemExit):m.main()
            check.assert_not_called();run.assert_not_called()

    def test_fixed_transient_units_and_no_worker_or_sql_command(self):
        args=m.command()
        self.assertIn('--unit=infraflow-demo-adapter-review',args)
        self.assertIn('--property=User=infraflow-demo-adapter-review',args)
        self.assertIn('--property=LoadCredential=adapter-sql-password:'+str(m.SECRET),args)
        self.assertIn('--socket-property=RemoveOnStop=yes',args)
        self.assertIn('--property=RuntimeMaxSec=30s',args)
        self.assertNotIn('--wait',args)
        self.assertNotIn('--property=PrivateNetwork=yes',args)
        self.assertEqual(args[-1],'--serve-review-only')
        self.assertFalse(any('channel-review-probe.js' in x or 'sqlcmd' in x or 'lease-sql.password' in x for x in args))

    def test_root_probe_sends_no_request_and_requires_exact_denial(self):
        class Client:
            sent=False
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def settimeout(self,t):pass
            def connect(self,p):self.path=p
            def shutdown(self,how):pass
            def recv(self,n):
                if self.sent:return b''
                self.sent=True;return b'{"ok":false,"code":"review_unconfirmed"}'
        with patch.object(m.socket,'AF_UNIX',1,create=True),patch.object(m.socket,'socket',return_value=Client()):m.root_request()

    def test_no_secret_read_or_worker_cycle_hidden_in_probe(self):
        source=Path(m.__file__).read_text(encoding='utf8')
        self.assertNotIn('SECRET.read',source)
        self.assertNotIn('--run-channel-review-confirmed',source)
        self.assertNotIn('unlink(',source)
        self.assertIn("if not success:sys.exit(1)",source)

    def test_success_and_root_probe_failure_stop_only_created_pair(self):
        def user(name):
            uid,gid=(993,984) if name=='infraflow-demo-adapter-review' else (994,985)
            return SimpleNamespace(pw_uid=uid,pw_gid=gid,pw_dir='/nonexistent',pw_shell='/usr/sbin/nologin')
        for fail in (False,True):
            states=[{'LoadState':'not-found'}]*3+[{'ActiveState':'active'},{'ActiveState':'inactive'}]
            if not fail:states+=[{'ActiveState':'active'}]
            states+=[{'LoadState':'not-found'}]*2
            with ExitStack() as stack:
                stack.enter_context(patch.object(m.sys,'platform','linux'))
                stack.enter_context(patch.object(m.os,'geteuid',return_value=0,create=True))
                stack.enter_context(patch.object(m.sys,'argv',['probe','--mount-probe-confirmed']))
                stack.enter_context(patch.dict('sys.modules',{'pwd':SimpleNamespace(getpwnam=user)}))
                stack.enter_context(patch.object(m,'check_release'))
                stack.enter_context(patch.object(m.os.path,'lexists',return_value=False))
                stack.enter_context(patch.object(m,'state',side_effect=states))
                stack.enter_context(patch.object(m,'root_request',side_effect=RuntimeError() if fail else None))
                run=stack.enter_context(patch.object(m.subprocess,'run'))
                output=stack.enter_context(redirect_stdout(io.StringIO()))
                if fail:
                    with self.assertRaises(SystemExit):m.main()
                else:m.main()
                self.assertEqual(run.call_args_list[-1].args[0],['/usr/bin/systemctl','stop',m.BASE+'.socket',m.BASE+'.service'])
                self.assertIn('REAL_ADAPTER_MOUNT_CLEANUP_OK',output.getvalue())
                self.assertEqual('NO_SQL_RPC_NO_JOB_NO_TICKET_NO_EXISTING_SERVICE_RESTART' in output.getvalue(),not fail)

if __name__=='__main__':unittest.main()
