#!/usr/bin/env python3
"""Interactive root-only test; consumes an attempt and a TOTP, writes auth audit."""
import getpass
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def main():
    if sys.platform != 'linux' or os.geteuid() != 0 or sys.argv[1:] != ['--login-probe-confirmed']:
        sys.exit('Linux, sudo si --login-probe-confirmed necesare.')
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        sys.exit('Terminal interactiv necesar.')
    helper = Path(__file__).resolve().parents[2] / 'server/demo-platform/operator-login-probe.js'
    if not helper.is_file():
        sys.exit('Helper lipsa. Nimic modificat.')
    admin = getpass.getpass('Parola SA (numai pentru acest diagnostic local): ')
    username = input('Nume operator (infraop): ') or 'infraop'
    password = getpass.getpass('Parola OPERATORULUI (nu parola SQL): ')
    code = getpass.getpass('Cod TOTP PROASPAT din Authenticator: ')
    if not re.fullmatch(r'[a-z0-9_.-]{1,64}', username) or not re.fullmatch(r'[0-9]{6}', code):
        sys.exit('Format nume/cod invalid. Proba nu a fost executata.')
    print('Se verifica loginul, consultarea autorizata si logout; fara companii/restart.')
    try:
        result = subprocess.run(['/usr/local/bin/node', str(helper)],
            input=json.dumps({'adminPassword':admin,'username':username,'password':password,'code':code}),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=45,
            env={'PATH':'/usr/local/bin:/usr/bin:/bin'})
        allowed = {'OPERATOR_PASSWORD_TOTP_OK','OPERATOR_READ_SCOPE_OK','OPERATOR_LOGOUT_OK',
                   'OPERATOR_PROBE_PREFLIGHT_FAILED'}
        stages = {'KEY','CONNECT','ACCOUNT','PASSWORD_TOTP','READ_SCOPE','LOGOUT'}
        for line in result.stdout.splitlines():
            if line in allowed or line in {'OPERATOR_PROBE_FAILED_STAGE='+stage for stage in stages}:
                print(line)
        if result.returncode:
            sys.exit('Proba neconfirmata. Nu repeta automat; trimite doar codul etapei.')
        if set(result.stdout.splitlines()) != {'OPERATOR_PASSWORD_TOTP_OK','OPERATOR_READ_SCOPE_OK','OPERATOR_LOGOUT_OK'}:
            sys.exit('Rezultat neasteptat. Necesita verificare.')
    except subprocess.TimeoutExpired:
        sys.exit('Proba a expirat; poate fi consumat codul/incercarea. Nu repeta automat.')


if __name__ == '__main__':
    main()
