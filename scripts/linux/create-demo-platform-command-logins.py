#!/usr/bin/env python3
"""Explicit provision of two procedure-only SQL identities; no trial operations."""
import getpass
import os
import subprocess
import sys

DB = 'INFRAFLOW_DEMO_PLATFORM'
SQLCMD = '/opt/mssql-tools18/bin/sqlcmd'
LOGINS = ('infraflow_demo_registrar', 'infraflow_demo_activator')


def literal(value):
    return "N'" + value.replace("'", "''") + "'"


def query(password, sql, user='sa'):
    if user not in ('sa', *LOGINS):
        raise ValueError('invalid_identity')
    return subprocess.run(
        [SQLCMD, '-S', 'tcp:127.0.0.1,1433', '-U', user, '-d', DB,
         '-C', '-l', '5', '-t', '30', '-b', '-x', '-h', '-1', '-W', '-f', '65001'],
        input=sql + '\nGO\n', text=True, encoding='utf-8',
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=40,
        env={'PATH': '/usr/local/bin:/usr/bin:/bin', 'LANG': 'C.UTF-8', 'SQLCMDPASSWORD': password})


def require(password, sql, marker, user='sa'):
    result = query(password, sql, user)
    if result.returncode != 0 or marker not in result.stdout.split():
        raise RuntimeError('sql_step_not_confirmed')


def read_new_password(label, forbidden):
    value = getpass.getpass('Parola NOUA ' + label + ': ')
    again = getpass.getpass('Repeta parola ' + label + ': ')
    if value != again:
        raise RuntimeError('password_mismatch')
    if not 16 <= len(value) <= 128 or not all(32 <= ord(c) < 127 for c in value):
        raise RuntimeError('password_format_invalid')
    if value in forbidden:
        raise RuntimeError('password_must_be_distinct')
    return value


def creation_sql(passwords):
    parts = ['SET NOCOUNT ON; SET XACT_ABORT ON; BEGIN TRY BEGIN TRANSACTION;']
    for i, login in enumerate(LOGINS):
        own, other = ('queue_trial', 'activate_trial') if i == 0 else ('activate_trial', 'queue_trial')
        parts.append(f"""IF SUSER_ID(N'{login}') IS NOT NULL OR USER_ID(N'{login}') IS NOT NULL
 THROW 51501,'identity_exists_stop',1;
CREATE LOGIN [{login}] WITH PASSWORD={literal(passwords[i])},DEFAULT_DATABASE=[{DB}],CHECK_POLICY=ON;
CREATE USER [{login}] FOR LOGIN [{login}];
GRANT CONNECT TO [{login}];
GRANT EXECUTE ON OBJECT::platform.{own} TO [{login}];
DENY EXECUTE ON OBJECT::platform.{other} TO [{login}];
DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::platform TO [{login}];""")
    parts.append("COMMIT; SELECT N'IDENTITIES_CREATED'; END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK; THROW; END CATCH;")
    return '\n'.join(parts)


def verification_sql(i):
    own, other = ('queue_trial', 'activate_trial') if i == 0 else ('activate_trial', 'queue_trial')
    # Wrong procedure supplied NULLs: even a mistaken grant could not create a trial.
    negative_call = 'EXEC platform.activate_trial NULL,NULL,NULL;' if i == 0 else 'EXEC platform.queue_trial NULL,NULL,NULL;'
    return f"""SET NOCOUNT ON;
IF ORIGINAL_LOGIN()<>N'{LOGINS[i]}' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>0
 THROW 51502,'wrong_identity_or_role',1;
IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,'SERVER') WHERE permission_name NOT IN ('CONNECT SQL','VIEW ANY DATABASE'))
 THROW 51503,'unexpected_server_right',1;
IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,'DATABASE')
 WHERE permission_name NOT IN ('CONNECT','VIEW ANY COLUMN MASTER KEY DEFINITION','VIEW ANY COLUMN ENCRYPTION KEY DEFINITION'))
 THROW 51504,'unexpected_database_right',1;
IF COALESCE(HAS_PERMS_BY_NAME('platform.{own}','OBJECT','EXECUTE'),0)<>1
 THROW 51505,'own_procedure_not_granted',1;
IF HAS_DBACCESS(N'INFRAFLOW_DEMO')=1 THROW 51506,'erp_access',1;
BEGIN TRY
 {negative_call}
 THROW 51507,'opposite_procedure_not_denied',1;
END TRY
BEGIN CATCH
 IF ERROR_NUMBER()<>229 THROW;
END CATCH;
SELECT N'IDENTITY_VERIFIED';"""


def main():
    if sys.platform != 'linux' or sys.argv[1:] != ['--create-confirmed']:
        sys.exit('Linux si --create-confirmed necesare. Nimic modificat.')
    stage = 'preflight'
    try:
        if not os.path.isfile(SQLCMD):
            raise RuntimeError('sqlcmd_missing')
        admin = getpass.getpass('Parola SA actuala: ')
        preflight = """SET NOCOUNT ON;
IF COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1 THROW 51500,'admin_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='002_trial_commands_v1')
 THROW 51500,'commands_migration_required',1;"""
        for login in LOGINS:
            preflight += f"IF SUSER_ID(N'{login}') IS NOT NULL OR USER_ID(N'{login}') IS NOT NULL THROW 51501,'identity_exists_stop',1;\n"
        require(admin, preflight + "SELECT N'PREFLIGHT_OK';", 'PREFLIGHT_OK')
        stage = 'parole noi (fara scrieri)'
        registrar = read_new_password(LOGINS[0], (admin,))
        activator = read_new_password(LOGINS[1], (admin, registrar))
        print('Salveaza ambele parole separat. Nu le trimite in chat.')
        stage = 'creare identitati si granturi'
        require(admin, creation_sql((registrar, activator)), 'IDENTITIES_CREATED')
        stage = 'verificare registrar'
        require(registrar, verification_sql(0), 'IDENTITY_VERIFIED', LOGINS[0])
        stage = 'verificare activator'
        require(activator, verification_sql(1), 'IDENTITY_VERIFIED', LOGINS[1])
        print('REGISTRAR_OK\nACTIVATOR_OK\nNicio companie creata sau activata. Niciun restart.')
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        codes = {'password_mismatch', 'password_format_invalid', 'password_must_be_distinct', 'sqlcmd_missing', 'sql_step_not_confirmed'}
        code = str(error) if type(error) is RuntimeError and str(error) in codes else 'operation_failed'
        print('Oprit la etapa: ' + stage + '\nCod diagnostic: ' + code)
        print('Nu relua scriptul; identitatile pot exista. Necesita verificare, fara stergere automata.')
        sys.exit(1)


if __name__ == '__main__':
    main()
