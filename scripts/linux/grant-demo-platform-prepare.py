#!/usr/bin/env python3
"""Explicit root/SA administrative grant; no runtime restart, TOTP use or jobs."""
import getpass
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

SQLCMD = '/opt/mssql-tools18/bin/sqlcmd'
NODE = '/usr/local/bin/node'
ID_FILE = '/etc/infraflow-demo-platform/operator-id'
DB = 'INFRAFLOW_DEMO_PLATFORM'


def literal(value):
    return "N'"+value.replace("'", "''")+"'"


def read_id():
    fd = os.open(ID_FILE, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        s = os.fstat(stream.fileno())
        if not stat.S_ISREG(s.st_mode) or s.st_uid != 0 or s.st_gid != 0 or stat.S_IMODE(s.st_mode) != 0o600 or s.st_nlink != 1 or s.st_size != 36:
            raise RuntimeError('operator_id_invalid')
        value = stream.read(37).decode('ascii')
    if not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', value):
        raise RuntimeError('operator_id_invalid')
    return value


def query(password, sql):
    result = subprocess.run([SQLCMD, '-S', 'tcp:127.0.0.1,1433', '-U', 'sa', '-d', DB,
                             '-C', '-l', '5', '-t', '30', '-b', '-x', '-h', '-1', '-y', '4096', '-w', '65535', '-f', '65001'],
                            input=sql+'\nGO\n', text=True, encoding='utf-8', timeout=40,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            env={'PATH': '/usr/local/bin:/usr/bin:/bin', 'LANG': 'C.UTF-8', 'SQLCMDPASSWORD': password})
    if result.returncode:
        raise RuntimeError('sql_result_unconfirmed')
    return result.stdout.strip()


def record_sql(operator_id):
    return f"""SET NOCOUNT ON;
IF DB_NAME()<>N'{DB}' OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),0)<>1 THROW 52801,'admin_required',1;
IF NOT EXISTS(SELECT 1 FROM platform.schema_migrations WHERE migration_id='009_operator_prepare_change_v1') THROW 52801,'scope_migration_required',1;
SELECT LOWER(CONVERT(char(36),operator_id)) id,enabled,revision,totp_envelope envelope,scopes_json scopesJson
FROM operator_security.accounts WHERE operator_id=CONVERT(uniqueidentifier,{literal(operator_id)})
FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;"""


def helper(mode, record):
    if mode not in ('prepare', 'verify'):
        raise RuntimeError('helper_failed')
    script = Path(__file__).resolve().parents[2]/'server/demo-platform/operator-prepare-admin.js'
    result = subprocess.run([NODE, str(script), mode], input=json.dumps(record), text=True,
                            encoding='utf-8', timeout=15, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode or len(result.stdout) > 8192:
        raise RuntimeError('helper_failed')
    return json.loads(result.stdout)


def validate_post(record, plan):
    if record.get('id') != plan['operatorId'] or record.get('enabled') is not True or record.get('revision') != plan['revision'] or record.get('envelope') != plan['envelope'] or record.get('scopesJson') != plan['scopesJson']:
        raise RuntimeError('postcheck_failed')


def main():
    if sys.platform != 'linux' or os.geteuid() != 0 or sys.argv[1:] != ['--grant-confirmed'] or not sys.stdin.isatty():
        sys.exit('Linux, sudo, terminal interactiv si --grant-confirmed necesare.')
    stage = 'citire identitate si verificare numai citire'
    try:
        operator_id = read_id()
        password = getpass.getpass('Parola SA actuala (nu operator/lease): ')
        record = json.loads(query(password, record_sql(operator_id)))
        if record.get('id') != operator_id:
            raise RuntimeError('operator_id_invalid')
        plan = helper('prepare', record)
        print('Operator UUID: '+operator_id+'; revizie '+str(record['revision'])+' -> '+str(plan['revision']))
        print('Se adauga numai trial:prepare. Sesiunile vechi vor fi refuzate. Authenticator ramane acelasi.')
        if input('Pentru aplicare tasteaza ACORD trial:prepare: ') != 'ACORD trial:prepare':
            print('Anulat. Nicio scriere.');return
        stage = 'aplicare atomica scope revision envelope si audit'
        payload = json.dumps(plan, separators=(',', ':'))
        output = query(password, 'SET NOCOUNT ON;EXEC operator_security.grant_prepare_scope @json='+literal(payload)+';')
        if output.split() != ['OPERATOR_PREPARE_SCOPE_APPLIED']:
            raise RuntimeError('sql_result_unconfirmed')
        stage = 'verificare dupa commit'
        current = json.loads(query(password, record_sql(operator_id)))
        validate_post(current, plan)
        if helper('verify', current) != {'verified': True}:
            raise RuntimeError('postcheck_failed')
        print('OPERATOR_PREPARE_SCOPE_VERIFIED\nNO_RESTART_NO_JOB_CREATED\nReautentificare necesara dupa instalarea runtime-ului compatibil.')
    except (RuntimeError, ValueError, KeyError, OSError, subprocess.SubprocessError) as error:
        allowed = {'operator_id_invalid', 'sql_result_unconfirmed', 'helper_failed', 'postcheck_failed'}
        code = str(error) if type(error) is RuntimeError and str(error) in allowed else 'operation_failed'
        print('Oprit la etapa: '+stage+'\nCod diagnostic: '+code)
        print('Nu relua automat si nu modifica manual revizia/envelope. Verificare necesara, fara stergere automata.')
        sys.exit(1)


if __name__ == '__main__':
    main()
