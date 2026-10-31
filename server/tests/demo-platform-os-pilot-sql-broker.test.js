'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createPilotSqlBroker,serve}=require('../demo-platform/os-pilot-sql-broker');
const init={jobId:'00f612ed-a8ac-4688-a26f-679760eee0be',trialId:'b1100b43-48d0-42fa-8a1d-73b1286f8242',intentId:'11111111-1111-4111-8111-111111111111',expectedJobRevision:5};
const binding={jobId:init.jobId,trialId:init.trialId,intentId:init.intentId,generation:3,jobRevision:6},token='ab'.repeat(32),delegationToken='cd'.repeat(32);
function driver(){const calls=[];
 class Pool extends EventEmitter{constructor(c){super();this.login=c.user;}async connect(){}request(){const params={};const login=this.login;return {input(k,t,v){params[k]=v;return this;},query:async()=>{
  calls.push('metadata:'+login);return {recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login,principal:login,sysadmin:0,accessDemo:0}],[{permission_name:'CONNECT SQL'}],[{permission_name:'CONNECT'}],(login==='infraflow_demo_lease'?['provision_lease_command','record_step_intent','adapter_review_ticket_command','prepare_os_identity_delegation']:['accept_os_identity_delegation','verify_os_identity_execution_context','record_os_identity_result']).map(object_name=>({schema_name:'platform',object_name,permission_name:'EXECUTE'}))]};
 },execute:async proc=>{
  calls.push(proc);const p=JSON.parse(params.json),common={jobId:init.jobId,intentId:init.intentId,generation:3,jobRevision:6,executionAllowed:false},resourceKey='ift_b1100b4348d042fa8a1d73b1286f';let r;
  if(proc.endsWith('provision_lease_command'))r={jobId:init.jobId,generation:3,jobRevision:params.operation==='claim'?6:7,leaseExpiresAt:params.operation==='claim'?'2026-10-31T12:00:00.000':null,executionAllowed:false};
  else if(proc.endsWith('record_step_intent'))r={jobId:init.jobId,intentId:init.intentId,generation:3,step:'os_identity',state:'intent_recorded',executionAllowed:false};
  else if(proc.endsWith('prepare_os_identity_delegation'))r={...common,resourceKey,state:'prepared'};
  else if(proc.endsWith('accept_os_identity_delegation'))r={...common,trialId:init.trialId,resourceKey,state:'accepted',nextGate:'durable_result_and_reconciliation_protocol'};
  else if(proc.endsWith('verify_os_identity_execution_context'))r={...common,trialId:init.trialId,resourceKey,contextReady:true,validForMs:30000};
  else if(proc.endsWith('record_os_identity_result'))r={...common,outcome:p.outcome,uid:p.uid,gid:p.gid,reconciliationRequired:true};
  else throw Error('unexpected procedure');
  return {recordsets:[[{json:JSON.stringify(r)}]]};
 }};}async close(){calls.push('close:'+this.login);}}
 return {value:{ConnectionPool:Pool,NVarChar:()=>0,VarChar:()=>0,MAX:0},calls};
}
test('broker scopes worker and executor through one bound control-plane attempt',async()=>{
 const d=driver(),w=createPilotSqlBroker('worker','x'.repeat(20),d.value),e=createPilotSqlBroker('executor','y'.repeat(20),d.value);
 await w.request('init',init);await w.request('check',{});
 await w.request('claim',{jobId:init.jobId,expectedJobRevision:5,leaseToken:token});
 await w.request('intent',{jobId:init.jobId,generation:3,expectedJobRevision:6,leaseToken:token,intentId:init.intentId,step:'os_identity'});
 await w.request('prepare',{leaseToken:token,delegationToken});
 await e.request('init',{binding});await e.request('accept',{delegationToken});assert.equal((await e.request('context',{delegationToken})).executionAllowed,false);
 await e.request('report',{delegationToken,outcome:'observed_created',uid:992,gid:983});
 assert.equal((await w.request('release',{jobId:init.jobId,generation:3,expectedJobRevision:6,leaseToken:token})).jobRevision,7);
 await w.shutdown();await e.shutdown();assert.equal(d.calls.filter(x=>x.startsWith('platform.')).length,7);
});
test('cross-role actions and unbound job fail before any RPC and poison broker',async()=>{
 for(const [role,action,payload] of [['worker','accept',{delegationToken}],['executor','claim',{jobId:init.jobId,expectedJobRevision:5,leaseToken:token}],['worker','claim',{jobId:binding.intentId,expectedJobRevision:5,leaseToken:token}]]){
  const d=driver(),b=createPilotSqlBroker(role,'x'.repeat(20),d.value);await b.request('init',role==='worker'?init:{binding});
  await assert.rejects(b.request(action,payload),/^Error: pilot_sql_broker_unconfirmed$/);await assert.rejects(b.request('check',{}));
  assert.equal(d.calls.filter(x=>x.startsWith('platform.')).length,0);await b.shutdown();
 }
});
test('private pipe protocol enforces order, bounded JSON and masks error details',async()=>{
 const writes=[],calls=[];const broker={request:async(a,p)=>{calls.push(a);if(a==='bad')throw Error('private-secret');return {initialized:true};},shutdown:async()=>{}};
 async function* input(){yield Buffer.from(JSON.stringify({id:1,action:'init',payload:{}})+'\n'+JSON.stringify({id:1,action:'bad',payload:{}})+'\n');}
 await serve(broker,input(),async line=>writes.push(line));assert.equal(writes.length,2);assert.deepEqual(calls,['init']);assert.equal(JSON.parse(writes[1]).ok,false);assert.ok(!writes.join('').includes('private-secret'));
 async function* huge(){yield Buffer.alloc(4097,32);}
 await assert.rejects(serve(broker,huge(),async()=>{}));
});
