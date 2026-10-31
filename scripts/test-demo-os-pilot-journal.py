import importlib.util
from pathlib import Path
import unittest
from unittest import mock
spec=importlib.util.spec_from_file_location('journal',Path(__file__).parent/'linux/os-pilot-journal.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
    def test_events_are_ordered_append_only_and_secret_free(self):
        previous=None
        for stage in m.STAGES:
            details={'generation':1,'jobRevision':1} if stage=='claimed' else {'uid':992,'gid':983} if stage=='host_observed' else {'jobRevision':2} if stage=='released' else {}
            value=m.event(previous,stage,details)
            self.assertEqual(value['sequence'],(previous['sequence'] if previous else 0)+1)
            self.assertEqual(value['previousHash'],previous['eventHash'] if previous else '0'*64)
            self.assertNotIn('Token',str(value));previous=value
        with self.assertRaises(ValueError):m.event(previous,'claim_requested',{})
        with self.assertRaises(ValueError):m.event(previous,'review_required',{'failedStage':'host_requested'})
    def test_jumps_and_unbounded_error_or_secret_details_refused(self):
        first=m.event(None,'created',{})
        for stage,details in [('host_requested',{}),('claim_requested',{'leaseToken':'secret'}),('review_required',{'failedStage':'secret'})]:
            with self.assertRaises(ValueError):m.event(first,stage,details)
        r=m.event(first,'review_required',{'failedStage':'claim_requested'})
        with self.assertRaises(ValueError):m.event(r,'claim_requested',{})
    def test_bootstrap_exact_types_and_distinct_tokens(self):
        b={'format':'infraflow-os-pilot-v1','jobId':'dddddddd-dddd-4ddd-8ddd-dddddddddddd','trialId':'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','intentId':'ffffffff-ffff-4fff-8fff-ffffffffffff','expectedJobRevision':0,'leaseToken':'1'*64,'delegationToken':'2'*64}
        self.assertEqual(m.validate_bootstrap(b),b)
        for change in [{'expectedJobRevision':False},{'jobId':'../root'},{'delegationToken':'1'*64},{'extra':1}]:
            with self.assertRaises(ValueError):m.validate_bootstrap(b|change)
    def test_write_is_exclusive_and_fsyncs_file_before_directory(self):
        calls=[]
        class Stream:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def write(self,raw):calls.append('write')
            def flush(self):calls.append('flush')
            def fileno(self):return 10
        def opened(*args):calls.append(('open',args[1]));return 10 if len([x for x in calls if type(x) is tuple and x[0]=='open'])==1 else 11
        with mock.patch.object(m,'safe_directory'),mock.patch.object(m.os,'O_NOFOLLOW',1<<20,create=True),mock.patch.object(m.os,'O_CLOEXEC',1<<21,create=True),mock.patch.object(m.os,'O_DIRECTORY',1<<22,create=True),mock.patch.object(m.os,'open',side_effect=opened),mock.patch.object(m.os,'fdopen',return_value=Stream()),mock.patch.object(m.os,'fchown',create=True),mock.patch.object(m.os,'fchmod',create=True),mock.patch.object(m.os,'fsync',side_effect=lambda fd:calls.append(('fsync',fd))),mock.patch.object(m.os,'close'):
            m.write_exclusive(Path('private'),'000001.json',{'stage':'created'})
        self.assertTrue(calls[0][1]&m.os.O_EXCL);self.assertLess(calls.index(('fsync',10)),calls.index(('fsync',11)))
    def test_path_traversal_refused_before_filesystem_access(self):
        with mock.patch.object(m,'safe_directory') as safe:
            for name in ('../bootstrap.json','000001.json/other','arbitrary'):
                with self.assertRaises(RuntimeError):m.read_private(Path('private'),name)
                with self.assertRaises(RuntimeError):m.write_exclusive(Path('private'),name,{})
            safe.assert_not_called()
if __name__=='__main__':unittest.main()
