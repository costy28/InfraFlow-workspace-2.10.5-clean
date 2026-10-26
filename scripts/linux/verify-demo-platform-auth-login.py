#!/usr/bin/env python3
"""Verify the EXISTING auth login. Never creates login, changes grants or consumes OTP."""
import getpass
import importlib.util
from pathlib import Path
import sys
import uuid


def main():
    if sys.platform != 'linux' or sys.argv[1:] != ['--verify-existing']:
        sys.exit('Linux si --verify-existing necesare.')
    source = Path(__file__).with_name('create-demo-platform-auth-login.py')
    spec = importlib.util.spec_from_file_location('auth_verifier_helpers', source)
    helpers = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helpers)
    stage = 'identificare operator (numai citire)'
    try:
        admin = getpass.getpass('Parola SA pentru identificarea UUID operatorului: ')
        result = helpers.query(admin, "SET NOCOUNT ON;SELECT LOWER(CONVERT(char(36),operator_id)) FROM operator_security.accounts WHERE enabled=1;")
        ids = result.stdout.split()
        if result.returncode != 0 or len(ids) != 1 or str(uuid.UUID(ids[0])) != ids[0]:
            raise RuntimeError('operator_lookup_failed')
        stage = 'verificare login existent si citire procedura'
        password = getpass.getpass('Parola SQL EXISTENTA infraflow_demo_auth (nu SA/infraop): ')
        helpers.verify_existing(password, ids[0])
        print('AUTH_LOGIN_VERIFIED\nAcces direct si comenzi comerciale refuzate. Citire prin procedura: OK.')
        print('Nicio modificare de cont/grant, nicio incercare TOTP consumata, niciun restart.')
    except Exception:
        print('VERIFICATION_FAILED_STAGE=' + stage)
        print('Nu recrea loginul. Trimite doar acest mesaj, fara parole.')
        sys.exit(1)


if __name__ == '__main__':
    main()
