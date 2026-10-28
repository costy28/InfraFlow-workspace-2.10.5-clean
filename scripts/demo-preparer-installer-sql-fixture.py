"""Private test IPC only: generated SQL contains a synthetic password, never log."""
import importlib.util
import json
import os
from pathlib import Path
import sys

if os.environ.get('NODE_ENV') != 'test':
    sys.exit(1)
spec = importlib.util.spec_from_file_location('preparer', Path(__file__).parent/'linux/create-demo-platform-preparer-login.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
payload = json.loads(sys.stdin.read(4096))
print(json.dumps({'preflight': module.preflight_sql(), 'creation': module.creation_sql(payload['password']),
                  'verification': module.verification_sql()}))
