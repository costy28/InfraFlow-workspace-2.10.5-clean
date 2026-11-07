import copy
import hashlib
import importlib.util
from pathlib import Path
import unittest
def load(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
m=load('tenant-directory-execution-journal');h=load('os-pilot-journal');planner=load('tenant-directory-plan')
B={'jobId':'10000000-0000-0000-0000-000000000001','trialId':'20000000-0000-0000-0000-000000000002','intentId':'30000000-0000-0000-0000-000000000003','priorOsIntentId':'40000000-0000-0000-0000-000000000004','attemptId':'50000000-0000-0000-0000-000000000005','generation':5,'jobRevision':10,'uid':992,'gid':983}
def fixture():
    p=planner.plan(B['trialId'],992,983);e={'jobId':B['jobId'],'osIntentId':B['priorOsIntentId'],'generation':3,'jobRevision':6,'uid':992,'gid':983};v=m.manifest(p,e,B);events=[]
    def append(stage,details):
        previous=events[-1]['eventHash'] if events else hashlib.sha256(h.canonical(v)).hexdigest()
        r={'sequence':len(events)+1,'stage':stage,'details':details,'previousHash':previous};r['eventHash']=hashlib.sha256(h.canonical(r)).hexdigest();events.append(r)
    for i,row in enumerate(p['directories']):
        append('mkdir_requested',{'index':i});append('mkdir_observed',{'index':i,**{k:row[k] for k in ('uid','gid','mode')},'device':1,'inode':18446744073709551615-i})
    append('completed',{});return v,events
class Tests(unittest.TestCase):
    def test_valid_chain_does_not_hide_invalid_observations(self):
        for change in ('duplicate','overflow','zero','boolean'):
            v,e=fixture()
            if change=='duplicate':e[3]['details']['inode']=e[1]['details']['inode']
            if change=='overflow':e[1]['details']['inode']=18446744073709551616
            if change=='zero':e[1]['details']['inode']=0
            if change=='boolean':e[1]['details']['device']=True
            previous=hashlib.sha256(h.canonical(v)).hexdigest()
            for row in e:
                row['previousHash']=previous
                raw={k:row[k] for k in ('sequence','stage','details','previousHash')}
                row['eventHash']=hashlib.sha256(h.canonical(raw)).hexdigest();previous=row['eventHash']
            with self.assertRaises(RuntimeError):m.project(v,e,B)
    def test_complete_bound_projection_preserves_uint64_exactly(self):
        v,e=fixture();r=m.project(v,e,B);self.assertEqual(r['journalDigest'],e[-1]['eventHash']);self.assertEqual(len(r['observations']),8);self.assertEqual(r['observations'][0]['inode'],'18446744073709551615');self.assertNotIn('attemptToken',r)
    def test_other_attempt_or_revision_refused(self):
        v,e=fixture()
        for b in ({**B,'jobRevision':12},{**B,'attemptId':'60000000-0000-0000-0000-000000000006'}):
            with self.assertRaises(RuntimeError):m.project(v,e,b)
    def test_missing_changed_or_extra_event_refused(self):
        v,e=fixture()
        for rows in (e[:-1],e+[e[-1]],list(reversed(e))):
            with self.assertRaises(RuntimeError):m.project(v,rows,B)
        e[1]['details']['uid']=123
        with self.assertRaises(RuntimeError):m.project(v,e,B)
    def test_shared_verified_cannot_be_reported_as_observed_created(self):
        v,e=fixture();e[0]['stage']='shared_verified'
        with self.assertRaises(RuntimeError):m.project(v,e,B)
    def test_prior_evidence_must_be_earlier_and_same_identity(self):
        v,e=fixture()
        for change in ({'generation':5},{'uid':993},{'osIntentId':B['intentId']}):
            with self.assertRaises(RuntimeError):m.manifest(v['policy'],{**v['evidence'],**change},B)
if __name__=='__main__':unittest.main()
