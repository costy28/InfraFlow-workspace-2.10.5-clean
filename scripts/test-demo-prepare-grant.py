"""Pure administrative installer tests: no root, SQL, keys or file writes."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('prepare_grant', Path(__file__).parent/'linux/grant-demo-platform-prepare.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class GrantTests(unittest.TestCase):
    def test_read_only_sql_and_exact_postcheck(self):
        sql = module.record_sql('11111111-1111-4111-8111-111111111111')
        self.assertIn('009_operator_prepare_change_v1', sql)
        self.assertNotIn('UPDATE ', sql)
        record = {'id': 'fixture', 'enabled': True, 'revision': 2, 'envelope': 'fixture-envelope', 'scopesJson': '["trial:prepare"]'}
        plan = {'operatorId': 'fixture', **{k: record[k] for k in ('revision', 'envelope', 'scopesJson')}}
        module.validate_post(record, plan)
        with self.assertRaises(RuntimeError):
            module.validate_post({**record, 'revision': 3}, plan)

    def test_transport_no_password_argv_and_no_raw_error_output(self):
        with patch.object(module.subprocess, 'run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = 'OK'
            self.assertEqual(module.query('fixture-private', 'SELECT 1;'), 'OK')
            args, kwargs = run.call_args
            self.assertNotIn('fixture-private', args[0])
            self.assertEqual(kwargs['env']['SQLCMDPASSWORD'], 'fixture-private')
            run.return_value.returncode = 1
            with self.assertRaisesRegex(RuntimeError, '^sql_result_unconfirmed$'):
                module.query('fixture-private', 'SELECT 1;')

    def test_cancel_before_mutation_and_postcommit_failure_never_retries(self):
        record = {'id': 'fixture-id', 'revision': 1}
        plan = {'revision': 2}
        for confirmation, expected_queries in [('no', 1), ('ACORD trial:prepare', 2)]:
            with patch.object(module.sys, 'platform', 'linux'), patch.object(module.sys, 'argv', ['script', '--grant-confirmed']), patch.object(module.os, 'geteuid', return_value=0, create=True), patch.object(module.sys.stdin, 'isatty', return_value=True), patch.object(module, 'read_id', return_value='fixture-id'), patch.object(module.getpass, 'getpass', return_value='fixture-private'), patch.object(module, 'helper', return_value=plan), patch.object(module, 'query') as query, patch('builtins.input', return_value=confirmation), patch('builtins.print'):
                query.side_effect = [json.dumps(record), RuntimeError('sql_result_unconfirmed')]
                if expected_queries == 2:
                    with self.assertRaises(SystemExit):
                        module.main()
                else:
                    module.main()
                self.assertEqual(query.call_count, expected_queries)


if __name__ == '__main__':
    unittest.main()
