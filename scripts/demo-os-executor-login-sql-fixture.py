"""Private synthetic test IPC; stdout contains SQL with a test password, never print it."""
import importlib.util
import json
import os
from pathlib import Path
import sys
if os.environ.get('NODE_ENV')!='test':sys.exit(1)
spec=importlib.util.spec_from_file_location('os_creator',Path(__file__).parent/'linux/create-demo-platform-os-executor-login.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
value=json.loads(sys.stdin.read(4096))
if set(value)!={'password'} or type(value['password']) is not str:sys.exit(1)
print(json.dumps({'preflight':m.preflight_sql(),'creation':m.creation_sql(value['password']),
                  'verification':m.verification_sql(),'scope':m.scope_sql()}))
