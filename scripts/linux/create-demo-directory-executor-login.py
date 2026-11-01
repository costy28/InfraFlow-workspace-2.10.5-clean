#!/usr/bin/env python3
"""Fixed two-RPC directory SQL login. No files, OS accounts or restart."""
import getpass
import importlib.util
import os
from pathlib import Path
import subprocess
import sys

DB = 'INFRAFLOW_DEMO_PLATFORM'
LOGIN = 'infraflow_demo_directory_executor'
SQLCMD = '/opt/mssql-tools18/bin/sqlcmd'


def template():
    path = Path(__file__).with_name('create-demo-platform-adapter-review-login.py')
    spec = importlib.util.spec_from_file_location('directory_login_template', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def adapt(sql):
    for old, new in (
        ('infraflow_demo_adapter_review', LOGIN),
        ('read_adapter_resource_review', 'verify_tenant_directory_context'),
        ('adapter_review_ticket_command', 'record_tenant_directory_result'),
        ('012_adapter_review_tickets_v1', '021_tenant_directory_results_v1'),
        ('ADAPTER_REVIEW', 'DIRECTORY_EXECUTOR'),
    ):
        sql = sql.replace(old, new)
    return sql


def preflight_sql():
    return Path(__file__).with_name('preflight-demo-directory-executor-login.sql').read_text(encoding='utf-8')


def creation_sql(password):
    base = template()
    placeholder = 'Directory_Profile_Placeholder_50c122a9'
    sql = adapt(base.creation_sql(placeholder))
    marker = base.literal(placeholder)
    if sql.count(marker) != 1:
        raise RuntimeError('sql_template_requires_review')
    # Recheck the entire approved baseline inside the creation transaction.
    boundary = f'CREATE LOGIN [{LOGIN}]'
    if sql.count(boundary) != 1:
        raise RuntimeError('sql_template_requires_review')
    sql = sql.replace(boundary, preflight_sql() + '\n' + boundary, 1)
    return sql.replace(marker, base.literal(password))


def verification_sql():
    return adapt(template().verification_sql())


def query(password, sql, user='sa'):
    if user not in ('sa', LOGIN):
        raise ValueError('fixed_identity_required')
    return subprocess.run(
        [SQLCMD, '-S', 'tcp:127.0.0.1,1433', '-U', user, '-d', DB,
         '-C', '-l', '5', '-t', '30', '-b', '-x', '-h', '-1', '-y', '4096', '-f', '65001'],
        input=sql + '\nGO\n', text=True, encoding='utf-8', timeout=40,
        capture_output=True,
        env={'PATH': '/usr/local/bin:/usr/bin:/bin', 'LANG': 'C.UTF-8', 'SQLCMDPASSWORD': password})


def require(password, sql, marker, user='sa'):
    result = query(password, sql, user)
    if result.returncode or marker not in result.stdout.split():
        raise RuntimeError('sql_step_not_confirmed')


def main():
    if sys.platform != 'linux' or sys.argv[1:] != ['--create-confirmed'] or not sys.stdin.isatty():
        sys.exit('LINUX_INTERACTIVE_AND_CREATION_CONFIRMATION_REQUIRED')
    stage = 'preflight fara scrieri'
    try:
        if not os.path.isfile(SQLCMD):
            raise RuntimeError('sqlcmd_missing')
        admin = getpass.getpass('Parola SA actuala: ')
        require(admin, preflight_sql(), 'DIRECTORY_EXECUTOR_LOGIN_PREFLIGHT_OK')
        stage = 'parola noua fara scrieri'
        password = getpass.getpass('Parola NOUA SQL infraflow_demo_directory_executor (16-128 ASCII): ')
        again = getpass.getpass('Repeta parola SQL executor directoare: ')
        template().validate_password(password, again, admin)
        print('Salveaza parola separat. Nu reutiliza parola SA, operatorului sau altui login SQL.')
        stage = 'creare atomica login user si doua drepturi RPC'
        require(admin, creation_sql(password), 'DIRECTORY_EXECUTOR_LOGIN_CREATED')
        stage = 'autentificare si verificare drepturi efective'
        require(password, verification_sql(), 'DIRECTORY_EXECUTOR_LOGIN_VERIFIED', LOGIN)
        print('DIRECTORY_EXECUTOR_LOGIN_VERIFIED\nNO_DIRECTORY_NO_JOB_NO_RESTART\nNicio credentiala instalata.')
    except (RuntimeError, ValueError, OSError, subprocess.SubprocessError) as error:
        allowed = {'sqlcmd_missing', 'sql_step_not_confirmed', 'password_format_invalid', 'password_must_be_distinct', 'sql_template_requires_review'}
        code = str(error) if type(error) is RuntimeError and str(error) in allowed else 'operation_failed'
        print('Oprit la etapa: ' + stage + '\nCod diagnostic: ' + code)
        print('Nu relua automat: identitatea poate exista. Verificare necesara, fara stergere automata.')
        sys.exit(1)


if __name__ == '__main__':
    main()
