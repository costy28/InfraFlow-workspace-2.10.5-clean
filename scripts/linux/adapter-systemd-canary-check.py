#!/usr/bin/env python3
"""Child of the isolated transient unit. Canary only; no SQL or real secrets."""
import os
from pathlib import Path
import stat
import sys

CANARY=b'InfraFlow-systemd-canary-v1'.ljust(32,b'.')
DIRECTORY='/run/credentials/infraflow-demo-adapter-credential-check.service'

def valid_metadata(info):
    mode=stat.S_IMODE(info.st_mode)
    return (stat.S_ISREG(info.st_mode) and info.st_nlink==1 and info.st_size==32
            and not info.st_mode&0o7000
            and ((info.st_uid==0 and info.st_gid==0 and mode==0o440)
                 or (info.st_uid==993 and mode==0o400)))

def main():
    if sys.platform!='linux' or len(sys.argv)!=2 or os.getuid()!=993 or os.getgid()!=984 or any(g!=984 for g in os.getgroups()):
        raise RuntimeError('identity')
    source=Path(sys.argv[1])
    if source.parent.name!='private' or source.name!='canary' or source.parent.parent.parent!=Path('/run') or not source.parent.parent.name.startswith('infraflow-adapter-credential-probe-'):
        raise RuntimeError('source_path')
    if os.environ.get('CREDENTIALS_DIRECTORY')!=DIRECTORY:
        raise RuntimeError('credential_directory')
    flags=os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK
    try:
        fd=os.open(source,flags)
    except PermissionError:
        pass
    else:
        os.close(fd)
        raise RuntimeError('source_access')
    fd=os.open(DIRECTORY+'/adapter-canary',flags)
    try:
        if not valid_metadata(os.fstat(fd)):
            raise RuntimeError('credential_metadata')
        if os.read(fd,33)!=CANARY:
            raise RuntimeError('credential_value')
    finally:
        os.close(fd)
    print('ADAPTER_SYSTEMD_CANARY_OK')

if __name__=='__main__':
    try:
        main()
    except Exception:
        sys.exit('ADAPTER_SYSTEMD_CANARY_UNCONFIRMED')
