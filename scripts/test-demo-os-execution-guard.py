import importlib.util
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
import unittest
spec=importlib.util.spec_from_file_location('guard',Path(__file__).parent/'linux/tenant-os-execution-guard.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Tests(unittest.TestCase):
    def setUp(self):
        self.plan=m.executor().inventory_module().identity_plan(m.executor().inventory_module().TRIAL)
        self.approval={'jobId':'00f612ed-a8ac-4688-a26f-679760eee0be','trialId':self.plan['trialId'],'intentId':'11111111-1111-4111-8111-111111111111','generation':3,'jobRevision':6,'resourceKey':self.plan['user'],'localRootApproved':True}
        self.calls=[]
    def run_case(self,change=None,times=None,fail_stage=None):
        @contextmanager
        def lock(identity):
            self.calls.append('lock')
            try:yield
            finally:self.calls.append('unlock')
        def context():
            self.calls.append('context')
            return {**{k:v for k,v in self.approval.items() if k!='localRootApproved'},'validForMs':30000,'contextReady':True,'executionAllowed':False,**(change or {})}
        def inventory(plan):self.calls.append('inventory');return True
        def run(command,timeout):
            stage='group' if command[0].endswith('groupadd') else 'user'
            self.calls.append(stage);self.assertEqual(timeout,5)
            if fail_stage==stage:raise TimeoutError()
            return SimpleNamespace(returncode=0)
        def observe(plan):return {'uid':10001,'gid':10002,'policyVerified':True}
        def record(*args):self.calls.append('record')
        it=iter(times or [0]*10)
        return m.guarded_execute(self.plan,self.approval,context,lock,inventory,run,observe,record,clock=lambda:next(it))
    def test_context_before_each_command_under_one_lock(self):
        self.run_case();self.assertEqual(self.calls,['lock','inventory','context','group','context','user','record','unlock'])
    def test_wrong_receipt_never_runs_and_unlocks(self):
        for change in [{'executionAllowed':True},{'contextReady':False},{'generation':4},{'resourceKey':'root'},{'extra':1},{'validForMs':True}]:
            self.calls=[]
            with self.assertRaises(RuntimeError):self.run_case(change)
            self.assertNotIn('group',self.calls);self.assertEqual(self.calls[-1],'unlock')
    def test_clock_and_transit_budget_refused(self):
        for times in [[10,9],[0,20],[0,0,29],[float('nan'),1]]:
            self.calls=[]
            with self.assertRaises(RuntimeError):self.run_case(times=times)
            self.assertNotIn('group',self.calls)
    def test_failure_never_retries_and_releases_lock(self):
        with self.assertRaisesRegex(RuntimeError,'review_required'):self.run_case(fail_stage='user')
        self.assertEqual(self.calls.count('group'),1);self.assertEqual(self.calls.count('user'),1);self.assertEqual(self.calls[-1],'unlock');self.assertNotIn('record',self.calls)
    def test_local_approval_required_separately(self):
        self.approval['localRootApproved']=False
        with self.assertRaisesRegex(RuntimeError,'approval_required'):self.run_case()
        self.assertEqual(self.calls,[])

if __name__=='__main__':unittest.main()
