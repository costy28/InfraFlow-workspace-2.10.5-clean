"""Canonical directory policy. Planning and inspection only; no creation entry point."""
import os
from pathlib import PurePosixPath
import re
import stat

UUID=re.compile('[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')

def plan(trial,uid,gid):
    if type(trial) is not str or not UUID.fullmatch(trial):raise ValueError('invalid_trial')
    if any(type(n) is not int or not 0<n<2147483647 for n in (uid,gid)):raise ValueError('invalid_identity')
    storage='/var/lib/infraflow-demo-tenants';config='/etc/infraflow-demo-tenants'
    rows=[(storage,0,0,0o711,'shared_parent'),(config,0,0,0o711,'shared_parent'),
          (storage+'/'+trial,uid,gid,0o700,'tenant_storage'),(config+'/'+trial,0,gid,0o750,'tenant_config')]
    rows += [(storage+'/'+trial+'/'+name,uid,gid,0o700,'tenant_data') for name in ('data','uploads','logs','tmp')]
    return {'trialId':trial,'identity':'ift_'+trial.replace('-','')[:28],'uid':uid,'gid':gid,
            'directories':[{'path':p,'uid':u,'gid':g,'mode':format(mode,'04o'),'kind':kind} for p,u,g,mode,kind in rows],
            'executionAllowed':False}

def inspect(value,lstat=os.lstat):
    if type(value) is not dict or value!=plan(value.get('trialId'),value.get('uid'),value.get('gid')):raise RuntimeError('directory_plan_refused')
    result=[]
    for entry in value['directories']:
        path=PurePosixPath(entry['path']);missing=False;leaf=None
        # Validate ancestors first; never traverse a symlink, even to an absent leaf.
        for item in reversed((path,*path.parents)):
            try:s=lstat(item)
            except FileNotFoundError:missing=True;continue
            if missing:raise RuntimeError('directory_inventory_inconsistent')
            if not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode):raise RuntimeError('directory_path_refused')
            if item==path:leaf=s
            else:
                if s.st_uid!=0 or s.st_mode&0o022:raise RuntimeError('directory_parent_refused')
        if leaf is not None:
            # Only exact shared parents may preexist. No adoption of tenant paths.
            if entry['kind']!='shared_parent' or (leaf.st_uid,leaf.st_gid,stat.S_IMODE(leaf.st_mode))!=(entry['uid'],entry['gid'],int(entry['mode'],8)):
                raise RuntimeError('directory_exists_requires_review')
        result.append({'path':entry['path'],'status':'absent' if leaf is None else 'shared_parent_verified'})
    return {'trialId':value['trialId'],'directories':result,'executionAllowed':False}
