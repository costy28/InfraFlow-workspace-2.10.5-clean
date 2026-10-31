import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('complete',Path(__file__).parent/'linux/probe-demo-channel-complete.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
    def test_explicit_consent_required(self):
        with patch.object(m.sys,'platform','win32'),patch.object(m,'support') as support:
            with self.assertRaises(SystemExit):m.main()
            support.assert_not_called()
    def test_worker_fixed_identity_and_credential_no_password_argv(self):
        c=m.worker_command()
        for text in ['--property=User=infraflow-demo-worker','--unit=infraflow-demo-channel-cycle.service','--property=RuntimeMaxSec=45s','--property=LoadCredential=lease-sql-password:'+str(m.SECRET),'--run-channel-review-confirmed']:self.assertIn(text,c)
        self.assertNotIn('sa',c)
    def test_exact_receipt_and_no_execution(self):
        r={'jobId':'00f612ed-a8ac-4688-a26f-679760eee0be','generation':2,'jobRevision':5,'status':'channel_checked_and_released','executionAllowed':False}
        def out(x):return json.dumps(x)+'\nCHANNEL_REVIEW_CYCLE_OK\n'
        m.validate_output(out(r))
        for delta in [{'executionAllowed':True},{'generation':3},{'jobRevision':6},{'extra':1}]:
            with self.assertRaises(RuntimeError):m.validate_output(out({**r,**delta}))
    def test_helper_does_not_mutate_on_import(self):
        self.assertEqual(m.support().BASE,'infraflow-demo-adapter-review')
if __name__=='__main__':unittest.main()
