"""Portable tests: no systemd, SQL, secrets or host accounts are touched."""
import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import Mock, patch

spec=importlib.util.spec_from_file_location('ipc',Path(__file__).with_name('directory-cycle-sql-ipc.py'))
ipc=importlib.util.module_from_spec(spec)
spec.loader.exec_module(ipc)

class Tests(unittest.TestCase):
    def pipe(self,invocation):
        p=object.__new__(ipc.SqlPipe)
        p.role='cycle';p.closed=False;p.broken=True;p.invocation=invocation
        p.child=Mock()
        p.child.wait.side_effect=[subprocess.TimeoutExpired('owned',5),0]
        return p

    def test_fixed_commands_and_credentials(self):
        for role in ipc.PROFILES:
            c=ipc.command(role)
            self.assertIn('--property=NoNewPrivileges=yes',c)
            self.assertIn('--property=KillMode=control-group',c)
            self.assertIn('--property=RuntimeMaxSec=120s',c)
            self.assertIn('--property=LoadCredential=sql-password:'+ipc.PROFILES[role][2],c)
            self.assertTrue(c[-1].replace('\\','/').endswith('/directory-cycle-service.js'))
            self.assertNotIn('sa',c)
        self.assertNotIn('--property=DynamicUser=yes',ipc.command('cycle'))
        with self.assertRaisesRegex(RuntimeError,'role_refused'):ipc.SqlPipe('unknown')

    def test_never_stop_replacement_or_unconfirmed_unit(self):
        for invocation in (None,'a'*32):
            p=self.pipe(invocation)
            with patch.object(ipc.subprocess,'run',return_value=Mock(stdout='b'*32,returncode=0)) as run:
                with self.assertRaisesRegex(RuntimeError,'requires_review'):p.close()
                self.assertEqual(run.call_count,1)
                self.assertIn('show',run.call_args.args[0])
                p.child.kill.assert_called_once()
                self.assertTrue(p.closed)

    def test_stop_only_confirmed_own_invocation(self):
        p=self.pipe('a'*32)
        with patch.object(ipc.subprocess,'run',side_effect=[Mock(stdout='a'*32,returncode=0),Mock(returncode=0)]) as run:
            p.close()
            self.assertEqual(run.call_args_list[1].args[0],['/usr/bin/systemctl','stop',ipc.PROFILES['cycle'][0]])
            p.child.kill.assert_not_called()
        p.close()

    def test_clean_shutdown_does_not_stop_unit_by_name(self):
        p=self.pipe('a'*32);p.broken=False;p.call=Mock(return_value={'closed':True})
        p.child.wait.side_effect=None
        with patch.object(ipc.subprocess,'run') as run:
            p.close();p.call.assert_called_once_with('shutdown',{});run.assert_not_called()

    def test_oversized_packet_poisoned_before_write(self):
        p=self.pipe(None);p.sequence=0
        with self.assertRaisesRegex(RuntimeError,'unconfirmed'):p.call('init',{'data':'x'*4096})
        self.assertTrue(p.broken)

if __name__=='__main__':unittest.main()
