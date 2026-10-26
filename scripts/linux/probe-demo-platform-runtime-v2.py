#!/usr/bin/env python3
"""Prepare separate corrected release and transient probe; never restart existing units."""
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys

OLD = Path('/opt/infraflow-demo-platform/releases/operator-runtime-v1')
NEW = Path('/opt/infraflow-demo-platform/releases/operator-runtime-v2')
FILES = ('service.js', 'sql-reader.js', 'operator-sql-client.js', 'operator-store.js',
         'operator-auth.js', 'operator-credentials.js', 'package.json')

def safe(path):
    for item in (path, *path.parents):
        if item.is_symlink():
            raise RuntimeError('symlink_refused')
        if item.exists():
            info = item.stat()
            if info.st_uid != 0 or info.st_mode & 0o022:
                raise RuntimeError('unsafe_owner_or_mode')

def main():
    if sys.platform != 'linux' or os.geteuid() != 0 or sys.argv[1:] != ['--probe-confirmed']:
        sys.exit('Linux, sudo si --probe-confirmed necesare.')
    stage = 'preflight'
    try:
        safe(OLD)
        safe(NEW.parent)
        if NEW.exists() or NEW.is_symlink():
            raise RuntimeError('release_exists')
        source = Path(__file__).resolve().parents[2] / 'server/demo-platform'
        for name in FILES:
            safe(OLD / name)
            if not (OLD / name).is_file():
                raise RuntimeError('source_missing')
        for name in ('operator-auth.key', 'operator-sql.password', 'operator-id'):
            path = Path('/etc/infraflow-demo-platform') / name
            safe(path)
            info = path.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_gid != 0 or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1:
                raise RuntimeError('source_credential_metadata_invalid')
        driver = Path('/opt/infraflow-demo-platform/releases/sql-reader-v1/node_modules')
        safe(driver)
        if not (driver / 'mssql/package.json').is_file():
            raise RuntimeError('driver_missing')
        for name in ('operator-runtime.js', 'operator-credential-probe.js'):
            path = source / name
            if path.is_symlink() or not path.is_file():
                raise RuntimeError('patch_invalid')
            subprocess.run(['/usr/local/bin/node', '--check', str(path)], check=True,
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        stage = 'release separat'
        NEW.mkdir(mode=0o755)
        os.chown(NEW, 0, 0)
        os.chmod(NEW, 0o755)
        for name in (*FILES, 'operator-runtime.js', 'operator-credential-probe.js'):
            origin = OLD if name in FILES else source
            shutil.copyfile(origin / name, NEW / name)
            os.chown(NEW / name, 0, 0)
            os.chmod(NEW / name, 0o644)
        (NEW / 'node_modules').symlink_to(driver, target_is_directory=True)
        stage = 'proba systemd fara restart'
        command = ['systemd-run', '--wait', '--pipe', '--collect',
                   '--unit=infraflow-operator-runtime-probe',
                   '--property=User=infraflow-demo-platform',
                   '--property=Group=infraflow-demo-platform',
                   '--property=NoNewPrivileges=yes', '--property=ProtectSystem=strict',
                   '--property=ProtectHome=yes', '--property=PrivateTmp=yes',
                   '--property=PrivateDevices=yes', '--property=MemoryMax=256M',
                   '--property=TasksMax=64', '--property=RuntimeMaxSec=30s']
        for name, filename in (('operator-key', 'operator-auth.key'),
                               ('operator-sql-password', 'operator-sql.password'), ('operator-id', 'operator-id')):
            command.append('--property=LoadCredential='+name+':/etc/infraflow-demo-platform/'+filename)
        command += ['/usr/local/bin/node', str(NEW / 'operator-credential-probe.js')]
        subprocess.run(command, check=True, timeout=40)
        print('PROBE_COMPLETE_NO_EXISTING_SERVICE_RESTART')
    except Exception:
        print('Oprit la etapa: '+stage+'. Nu relua automat; release pastrat pentru verificare.')
        sys.exit(1)

if __name__ == '__main__':
    main()
