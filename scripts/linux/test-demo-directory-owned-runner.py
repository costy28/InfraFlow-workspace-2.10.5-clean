import importlib.util
import json
from pathlib import Path
import signal
import subprocess
import unittest
from unittest.mock import Mock
spec=importlib.util.spec_from_file_location('runner',Path(__file__).with_name('tenant-directory-owned-runner.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class Tests(unittest.TestCase):
    def child(self):
        c=Mock();c.pid=12345;c.returncode=0;c.communicate.return_value=(json.dumps({'uid':0,'gid':0,'mode':'0711','device':1,'inode':2}).encode(),None);return c
    def test_success_and_owned_launch(self):
        c=self.child();spawn=Mock(return_value=c);kill=Mock();out=r._capture_owned(['/trusted/python','/trusted/child'],b'{}',5,spawn,kill)
        self.assertEqual(out['inode'],2);self.assertTrue(spawn.call_args.kwargs['start_new_session']);self.assertEqual(c.communicate.call_args.kwargs['timeout'],5);kill.assert_not_called()
    def test_timeout_kills_only_created_group_and_reaps(self):
        c=self.child();c.communicate.side_effect=[subprocess.TimeoutExpired('owned',5),(b'',None)];kill=Mock()
        with self.assertRaisesRegex(RuntimeError,'no_retry'):r._capture_owned(['owned'],b'{}',5,Mock(return_value=c),kill)
        kill.assert_called_once_with(c.pid,getattr(signal,'SIGKILL',9));self.assertEqual(c.communicate.call_count,2)
    def test_bad_output_never_retries_or_kills_unrelated_group(self):
        for out in (b'{}',b'x'*2049,b'not-json'):
            c=self.child();c.communicate.return_value=(out,None);kill=Mock();spawn=Mock(return_value=c)
            with self.assertRaises(RuntimeError):r._capture_owned(['owned'],b'{}',5,spawn,kill)
            spawn.assert_called_once();kill.assert_not_called()
    def test_bad_timeout_or_payload_never_spawns(self):
        for timeout,raw in ((6,b'{}'),(True,b'{}'),(5,b'x'*4097)):
            spawn=Mock()
            with self.assertRaises(RuntimeError):r._capture_owned(['owned'],raw,timeout,spawn,Mock())
            spawn.assert_not_called()
if __name__=='__main__':unittest.main()
