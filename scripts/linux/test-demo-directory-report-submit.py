import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

def load(name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

m=load('tenant-directory-report-submit');fixture=load('test-demo-directory-execution-report')
class Tests(unittest.TestCase):
    def run_case(self,fail=None):
        v,e=fixture.fixture();b=fixture.B;projection=load('tenant-directory-execution-journal').project(v,e,b);events=[]
        def requested(value):
            events.append('durable')
            self.assertNotIn('attemptToken',str(value))
            if fail=='disk':raise OSError()
        def send(action,value):
            events.append('send');self.assertEqual(action,'report')
            if fail=='lost':raise TimeoutError()
            receipt={**{k:b[k] for k in ('jobId','trialId','intentId','priorOsIntentId','attemptId','generation','jobRevision')},'outcome':'observed_created','confirmedCount':8,'journalDigest':projection['journalDigest'],'executionAllowed':False,'reconciliationRequired':True}
            if fail=='wrong':receipt['generation']+=1
            return receipt
        def confirmed(value):events.append('confirmed')
        original=m.load
        module=original('tenant-directory-execution-journal')
        with patch.object(module,'read_report',return_value=projection),patch.object(m,'load',side_effect=lambda n:module if n=='tenant-directory-execution-journal' else original(n)):
            if fail:
                with self.assertRaises((RuntimeError,OSError)):m.submit(Path('unused'),b,'a'*64,requested,confirmed,send)
            else:m.submit(Path('unused'),b,'a'*64,requested,confirmed,send)
        return events
    def test_success_order(self):self.assertEqual(self.run_case(),['durable','send','confirmed'])
    def test_disk_failure_no_send(self):self.assertEqual(self.run_case('disk'),['durable'])
    def test_response_loss_no_retry(self):self.assertEqual(self.run_case('lost'),['durable','send'])
    def test_wrong_receipt_not_confirmed(self):self.assertEqual(self.run_case('wrong'),['durable','send'])
if __name__=='__main__':unittest.main()
