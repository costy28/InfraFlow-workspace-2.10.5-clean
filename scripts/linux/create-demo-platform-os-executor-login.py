#!/usr/bin/env python3
"""Fixed two-RPC SQL identity only. No OS user, credential file or service changes."""
import getpass
import importlib.util
import os
from pathlib import Path
import subprocess
import sys

DB='INFRAFLOW_DEMO_PLATFORM'
LOGIN='infraflow_demo_os_executor'
SQLCMD='/opt/mssql-tools18/bin/sqlcmd'

def template():
    file=Path(__file__).with_name('create-demo-platform-adapter-review-login.py')
    spec=importlib.util.spec_from_file_location('review_sql_template',file)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def adapt(sql):
    # Fixed profile substitution, never names supplied by CLI/browser/environment.
    for old,new in [('infraflow_demo_adapter_review',LOGIN),('read_adapter_resource_review','accept_os_identity_delegation'),
                    ('adapter_review_ticket_command','record_os_identity_result'),
                    ('012_adapter_review_tickets_v1','016_os_identity_results_v1'),('ADAPTER_REVIEW','OS_EXECUTOR')]:
        sql=sql.replace(old,new)
    return sql

def preflight_sql():return adapt(template().preflight_sql())
def creation_sql(password):
    base=template();placeholder='InfraFlow_Profile_Placeholder_91d57b2d'
    sql=adapt(base.creation_sql(placeholder))
    marker=base.literal(placeholder)
    if sql.count(marker)!=1:raise RuntimeError('sql_template_requires_review')
    return sql.replace(marker,base.literal(password))
def verification_sql():return adapt(template().verification_sql())
def scope_sql():return adapt(Path(__file__).with_name('restrict-demo-platform-adapter-review.sql').read_text(encoding='utf8'))

def query(password,sql,user='sa'):
    if user not in ('sa',LOGIN):raise ValueError()
    return subprocess.run([SQLCMD,'-S','tcp:127.0.0.1,1433','-U',user,'-d',DB,'-C','-l','5','-t','30','-b','-x','-h','-1','-y','4096','-f','65001'],
                          input=sql+'\nGO\n',text=True,encoding='utf8',timeout=40,capture_output=True,
                          env={'PATH':'/usr/local/bin:/usr/bin:/bin','LANG':'C.UTF-8','SQLCMDPASSWORD':password})

def require(password,sql,marker,user='sa'):
    r=query(password,sql,user)
    if r.returncode or marker not in r.stdout.split():raise RuntimeError('sql_step_not_confirmed')

def main():
    if sys.platform!='linux' or sys.argv[1:]!=['--create-confirmed'] or not sys.stdin.isatty():
        sys.exit('LINUX_INTERACTIVE_AND_CREATION_CONFIRMATION_REQUIRED')
    stage='preflight fara scrieri'
    try:
        if not os.path.isfile(SQLCMD):raise RuntimeError('sqlcmd_missing')
        admin=getpass.getpass('Parola SA actuala: ')
        require(admin,preflight_sql(),'OS_EXECUTOR_LOGIN_PREFLIGHT_OK')
        stage='parola noua fara scrieri'
        password=getpass.getpass('Parola NOUA SQL infraflow_demo_os_executor (16-128 ASCII): ')
        again=getpass.getpass('Repeta parola SQL executor: ')
        template().validate_password(password,again,admin)
        print('Salveaza parola SQL executor separat. Nu o trimite in chat si nu reutiliza alta parola.')
        stage='creare atomica login user si doua drepturi RPC'
        require(admin,creation_sql(password),'OS_EXECUTOR_LOGIN_CREATED')
        stage='autentificare nativa si verificare drepturi efective'
        require(password,verification_sql(),'OS_EXECUTOR_LOGIN_VERIFIED',LOGIN)
        print('OS_EXECUTOR_LOGIN_VERIFIED\nNO_OS_ACCOUNT_NO_JOB_NO_DELEGATION_NO_RESTART\nNicio credentiala instalata.')
    except (RuntimeError,ValueError,OSError,subprocess.SubprocessError) as error:
        allowed={'sqlcmd_missing','sql_step_not_confirmed','password_format_invalid','password_must_be_distinct'}
        code=str(error) if type(error) is RuntimeError and str(error) in allowed else 'operation_failed'
        print('Oprit la etapa: '+stage+'\nCod diagnostic: '+code)
        print('Nu relua automat: loginul poate exista. Necesita verificare, fara stergere automata.')
        sys.exit(1)

if __name__=='__main__':main()
