import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

spec=importlib.util.spec_from_file_location('journal',Path(__file__).with_name('directory-preparation-journal.py'))
j=importlib.util.module_from_spec(spec);spec.loader.exec_module(j)

def value():return {'format':'infraflow-directory-prepare-v1','binding':{'jobId':'10000000-0000-0000-0000-000000000001','trialId':'20000000-0000-0000-0000-000000000002','intentId':'30000000-0000-0000-0000-000000000003','priorOsIntentId':'40000000-0000-0000-0000-000000000004','attemptId':'50000000-0000-0000-0000-000000000005','generation':4,'jobRevision':8,'uid':992,'gid':983},'leaseToken':'ab'*32,'attemptToken':'cd'*32}
def receipt(b):return {**b,'storageRoot':'/var/lib/infraflow-demo-tenants/'+b['trialId'],'configRoot':'/etc/infraflow-demo-tenants/'+b['trialId'],'state':'prepared','executionAllowed':False}

class Tests(unittest.TestCase):
    def test_order_before_rpc_and_safe_result(self):
        stages=[];journal=Mock();journal.append.side_effect=lambda s:stages.append(s)
        def prepare(b,t):
            self.assertEqual(stages,['prepare_requested']);return receipt(b)
        r=j.run_once(value(),{'journal':lambda v:journal,'prepare':prepare})
        self.assertEqual(stages,['prepare_requested','prepared']);self.assertFalse(r['resumeAllowed']);self.assertNotIn('leaseToken',r)
    def test_lost_response_only_one_request_no_compensation(self):
        journal=Mock();calls=[]
        def prepare(*args):calls.append(1);raise RuntimeError('secret')
        with self.assertRaisesRegex(RuntimeError,'directory_prepare_review_required'):j.run_once(value(),{'journal':lambda v:journal,'prepare':prepare})
        self.assertEqual(len(calls),1);self.assertEqual([x.args[0] for x in journal.append.call_args_list],['prepare_requested','review_required'])
    def test_failed_durable_request_prevents_rpc(self):
        journal=Mock();journal.append.side_effect=RuntimeError('fsync');prepare=Mock()
        with self.assertRaises(RuntimeError):j.run_once(value(),{'journal':lambda v:journal,'prepare':prepare})
        prepare.assert_not_called()
    def test_native_private_exclusive_journal(self):
        import os
        if os.name!='posix' or os.geteuid()!=0:self.skipTest('root Linux required')
        with tempfile.TemporaryDirectory(prefix='infraflow-prepare-journal-',dir='/run') as root:
            os.chmod(root,0o700);p=Path(root);v=value();journal=j.create_new(p,v)
            journal.append('prepare_requested');journal.append('prepared')
            self.assertEqual(journal.sequence,3)
            with self.assertRaises(FileExistsError):j.create_new(p,v)
            for f in journal.directory.iterdir():self.assertEqual(f.stat().st_mode&0o777,0o600)
            with self.assertRaises(RuntimeError):journal.append('prepare_requested')
    def test_invalid_bootstrap_no_journal(self):
        v=value();v['binding']['uid']=True;port=Mock()
        with self.assertRaises(RuntimeError):j.run_once(v,{'journal':port,'prepare':Mock()})
        port.assert_not_called()

if __name__=='__main__':unittest.main()
