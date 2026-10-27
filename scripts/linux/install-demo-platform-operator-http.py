#!/usr/bin/env python3
"""Install private operator UI after Access acceptance. Reuse secrets; no SQL writes or ERP restart."""
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.request

NAME = 'infraflow-demo-platform'
BASE = Path('/opt/infraflow-demo-platform/releases')
PREVIOUS = BASE / 'operator-runtime-v2'
RELEASE = BASE / 'operator-http-v1'
DROPIN = Path('/etc/systemd/system/infraflow-demo-platform.service.d/40-operator-http.conf')
ORIGIN = 'https://operator.infraflow.ro'
FILES = ('service.js', 'sql-reader.js', 'operator-runtime.js', 'operator-sql-client.js',
         'operator-store.js', 'operator-auth.js', 'operator-credentials.js', 'operator-http.js',
         'package.json', 'operator-ui/index.html', 'operator-ui/style.css', 'operator-ui/app.js')

def run(*args):
    return subprocess.run(args, check=True, timeout=40, text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)

def safe(path):
    for item in (path, *path.parents):
        if item.is_symlink():
            raise RuntimeError('unsafe_path')
        if item.exists():
            info = item.stat()
            if info.st_uid != 0 or info.st_mode & 0o022:
                raise RuntimeError('unsafe_path')

def dropin_text():
    return ('[Service]\nEnvironment=INFRAFLOW_DEMO_PLATFORM_HTTP=1\n'
            'Environment=INFRAFLOW_DEMO_PLATFORM_ORIGIN='+ORIGIN+'\n'
            'Environment=INFRAFLOW_DEMO_PLATFORM_PROXY=loopback-https\n'
            'ExecStart=\nExecStart=/usr/local/bin/node '+str(RELEASE / 'service.js')+'\n')

def fetch(path, public=False):
    headers = {'Host': 'operator.infraflow.ro', 'X-Forwarded-Proto': 'https'} if public else {}
    request = urllib.request.Request('http://127.0.0.1:4280'+path, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=6) as response:
            return response.status, response.read(65536), response.headers
    except urllib.error.HTTPError as error:
        return error.code, error.read(65536), error.headers

def health(path, code):
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        try:
            status, data, _ = fetch(path)
            if status == 200 and json.loads(data).get('code') == code:
                return
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError('health_failed')

def rollback():
    DROPIN.unlink()  # Only the exact file created in this invocation.
    run('systemctl', 'daemon-reload')
    run('systemctl', 'restart', NAME)
    health('/health/operator', 'platform_operator_runtime_verified')
    health('/health/sql', 'platform_sql_reader_verified')

def main():
    if sys.platform != 'linux' or os.geteuid() != 0 or sys.argv[1:] != ['--install-confirmed', '--access-protection-confirmed']:
        sys.exit('Linux, sudo, --install-confirmed si --access-protection-confirmed necesare.')
    stage, created = 'preflight', False
    try:
        source = Path(__file__).resolve().parents[2] / 'server/demo-platform'
        safe(RELEASE.parent)
        safe(DROPIN.parent)
        if RELEASE.exists() or RELEASE.is_symlink() or DROPIN.exists() or DROPIN.is_symlink():
            raise RuntimeError('target_exists')
        safe(PREVIOUS)
        if run('systemctl', 'show', '--value', '-p', 'User', NAME).stdout.strip() != NAME:
            raise RuntimeError('service_identity_invalid')
        command = run('systemctl', 'show', '--value', '-p', 'ExecStart', NAME).stdout
        if str(PREVIOUS / 'service.js') not in command:
            raise RuntimeError('unexpected_active_release')
        run('systemctl', 'is-active', '--quiet', NAME)
        health('/health/operator', 'platform_operator_runtime_verified')
        health('/health/sql', 'platform_sql_reader_verified')
        driver = BASE / 'sql-reader-v1/node_modules'
        safe(driver)
        if not (driver / 'mssql/package.json').is_file():
            raise RuntimeError('driver_missing')
        for name in FILES:
            file = source / name
            if file.is_symlink() or not stat.S_ISREG(file.lstat().st_mode):
                raise RuntimeError('invalid_source')
            if name.endswith('.js'):
                run('/usr/local/bin/node', '--check', str(file))
        stage = 'release separat'
        RELEASE.mkdir(mode=0o755)
        os.chown(RELEASE, 0, 0)
        os.chmod(RELEASE, 0o755)
        (RELEASE / 'operator-ui').mkdir(mode=0o755)
        os.chown(RELEASE / 'operator-ui', 0, 0)
        os.chmod(RELEASE / 'operator-ui', 0o755)
        for name in FILES:
            shutil.copyfile(source / name, RELEASE / name)
            os.chown(RELEASE / name, 0, 0)
            os.chmod(RELEASE / name, 0o644)
        (RELEASE / 'node_modules').symlink_to(driver, target_is_directory=True)
        stage = 'configurare si restart privat'
        fd = os.open(DROPIN, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
        created = True
        with os.fdopen(fd, 'w') as stream:
            os.fchmod(stream.fileno(), 0o644)
            stream.write(dropin_text())
            stream.flush()
            os.fsync(stream.fileno())
        run('systemctl', 'daemon-reload')
        run('systemctl', 'restart', NAME)
        stage = 'verificare runtime si HTTP local'
        health('/health/operator', 'platform_operator_runtime_verified')
        health('/health/sql', 'platform_sql_reader_verified')
        status, data, headers = fetch('/operator', public=True)
        if status != 200 or b'Acces operator' not in data or 'no-store' not in headers.get('Cache-Control', ''):
            raise RuntimeError('ui_not_confirmed')
        for path, mime in (('/operator/app.js', 'javascript'), ('/operator/style.css', 'text/css')):
            status, data, headers = fetch(path, public=True)
            if status != 200 or not data or mime not in headers.get('Content-Type', ''):
                raise RuntimeError('asset_not_confirmed')
        if fetch('/operator/session', public=True)[0] != 401 or fetch('/operator')[0] != 401:
            raise RuntimeError('unauthenticated_gate_failed')
        if fetch('/health/ready')[0] != 503:
            raise RuntimeError('unexpected_readiness')
        print('OPERATOR_HTTP_INSTALLED\nOPERATOR_UI_LOCAL_OK\nOPERATOR_SESSION_GATE_OK')
        print('OPERATOR_HEALTH_OK\nSQL_READER_HEALTH_OK')
        print('Nicio parola/TOTP ceruta. ERP neatins. Urmeaza testul real HTTPS prin Access.')
    except Exception:
        print('Oprit la etapa: '+stage+'. Nu relua instalatorul.')
        if created:
            try:
                rollback()
                print('ROLLBACK_OPERATOR_RUNTIME_V2_OK')
            except Exception:
                print('ROLLBACK_REQUIRES_REVIEW')
        print('Release pastrat pentru verificare. Credentialele existente nu au fost modificate.')
        sys.exit(1)

if __name__ == '__main__':
    main()
