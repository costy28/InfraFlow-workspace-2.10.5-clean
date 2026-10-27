#!/usr/bin/env python3
"""Read-only verification of the existing restricted registrar login. No SA or trial calls."""
import getpass
import re
import subprocess
import sys

SQLCMD = '/opt/mssql-tools18/bin/sqlcmd'
LOGIN = 'infraflow_demo_registrar'
SQL = r"""SET NOCOUNT ON;
IF DB_NAME()<>N'INFRAFLOW_DEMO_PLATFORM' OR ORIGINAL_LOGIN()<>N'infraflow_demo_registrar'
 OR COALESCE(IS_SRVROLEMEMBER(N'sysadmin'),-1)<>0
 THROW 52101,'registrar_identity_invalid',1;
IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,N'SERVER') WHERE permission_name NOT IN (N'CONNECT SQL',N'VIEW ANY DATABASE'))
 OR NOT EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,N'SERVER') WHERE permission_name=N'CONNECT SQL')
 THROW 52102,'registrar_server_scope_invalid',1;
IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,N'DATABASE')
 WHERE permission_name NOT IN (N'CONNECT',N'VIEW ANY COLUMN MASTER KEY DEFINITION',N'VIEW ANY COLUMN ENCRYPTION KEY DEFINITION'))
 OR COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),N'DATABASE',N'CONTROL'),1)<>0
 OR COALESCE(HAS_DBACCESS(N'INFRAFLOW_DEMO'),1)<>0
 THROW 52103,'registrar_database_scope_invalid',1;
IF COALESCE(HAS_PERMS_BY_NAME(N'platform.queue_trial_by_operator',N'OBJECT',N'EXECUTE'),0)<>1
 OR COALESCE(HAS_PERMS_BY_NAME(N'platform.queue_trial',N'OBJECT',N'EXECUTE'),1)<>0
 OR COALESCE(HAS_PERMS_BY_NAME(N'platform.activate_trial',N'OBJECT',N'EXECUTE'),1)<>0
 THROW 52104,'registrar_procedure_scope_invalid',1;
IF EXISTS(SELECT 1 FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
 WHERE s.name IN (N'platform',N'operator_security') AND o.type IN ('P','PC')
 AND NOT(s.name=N'platform' AND o.name=N'queue_trial_by_operator')
 AND HAS_PERMS_BY_NAME(QUOTENAME(s.name)+N'.'+QUOTENAME(o.name),N'OBJECT',N'EXECUTE')=1)
 THROW 52104,'unexpected_executable_procedure',1;
IF EXISTS(SELECT 1 FROM (VALUES (N'platform.trials'),(N'platform.trial_commands'),
 (N'platform.trial_events'),(N'platform.operator_command_audit'),(N'operator_security.accounts'),(N'operator_security.audit')) objects(name)
 CROSS JOIN (VALUES(N'SELECT'),(N'INSERT'),(N'UPDATE'),(N'DELETE')) rights(permission)
 WHERE COALESCE(HAS_PERMS_BY_NAME(objects.name,N'OBJECT',rights.permission),1)<>0)
 THROW 52105,'registrar_direct_table_access',1;
SELECT N'REGISTRAR_LOGIN_SCOPE_VERIFIED';
"""

def verify(password):
    if not isinstance(password, str) or not re.fullmatch(r'[\x20-\x7e]{16,128}', password):
        raise ValueError('password_format_invalid')
    result = subprocess.run(
        [SQLCMD, '-S', 'tcp:127.0.0.1,1433', '-U', LOGIN, '-d', 'INFRAFLOW_DEMO_PLATFORM',
         '-C', '-l', '5', '-t', '15', '-b', '-x', '-h', '-1', '-W', '-f', '65001'],
        input=SQL+'\nGO\n', text=True, encoding='utf-8',
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=25,
        env={'PATH': '/usr/local/bin:/usr/bin:/bin', 'LANG': 'C.UTF-8', 'SQLCMDPASSWORD': password})
    if result.returncode != 0 or result.stdout.split() != ['REGISTRAR_LOGIN_SCOPE_VERIFIED']:
        raise RuntimeError('registrar_verification_failed')

def main():
    if sys.platform != 'linux' or sys.argv[1:] != ['--verify-existing']:
        sys.exit('Linux si --verify-existing necesare.')
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        sys.exit('Terminal interactiv necesar.')
    try:
        password = getpass.getpass('Parola SQL EXISTENTA infraflow_demo_registrar (NU SA/auth/infraop): ')
        verify(password)
        print('REGISTRAR_LOGIN_SCOPE_VERIFIED')
        print('Procedura auditata permisa; procedura veche, activarea si accesul direct refuzate prin drepturile efective.')
        print('Verificare doar metadate: nicio companie creata, niciun TOTP consumat, niciun restart.')
    except Exception:
        print('REGISTRAR_SCOPE_VERIFICATION_FAILED')
        print('Nu recrea loginul si nu modifica parola/granturile. Trimite doar acest rezultat.')
        sys.exit(1)

if __name__ == '__main__':
    main()
