"""Descriptor-based directory primitives and injected durable flow. No CLI/default authority."""
import importlib.util
import os
from pathlib import Path,PurePosixPath
import stat

def policy_module():
    s=importlib.util.spec_from_file_location('directory_policy',Path(__file__).with_name('tenant-directory-plan.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def _no_acl(fd):
    if any(name in ('system.posix_acl_access','system.posix_acl_default') for name in os.listxattr(fd)):
        raise RuntimeError('directory_acl_requires_review')

def _open_parent(path,expected):
    if os.name!='posix' or os.geteuid()!=0 or os.getegid()!=0:raise RuntimeError('root_posix_required')
    p=PurePosixPath(path)
    if not p.is_absolute() or '..' in p.parts:raise RuntimeError('directory_path_refused')
    flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC
    fd=os.open('/',flags)
    current=PurePosixPath('/')
    try:
        root=os.fstat(fd);_no_acl(fd)
        if root.st_uid!=0 or root.st_mode&0o022:raise RuntimeError('directory_root_unsafe')
        for component in p.parts[1:]:
            child=os.open(component,flags,dir_fd=fd);os.close(fd);fd=child;current/=component
            s=os.fstat(fd);_no_acl(fd)
            if str(current) in expected:
                e=expected[str(current)]
                if (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))!=(e['uid'],e['gid'],int(e['mode'],8)):raise RuntimeError('directory_parent_changed')
            elif s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('directory_parent_unsafe')
        return fd
    except BaseException:
        os.close(fd);raise

def _mkdir(entry,expected):
    """Internal trusted entry; parent descriptors never follow symlinks. Never adopt/remove."""
    p=PurePosixPath(entry['path']);parent=_open_parent(str(p.parent),expected);fd=None
    try:
        os.mkdir(p.name,mode=0o700,dir_fd=parent) # EEXIST always stops, including symlinks.
        fd=os.open(p.name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=parent)
        before=os.fstat(fd);_no_acl(fd)
        os.fchown(fd,entry['uid'],entry['gid']);os.fchmod(fd,int(entry['mode'],8));os.fsync(fd);os.fsync(parent)
        after=os.fstat(fd);named=os.stat(p.name,dir_fd=parent,follow_symlinks=False)
        if (before.st_dev,before.st_ino)!=(named.st_dev,named.st_ino) or (after.st_uid,after.st_gid,stat.S_IMODE(after.st_mode))!=(entry['uid'],entry['gid'],int(entry['mode'],8)):
            raise RuntimeError('directory_result_unconfirmed')
        return {'uid':after.st_uid,'gid':after.st_gid,'mode':format(stat.S_IMODE(after.st_mode),'04o'),'device':after.st_dev,'inode':after.st_ino}
    finally:
        if fd is not None:os.close(fd)
        os.close(parent)

def run_plan(value,ports):
    policy=policy_module()
    if type(value) is not dict or value!=policy.plan(value.get('trialId'),value.get('uid'),value.get('gid')):raise RuntimeError('directory_plan_refused')
    if type(ports) is not dict or set(ports)!={'inventory','journal','authorize','create'} or not all(callable(p) for p in ports.values()):raise RuntimeError('trusted_directory_ports_required')
    snapshot=ports['inventory'](value)
    if type(snapshot) is not dict or set(snapshot)!={'trialId','directories','executionAllowed'} or snapshot['trialId']!=value['trialId'] or snapshot['executionAllowed'] is not False:raise RuntimeError('inventory_refused')
    rows=snapshot['directories']
    if type(rows) is not list or len(rows)!=len(value['directories']):raise RuntimeError('inventory_refused')
    for entry,row in zip(value['directories'],rows):
        if type(row) is not dict or set(row)!={'path','status'} or row['path']!=entry['path'] or row['status'] not in (('absent','shared_parent_verified') if entry['kind']=='shared_parent' else ('absent',)):raise RuntimeError('inventory_refused')
    journal=ports['journal'](value)
    index=0
    try:
        for index,(entry,row) in enumerate(zip(value['directories'],rows)):
            if row['status']=='shared_parent_verified':
                journal.append('shared_verified',{'index':index});continue
            if ports['authorize'](index,dict(entry)) is not True:raise RuntimeError('directory_authority_refused')
            journal.append('mkdir_requested',{'index':index})
            result=ports['create'](dict(entry))
            if type(result) is not dict or set(result)!={'uid','gid','mode','device','inode'} or any(result[k]!=entry[k] or type(result[k]) is not type(entry[k]) for k in ('uid','gid','mode')) or any(type(result[k]) is not int or result[k]<0 for k in ('device','inode')) or result['inode']==0:raise RuntimeError('directory_receipt_refused')
            journal.append('mkdir_observed',{'index':index,**result})
        journal.append('completed',{})
        return {'trialId':value['trialId'],'status':'directories_observed_requires_review','activationPerformed':False}
    except Exception:
        try:journal.append('review_required',{'index':index})
        except Exception:pass
        raise RuntimeError('directories_unconfirmed_no_retry_review_required') from None
