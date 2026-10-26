#!/usr/bin/env python3
"""Opt-in runtime installation. No SA, schema changes, ERP restart or public routes."""
import getpass
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import time
import urllib.request

NAME = 'infraflow-demo-platform'
CONFIG = Path('/etc/infraflow-demo-platform')
RELEASE = Path('/opt/infraflow-demo-platform/releases/operator-runtime-v1')
READER = Path('/opt/infraflow-demo-platform/releases/sql-reader-v1')
DROPIN = Path('/etc/systemd/system/infraflow-demo-platform.service.d/30-operator-runtime.conf')
FILES = ('service.js', 'sql-reader.js', 'operator-runtime.js', 'operator-sql-client.js',
         'operator-store.js', 'operator-auth.js', 'operator-credentials.js', 'package.json')

def run(args, **kwargs):
    return subprocess.run(args, check=True, timeout=40, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, text=True, **kwargs)

def safe_parent(path):
    for ancestor in (path, *path.parents):
        if ancestor.is_symlink():
            raise RuntimeError('unsafe_path')
        if ancestor.exists():
            info = ancestor.stat()
            if info.st_uid != 0 or info.st_mode & 0o022:
                raise RuntimeError('unsafe_path')

def secure_write(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())

def dropin_text():
    return ('[Service]\nEnvironment=INFRAFLOW_DEMO_PLATFORM_OPERATOR=1\n'
            'LoadCredential=operator-key:/etc/infraflow-demo-platform/operator-auth.key\n'
            'LoadCredential=operator-sql-password:/etc/infraflow-demo-platform/operator-sql.password\n'
            'LoadCredential=operator-id:/etc/infraflow-demo-platform/operator-id\n'
            'ExecStart=\nExecStart=/usr/local/bin/node ' + str(RELEASE / 'service.js') + '\n')

def health(path, code):
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen('http://127.0.0.1:4280' + path, timeout=6) as response:
                data = json.load(response)
            if data.get('ok') is True and (code is None or data.get('code') == code):
                return
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError('health_failed')

def main():
    if sys.platform != 'linux' or os.geteuid() != 0 or sys.argv[1:] != ['--install-confirmed']:
        sys.exit('Linux, sudo et --install-confirmed necesare.')
    if not sys.stdin.isatty():
        sys.exit('Terminal interactiv necesar.')
    source = Path(__file__).resolve().parents[2] / 'server/demo-platform'
    stage, activated = 'preflight', False
    try:
        for path in (RELEASE, DROPIN, CONFIG / 'operator-sql.password', CONFIG / 'operator-id'):
            safe_parent(path.parent)
            if path.exists() or path.is_symlink():
                raise RuntimeError('target_exists')
        for path in (CONFIG / 'operator-auth.key',):
            safe_parent(path.parent)
            info = path.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_gid != 0 or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1 or info.st_size != 32:
                raise RuntimeError('key_metadata_invalid')
        safe_parent(READER)
        if not (READER / 'node_modules/mssql/package.json').is_file():
            raise RuntimeError('driver_missing')
        for filename in FILES:
            path = source / filename
            if not path.is_file() or path.is_symlink():
                raise RuntimeError('source_invalid')
            if filename.endswith('.js'):
                run(['/usr/local/bin/node', '--check', str(path)])
        run(['systemctl', 'is-active', '--quiet', NAME])
        if run(['systemctl', 'show', '--value', '-p', 'User', NAME]).stdout.strip() != NAME:
            raise RuntimeError('service_identity_invalid')
        health('/health/sql', 'platform_sql_reader_verified')
        stage = 'validare date fara scrieri'
        operator_id = input('UUID operator EXISTENT: ').strip().lower()
        password = getpass.getpass('Parola SQL EXISTENTA infraflow_demo_auth (NU SA): ')
        again = getpass.getpass('Repeta parola SQL auth: ')
        if not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', operator_id):
            raise RuntimeError('uuid_invalid')
        if password != again or not re.fullmatch(r'[\x20-\x7e]{16,128}', password):
            raise RuntimeError('password_format_or_confirmation_invalid')
        stage = 'release si credentiale root'
        RELEASE.mkdir(mode=0o755)
        os.chown(RELEASE, 0, 0)
        os.chmod(RELEASE, 0o755)
        for filename in FILES:
            shutil.copyfile(source / filename, RELEASE / filename)
            os.chmod(RELEASE / filename, 0o644)
        # Reuse only this platform's installed driver; never ERP node_modules.
        (RELEASE / 'node_modules').symlink_to(READER / 'node_modules', target_is_directory=True)
        secure_write(CONFIG / 'operator-sql.password', password.encode('ascii'))
        secure_write(CONFIG / 'operator-id', operator_id.encode('ascii'))
        del password, again
        stage = 'verificare SQL si cheie fara TOTP'
        code = "const fs=require('fs');require('./operator-runtime').createOperatorRuntime({read:n=>fs.readFileSync({'operator-key':'/etc/infraflow-demo-platform/operator-auth.key','operator-sql-password':'/etc/infraflow-demo-platform/operator-sql.password','operator-id':'/etc/infraflow-demo-platform/operator-id'}[n])}).then(r=>r.shutdown()).then(()=>console.log('RUNTIME_OK')).catch(()=>{process.exitCode=1})"
        result = run(['/usr/local/bin/node', '-e', code], cwd=RELEASE)
        if result.stdout.strip() != 'RUNTIME_OK':
            raise RuntimeError('runtime_preflight_failed')
        stage = 'activare serviciu privat'
        with DROPIN.open('x') as stream:
            activated = True
            stream.write(dropin_text())
        os.chmod(DROPIN, 0o644)
        run(['systemctl', 'daemon-reload'])
        run(['systemctl', 'restart', NAME])
        health('/health/operator', 'platform_operator_runtime_verified')
        health('/health/sql', 'platform_sql_reader_verified')
        print('OPERATOR_RUNTIME_INSTALLED\nOPERATOR_SERVICE_CREDENTIALS_OK\nPLATFORM_SQL_READER_OK')
        print('Fara TOTP consumat, fara ERP restart/schema/granturi. Readiness ramane 503.')
    except Exception:
        print('Oprit la etapa: ' + stage + '. Nu relua instalatorul.')
        if activated:
            try:
                DROPIN.unlink()  # Exact file created by this invocation only.
                run(['systemctl', 'daemon-reload'])
                run(['systemctl', 'restart', NAME])
                health('/health/sql', 'platform_sql_reader_verified')
                print('ROLLBACK_READER_OK')
            except Exception:
                print('ROLLBACK_REQUIRES_REVIEW')
        print('Release/credentiale pastrate pentru verificare; fara stergere automata.')
        sys.exit(1)

if __name__ == '__main__':
    main()
