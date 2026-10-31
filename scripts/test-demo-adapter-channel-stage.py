import importlib.util
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('stage',Path(__file__).parent/'linux/stage-demo-adapter-channel.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class StageTests(unittest.TestCase):
    def test_non_linux_refuses_before_files_or_units(self):
        with patch.object(m.sys,'platform','win32'),patch.object(m,'safe') as safe,patch.object(m.subprocess,'run') as run:
            with self.assertRaises(SystemExit):m.main()
            safe.assert_not_called();run.assert_not_called()

    def test_allowlist_complete_and_source_checked_without_execution(self):
        root=Path(__file__).resolve().parents[1]
        with patch.object(m.subprocess,'run') as run:
            data=m.files(root)
        self.assertEqual(set(data),set(m.JS)|{'adapter-review-socket.py'})
        self.assertEqual(run.call_count,len(m.JS))
        for call in run.call_args_list:
            self.assertEqual(call.args[0][:2],['/usr/local/bin/node','--check'])
            self.assertNotIn('shell',call.kwargs)
        self.assertNotIn('service.js',data)
        self.assertIn(b'channel_review_probe',data['adapter-ticket-client.js'])
        self.assertIn(b'channel_review_probe',data['adapter-review-socket.py'])

    def test_missing_source_refused(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(FileNotFoundError):m.files(Path(root))

    def test_no_install_or_sql_commands_in_stager(self):
        source=Path(m.__file__).read_text(encoding='utf8')
        for forbidden in ['sqlcmd','systemctl\',\'start','systemctl\',\'restart','getpass','shutil.rmtree','useradd']:
            self.assertNotIn(forbidden,source)
        self.assertIn('os.O_EXCL|os.O_NOFOLLOW',source)
        self.assertIn('LoadState=not-found',source)

if __name__=='__main__':unittest.main()
