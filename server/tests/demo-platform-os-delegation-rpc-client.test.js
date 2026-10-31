'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createOsDelegationRpcClient}=require('../demo-platform/os-delegation-rpc-client');
const binding={jobId:'00f612ed-a8ac-4688-a26f-679760eee0be',trialId:'b1100b43-48d0-42fa-8a1d-73b1286f8242',intentId:'11111111-1111-4111-8111-111111111111',generation:3,jobRevision:6};
const resourceKey='ift_b1100b4348d042fa8a1d73b1286f',delegationToken='cd'.repeat(32),leaseToken='ab'.repeat(32);
function metadata(role){const login=role==='worker'?'infraflow_demo_lease':'infraflow_demo_os_executor';return {recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login,principal:login,sysadmin:0,accessDemo:0}],[{permission_name:'CONNECT SQL'}],[{permission_name:'CONNECT'}],(role==='worker'?['provision_lease_command','record_step_intent','adapter_review_ticket_command','prepare_os_identity_delegation']:['accept_os_identity_delegation','record_os_identity_result','verify_os_identity_execution_context']).map(object_name=>({schema_name:'platform',object_name,permission_name:'EXECUTE'}))]};}
function fixture(role,change=x=>x,{fail=false}={}){
 const calls=[],inputs=[];
 class Pool extends EventEmitter{constructor(c){super();assert.equal(c.user,role==='worker'?'infraflow_demo_lease':'infraflow_demo_os_executor');}async connect(){}request(){let value;return {query:async()=>{calls.push('metadata');return metadata(role);},input(name,type,json){assert.equal(name,'json');value=JSON.parse(json);inputs.push(value);return this;},execute:async proc=>{
  calls.push(proc);if(fail)throw Error(delegationToken);
  const common={jobId:binding.jobId,intentId:binding.intentId,generation:binding.generation,jobRevision:binding.jobRevision,executionAllowed:false};
  let r=proc.endsWith('prepare_os_identity_delegation')?{...common,resourceKey,state:'prepared'}:
   proc.endsWith('accept_os_identity_delegation')?{...common,trialId:binding.trialId,resourceKey,state:'accepted',nextGate:'durable_result_and_reconciliation_protocol'}:
   proc.endsWith('verify_os_identity_execution_context')?{...common,trialId:binding.trialId,resourceKey,validForMs:30000,contextReady:true}:
   {...common,outcome:value.outcome,uid:value.uid,gid:value.gid,reconciliationRequired:true};
  return {recordsets:[[{json:JSON.stringify(change(r))}]]};
 }};}async close(){calls.push('close');}}
 return {client:createOsDelegationRpcClient({role,password:'x'.repeat(20),binding,driver:{ConnectionPool:Pool,NVarChar:()=>0,MAX:0}}),calls,inputs};
}
test('worker and executor expose distinct fixed RPCs with bound payloads only',async()=>{
 const w=fixture('worker'),e=fixture('executor');
 assert.deepEqual(Object.keys(w.client).sort(),['check','prepare','shutdown']);assert.deepEqual(Object.keys(e.client).sort(),['accept','check','context','report','shutdown']);
 assert.equal((await w.client.prepare({leaseToken,delegationToken})).state,'prepared');
 assert.deepEqual(w.inputs[0],{jobId:binding.jobId,generation:3,expectedJobRevision:6,leaseToken,intentId:binding.intentId,delegationToken});
 assert.equal((await e.client.accept({delegationToken})).state,'accepted');assert.equal((await e.client.context({delegationToken})).executionAllowed,false);
 assert.equal((await e.client.report({delegationToken,outcome:'uncertain',uid:null,gid:null})).reconciliationRequired,true);
 assert.equal(e.calls.filter(x=>x==='metadata').length,3);await w.client.shutdown();await e.client.shutdown();
});
test('unrelated binding, extra fields or host authority in receipt poison client without retry',async()=>{
 for(const change of [r=>({...r,jobRevision:7}),r=>({...r,executionAllowed:true}),r=>({...r,resourceKey:'root'}),r=>({...r,extra:true})]){
  const f=fixture('executor',change);await assert.rejects(f.client.accept({delegationToken}),/^Error: os_delegation_rpc_unconfirmed$/);await assert.rejects(f.client.accept({delegationToken}));
  assert.equal(f.calls.filter(x=>x.endsWith('accept_os_identity_delegation')).length,1);await f.client.shutdown();
 }
});
test('invalid report, getters and injection refused before connecting',async()=>{
 const f=fixture('executor');let read=false;const value={};Object.defineProperty(value,'delegationToken',{get(){read=true;}});
 await assert.rejects(f.client.accept(value));assert.equal(read,false);
 for(const value of [{delegationToken,outcome:'uncertain',uid:1,gid:null},{delegationToken,outcome:'observed_created',uid:0,gid:1},{delegationToken,outcome:'observed_created',uid:1,gid:1,sql:'DROP'}])await assert.rejects(f.client.report(value));
 assert.deepEqual(f.calls,[]);await f.client.shutdown();
});
test('uncertain RPC is masked, never retried, shutdown closes transport',async()=>{
 const f=fixture('worker',x=>x,{fail:true});await assert.rejects(f.client.prepare({leaseToken,delegationToken}),/^Error: os_delegation_rpc_unconfirmed$/);
 await assert.rejects(f.client.prepare({leaseToken,delegationToken}));assert.equal(f.calls.filter(x=>x.endsWith('prepare_os_identity_delegation')).length,1);await f.client.shutdown();assert.equal(f.calls.at(-1),'close');
});
