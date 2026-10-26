import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('auth_login', Path(__file__).with_name('create-demo-platform-auth-login.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class Tests(unittest.TestCase):
    def test_only_four_execute_grants_with_explicit_denials(self):
        sql = m.creation_sql("test'password")
        self.assertEqual(sql.count('GRANT EXECUTE ON OBJECT::operator_security.'), 4)
        self.assertEqual(sql.count('DENY EXECUTE ON OBJECT::platform.'), 2)
        self.assertEqual(sql.count('DENY SELECT,INSERT,UPDATE,DELETE'), 2)
        self.assertIn("N'test''password'", sql)
        self.assertIn('ROLLBACK', sql)
        self.assertNotIn('db_owner', sql)

    def test_verification_is_non_mutating_to_accounts_and_totp(self):
        sql = m.verification_sql('11111111-1111-4111-8111-111111111111')
        self.assertNotIn('INSERT @result EXEC', sql)
        self.assertNotIn('EXEC operator_security.claim_totp', sql)
        self.assertNotIn('EXEC operator_security.reserve_attempt', sql)
        self.assertIn('WHERE 1=0', sql)
        self.assertIn('ERROR_NUMBER()<>229', sql)

    def test_json_procedure_captured_without_insert_exec_or_secret_output(self):
        from subprocess import CompletedProcess
        import json
        operator_id='11111111-1111-4111-8111-111111111111'
        with patch.object(m, 'query', side_effect=[
            CompletedProcess([],0,stdout='AUTH_RIGHTS_VERIFIED',stderr=''),
            CompletedProcess([],0,stdout=json.dumps({'id':operator_id,'enabled':True,'passwordHash':'private-test-value'}),stderr='')
        ]) as query:
            m.verify_existing('test', operator_id)
        self.assertNotIn('INSERT', query.call_args.args[1])

    def test_secret_not_in_argv_and_targets_fixed(self):
        with patch.object(m.subprocess, 'run') as run:
            m.query('private-test-value', 'SELECT 1;')
        args, opts = run.call_args
        self.assertNotIn('private-test-value', repr(args))
        self.assertEqual(opts['env']['SQLCMDPASSWORD'], 'private-test-value')
        self.assertEqual(args[0][args[0].index('-y')+1], '4096')
        self.assertNotIn('-W', args[0])
        with self.assertRaises(ValueError):
            m.query('x', 'SELECT 1;', 'infraflow')


if __name__ == '__main__':
    unittest.main()
