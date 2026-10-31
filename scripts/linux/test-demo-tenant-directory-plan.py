import importlib.util
from pathlib import Path
import stat
from types import SimpleNamespace
import unittest

s=importlib.util.spec_from_file_location('dirs',Path(__file__).with_name('tenant-directory-plan.py'))
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
TRIAL='b1100b43-48d0-42fa-8a1d-73b1286f8242'

class Tests(unittest.TestCase):
    def setUp(self):self.plan=m.plan(TRIAL,992,983)
    def fs(self,extra=None):
        entries={p:(0,0,0o755) for p in ('/','/var','/var/lib','/etc')};entries.update(extra or {})
        def read(path):
            if str(path) not in entries:raise FileNotFoundError()
            u,g,mode=entries[str(path)]
            return SimpleNamespace(st_uid=u,st_gid=g,st_mode=stat.S_IFDIR|mode)
        return read
    def test_canonical_paths_and_least_privilege(self):
        rows=self.plan['directories'];self.assertEqual(len(rows),8)
        self.assertEqual(rows[2]['mode'],'0700');self.assertEqual(rows[3]['mode'],'0750');self.assertEqual(rows[3]['uid'],0)
        self.assertFalse(self.plan['executionAllowed'])
        self.assertTrue(all(r['status']=='absent' for r in m.inspect(self.plan,self.fs())['directories']))
    def test_only_exact_shared_parents_may_exist(self):
        parents={'/var/lib/infraflow-demo-tenants':(0,0,0o711),'/etc/infraflow-demo-tenants':(0,0,0o711)}
        self.assertEqual(m.inspect(self.plan,self.fs(parents))['directories'][0]['status'],'shared_parent_verified')
        for path,owner in [('/var/lib/infraflow-demo-tenants',(0,0,0o777)),('/etc/infraflow-demo-tenants/'+TRIAL,(0,983,0o750))]:
            with self.assertRaises(RuntimeError):m.inspect(self.plan,self.fs(parents|{path:owner}))
    def test_symlink_ancestor_refused_even_when_leaf_absent(self):
        read=self.fs()
        def symlink(path):
            if str(path)=='/var/lib/infraflow-demo-tenants':return SimpleNamespace(st_uid=0,st_gid=0,st_mode=stat.S_IFLNK|0o777)
            return read(path)
        with self.assertRaises(RuntimeError):m.inspect(self.plan,symlink)
    def test_arbitrary_identity_and_paths_refused(self):
        for trial,uid,gid in [('../etc',992,983),(TRIAL,True,983),(TRIAL,0,983)]:
            with self.assertRaises(ValueError):m.plan(trial,uid,gid)
        bad=self.plan|{'directories':[]}
        with self.assertRaises(RuntimeError):m.inspect(bad,self.fs())

if __name__=='__main__':unittest.main()
