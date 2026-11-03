#!/usr/bin/env python3
"""Root Linux temporary /run journal only. All SQL/pipe ports simulated."""
import importlib.util
import io
import os
from pathlib import Path
import sys
import unittest

def main():
    if sys.platform!='linux' or os.geteuid()!=0 or os.getegid()!=0 or sys.argv[1:]!=['--run-canary-confirmed']:
        sys.exit('LINUX_ROOT_CANARY_CONFIRMATION_REQUIRED')
    spec=importlib.util.spec_from_file_location('cycle_tests',Path(__file__).with_name('test-demo-directory-cycle.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    result=unittest.TextTestRunner(stream=io.StringIO(),verbosity=0).run(unittest.defaultTestLoader.loadTestsFromModule(module))
    if not result.wasSuccessful() or result.testsRun!=5 or result.skipped:
        print('DIRECTORY_CYCLE_JOURNAL_CANARY_UNCONFIRMED\nNO_AUTOMATIC_RETRY_REVIEW_REQUIRED');sys.exit(1)
    print('DIRECTORY_CYCLE_DURABLE_ORDER_OK\nDIRECTORY_CYCLE_LOST_RESPONSE_NO_COMPENSATION_OK\nDIRECTORY_CYCLE_NATIVE_PRIVATE_JOURNAL_OK\nDIRECTORY_CYCLE_JOURNAL_CANARY_CLEANUP_OK\nALL_SQL_AND_PIPE_PORTS_SIMULATED_NO_ACCOUNT_NO_EXISTING_SERVICE_RESTART')

if __name__=='__main__':main()
