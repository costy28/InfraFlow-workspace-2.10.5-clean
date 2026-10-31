import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('executor',Path(__file__).parent/'linux/tenant-os-executor.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Tests(unittest.TestCase):
    def setUp(self):self.plan=m.inventory_module().identity_plan(m.inventory_module().TRIAL)
    def test_fixed_commands_and_no_password_or_force_or_uid_override(self):
        group,user=m.commands(self.plan)
        self.assertEqual(group,('/usr/sbin/groupadd','--system',self.plan['user']))
        for flag in ('--no-create-home','--no-user-group','--no-log-init'):self.assertIn(flag,user)
        for flag in ('--force','--password','--uid','--groups','--non-unique'):self.assertNotIn(flag,user)
        with self.assertRaises(ValueError):m.commands({**self.plan,'user':'root'})
    def test_tools_check_runs_help_only(self):
        calls=[]
        def run(cmd,**kwargs):calls.append(cmd);return SimpleNamespace(returncode=0,stdout='--system --no-user-group --gid --home-dir --no-create-home --shell --no-log-init')
        m.check_tools(run,lambda _:None)
        self.assertEqual(calls,[['/usr/sbin/groupadd','--help'],['/usr/sbin/useradd','--help']])
    def ports(self,fail=None,permit=True):
        calls=[]
        def authorize(stage,plan):calls.append('authorize_'+stage);return {'identity':plan['user'],'stage':stage,'executionAllowed':permit}
        def inventory(plan):calls.append('inventory');return fail!='inventory'
        def run(cmd):stage='group' if cmd[0].endswith('groupadd') else 'user';calls.append(stage);return SimpleNamespace(returncode=1 if fail==stage else 0)
        def observe(plan):calls.append('observe');return {'uid':10001,'gid':10002,'policyVerified':fail!='observe'}
        def record(*args):calls.append('record');
        return [self.plan,authorize,inventory,run,observe,record],calls
    def test_false_receipts_cannot_create_anything(self):
        args,calls=self.ports(permit=False)
        with self.assertRaisesRegex(RuntimeError,'no_command'):m.execute_with_ports(*args)
        self.assertEqual(calls,['inventory','authorize_group'])
    def test_partial_failure_never_retries_or_deletes(self):
        for stage in ('inventory','group','user','observe'):
            args,calls=self.ports(fail=stage)
            with self.assertRaises(RuntimeError):m.execute_with_ports(*args)
            self.assertLessEqual(calls.count('group'),1);self.assertLessEqual(calls.count('user'),1);self.assertNotIn('record',calls)
    def test_both_effects_need_fresh_authorization(self):
        args,calls=self.ports()
        self.assertEqual(m.execute_with_ports(*args)['outcome'],'observed_created')
        self.assertEqual(calls,['inventory','authorize_group','group','authorize_user','user','observe','record'])
    def test_uncertain_report_never_causes_second_report_or_effect(self):
        args,calls=self.ports()
        def report(*values):calls.append('uncertain_report');raise RuntimeError('secret')
        args[-1]=report
        with self.assertRaisesRegex(RuntimeError,'review_required'):m.execute_with_ports(*args)
        self.assertEqual(calls.count('uncertain_report'),1);self.assertEqual(calls.count('group'),1)
    def test_cli_has_no_apply_mode(self):
        with patch.object(m.sys,'platform','linux'),patch.object(m.os,'geteuid',return_value=0,create=True),patch.object(m.sys,'argv',['executor','--apply']),patch.object(m,'execute_with_ports') as execute:
            with self.assertRaises(SystemExit):m.main()
            execute.assert_not_called()
if __name__=='__main__':unittest.main()
