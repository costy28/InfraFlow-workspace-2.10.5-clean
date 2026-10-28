#!/usr/bin/env python3
"""Store existing preparer credential and run transient metadata-only probe."""
import getpass
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys

SECRET = Path('/etc/infraflow-demo-platform/preparer.password')
RELEASE = Path('/opt/infraflow-demo-platform/releases/preparer-check-v1')
DRIVER = Path('/opt/infraflow-demo-platform/releases/sql-reader-v1/node_modules')
FILES = ('package.json', 'provision-request.js', 'provision-request-sql.js', 'preparer-runtime.js', 'preparer-credential-probe.js')


def validate_password(password, again):
    if password != again or not re.fullmatch(r'[\x20-\x7e]{16,128}', password):
        raise ValueError('password_format_invalid')


def safe(path):
    for item in (path, *path.parents):
        if item.is_symlink():
            raise RuntimeError('unsafe_path')
        if item.exists():
            s = item.stat()
            if s.st_uid != 0 or s.st_mode & 0o022:
                raise RuntimeError('unsafe_path')


def secure_write(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        os.fchown(stream.fileno(), 0, 0)
        os.fchmod(stream.fileno(), 0o600)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def probe_command():
    return ['/usr/bin/systemd-run', '--quiet', '--wait', '--pipe', '--collect', '--unit=infraflow-preparer-check',
            '--property=User=infraflow-demo-platform', '--property=Group=infraflow-demo-platform',
            '--property=NoNewPrivileges=yes', '--property=ProtectSystem=strict', '--property=ProtectHome=yes',
            '--property=PrivateTmp=yes', '--property=PrivateDevices=yes', '--property=CapabilityBoundingSet=',
            '--property=MemoryMax=256M', '--property=TasksMax=64', '--property=RuntimeMaxSec=30s',
            '--property=LoadCredential=preparer-password:'+SECRET.as_posix(),
            '/usr/local/bin/node', (RELEASE/'preparer-credential-probe.js').as_posix()]


def main():
    if sys.platform != 'linux' or os.geteuid() != 0 or sys.argv[1:] != ['--prepare-confirmed'] or not sys.stdin.isatty() or not sys.stdout.isatty():
        sys.exit('Linux, sudo, terminal interactiv si --prepare-confirmed necesare.')
    stage = 'preflight fara scrieri'
    try:
        for target in (SECRET, RELEASE):
            safe(target.parent)
            if not target.parent.is_dir() or target.exists() or target.is_symlink():
                raise RuntimeError('target_exists_or_parent_missing')
        safe(DRIVER)
        if not (DRIVER/'mssql/package.json').is_file():
            raise RuntimeError('driver_missing')
        source = Path(__file__).resolve().parents[2]/'server/demo-platform'
        for name in FILES:
            file = source/name
            if file.is_symlink() or not stat.S_ISREG(file.lstat().st_mode):
                raise RuntimeError('source_invalid')
            if name.endswith('.js'):
                subprocess.run(['/usr/local/bin/node', '--check', str(file)], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        stage = 'confirmare parola existenta fara scrieri'
        password = getpass.getpass('Parola SQL EXISTENTA infraflow_demo_preparer (NU SA/lease/registrar): ')
        again = getpass.getpass('Repeta parola SQL preparer: ')
        validate_password(password, again)
        stage = 'release si credential root-only'
        RELEASE.mkdir(mode=0o755)
        os.chown(RELEASE, 0, 0)
        os.chmod(RELEASE, 0o755)
        for name in FILES:
            shutil.copyfile(source/name, RELEASE/name)
            os.chown(RELEASE/name, 0, 0)
            os.chmod(RELEASE/name, 0o644)
        (RELEASE/'node_modules').symlink_to(DRIVER, target_is_directory=True)
        secure_write(SECRET, password.encode('ascii'))
        del password, again
        stage = 'proba systemd credential si metadate SQL'
        result = subprocess.run(probe_command(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=40)
        if result.returncode or result.stdout.split() != ['PREPARER_CREDENTIAL_SQL_OK']:
            raise RuntimeError('credential_probe_failed')
        print('PREPARER_CREDENTIAL_SQL_OK\nPREPARER_SECRET_PREPARED\nNO_RESTART_NO_JOB_CREATED')
    except Exception as error:
        allowed = {'unsafe_path', 'target_exists_or_parent_missing', 'driver_missing', 'source_invalid', 'password_format_invalid', 'credential_probe_failed'}
        code = str(error) if type(error) in (RuntimeError, ValueError) and str(error) in allowed else 'preparation_step_failed'
        print('Oprit la etapa: '+stage+'. Nu relua automat.\nCod diagnostic: '+code)
        print('Resursele create sunt pastrate pentru verificare; fara stergere automata.')
        sys.exit(1)


if __name__ == '__main__':
    main()
