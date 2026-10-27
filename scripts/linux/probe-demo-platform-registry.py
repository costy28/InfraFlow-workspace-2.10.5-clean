#!/usr/bin/env python3
"""Prepare isolated reader probe. No service commands, SQL writes, credentials prompts or TOTP."""
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys

TARGET = Path('/opt/infraflow-demo-platform/releases/registry-read-probe-v1')
DRIVER = Path('/opt/infraflow-demo-platform/releases/sql-reader-v1/node_modules')
FILES = ('package.json', 'sql-reader.js', 'trial-list.js', 'trial-list-probe.js')

def safe(path):
    for item in (path, *path.parents):
        if item.is_symlink():
            raise RuntimeError('unsafe_path')
        if item.exists():
            info = item.stat()
            if info.st_uid != 0 or info.st_mode & 0o022:
                raise RuntimeError('unsafe_path')

def main():
    if sys.platform != 'linux' or os.geteuid() != 0 or sys.argv[1:] != ['--probe-confirmed']:
        sys.exit('Linux, sudo si --probe-confirmed necesare.')
    stage = 'preflight'
    try:
        safe(TARGET.parent)
        safe(DRIVER)
        if TARGET.exists() or TARGET.is_symlink():
            raise RuntimeError('probe_exists')
        if not (DRIVER / 'mssql/package.json').is_file():
            raise RuntimeError('driver_missing')
        source = Path(__file__).resolve().parents[2] / 'server/demo-platform'
        for name in FILES:
            path = source / name
            if path.is_symlink() or not stat.S_ISREG(path.lstat().st_mode):
                raise RuntimeError('invalid_source')
            if name.endswith('.js'):
                subprocess.run(['/usr/local/bin/node', '--check', str(path)], check=True,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        stage = 'director separat de proba'
        TARGET.mkdir(mode=0o755)
        os.chown(TARGET, 0, 0)
        os.chmod(TARGET, 0o755)
        for name in FILES:
            shutil.copyfile(source / name, TARGET / name)
            os.chown(TARGET / name, 0, 0)
            os.chmod(TARGET / name, 0o644)
        (TARGET / 'node_modules').symlink_to(DRIVER, target_is_directory=True)
        stage = 'citire SQL sub identitatea serviciului'
        result = subprocess.run(['/usr/sbin/runuser', '-u', 'infraflow-demo-platform', '--',
                                 '/usr/local/bin/node', str(TARGET / 'trial-list-probe.js')],
                                check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, timeout=40, env={'PATH': '/usr/local/bin:/usr/bin:/bin'})
        lines = result.stdout.splitlines()
        for line in lines:
            if line in ('REGISTRY_READ_OK', 'REGISTRY_FILTERS_OK', 'REGISTRY_PROBE_CLOSE_FAILED'):
                print(line)
            elif line.startswith('REGISTRY_TOTAL=') and line.removeprefix('REGISTRY_TOTAL=').isascii() and line.removeprefix('REGISTRY_TOTAL=').isdigit():
                print(line)
            elif line in {'REGISTRY_PROBE_FAILED_STAGE='+item for item in ('IDENTITY', 'SECRET', 'READER_CHECK', 'REGISTRY_PAGE', 'FILTERS')}:
                print(line)
        if result.returncode or 'REGISTRY_READ_OK' not in lines or 'REGISTRY_FILTERS_OK' not in lines:
            raise RuntimeError('probe_not_confirmed')
        print('REGISTRY_PROBE_COMPLETE_NO_RESTART')
    except Exception:
        print('Oprit la etapa: '+stage+'. Nu relua automat; directorul este pastrat pentru verificare.')
        sys.exit(1)

if __name__ == '__main__':
    main()
