#!/usr/bin/env python3
"""Stage root-owned one-shot files only. No SQL command, credential write or restart."""
import os
from pathlib import Path
import pwd
import stat
import subprocess
import sys

RELEASE = Path('/opt/infraflow-demo-platform/releases/worker-check-v1')
DRIVER = Path('/opt/infraflow-demo-platform/releases/sql-reader-v1/node_modules')
FILES = ('package.json', 'provision-lease-command.js', 'provision-lease-client.js',
         'provision-lease-sql.js', 'provision-lease-runtime.js',
         'provision-worker-cycle.js', 'worker-cycle-probe.js')

def safe(path):
    for item in (path, *path.parents):
        if item.is_symlink():
            raise RuntimeError()
        if item.exists():
            info = item.stat()
            if info.st_uid != 0 or info.st_mode & 0o022:
                raise RuntimeError()

def main():
    if sys.platform != 'linux' or os.geteuid() != 0 or sys.argv[1:] != ['--stage-confirmed']:
        sys.exit('Linux, sudo si --stage-confirmed necesare.')
    try:
        identity = pwd.getpwnam('infraflow-demo-worker')
        if (identity.pw_uid, identity.pw_gid, identity.pw_dir, identity.pw_shell) != (994, 985, '/nonexistent', '/usr/sbin/nologin'):
            raise RuntimeError()
        safe(RELEASE.parent)
        safe(DRIVER)
        if not RELEASE.parent.is_dir() or RELEASE.exists() or RELEASE.is_symlink() or not (DRIVER/'mssql/package.json').is_file():
            raise RuntimeError()
        source = Path(__file__).resolve().parents[2]/'server/demo-platform'
        content = {}
        for name in FILES:
            file = source/name
            if file.is_symlink() or not stat.S_ISREG(file.lstat().st_mode):
                raise RuntimeError()
            content[name] = file.read_bytes()
            if name.endswith('.js'):
                subprocess.run(['/usr/local/bin/node', '--check', str(file)], check=True,
                               capture_output=True, timeout=10)
        RELEASE.mkdir(mode=0o755)
        os.chmod(RELEASE, 0o755)
        for name, data in content.items():
            fd = os.open(RELEASE/name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
            with os.fdopen(fd, 'wb') as stream:
                os.fchmod(stream.fileno(), 0o644)
                stream.write(data)
        (RELEASE/'node_modules').symlink_to(DRIVER, target_is_directory=True)
        print('WORKER_CHECK_FILES_STAGED\nNO_RESTART_NO_JOB_CLAIMED')
    except Exception:
        sys.exit('WORKER_STAGE_UNCONFIRMED: nu relua automat; verifica resursele partiale.')

if __name__ == '__main__':
    main()
