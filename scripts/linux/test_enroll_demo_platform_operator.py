import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('enroll', Path(__file__).with_name('enroll-demo-platform-operator.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'


class Tests(unittest.TestCase):
    def test_rfc_totp_matches_node_and_bounded_window(self):
        self.assertEqual(m.totp(SECRET, 1), '287082')
        self.assertEqual(m.accepted_counter(SECRET, '287082', 59), 1)
        self.assertEqual(m.accepted_counter(SECRET, '287082', 60), 1)
        self.assertIsNone(m.accepted_counter(SECRET, '287082', 90))
        self.assertIsNone(m.accepted_counter(SECRET, 'bad', 59))

    def test_creation_is_atomic_and_counter_consumed(self):
        sql = m.creation_sql({'id':'test-id','username':"test'user",'passwordHash':'HASH','envelope':'ENCRYPTED'}, 42)
        for marker in ('BEGIN TRANSACTION','platform-first-operator','first_operator_already_exists','last_totp_counter','operator_totp_claimed','ROLLBACK'):
            self.assertIn(marker, sql)
        self.assertIn("N'test''user'", sql)
        self.assertNotIn(SECRET, sql)
        self.assertNotIn('CREATE LOGIN', sql)

    def test_non_linux_refused_before_writes(self):
        with patch.object(m.sys, 'platform', 'win32'), patch.object(m, 'write_new_key') as write:
            with self.assertRaises(SystemExit):
                m.main()
            write.assert_not_called()


if __name__ == '__main__':
    unittest.main()
