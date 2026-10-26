#!/usr/bin/env python3
"""Create fixed execute-only auth identity. Does not log in the human operator."""
import getpass
import os
import subprocess
import sys
import uuid

DB = 'INFRAFLOW_DEMO_PLATFORM'
LOGIN = 'infraflow_demo_auth'
SQLCMD = '/opt/mssql-tools18/bin/sqlcmd'
PROCEDURES = ('read_account', 'reserve_attempt', 'claim_totp', 'append_audit')


def literal(value):
    return "N'" + value.replace("'", "''") + "'"


def query(password, sql, user='sa'):
    if user not in ('sa', LOGIN):
        raise ValueError('invalid_identity')
    return subprocess.run(
        [SQLCMD, '-S', 'tcp:127.0.0.1,1433', '-U', user, '-d', DB,
         '-C', '-l', '5', '-t', '30', '-b', '-x', '-h', '-1', '-y', '4096', '-w', '65535', '-f', '65001'],
        input=sql + '\nGO\n', text=True, encoding='utf-8', timeout=40,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env={'PATH':'/usr/local/bin:/usr/bin:/bin','LANG':'C.UTF-8','SQLCMDPASSWORD':password})


def require(password, sql, marker, user='sa'):
    result = query(password, sql, user)
    if result.returncode != 0 or marker not in result.stdout.split():
        raise RuntimeError('sql_step_not_confirmed')


def creation_sql(password):
    grants = '\n'.join(f'GRANT EXECUTE ON OBJECT::operator_security.{proc} TO [{LOGIN}];' for proc in PROCEDURES)
    return f"""SET NOCOUNT ON;SET XACT_ABORT ON;
BEGIN TRY BEGIN TRANSACTION;
IF SUSER_ID(N'{LOGIN}') IS NOT NULL OR USER_ID(N'{LOGIN}') IS NOT NULL THROW 51901,'auth_identity_exists_stop',1;
CREATE LOGIN [{LOGIN}] WITH PASSWORD={literal(password)},DEFAULT_DATABASE=[{DB}],CHECK_POLICY=ON;
CREATE USER [{LOGIN}] FOR LOGIN [{LOGIN}];GRANT CONNECT TO [{LOGIN}];
{grants}
DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::operator_security TO [{LOGIN}];
DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::platform TO [{LOGIN}];
DENY EXECUTE ON OBJECT::platform.queue_trial TO [{LOGIN}];
DENY EXECUTE ON OBJECT::platform.activate_trial TO [{LOGIN}];
COMMIT;SELECT N'AUTH_IDENTITY_CREATED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;"""


def verification_sql(operator_id):
    if str(uuid.UUID(operator_id)) != operator_id:
        raise ValueError('invalid_operator_id')
    checks = '\n'.join(f"IF COALESCE(HAS_PERMS_BY_NAME('operator_security.{proc}','OBJECT','EXECUTE'),0)<>1 THROW 51902,'procedure_not_granted',1;" for proc in PROCEDURES)
    negatives = []
    for statement in ('SELECT TOP(0) password_hash FROM operator_security.accounts;',
                      'UPDATE operator_security.accounts SET enabled=0 WHERE 1=0;',
                      'EXEC platform.queue_trial NULL,NULL,NULL;',
                      'EXEC platform.activate_trial NULL,NULL,NULL;'):
        negatives.append(f"BEGIN TRY {statement} THROW 51904,'unexpected_direct_access',1; END TRY BEGIN CATCH IF ERROR_NUMBER()<>229 THROW;END CATCH;")
    return f"""SET NOCOUNT ON;
IF ORIGINAL_LOGIN()<>N'{LOGIN}' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>0 THROW 51902,'identity_invalid',1;
IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,'SERVER') WHERE permission_name NOT IN ('CONNECT SQL','VIEW ANY DATABASE')) THROW 51902,'server_right',1;
IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,'DATABASE') WHERE permission_name NOT IN ('CONNECT','VIEW ANY COLUMN MASTER KEY DEFINITION','VIEW ANY COLUMN ENCRYPTION KEY DEFINITION')) THROW 51902,'database_right',1;
IF HAS_DBACCESS(N'INFRAFLOW_DEMO')=1 THROW 51902,'erp_access',1;
{checks}
{''.join(negatives)}
SELECT N'AUTH_RIGHTS_VERIFIED';"""


def verify_existing(password, operator_id):
    import json
    require(password, verification_sql(operator_id), 'AUTH_RIGHTS_VERIFIED', LOGIN)
    # FOR JSON cannot be captured through INSERT ... EXEC (SQL error 13602).
    # Capture the procedure output in memory only; never print the payload.
    payload = json.dumps({'id': operator_id}, separators=(',', ':'))
    result = query(password, 'SET NOCOUNT ON;EXEC operator_security.read_account ' + literal(payload) + ';', LOGIN)
    if result.returncode != 0:
        raise RuntimeError('sql_step_not_confirmed')
    try:
        record = json.loads(result.stdout.strip())
    except ValueError:
        raise RuntimeError('sql_step_not_confirmed') from None
    if record.get('id') != operator_id or record.get('enabled') is not True:
        raise RuntimeError('sql_step_not_confirmed')


def main():
    if sys.platform != 'linux' or sys.argv[1:] != ['--create-confirmed']:
        sys.exit('Linux si --create-confirmed necesare. Nimic modificat.')
    stage = 'preflight (fara scrieri)'
    try:
        if not os.path.isfile(SQLCMD):
            raise RuntimeError('sqlcmd_missing')
        admin = getpass.getpass('Parola SA actuala: ')
        preflight = f"""SET NOCOUNT ON;
IF COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1 THROW 51900,'admin_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='004_operator_procedures_v1') THROW 51900,'procedures_required',1;
IF SUSER_ID(N'{LOGIN}') IS NOT NULL OR USER_ID(N'{LOGIN}') IS NOT NULL THROW 51901,'auth_identity_exists_stop',1;
IF (SELECT COUNT(*) FROM operator_security.accounts WHERE enabled=1)<>1 THROW 51900,'one_active_operator_required',1;
SELECT LOWER(CONVERT(char(36),operator_id)) FROM operator_security.accounts WHERE enabled=1;"""
        result = query(admin, preflight)
        ids = result.stdout.split()
        if result.returncode != 0 or len(ids) != 1 or str(uuid.UUID(ids[0])) != ids[0]:
            raise RuntimeError('preflight_not_confirmed')
        operator_id = ids[0]
        stage = 'parola noua (fara scrieri)'
        password = getpass.getpass('Parola NOUA SQL infraflow_demo_auth (16-128 caractere ASCII): ')
        again = getpass.getpass('Repeta parola SQL auth: ')
        if password != again:
            raise RuntimeError('password_mismatch')
        if not 16 <= len(password) <= 128 or not all(32 <= ord(c) < 127 for c in password):
            raise RuntimeError('password_format_invalid')
        if password == admin:
            raise RuntimeError('password_must_be_distinct')
        print('Salveaza parola SQL auth separat. Nu reutiliza parola operatorului sau a altui login SQL.')
        stage = 'creare login si granturi'
        require(admin, creation_sql(password), 'AUTH_IDENTITY_CREATED')
        stage = 'verificare drepturi si citire prin procedura'
        verify_existing(password, operator_id)
        print('AUTH_LOGIN_VERIFIED\nContul operatorului si bugetul TOTP sunt nemodificate. Niciun restart.')
    except (RuntimeError, ValueError, OSError, subprocess.SubprocessError) as error:
        codes = {'sqlcmd_missing','preflight_not_confirmed','password_mismatch','password_format_invalid','password_must_be_distinct','sql_step_not_confirmed'}
        code = str(error) if type(error) is RuntimeError and str(error) in codes else 'operation_failed'
        print('Etapa: ' + stage + '\nCod diagnostic: ' + code)
        print('Nu relua automat: loginul poate exista. Necesita verificare, fara stergere automata.')
        sys.exit(1)


if __name__ == '__main__':
    main()
