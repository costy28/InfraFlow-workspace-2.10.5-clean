import importlib.util
from pathlib import Path
from unittest import TestCase,main,mock

spec=importlib.util.spec_from_file_location('context_checker',Path(__file__).parent/'linux/stage-demo-os-context-check.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class CheckerTests(TestCase):
    def test_command_only_temporary_metadata_probe(self):
        args=module.command()
        for flag in ['--property=DynamicUser=yes','--property=NoNewPrivileges=yes','--property=ProtectSystem=strict','--property=CapabilityBoundingSet=','--property=IPAddressDeny=any','--property=IPAddressAllow=localhost']:
            self.assertIn(flag,args)
        self.assertIn('--property=LoadCredential=os-executor-sql-password:'+str(module.SECRET),args)
        self.assertTrue(args[-1].endswith('os-executor-context-credential-probe.js'))
        self.assertNotIn('--stdin-check',args)

    def test_readonly_mode_does_not_stage_or_run_probe(self):
        with mock.patch.object(module.sys,'platform','linux'),mock.patch.object(module.os,'geteuid',return_value=0,create=True),mock.patch.object(module.sys,'argv',['script','--check-only']),mock.patch.object(module,'support'),mock.patch.object(module,'preflight') as preflight,mock.patch.object(module,'command') as command,mock.patch('builtins.print'):
            module.main();preflight.assert_called_once();command.assert_not_called()

    def test_invalid_mode_refused(self):
        with mock.patch.object(module.sys,'platform','linux'),mock.patch.object(module.os,'geteuid',return_value=0,create=True),mock.patch.object(module.sys,'argv',['script','--anything']):
            with self.assertRaises(SystemExit):module.main()

    def test_no_password_prompt_or_secret_rewrite(self):
        text=Path(module.__file__).read_text()
        self.assertNotIn('getpass',text)
        self.assertNotIn('secure_write(SECRET',text)
        self.assertNotIn('systemctl restart',text)

if __name__=='__main__':main()
