"""Private local test IPC: generated SQL contains a synthetic password; never log it."""
import importlib.util
import json
import os
from pathlib import Path
import sys

if os.environ.get('NODE_ENV')!='test':sys.exit(1)
spec=importlib.util.spec_from_file_location('adapter_creator',Path(__file__).parent/'linux/create-demo-platform-adapter-review-login.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
value=json.loads(sys.stdin.read(4096))
if set(value)!={'password'} or type(value['password']) is not str:sys.exit(1)
print(json.dumps({'preflight':module.preflight_sql(),'creation':module.creation_sql(value['password']),
                  'verification':module.verification_sql(),
                  'scope':Path(__file__).with_name('linux').joinpath('restrict-demo-platform-adapter-review.sql').read_text(encoding='utf-8')}))
