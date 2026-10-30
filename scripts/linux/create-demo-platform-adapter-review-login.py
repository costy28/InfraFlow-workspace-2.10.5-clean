#!/usr/bin/env python3
"""Create only the fixed, execute-only adapter review SQL login; no credential file/restart."""
import getpass
import os
from pathlib import Path
import subprocess
import sys

DB='INFRAFLOW_DEMO_PLATFORM'
LOGIN='infraflow_demo_adapter_review'
SQLCMD='/opt/mssql-tools18/bin/sqlcmd'

def literal(value):return "N'"+value.replace("'","''")+"'"

def preflight_sql():
    return f"""SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'{DB}' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1 THROW 53501,'admin_platform_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='012_adapter_review_tickets_v1')
 OR OBJECT_ID(N'platform.read_adapter_resource_review',N'P') IS NULL OR OBJECT_ID(N'platform.adapter_review_ticket_command',N'P') IS NULL THROW 53501,'adapter_migrations_required',1;
IF SUSER_ID(N'{LOGIN}') IS NOT NULL OR USER_ID(N'{LOGIN}') IS NOT NULL THROW 53502,'adapter_identity_exists_stop',1;
SELECT N'ADAPTER_REVIEW_LOGIN_PREFLIGHT_OK';"""

def creation_sql(password):
    scope=Path(__file__).with_name('restrict-demo-platform-adapter-review.sql').read_text(encoding='utf-8')
    return f"""SET NOCOUNT ON;SET XACT_ABORT ON;
BEGIN TRY BEGIN TRANSACTION;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'{DB}' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>1 THROW 53501,'admin_platform_required',1;
IF SUSER_ID(N'{LOGIN}') IS NOT NULL OR USER_ID(N'{LOGIN}') IS NOT NULL THROW 53502,'adapter_identity_exists_stop',1;
CREATE LOGIN [{LOGIN}] WITH PASSWORD={literal(password)},DEFAULT_DATABASE=[{DB}],CHECK_POLICY=ON;
CREATE USER [{LOGIN}] FOR LOGIN [{LOGIN}];GRANT CONNECT TO [{LOGIN}];
{scope}
COMMIT;SELECT N'ADAPTER_REVIEW_LOGIN_CREATED';
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;"""

def verification_sql():
    return f"""SET NOCOUNT ON;
IF DB_NAME()<>N'{DB}' OR ORIGINAL_LOGIN()<>N'{LOGIN}' OR USER_NAME()<>N'{LOGIN}' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),-1)<>0 THROW 53503,'adapter_identity_invalid',1;
IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,'SERVER') WHERE permission_name NOT IN('CONNECT SQL','VIEW ANY DATABASE'))
 OR EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,'DATABASE') WHERE permission_name NOT IN('CONNECT','VIEW ANY COLUMN ENCRYPTION KEY DEFINITION','VIEW ANY COLUMN MASTER KEY DEFINITION'))
 OR COALESCE(HAS_DBACCESS(N'INFRAFLOW_DEMO'),1)<>0 THROW 53503,'adapter_scope_invalid',1;
IF COALESCE(HAS_PERMS_BY_NAME('platform.read_adapter_resource_review','OBJECT','EXECUTE'),0)<>1
 OR COALESCE(HAS_PERMS_BY_NAME('platform.adapter_review_ticket_command','OBJECT','EXECUTE'),0)<>1
 OR EXISTS(SELECT 1 FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
 CROSS APPLY sys.fn_my_permissions(QUOTENAME(s.name)+'.'+QUOTENAME(o.name),'OBJECT') p
 WHERE s.name IN('platform','operator_security')
 AND p.permission_name IN('SELECT','INSERT','UPDATE','DELETE','EXECUTE','ALTER','CONTROL','TAKE OWNERSHIP','REFERENCES','VIEW DEFINITION')
 AND NOT(s.name='platform' AND o.name IN('read_adapter_resource_review','adapter_review_ticket_command') AND p.permission_name='EXECUTE')) THROW 53503,'adapter_scope_invalid',1;
SELECT N'ADAPTER_REVIEW_LOGIN_VERIFIED';"""

def validate_password(password,again,admin):
    if password!=again or not 16<=len(password)<=128 or not all(32<=ord(c)<=126 for c in password):
        raise RuntimeError('password_format_invalid')
    if password==admin:raise RuntimeError('password_must_be_distinct')

def query(password,sql,user='sa'):
    if user not in ('sa',LOGIN):raise ValueError()
    return subprocess.run([SQLCMD,'-S','tcp:127.0.0.1,1433','-U',user,'-d',DB,'-C','-l','5','-t','30','-b','-x','-h','-1','-y','4096','-f','65001'],
                          input=sql+'\nGO\n',text=True,encoding='utf-8',timeout=40,capture_output=True,
                          env={'PATH':'/usr/local/bin:/usr/bin:/bin','LANG':'C.UTF-8','SQLCMDPASSWORD':password})

def require(password,sql,marker,user='sa'):
    r=query(password,sql,user)
    if r.returncode or marker not in r.stdout.split():raise RuntimeError('sql_step_not_confirmed')

def main():
    if sys.platform!='linux' or sys.argv[1:]!=['--create-confirmed'] or not sys.stdin.isatty():
        sys.exit('LINUX_INTERACTIVE_TERMINAL_AND_CONFIRMATION_REQUIRED')
    stage='preflight fara scrieri'
    try:
        if not os.path.isfile(SQLCMD):raise RuntimeError('sqlcmd_missing')
        Path(__file__).with_name('restrict-demo-platform-adapter-review.sql').read_text(encoding='utf-8')
        admin=getpass.getpass('Parola SA actuala: ')
        require(admin,preflight_sql(),'ADAPTER_REVIEW_LOGIN_PREFLIGHT_OK')
        stage='parola noua fara scrieri'
        password=getpass.getpass('Parola NOUA SQL infraflow_demo_adapter_review (16-128 ASCII): ')
        again=getpass.getpass('Repeta parola SQL adaptor: ')
        validate_password(password,again,admin)
        print('Salveaza parola SQL adaptor separat. Nu reutiliza parola worker/operator/SA.')
        stage='creare atomica login user si drepturi'
        require(admin,creation_sql(password),'ADAPTER_REVIEW_LOGIN_CREATED')
        stage='verificare autentificare si metadate'
        require(password,verification_sql(),'ADAPTER_REVIEW_LOGIN_VERIFIED',LOGIN)
        print('ADAPTER_REVIEW_LOGIN_VERIFIED\nNO_JOB_NO_TICKET_NO_RESTART\nNicio credentiala instalata.')
    except (RuntimeError,ValueError,OSError,subprocess.SubprocessError) as error:
        allowed={'sqlcmd_missing','sql_step_not_confirmed','password_format_invalid','password_must_be_distinct'}
        code=str(error) if type(error) is RuntimeError and str(error) in allowed else 'operation_failed'
        print('Oprit la etapa: '+stage+'\nCod diagnostic: '+code)
        print('Nu relua automat. Verifica loginul posibil creat; fara stergere automata.')
        sys.exit(1)

if __name__=='__main__':main()
