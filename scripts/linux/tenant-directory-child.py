#!/usr/bin/env python3
"""One canonical mkdir per owned child. No path/command supplied independently."""
import importlib.util
import json
import os
from pathlib import Path
import sys
def load(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def main():
    if sys.platform!='linux' or os.geteuid()!=0 or os.getegid()!=0 or sys.argv[1:]!=['--mkdir']:raise RuntimeError()
    raw=sys.stdin.buffer.read(4097)
    if len(raw)>4096:raise RuntimeError()
    p=json.loads(raw)
    if type(p) is not dict or set(p)!={'plan','index'} or type(p['index']) is not int or not 0<=p['index']<8:raise RuntimeError()
    plan=p['plan'];canonical=load('tenant-directory-plan').plan(plan.get('trialId'),plan.get('uid'),plan.get('gid'))
    if type(plan) is not dict or plan!=canonical:raise RuntimeError()
    r=load('tenant-directory-executor')._mkdir(canonical['directories'][p['index']],{e['path']:e for e in canonical['directories']})
    print(json.dumps(r,separators=(',',':')))
if __name__=='__main__':
    try:main()
    except Exception:print('DIRECTORY_CHILD_UNCONFIRMED',file=sys.stderr);sys.exit(1)
