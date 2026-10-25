#!/usr/bin/env python3
"""Explicit local SQL bootstrap. No ERP env, no secret files, no automatic DROP."""
import getpass
import os
import subprocess
import sys

DATABASE = 'INFRAFLOW_DEMO_PLATFORM'
LOGIN = 'infraflow_demo_platform'
SQLCMD = '/opt/mssql-tools18/bin/sqlcmd'


def literal(value):
    return "N'" + value.replace("'", "''") + "'"


def valid_password(value):
    return (16 <= len(value) <= 128 and value.isascii()
            and all(32 <= ord(c) < 127 for c in value))


def query(password, sql, database='master', user='sa'):
    if database not in ('master', DATABASE) or user not in ('sa', LOGIN):
        raise ValueError('invalid_target')
    env = {'PATH': '/usr/local/bin:/usr/bin:/bin', 'LANG': 'C.UTF-8',
           'SQLCMDPASSWORD': password}
    return subprocess.run(
        [SQLCMD, '-S', 'tcp:127.0.0.1,1433', '-U', user, '-d', database,
         '-C', '-l', '5', '-t', '30', '-b', '-x', '-h', '-1', '-W',
         '-f', '65001'],
        input=sql + '\nGO\n', text=True, encoding='utf-8',
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, timeout=40)


def require(password, sql, marker, **kwargs):
    result = query(password, sql, **kwargs)
    if result.returncode != 0 or marker not in result.stdout.split():
        raise RuntimeError('sql_step_not_confirmed')


def main():
    if sys.platform != 'linux' or sys.argv[1:] != ['--create-confirmed']:
        sys.exit('Linux si --create-confirmed necesare. Nimic modificat.')
    if not os.path.isfile(SQLCMD):
        sys.exit('sqlcmd lipseste. Nimic modificat.')
    stage = 'autentificare/preflight'
    try:
        admin = getpass.getpass('Parola SA actuala: ')
        require(admin, f"""SET NOCOUNT ON;
IF COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1 THROW 51000,'admin_required',1;
IF DB_ID(N'{DATABASE}') IS NOT NULL OR SUSER_ID(N'{LOGIN}') IS NOT NULL
 THROW 51001,'resources_exist_stop',1;
SELECT N'PREFLIGHT_OK';""", 'PREFLIGHT_OK')
        password = getpass.getpass('Parola NOUA pentru loginul platformei (16-128 caractere ASCII): ')
        again = getpass.getpass('Repeta parola platformei: ')
        if password != again or password == admin or not valid_password(password):
            sys.exit('Parola invalida/diferita sau identica cu SA. Nimic modificat.')
        print('Pastreaza parola platformei in managerul de parole. Nu o trimite in chat.')
        stage = 'creare baza'
        require(admin, f"CREATE DATABASE [{DATABASE}]; SELECT N'DATABASE_OK';", 'DATABASE_OK')
        stage = 'creare login'
        require(admin, f"""CREATE LOGIN [{LOGIN}] WITH PASSWORD={literal(password)},
DEFAULT_DATABASE=[{DATABASE}], CHECK_POLICY=ON;
SELECT N'LOGIN_OK';""", 'LOGIN_OK')
        stage = 'schema si drepturi'
        require(admin, f"""SET NOCOUNT ON; SET XACT_ABORT ON;
BEGIN TRANSACTION;
EXEC(N'CREATE SCHEMA platform AUTHORIZATION dbo');
CREATE ROLE platform_reader AUTHORIZATION dbo;
CREATE USER [{LOGIN}] FOR LOGIN [{LOGIN}];
GRANT CONNECT TO [{LOGIN}];
GRANT SELECT ON SCHEMA::platform TO platform_reader;
ALTER ROLE platform_reader ADD MEMBER [{LOGIN}];
CREATE TABLE platform.bootstrap(singleton bit NOT NULL PRIMARY KEY CHECK(singleton=1),
 format varchar(64) NOT NULL);
INSERT platform.bootstrap VALUES(1,'infraflow-platform-bootstrap-v1');
COMMIT;
SELECT N'SCHEMA_OK';""", 'SCHEMA_OK', database=DATABASE)
        stage = 'verificare login dedicat'
        require(password, f"""SET NOCOUNT ON;
IF ORIGINAL_LOGIN()<>N'{LOGIN}' THROW 51002,'wrong_identity',1;
IF COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>0 OR EXISTS(
 SELECT 1 FROM sys.fn_my_permissions(NULL,'SERVER')
 WHERE permission_name NOT IN ('CONNECT SQL','VIEW ANY DATABASE'))
 THROW 51003,'server_privileges',1;
IF COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL'),-1)<>0
 OR COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CREATE TABLE'),-1)<>0
 THROW 51004,'database_privileges',1;
IF COALESCE(HAS_PERMS_BY_NAME('platform.bootstrap','OBJECT','INSERT'),-1)<>0
 THROW 51005,'write_privileges',1;
IF HAS_DBACCESS(N'INFRAFLOW_DEMO')=1 THROW 51006,'erp_database_access',1;
IF NOT EXISTS(SELECT 1 FROM platform.bootstrap WHERE singleton=1
 AND format='infraflow-platform-bootstrap-v1') THROW 51007,'read_failed',1;
SELECT N'READER_OK';""", 'READER_OK', database=DATABASE, user=LOGIN)
        print('Baza separata: OK\nLogin dedicat, citire bootstrap: OK\nVerificari drepturi: OK')
        print('Serviciul nu este conectat inca la SQL. Niciun restart executat.')
    except (subprocess.SubprocessError, RuntimeError, OSError):
        print('Oprit la etapa: ' + stage)
        print('Nu relua scriptul. Pot exista resurse partial create; necesita verificare.')
        sys.exit(1)


if __name__ == '__main__':
    main()
