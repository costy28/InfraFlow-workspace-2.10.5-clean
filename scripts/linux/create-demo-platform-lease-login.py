#!/usr/bin/env python3
"""Explicit fixed lease login setup; no jobs, credentials files or service changes."""
import getpass
import os
from pathlib import Path
import subprocess
import sys

DB = 'INFRAFLOW_DEMO_PLATFORM'
LOGIN = 'infraflow_demo_lease'
SQLCMD = '/opt/mssql-tools18/bin/sqlcmd'


def literal(value):
    return "N'" + value.replace("'", "''") + "'"


def preflight_sql():
    return f"""SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'{DB}' THROW 52501,'wrong_database',1;
IF COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1 THROW 52501,'admin_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='007_provision_leases_v1')
 OR OBJECT_ID(N'platform.provision_lease_command',N'P') IS NULL THROW 52501,'lease_migration_required',1;
IF SUSER_ID(N'{LOGIN}') IS NOT NULL OR USER_ID(N'{LOGIN}') IS NOT NULL THROW 52502,'lease_identity_exists_stop',1;
SELECT N'LEASE_LOGIN_PREFLIGHT_OK';"""


def creation_sql(password):
    scope = Path(__file__).with_name('restrict-demo-platform-lease.sql').read_text(encoding='utf-8')
    return f"""SET NOCOUNT ON;SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'{DB}' THROW 52501,'wrong_database',1;
 IF SUSER_ID(N'{LOGIN}') IS NOT NULL OR USER_ID(N'{LOGIN}') IS NOT NULL THROW 52502,'lease_identity_exists_stop',1;
 CREATE LOGIN [{LOGIN}] WITH PASSWORD={literal(password)},DEFAULT_DATABASE=[{DB}],CHECK_POLICY=ON;
 CREATE USER [{LOGIN}] FOR LOGIN [{LOGIN}];GRANT CONNECT TO [{LOGIN}];
 {scope}
 COMMIT;SELECT N'LEASE_LOGIN_CREATED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;"""


def verification_sql():
    return f"""SET NOCOUNT ON;
IF DB_NAME()<>N'{DB}' OR ORIGINAL_LOGIN()<>N'{LOGIN}' OR USER_NAME()<>N'{LOGIN}'
 OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>0 THROW 52503,'identity_invalid',1;
IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,'SERVER') WHERE permission_name NOT IN('CONNECT SQL','VIEW ANY DATABASE'))
 OR EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,'DATABASE') WHERE permission_name NOT IN('CONNECT','VIEW ANY COLUMN ENCRYPTION KEY DEFINITION','VIEW ANY COLUMN MASTER KEY DEFINITION'))
 OR COALESCE(HAS_DBACCESS(N'INFRAFLOW_DEMO'),1)<>0 THROW 52503,'scope_invalid',1;
IF COALESCE(HAS_PERMS_BY_NAME('platform.provision_lease_command','OBJECT','EXECUTE'),0)<>1
 OR COALESCE(HAS_PERMS_BY_NAME('platform.request_provision_job','OBJECT','EXECUTE'),1)<>0
 OR COALESCE(HAS_PERMS_BY_NAME('platform.activate_trial','OBJECT','EXECUTE'),1)<>0
 OR COALESCE(HAS_PERMS_BY_NAME('operator_security.read_account','OBJECT','EXECUTE'),1)<>0
 OR COALESCE(HAS_PERMS_BY_NAME('platform.provision_jobs','OBJECT','SELECT'),1)<>0
 OR COALESCE(HAS_PERMS_BY_NAME('platform.provision_jobs','OBJECT','UPDATE'),1)<>0
 OR COALESCE(HAS_PERMS_BY_NAME('operator_security.accounts','OBJECT','SELECT'),1)<>0 THROW 52503,'scope_invalid',1;
SELECT N'LEASE_LOGIN_VERIFIED';"""


def query(password, sql, user='sa'):
    if user not in ('sa', LOGIN):
        raise ValueError('identity_invalid')
    return subprocess.run([SQLCMD, '-S', 'tcp:127.0.0.1,1433', '-U', user, '-d', DB,
                           '-C', '-l', '5', '-t', '30', '-b', '-x', '-h', '-1', '-y', '4096', '-f', '65001'],
                          input=sql+'\nGO\n', text=True, encoding='utf-8', timeout=40,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          env={'PATH': '/usr/local/bin:/usr/bin:/bin', 'LANG': 'C.UTF-8', 'SQLCMDPASSWORD': password})


def require(password, sql, marker, user='sa'):
    result = query(password, sql, user)
    if result.returncode != 0 or marker not in result.stdout.split():
        raise RuntimeError('sql_step_not_confirmed')


def main():
    if sys.platform != 'linux' or sys.argv[1:] != ['--create-confirmed'] or not sys.stdin.isatty():
        sys.exit('Linux, terminal interactiv si --create-confirmed necesare. Nimic modificat.')
    stage = 'preflight fara scrieri'
    try:
        if not os.path.isfile(SQLCMD):
            raise RuntimeError('sqlcmd_missing')
        # Load required scope file before any possible write.
        Path(__file__).with_name('restrict-demo-platform-lease.sql').read_text(encoding='utf-8')
        admin = getpass.getpass('Parola SA actuala: ')
        require(admin, preflight_sql(), 'LEASE_LOGIN_PREFLIGHT_OK')
        stage = 'confirmare parola noua fara scrieri'
        password = getpass.getpass('Parola NOUA SQL infraflow_demo_lease (16-128 ASCII): ')
        again = getpass.getpass('Repeta parola SQL lease: ')
        if password != again or not 16 <= len(password) <= 128 or not all(32 <= ord(c) <= 126 for c in password):
            raise RuntimeError('password_format_invalid')
        if password == admin:
            raise RuntimeError('password_must_be_distinct')
        sql = creation_sql(password)
        print('Salveaza parola SQL lease separat. Nu o trimite in chat.')
        stage = 'creare atomica login user si drepturi'
        require(admin, sql, 'LEASE_LOGIN_CREATED')
        stage = 'verificare login dedicat numai metadate'
        require(password, verification_sql(), 'LEASE_LOGIN_VERIFIED', LOGIN)
        print('LEASE_LOGIN_VERIFIED\nNiciun job preluat. Nicio credentiala instalata. Niciun restart.')
    except (RuntimeError, ValueError, OSError, subprocess.SubprocessError) as error:
        allowed = {'sqlcmd_missing', 'sql_step_not_confirmed', 'password_format_invalid', 'password_must_be_distinct'}
        code = str(error) if type(error) is RuntimeError and str(error) in allowed else 'operation_failed'
        print('Oprit la etapa: '+stage+'\nCod diagnostic: '+code)
        print('Nu relua automat. Verifica resursele posibil create; fara stergere automata.')
        sys.exit(1)


if __name__ == '__main__':
    main()
