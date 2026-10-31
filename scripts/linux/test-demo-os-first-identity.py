import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import Mock,patch

spec=importlib.util.spec_from_file_location('first',Path(__file__).with_name('apply-demo-os-first-identity.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Tests(unittest.TestCase):
    def test_broker_manifest_matches_source_and_original_package(self):
        import tarfile,hashlib
        root=Path(__file__).resolve().parents[2]
        manifest=json.loads((Path(__file__).with_name('os-pilot-broker-sha256.json')).read_text())
        with tarfile.open(root/'InfraFlow-demo-os-pilot-sql-brokers-v1.tar.gz','r:gz') as archive:
            for name,digest in manifest.items():
                self.assertEqual(hashlib.sha256((root/'server/demo-platform'/name).read_bytes()).hexdigest(),digest)
                self.assertEqual(hashlib.sha256(archive.extractfile('server/demo-platform/'+name).read()).hexdigest(),digest)
    def test_package_sources_compile_and_remain_fixed(self):
        for name in m.FILES:compile(Path(__file__).with_name(name).read_bytes(),name,'exec')
        self.assertEqual(m.REQUEST['expectedJobRevision'],5)
        self.assertEqual(m.IDENTITY,'ift_'+m.REQUEST['trialId'].replace('-','')[:28])
    def test_check_only_never_applies(self):
        with patch.object(m.sys,'platform','linux'),patch.object(m.os,'geteuid',return_value=0,create=True),patch.object(m.os,'getegid',return_value=0,create=True),patch.object(m.sys,'argv',['script','--check-only']),patch.object(m,'preflight',return_value={}),patch.object(m,'apply') as apply:
            m.main();apply.assert_not_called()
    def test_wrong_confirmation_never_applies(self):
        with patch.object(m.sys,'platform','linux'),patch.object(m.os,'geteuid',return_value=0,create=True),patch.object(m.os,'getegid',return_value=0,create=True),patch.object(m.sys,'argv',['script','--apply-confirmed']),patch.object(m,'preflight',return_value={}),patch.object(m.sys.stdin,'isatty',return_value=True),patch('builtins.input',return_value='yes'),patch.object(m,'apply') as apply:
            with self.assertRaises(SystemExit):m.main()
            apply.assert_not_called()
    def test_preflight_failure_never_applies(self):
        with patch.object(m.sys,'platform','linux'),patch.object(m.os,'geteuid',return_value=0,create=True),patch.object(m.os,'getegid',return_value=0,create=True),patch.object(m.sys,'argv',['script','--apply-confirmed']),patch.object(m,'preflight',side_effect=RuntimeError()),patch.object(m,'apply') as apply:
            with self.assertRaises(SystemExit):m.main()
            apply.assert_not_called()

if __name__=='__main__':unittest.main()
