'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{Readable}=require('node:stream');
const {createDirectoryPreparationBroker:create,serve}=require('../demo-platform/directory-preparation-sql-broker');
const binding={jobId:'10000000-0000-0000-0000-000000000001',trialId:'20000000-0000-0000-0000-000000000002',intentId:'30000000-0000-0000-0000-000000000003',priorOsIntentId:'40000000-0000-0000-0000-000000000004',attemptId:'50000000-0000-0000-0000-000000000005',generation:4,jobRevision:8,uid:992,gid:983};
const tokens={leaseToken:'ab'.repeat(32),attemptToken:'cd'.repeat(32)};
function fixture(){
 const state={rpcs:0,checks:0,closes:0};
 class Pool extends EventEmitter{async connect(){}request(){return {query:async()=>{state.checks++;return {recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login:'infraflow_demo_lease',principal:'infraflow_demo_lease',sysadmin:0,accessDemo:0}],[{permission_name:'CONNECT SQL'}],[{permission_name:'CONNECT'}],['provision_lease_command','record_step_intent','adapter_review_ticket_command','prepare_os_identity_delegation','prepare_tenant_directories'].map(object_name=>({schema_name:'platform',object_name,permission_name:'EXECUTE'}))]};},input:()=>({execute:async p=>{state.rpcs++;assert.equal(p,'platform.prepare_tenant_directories');return {recordsets:[[{json:JSON.stringify({...binding,storageRoot:'/var/lib/infraflow-demo-tenants/'+binding.trialId,configRoot:'/etc/infraflow-demo-tenants/'+binding.trialId,state:'prepared',executionAllowed:false})}]]};}})};}async close(){state.closes++;}}
 return {state,broker:create('x'.repeat(20),{ConnectionPool:Pool,NVarChar:()=>0,MAX:-1})};
}
test('broker init/check/prepare validates fixed SQL path and closes once',async()=>{
 const {broker,state}=fixture();assert.deepEqual(await broker.request('init',{binding}),{initialized:true});assert.equal(state.checks,0);
 await broker.request('check',{});assert.equal(state.rpcs,0);const r=await broker.request('prepare',tokens);assert.equal(r.executionAllowed,false);
 await assert.rejects(broker.request('prepare',tokens));await broker.shutdown();await broker.shutdown();assert.equal(state.rpcs,1);assert.equal(state.closes,1);
});
test('unknown, repeated init and pre-init action poison broker without RPC',async()=>{
 for(const action of ['claim','release','intent','report','execute','check']){
  const {broker,state}=fixture();await assert.rejects(broker.request(action,{}));await assert.rejects(broker.request('init',{binding}));await broker.shutdown();assert.equal(state.rpcs,0);
 }
 const {broker,state}=fixture();await broker.request('init',{binding});await assert.rejects(broker.request('init',{binding}));await broker.shutdown();assert.equal(state.rpcs,0);
});
test('IPC returns sequenced receipt and shutdown; secret never returned',async()=>{
 const {broker,state}=fixture(),out=[];
 const packets=[{id:1,action:'init',payload:{binding}},{id:2,action:'check',payload:{}},{id:3,action:'prepare',payload:tokens},{id:4,action:'shutdown',payload:{}}];
 await serve(broker,Readable.from(packets.map(p=>Buffer.from(JSON.stringify(p)+'\n'))),async line=>out.push(JSON.parse(line)));
 assert.deepEqual(out.map(r=>[r.id,r.ok]),[[1,true],[2,true],[3,true],[4,true]]);assert.equal(state.rpcs,1);assert.equal(state.closes,1);assert.ok(!JSON.stringify(out).includes(tokens.attemptToken));
});
test('malformed sequence and extra envelope fields fail closed and stop stream',async()=>{
 for(const p of [{id:2,action:'init',payload:{binding}},{id:1,action:'init',payload:{binding},extra:true}]){
  let calls=0,closed=0;const out=[];await serve({request:async()=>{calls++;},shutdown:async()=>{closed++;}},Readable.from([Buffer.from(JSON.stringify(p)+'\n')]),async line=>out.push(JSON.parse(line)));
  assert.equal(calls,0);assert.equal(closed,1);assert.equal(out[0].ok,false);
 }
});
test('oversize and truncated IPC input closes without invoking actions',async()=>{
 for(const raw of [Buffer.alloc(4097,65),Buffer.from('{"id":1')]){
  let closed=0;await assert.rejects(serve({request:async()=>{throw Error('unexpected');},shutdown:async()=>{closed++;}},Readable.from([raw]),async()=>{}));assert.equal(closed,1);
 }
});
