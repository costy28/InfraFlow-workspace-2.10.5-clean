#!/usr/bin/env python3
"""One trusted pilot attempt through injected ports. No default SQL/OS clients or CLI."""
import secrets
import uuid
import re

UUID=re.compile('[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
def exact(value,keys):
    if type(value) is not dict or set(value)!=set(keys):raise RuntimeError('pilot_receipt_refused')
    return value
def positive(x):return type(x) is int and 0<x<2147483647
def run_pilot(request,ports):
    exact(request,('jobId','trialId','expectedJobRevision','localRootApproved'))
    if request['localRootApproved'] is not True:raise RuntimeError('local_root_approval_required')
    for key in ('jobId','trialId'):
        if type(request[key]) is not str or not UUID.fullmatch(request[key]):raise RuntimeError('pilot_request_refused')
    if type(request['expectedJobRevision']) is not int or not 0<=request['expectedJobRevision']<=2147483643:raise RuntimeError('pilot_request_refused')
    exact(ports,('inventory','journal','claim','intent','prepare','accept','host','report','release'))
    if not all(callable(v) for v in ports.values()):raise RuntimeError('trusted_pilot_ports_required')
    if ports['inventory'](request['trialId']) is not True:raise RuntimeError('pilot_inventory_refused')
    private={'format':'infraflow-os-pilot-v1','jobId':request['jobId'],'trialId':request['trialId'],'intentId':str(uuid.uuid4()),
             'expectedJobRevision':request['expectedJobRevision'],'leaseToken':secrets.token_hex(32),'delegationToken':secrets.token_hex(32)}
    # Store secrets durably before the first possibly committing request.
    journal=ports['journal'](private)
    stage='claim_requested'
    try:
        journal.append(stage)
        claimed=exact(ports['claim']({'jobId':private['jobId'],'expectedJobRevision':private['expectedJobRevision'],'leaseToken':private['leaseToken']}),
                      ('jobId','generation','jobRevision','leaseExpiresAt','executionAllowed'))
        if claimed['jobId']!=private['jobId'] or claimed['executionAllowed'] is not False or not positive(claimed['generation']) or type(claimed['jobRevision']) is not int or claimed['jobRevision']!=private['expectedJobRevision']+1 or type(claimed['leaseExpiresAt']) is not str:
            raise RuntimeError('pilot_claim_refused')
        binding={'jobId':private['jobId'],'trialId':private['trialId'],'intentId':private['intentId'],
                 'generation':claimed['generation'],'jobRevision':claimed['jobRevision']}
        journal.append('claimed',{'generation':binding['generation'],'jobRevision':binding['jobRevision']})
        stage='intent_requested';journal.append(stage)
        r=exact(ports['intent']({**{k:binding[k] for k in ('jobId','generation','intentId')},'expectedJobRevision':binding['jobRevision'],'leaseToken':private['leaseToken'],'step':'os_identity'}),
                ('jobId','generation','intentId','step','state','executionAllowed'))
        if any(type(r[k]) is not type(binding[k]) or r[k]!=binding[k] for k in ('jobId','generation','intentId')) or r['step']!='os_identity' or r['state']!='intent_recorded' or r['executionAllowed'] is not False:raise RuntimeError('pilot_intent_refused')
        journal.append('intent_recorded')
        for action,expected in (('prepare','prepared'),('accept','accepted')):
            stage='delegation_requested' if action=='prepare' else 'accept_requested';journal.append(stage)
            r=ports[action](dict(binding),private['leaseToken'],private['delegationToken']) if action=='prepare' else ports[action](dict(binding),private['delegationToken'])
            common=('jobId','intentId','generation','jobRevision','executionAllowed','resourceKey','state')
            exact(r,common if action=='prepare' else (*common,'trialId','nextGate'))
            # Scoped RPC clients validate exact wire receipts; bind again here.
            if type(r) is not dict or any(type(r.get(k)) is not type(binding[k]) or r.get(k)!=binding[k] for k in ('jobId','generation','jobRevision','intentId')) or r.get('executionAllowed') is not False or r.get('state')!=expected or r.get('resourceKey')!='ift_'+binding['trialId'].replace('-','')[:28]:raise RuntimeError('pilot_delegation_refused')
            if action=='accept' and (r.get('trialId')!=binding['trialId'] or r.get('nextGate')!='durable_result_and_reconciliation_protocol'):raise RuntimeError('pilot_delegation_refused')
            journal.append('delegation_prepared' if action=='prepare' else 'accepted')
        stage='host_requested';journal.append(stage)
        observed=exact(ports['host'](dict(binding),private['delegationToken']),('uid','gid','policyVerified'))
        if observed['policyVerified'] is not True or not positive(observed['uid']) or not positive(observed['gid']):raise RuntimeError('pilot_observation_refused')
        journal.append('host_observed',{'uid':observed['uid'],'gid':observed['gid']})
        stage='result_requested';journal.append(stage)
        r=ports['report'](dict(binding),private['delegationToken'],{'outcome':'observed_created','uid':observed['uid'],'gid':observed['gid']})
        exact(r,('jobId','intentId','generation','jobRevision','outcome','uid','gid','executionAllowed','reconciliationRequired'))
        if type(r) is not dict or any(type(r.get(k)) is not type(binding[k]) or r.get(k)!=binding[k] for k in ('jobId','generation','jobRevision','intentId')) or r.get('executionAllowed') is not False or r.get('reconciliationRequired') is not True or r.get('outcome')!='observed_created' or type(r.get('uid')) is not int or r['uid']!=observed['uid'] or type(r.get('gid')) is not int or r['gid']!=observed['gid']:raise RuntimeError('pilot_report_refused')
        journal.append('result_recorded')
        stage='release_requested';journal.append(stage)
        r=exact(ports['release']({'jobId':binding['jobId'],'generation':binding['generation'],'expectedJobRevision':binding['jobRevision'],'leaseToken':private['leaseToken']}),
                ('jobId','generation','jobRevision','leaseExpiresAt','executionAllowed'))
        if r['jobId']!=binding['jobId'] or type(r['generation']) is not int or r['generation']!=binding['generation'] or type(r['jobRevision']) is not int or r['jobRevision']!=binding['jobRevision']+1 or r['leaseExpiresAt'] is not None or r['executionAllowed'] is not False:raise RuntimeError('pilot_release_refused')
        journal.append('released',{'jobRevision':r['jobRevision']})
        return {**binding,'jobRevision':r['jobRevision'],'status':'identity_recorded_requires_review','executionAllowed':False,'activationPerformed':False}
    except Exception:
        # A lost response may already have committed. No second report, retry,
        # release, delete or adoption is attempted automatically.
        try:journal.append('review_required',{'failedStage':stage})
        except Exception:pass # prior *_requested event remains the conservative marker
        raise RuntimeError('os_pilot_unconfirmed_review_required') from None
