#!/usr/bin/env python3
"""Patch only operator scope/audit allowlists; explicit private service restart."""
import importlib.util
import os
from pathlib import Path
import shutil
import stat
import sys

spec = importlib.util.spec_from_file_location('registration_installer', Path(__file__).with_name('install-demo-platform-registration.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
PREVIOUS = Path('/opt/infraflow-demo-platform/releases/operator-registration-v1')
RELEASE = Path('/opt/infraflow-demo-platform/releases/operator-prepare-compat-v1')
DROPIN = Path('/etc/systemd/system/infraflow-demo-platform.service.d/43-operator-prepare-compat.conf')
PATCHED = ('operator-auth.js', 'operator-store.js', 'operator-sql-client.js')


def dropin_text():
    return '[Service]\nExecStart=\nExecStart=/usr/local/bin/node '+(RELEASE/'service.js').as_posix()+'\n'


def check_runtime():
    base.health('/health/operator', 'platform_operator_runtime_verified')
    base.health('/health/sql', 'platform_sql_reader_verified')
    base.health('/health/registrar', 'registrar_scope_verified')
    status, data, headers = base.fetch('/operator', public=True)
    if status != 200 or b'register-form' not in data or 'no-store' not in headers.get('Cache-Control', ''):
        raise RuntimeError('operator_ui_not_confirmed')
    for route in ('/operator/session', '/operator/trials'):
        if base.fetch(route, public=True)[0] != 401:
            raise RuntimeError('operator_session_gate_failed')
    if base.fetch('/health/ready')[0] != 503:
        raise RuntimeError('unexpected_readiness')


def rollback():
    DROPIN.unlink()  # Exact newly created file only; leave releases/secrets intact.
    base.run('/usr/bin/systemctl', 'daemon-reload')
    base.run('/usr/bin/systemctl', 'restart', 'infraflow-demo-platform')
    check_runtime()


def main():
    if sys.platform != 'linux' or os.geteuid() != 0 or sys.argv[1:] != ['--install-confirmed', '--platform-restart-confirmed']:
        sys.exit('Linux, sudo, --install-confirmed si --platform-restart-confirmed necesare.')
    created = False
    stage = 'preflight fara scrieri'
    try:
        for target in (RELEASE, DROPIN):
            base.safe(target.parent)
            if not target.parent.is_dir() or target.exists() or target.is_symlink():
                raise RuntimeError('target_exists_or_parent_missing')
        base.safe(PREVIOUS)
        if base.run('/usr/bin/systemctl', 'show', '--value', '-p', 'User', 'infraflow-demo-platform').stdout.strip() != 'infraflow-demo-platform':
            raise RuntimeError('unexpected_service_identity')
        command = base.run('/usr/bin/systemctl', 'show', '--value', '-p', 'ExecStart', 'infraflow-demo-platform').stdout
        if (PREVIOUS/'service.js').as_posix() not in command:
            raise RuntimeError('unexpected_active_release')
        base.run('/usr/bin/systemctl', 'is-active', '--quiet', 'infraflow-demo-platform')
        check_runtime()
        source = Path(__file__).resolve().parents[2]/'server/demo-platform'
        driver = Path('/opt/infraflow-demo-platform/releases/sql-reader-v1/node_modules')
        base.safe(driver)
        if not (driver/'mssql/package.json').is_file():
            raise RuntimeError('driver_missing')
        sources = {}
        for name in base.FILES:
            file = (source if name in PATCHED else PREVIOUS)/name
            if name not in PATCHED:
                base.safe(file)
            if file.is_symlink() or not stat.S_ISREG(file.lstat().st_mode):
                raise RuntimeError('invalid_source')
            if name.endswith('.js'):
                base.run('/usr/local/bin/node', '--check', str(file))
            sources[name] = file
        stage = 'copie release separat'
        RELEASE.mkdir(mode=0o755)
        os.chown(RELEASE, 0, 0)
        os.chmod(RELEASE, 0o755)
        (RELEASE/'operator-ui').mkdir(mode=0o755)
        for name, file in sources.items():
            shutil.copyfile(file, RELEASE/name)
            os.chown(RELEASE/name, 0, 0)
            os.chmod(RELEASE/name, 0o644)
        (RELEASE/'node_modules').symlink_to(driver, target_is_directory=True)
        stage = 'activare compatibilitate si restart privat'
        fd = os.open(DROPIN, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
        created = True
        with os.fdopen(fd, 'w') as stream:
            os.fchmod(stream.fileno(), 0o644)
            stream.write(dropin_text())
            stream.flush()
            os.fsync(stream.fileno())
        base.run('/usr/bin/systemctl', 'daemon-reload')
        base.run('/usr/bin/systemctl', 'restart', 'infraflow-demo-platform')
        stage = 'verificare platforma privata'
        check_runtime()
        print('OPERATOR_PREPARE_COMPAT_INSTALLED\nOPERATOR_HEALTH_OK\nSQL_READER_HEALTH_OK\nREGISTRAR_HEALTH_OK')
        print('Niciun scope acordat. Niciun job creat. ERP neatins. Urmeaza autentificarea reala HTTPS.')
    except Exception:
        print('Oprit la etapa: '+stage+'. Nu relua automat.')
        if created:
            try:
                rollback()
                print('ROLLBACK_OPERATOR_REGISTRATION_V1_OK')
            except Exception:
                print('ROLLBACK_REQUIRES_REVIEW')
        print('Release pastrat pentru verificare. Contul si credentialele nu au fost modificate.')
        sys.exit(1)


if __name__ == '__main__':
    main()
