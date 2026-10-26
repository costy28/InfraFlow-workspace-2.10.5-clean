#!/usr/bin/env python3
"""First operator only: local root CLI. No service restart or public route."""
import base64
import getpass
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time
import uuid

KEY = Path('/etc/infraflow-demo-platform/operator-auth.key')
SQLCMD = '/opt/mssql-tools18/bin/sqlcmd'


def literal(value):
    return "N'" + value.replace("'", "''") + "'"


def totp(secret, counter):
    digest = hmac.new(base64.b32decode(secret), counter.to_bytes(8, 'big'), hashlib.sha1).digest()
    offset = digest[-1] & 15
    return str((int.from_bytes(digest[offset:offset + 4], 'big') & 0x7fffffff) % 1000000).zfill(6)


def accepted_counter(secret, code, now):
    if not re.fullmatch(r'[0-9]{6}', code):
        return None
    counter = int(now // 30)
    for candidate in (counter, counter - 1):
        if candidate >= 0 and hmac.compare_digest(totp(secret, candidate), code):
            return candidate
    return None


def sql(admin, query):
    result = subprocess.run(
        [SQLCMD, '-S', 'tcp:127.0.0.1,1433', '-U', 'sa', '-d', 'INFRAFLOW_DEMO_PLATFORM',
         '-C', '-l', '5', '-t', '30', '-b', '-x', '-h', '-1', '-W', '-f', '65001'],
        input=query + '\nGO\n', text=True, encoding='utf-8', timeout=40,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env={'PATH': '/usr/local/bin:/usr/bin:/bin', 'LANG': 'C.UTF-8', 'SQLCMDPASSWORD': admin})
    if result.returncode != 0:
        raise RuntimeError('enrollment_sql_unconfirmed')
    return result.stdout.split()


def creation_sql(record, counter):
    if not isinstance(counter, int) or counter < 0:
        raise ValueError('invalid_counter')
    scopes = json.dumps(['trial:read', 'trial:queue', 'trial:activate', 'session:own'])
    return f"""SET NOCOUNT ON;SET XACT_ABORT ON;
BEGIN TRY BEGIN TRANSACTION;
DECLARE @lock int,@id uniqueidentifier=CONVERT(uniqueidentifier,{literal(record['id'])}),
 @counter bigint={counter},@nowCounter bigint=DATEDIFF_BIG(second,CONVERT(datetime2,'1970-01-01'),SYSUTCDATETIME())/30;
EXEC @lock=sys.sp_getapplock @Resource=N'platform-first-operator',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
IF @lock<0 THROW 51701,'operator_enrollment_busy',1;
IF EXISTS(SELECT 1 FROM operator_security.accounts) THROW 51702,'first_operator_already_exists',1;
IF @counter NOT BETWEEN @nowCounter-1 AND @nowCounter THROW 51703,'totp_confirmation_expired',1;
INSERT operator_security.accounts(operator_id,username,revision,enabled,password_hash,totp_envelope,scopes_json,last_totp_counter)
VALUES(@id,{literal(record['username'])},1,1,{literal(record['passwordHash'])},{literal(record['envelope'])},{literal(scopes)},@counter);
INSERT operator_security.audit(operator_id,action) VALUES(@id,'operator_totp_claimed');
COMMIT;SELECT N'OPERATOR_ENROLLED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;"""


def write_new_key(key):
    if len(key) != 32:
        raise RuntimeError('invalid_key')
    for parent in (KEY.parent, *KEY.parent.parents):
        if parent.is_symlink() or not parent.is_dir():
            raise RuntimeError('unsafe_key_parent')
        info = parent.stat()
        if info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError('unsafe_key_parent')
    fd = os.open(KEY, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        os.fchown(stream.fileno(), 0, 0)
        os.fchmod(stream.fileno(), 0o600)
        stream.write(key)
        stream.flush()
        os.fsync(stream.fileno())
    directory = os.open(KEY.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def main():
    if sys.platform != 'linux' or os.geteuid() != 0 or sys.argv[1:] != ['--enroll-first-confirmed']:
        sys.exit('Linux, sudo si --enroll-first-confirmed necesare.')
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        sys.exit('Inrolarea necesita terminal interactiv, fara redirectare in fisier.')
    stage = 'preflight (fara scrieri)'
    try:
        if KEY.exists() or KEY.is_symlink():
            raise RuntimeError('operator_key_exists_stop')
        helper = Path(__file__).resolve().parents[2] / 'server/demo-platform/enrollment-material.js'
        if not helper.is_file():
            raise RuntimeError('enrollment_helper_missing')
        admin = getpass.getpass('Parola SA actuala: ')
        markers = sql(admin, """SET NOCOUNT ON;
IF COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1 THROW 51700,'admin_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='003_operator_security_v1') THROW 51700,'security_migration_required',1;
IF EXISTS(SELECT 1 FROM operator_security.accounts) THROW 51702,'first_operator_already_exists',1;
SELECT N'PREFLIGHT_OK';""")
        if 'PREFLIGHT_OK' not in markers:
            raise RuntimeError('enrollment_sql_unconfirmed')
        username = input('Nume operator (litere mici/cifre/_.-, maximum 64): ')
        if not re.fullmatch(r'[a-z0-9_.-]{1,64}', username):
            raise RuntimeError('operator_username_invalid')
        password = getpass.getpass('Parola NOUA operator (minimum 16 caractere): ')
        again = getpass.getpass('Repeta parola operator: ')
        if password != again or password == admin or len(password) < 16 or len(password.encode('utf-8')) > 1024 or any(ord(c) < 32 or ord(c) == 127 for c in password):
            raise RuntimeError('operator_password_invalid')
        key = secrets.token_bytes(32)
        secret = base64.b32encode(secrets.token_bytes(20)).decode('ascii')
        material = subprocess.run(['/usr/local/bin/node', str(helper)],
            input=json.dumps({'id': str(uuid.uuid4()), 'username': username, 'password': password,
                              'totpSecret': secret, 'keyHex': key.hex()}),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=20,
            env={'PATH': '/usr/local/bin:/usr/bin:/bin'})
        if material.returncode != 0:
            raise RuntimeError('enrollment_material_failed')
        record = json.loads(material.stdout)
        del password, again
        print('ATENTIE: urmatoarea cheie este SECRET TOTP. Nu trimite captura sau transcript!')
        if input('Scrie AFISEAZA pentru configurarea privata a Authenticatorului: ') != 'AFISEAZA':
            raise RuntimeError('totp_display_cancelled_no_writes')
        print('Authenticator: adaugare manuala, nume InfraFlow Operator, Time based, 6 cifre, 30 secunde.')
        print('Cheie secreta TOTP: ' + secret)
        counter = None
        for _ in range(3):
            code = getpass.getpass('Codul de 6 cifre din Authenticator: ')
            counter = accepted_counter(secret, code, time.time())
            if counter is not None:
                break
            print('Cod neconfirmat. Verifica ora telefonului si cheia introdusa.')
        if counter is None:
            raise RuntimeError('totp_confirmation_failed_no_writes')
        del secret, code
        stage = 'salvare cheie protejata'
        write_new_key(key)
        del key
        stage = 'inrolare SQL atomica'
        if 'OPERATOR_ENROLLED' not in sql(admin, creation_sql(record, counter)):
            raise RuntimeError('enrollment_sql_unconfirmed')
        print('OPERATOR_ENROLLED\nCheie root:root 0600. Codul TOTP de confirmare este consumat.')
        print('Loginul web nu este expus. Niciun restart si nicio companie creata.')
    except (RuntimeError, ValueError, OSError, subprocess.SubprocessError) as error:
        codes = {'operator_key_exists_stop','enrollment_helper_missing','operator_username_invalid','operator_password_invalid',
                 'enrollment_material_failed','totp_confirmation_failed_no_writes','enrollment_sql_unconfirmed',
                 'unsafe_key_parent','invalid_key','totp_display_cancelled_no_writes'}
        safe = str(error) if type(error) is RuntimeError and str(error) in codes else 'enrollment_step_failed'
        print('Etapa: ' + stage + '\nCod diagnostic: ' + safe)
        print('Nu relua daca cheia a fost creata. Necesita verificare; fara stergere automata.')
        sys.exit(1)


if __name__ == '__main__':
    main()
