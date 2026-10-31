import importlib.util
from pathlib import Path
import signal
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('runner',Path(__file__).parent/'linux/tenant-os-command-runner.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Tests(unittest.TestCase):
    def test_child_has_private_session_fixed_environment_no_output_or_stdin(self):
        seen={}
        def popen(command,**kwargs):seen.update(kwargs);return SimpleNamespace(wait=lambda timeout:0,pid=123)
        self.assertEqual(m._run_owned(('test',),5,popen,lambda *_:None).returncode,0)
        self.assertTrue(seen['start_new_session']);self.assertTrue(seen['close_fds'])
        self.assertEqual(seen['env'],{'PATH':'/usr/sbin:/usr/bin:/bin','LC_ALL':'C'})
        for key in ('stdin','stdout','stderr'):self.assertEqual(seen[key],subprocess.DEVNULL)
    def test_timeout_kills_only_owned_group_then_waits_no_retry(self):
        calls=[]
        def wait(timeout):
            calls.append(('wait',timeout))
            if timeout==5:raise subprocess.TimeoutExpired('private',5)
            return -9
        def popen(*args,**kwargs):calls.append(('popen',));return SimpleNamespace(wait=wait,pid=123)
        with self.assertRaisesRegex(RuntimeError,'timeout_review_required'):
            m._run_owned(('test',),5,popen,lambda pid,sig:calls.append(('kill',pid,sig)))
        self.assertEqual(calls,[('popen',),('wait',5),('kill',123,getattr(signal,'SIGKILL',9)),('wait',3)])
    def test_unknown_command_or_timeout_never_launches(self):
        module=m.executor();plan=module.inventory_module().identity_plan(module.inventory_module().TRIAL)
        run=m.create_command_runner(plan)
        with patch.object(m.sys,'platform','linux'),patch.object(m.os,'geteuid',return_value=0,create=True),patch.object(m,'_run_owned') as effect:
            for command,timeout in [(('/usr/sbin/userdel','root'),5),(module.commands(plan)[0],4),(list(module.commands(plan)[0]),5)]:
                with self.assertRaisesRegex(RuntimeError,'command_refused'):run(command,timeout)
            effect.assert_not_called()
    def test_failed_kill_or_wait_is_uncertain_and_never_retries(self):
        calls=[]
        def wait(timeout):calls.append(timeout);raise subprocess.TimeoutExpired('private',timeout)
        def kill(*args):raise PermissionError('private secret')
        with self.assertRaisesRegex(RuntimeError,'unconfirmed_review_required'):
            m._run_owned(('test',),5,lambda *a,**k:SimpleNamespace(wait=wait,pid=123),kill)
        self.assertEqual(calls,[5])

if __name__=='__main__':unittest.main()
