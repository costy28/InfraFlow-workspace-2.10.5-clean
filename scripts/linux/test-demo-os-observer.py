import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

spec=importlib.util.spec_from_file_location('observer',Path(__file__).with_name('tenant-os-observer.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Tests(unittest.TestCase):
    def setUp(self):
        self.plan=m.inventory().identity_plan(m.inventory().TRIAL);n=self.plan['user']
        self.data={'passwd':f'{n}:x:992:983::/nonexistent:/usr/sbin/nologin\n',
                   'group':f'{n}:x:983:\n','shadow':f'{n}:!:20000:0:99999:7:::\n','id':'983\n'}
    def run_read(self,args,**kw):
        self.assertIn(args[0],('/usr/bin/getent','/usr/bin/id'))
        key='id' if args[0]=='/usr/bin/id' else args[1]
        return SimpleNamespace(returncode=0,stderr='',stdout=self.data[key])
    def test_exact_policy(self):
        self.assertEqual(m.observe(self.plan,self.run_read,lambda _:False),{'uid':992,'gid':983,'policyVerified':True})
    def test_policy_deviations_refused(self):
        original=dict(self.data)
        for key,value in [('passwd',original['passwd'].replace('/usr/sbin/nologin','/bin/bash')),
                          ('shadow',original['shadow'].replace(':!:',':$6$secret:')),
                          ('group',original['group'].replace('983:','982:')),
                          ('id','983 27\n'),('passwd',original['passwd']*2)]:
            self.data={**original,key:value}
            with self.assertRaisesRegex(RuntimeError,'review_required'):m.observe(self.plan,self.run_read,lambda _:False)
    def test_existing_home_refused(self):
        with self.assertRaisesRegex(RuntimeError,'review_required'):m.observe(self.plan,self.run_read,lambda _:True)
    def test_no_sensitive_error(self):
        def fail(*a,**k):raise ValueError('private-shadow-hash')
        with self.assertRaisesRegex(RuntimeError,'^os_observation_unconfirmed_review_required$'):m.observe(self.plan,fail)

if __name__=='__main__':unittest.main()
