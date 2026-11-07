"""One-shot report coordination; injected transport, never retries or releases."""
import hashlib
import importlib.util
import re
from pathlib import Path

def load(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def submit(execution_parent,expected,attempt_token,record_requested,record_confirmed,send):
    """record_requested must be exclusive and durable before send is called.

    No default transport: caller supplies the already initialized executor pipe.
    A failed/ambiguous call leaves the requested record for manual review.
    """
    if type(attempt_token) is not str or not re.fullmatch('[0-9a-f]{64}',attempt_token):raise RuntimeError('report_token_refused')
    m=load('tenant-directory-execution-journal');h=load('os-pilot-journal');b=m.binding(expected)
    report=m.read_report(execution_parent,b)
    request={'format':'infraflow-directory-report-request-v1','binding':b,'report':report}
    digest=hashlib.sha256(h.canonical(request)).hexdigest()
    # No token is persisted in this journal. Exclusive creation is the retry gate.
    record_requested(request)
    try:
        receipt=send('report',{'attemptToken':attempt_token,**report})
        common={k:b[k] for k in ('jobId','trialId','intentId','priorOsIntentId','attemptId','generation','jobRevision')}
        wanted={**common,'outcome':'observed_created','confirmedCount':8,'journalDigest':report['journalDigest'],'executionAllowed':False,'reconciliationRequired':True}
        if type(receipt) is not dict or h.canonical(receipt)!=h.canonical(wanted):raise RuntimeError()
        record_confirmed({'format':'infraflow-directory-report-confirmed-v1','requestDigest':digest,'receipt':receipt})
        return receipt
    except Exception:raise RuntimeError('directory_report_unconfirmed_manual_review_no_retry') from None

def durable_ports(parent,expected):
    """Existing root-private parent; per-attempt exclusive request directory."""
    m=load('tenant-directory-execution-journal');h=load('os-pilot-journal');b=m.binding(expected)
    directory=parent/b['attemptId']
    def requested(value):
        h.safe_directory(parent,True)
        directory.mkdir(mode=0o700)
        # write_exclusive fsyncs file and directory. Sync parent for new entry.
        import os
        fd=os.open(parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        try:os.fsync(fd)
        finally:os.close(fd)
        h.write_exclusive(directory,'bootstrap.json',value)
    def confirmed(value):h.write_exclusive(directory,'000001.json',value)
    return requested,confirmed
