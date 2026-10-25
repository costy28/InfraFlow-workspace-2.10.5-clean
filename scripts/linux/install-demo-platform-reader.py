#!/usr/bin/env python3
"""Install new reader release only. Never touches ERP, SQL schema or firewall."""
import getpass
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import time
import urllib.request

APP = Path('/opt/infraflow-demo-platform')
RELEASE = APP / 'releases/sql-reader-v1'
SECRET = Path('/etc/infraflow-demo-platform/sql-reader.password')
DROPIN = Path('/etc/systemd/system/infraflow-demo-platform.service.d/20-sql-reader.conf')
NAME = 'infraflow-demo-platform'


def run(args, **kwargs):
    return subprocess.run(args, check=True, timeout=40, **kwargs)


def absent(path):
    if path.exists() or path.is_symlink():
        raise RuntimeError('target_exists')


def safe_parent(path):
    for ancestor in (path, *path.parents):
        if ancestor.is_symlink():
            raise RuntimeError('symlink_refused')
        if ancestor.exists():
            info = ancestor.stat()
            if info.st_uid != 0 or info.st_mode & 0o022:
                raise RuntimeError('unsafe_parent_permissions')


def health(path, expected):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen('http://127.0.0.1:4280' + path, timeout=6) as response:
                data = json.load(response)
            if data.get('ok') is True and (expected is None or data.get('code') == expected):
                return
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError('health_not_confirmed')


def main():
    if sys.platform != 'linux' or os.geteuid() != 0 or sys.argv[1:] != ['--install-confirmed']:
        sys.exit('Linux, sudo si --install-confirmed necesare.')
    import grp
    source = Path(__file__).resolve().parents[2] / 'server/demo-platform'
    stage = 'preflight'
    activated = False
    try:
        group = grp.getgrnam(NAME)
        for path in (RELEASE, SECRET, DROPIN):
            absent(path)
            safe_parent(path.parent)
        if not (source / 'node_modules/mssql/package.json').is_file():
            raise RuntimeError('run_npm_ci_first')
        for path in source.rglob('*'):
            if path.is_symlink() and not path.resolve().is_relative_to(source.resolve()):
                raise RuntimeError('external_source_symlink')
        run(['systemctl', 'is-active', '--quiet', NAME])
        for filename in ('service.js', 'sql-reader.js'):
            run(['/usr/local/bin/node', '--check', str(source / filename)])
        stage = 'validare parola (fara scrieri)'
        password = getpass.getpass('Parola loginului infraflow_demo_platform (NU SA): ')
        again = getpass.getpass('Repeta parola platformei: ')
        if password != again:
            raise RuntimeError('password_mismatch')
        if not 16 <= len(password) <= 128:
            raise RuntimeError('password_length_invalid')
        if not all(32 <= ord(c) < 127 for c in password):
            raise RuntimeError('password_characters_invalid')
        stage = 'release si secret'
        RELEASE.parent.mkdir(mode=0o755, exist_ok=True)
        shutil.copytree(source, RELEASE, symlinks=True)
        for path in (RELEASE, *RELEASE.rglob('*')):
            if not path.is_symlink():
                os.chown(path, 0, 0)
                os.chmod(path, 0o755 if path.is_dir() or path.stat().st_mode & stat.S_IXUSR else 0o644)
        fd = os.open(SECRET, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(password.encode('ascii'))
            stream.flush()
            os.fsync(stream.fileno())
            os.fchown(stream.fileno(), 0, group.gr_gid)
            os.fchmod(stream.fileno(), 0o640)
        del password, again
        stage = 'verificare SQL sub identitatea serviciului'
        # No password on argv, no SA, no ERP node_modules. Raw errors never printed.
        code = "const r=require('./sql-reader');const p=r.createSqlReader(r.readPassword());p.check().then(()=>p.shutdown()).then(()=>console.log('READER_OK')).catch(async()=>{try{await p.shutdown()}catch{};process.exitCode=1})"
        probe = run(['/usr/sbin/runuser', '-u', NAME, '--', '/usr/local/bin/node', '-e', code],
                    cwd=RELEASE, env={'PATH': '/usr/local/bin:/usr/bin:/bin'},
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if 'READER_OK' not in probe.stdout.split():
            raise RuntimeError('reader_probe_failed')
        stage = 'activare serviciu nou'
        DROPIN.parent.mkdir(mode=0o755, exist_ok=True)
        with DROPIN.open('x') as stream:
            stream.write('[Service]\nEnvironment=INFRAFLOW_DEMO_PLATFORM_SQL=1\nExecStart=\n'
                         'ExecStart=/usr/local/bin/node ' + str(RELEASE / 'service.js') + '\n')
        os.chmod(DROPIN, 0o644)
        activated = True
        run(['systemctl', 'daemon-reload'])
        run(['systemctl', 'restart', NAME])
        health('/health/sql', 'platform_sql_reader_verified')
        print('SQL sub identitatea serviciului: OK\nDiagnostic /health/sql: OK')
        print('Readiness ramane 503 intentionat. Nicio modificare ERP/SQL/firewall.')
    except Exception as error:
        print('Oprit la etapa: ' + stage + '. Nu relua instalatorul.')
        safe_codes = {
            'target_exists', 'symlink_refused', 'unsafe_parent_permissions',
            'run_npm_ci_first', 'external_source_symlink', 'password_mismatch',
            'password_length_invalid', 'password_characters_invalid',
            'reader_probe_failed', 'health_not_confirmed'
        }
        code = str(error) if type(error) is RuntimeError and str(error) in safe_codes else 'installation_step_failed'
        print('Cod diagnostic: ' + code)
        if activated:
            try:
                DROPIN.unlink()  # Only the exact file created in this invocation.
                run(['systemctl', 'daemon-reload'])
                run(['systemctl', 'restart', NAME])
                health('/health/live', None)
                print('Rollback la serviciul foundation anterior: OK')
            except Exception:
                print('Rollback necesita verificare manuala a serviciului nou.')
        print('Release/secret create sunt pastrate pentru verificare, fara stergere automata.')
        sys.exit(1)


if __name__ == '__main__':
    main()
