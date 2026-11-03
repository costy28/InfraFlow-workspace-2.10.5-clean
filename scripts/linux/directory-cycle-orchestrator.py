"""SQL preparation only through injected ports. No filesystem effect authority."""
import importlib.util
from pathlib import Path
import secrets
import uuid

def journal_module():
    spec=importlib.util.spec_from_file_location('cycle_journal',Path(__file__).with_name('directory-cycle-journal.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def exact(r,expected):
    if type(r) is not dict or set(r)!=set(expected) or any(type(r[k]) is not type(v) or r[k]!=v for k,v in expected.items()):raise RuntimeError('cycle_receipt_refused')
def run(request,ports):
    keys={'jobId','trialId','priorOsIntentId','uid','gid','expectedJobRevision','localRootApproved'}
    if type(request) is not dict or set(request)!=keys or request['localRootApproved'] is not True:raise RuntimeError('cycle_request_refused')
    if type(ports) is not dict or set(ports)!={'inventory','journal','claim','intent','prepare','release'} or not all(callable(v) for v in ports.values()):raise RuntimeError('cycle_ports_refused')
    private={k:request[k] for k in keys if k!='localRootApproved'}
    private.update(format='infraflow-directory-cycle-v1',intentId=str(uuid.uuid4()),attemptId=str(uuid.uuid4()),leaseToken=secrets.token_hex(32),attemptToken=secrets.token_hex(32))
    journal_module().validate(private)
    if ports['inventory'](dict(request)) is not True:raise RuntimeError('cycle_inventory_refused')
    # Journal factory persists bootstrap before a child or committing SQL request.
    journal=ports['journal'](dict(private));stage='claim_requested'
    try:
        journal.append(stage)
        c=ports['claim']({k:private[k] for k in ('jobId','expectedJobRevision','leaseToken')})
        if type(c) is not dict or set(c)!={'jobId','generation','jobRevision','leaseExpiresAt','executionAllowed'} or c['jobId']!=private['jobId'] or type(c['generation']) is not int or not 0<c['generation']<2147483647 or type(c['jobRevision']) is not int or c['jobRevision']!=private['expectedJobRevision']+1 or type(c['leaseExpiresAt']) is not str or c['executionAllowed'] is not False:raise RuntimeError()
        b={k:private[k] for k in ('jobId','trialId','intentId','priorOsIntentId','attemptId','uid','gid')};b.update(generation=c['generation'],jobRevision=c['jobRevision'])
        journal.append('claimed',{'generation':b['generation'],'jobRevision':b['jobRevision']})
        lease={'jobId':b['jobId'],'generation':b['generation'],'expectedJobRevision':b['jobRevision'],'leaseToken':private['leaseToken']}
        stage='intent_requested';journal.append(stage)
        exact(ports['intent']({**lease,'intentId':b['intentId'],'step':'tenant_directories'}),{'jobId':b['jobId'],'generation':b['generation'],'intentId':b['intentId'],'step':'tenant_directories','state':'intent_recorded','executionAllowed':False})
        journal.append('intent_recorded');stage='prepare_requested';journal.append(stage)
        exact(ports['prepare'](dict(b),{'leaseToken':private['leaseToken'],'attemptToken':private['attemptToken']}),{**b,'storageRoot':'/var/lib/infraflow-demo-tenants/'+b['trialId'],'configRoot':'/etc/infraflow-demo-tenants/'+b['trialId'],'state':'prepared','executionAllowed':False})
        journal.append('prepared');stage='release_requested';journal.append(stage)
        exact(ports['release'](dict(lease)),{'jobId':b['jobId'],'generation':b['generation'],'jobRevision':b['jobRevision']+1,'leaseExpiresAt':None,'executionAllowed':False})
        journal.append('released',{'jobRevision':b['jobRevision']+1})
        return {'jobId':b['jobId'],'attemptId':b['attemptId'],'intentId':b['intentId'],'generation':b['generation'],'jobRevision':b['jobRevision']+1,'status':'sql_prepared_released_requires_review','executionAllowed':False,'resumeAllowed':False}
    except Exception:
        try:journal.append('review_required',{'failedStage':stage})
        except Exception:pass
        raise RuntimeError('directory_cycle_review_required') from None
