'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createDirectoryPreparationRpcClient:create,parseDirectoryPreparationBinding:parse}=require('../demo-platform/directory-preparation-rpc-client');
const binding={jobId:'10000000-0000-0000-0000-000000000001',trialId:'20000000-0000-0000-0000-000000000002',intentId:'30000000-0000-0000-0000-000000000003',priorOsIntentId:'40000000-0000-0000-0000-000000000004',attemptId:'50000000-0000-0000-0000-000000000005',generation:4,jobRevision:8,uid:992,gid:983};
const input={leaseToken:'ab'.repeat(32),attemptToken:'cd'.repeat(32)};
const receipt=()=>({...binding,storageRoot:'/var/lib/infraflow-demo-tenants/'+binding.trialId,configRoot:'/etc/infraflow-demo-tenants/'+binding.trialId,state:'prepared',executionAllowed:false});
const metadata=()=>({recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login:'infraflow_demo_lease',principal:'infraflow_demo_lease',sysadmin:0,accessDemo:0}],[{permission_name:'CONNECT SQL'}],[{permission_name:'CONNECT'}],['provision_lease_command','record_step_intent','adapter_review_ticket_command','prepare_os_identity_delegation','prepare_tenant_directories'].map(object_name=>({schema_name:'platform',object_name,permission_name:'EXECUTE'}))]});
function fixture({mutate=x=>x,scope=metadata,execute}={}){
 const state={queries:0,rpcs:0,closes:0,args:[]};
 class Pool extends EventEmitter{constructor(c){super();state.config=c;}async connect(){}request(){return {query:async()=>{state.queries++;return scope();},input:(...a)=>{state.args.push(a);return {execute:async p=>{state.rpcs++;state.proc=p;if(execute)return execute();return {recordsets:[[{json:JSON.stringify(mutate(receipt()))}]]};}};}};}async close(){state.closes++;}}
 const client=create({password:'x'.repeat(20),binding,driver:{ConnectionPool:Pool,NVarChar:()=>0,MAX:-1}});return {client,state};
}
test('exact binding and descriptors refuse injected fields without getters',()=>{
 assert.deepEqual(parse(binding),binding);assert.throws(()=>parse({...binding,attemptId:binding.intentId}));
 let called=0;const b={...binding};Object.defineProperty(b,'uid',{get(){called++;return 992;}});assert.throws(()=>parse(b));assert.equal(called,0);
});
test('fixed parameterized prepare validates receipt and permits only one attempt',async()=>{
 const {client,state}=fixture();await client.check();const r=await client.prepare(input);
 assert.deepEqual(r,receipt());assert.ok(Object.isFrozen(r));assert.equal(state.proc,'platform.prepare_tenant_directories');
 assert.equal(state.config.user,'infraflow_demo_lease');assert.equal(state.config.server,'127.0.0.1');
 const payload=JSON.parse(state.args[0][2]);assert.equal(payload.expectedJobRevision,8);assert.equal(payload.attemptToken,input.attemptToken);assert.equal(Object.keys(payload).length,8);
 await assert.rejects(client.prepare(input));assert.equal(state.rpcs,1);await client.shutdown();assert.equal(state.closes,1);
});
test('invalid token, extras and legacy scope cause no RPC',async()=>{
 const f=fixture();for(const bad of [{...input,extra:true},{...input,attemptToken:input.leaseToken},{...input,attemptToken:'INVALID'}])await assert.rejects(f.client.prepare(bad));assert.equal(f.state.queries,0);await f.client.shutdown();
 const {client,state}=fixture({scope:()=>{const m=metadata();m.recordsets[3].pop();return m;}});await assert.rejects(client.prepare(input));assert.equal(state.rpcs,0);await client.shutdown();
});
test('receipt mismatch or uncertain transport poisons client without retry',async()=>{
 for(const mutate of [r=>({...r,executionAllowed:true}),r=>({...r,jobRevision:9}),r=>({...r,uid:1}),r=>({...r,storageRoot:'/tmp'}),r=>({...r,attemptToken:input.attemptToken})]){
  const {client,state}=fixture({mutate});await assert.rejects(client.prepare(input),/directory_preparation_rpc_unconfirmed/);await assert.rejects(client.check());assert.equal(state.rpcs,1);await client.shutdown();
 }
 const {client,state}=fixture({execute:async()=>{throw Error('secret-bearing-driver-error');}});await assert.rejects(client.prepare(input),/directory_preparation_rpc_unconfirmed/);await assert.rejects(client.prepare(input));assert.equal(state.rpcs,1);await client.shutdown();
});
test('shutdown drains pending RPC and rejects late success or parallel request',async()=>{
 let finish;const {client,state}=fixture({execute:()=>new Promise(resolve=>finish=()=>resolve({recordsets:[[{json:JSON.stringify(receipt())}]]}))});
 const task=client.prepare(input);const settled=Promise.allSettled([task]);await new Promise(r=>setImmediate(r));
 await assert.rejects(client.check());const stop=client.shutdown();finish();await stop;assert.equal((await settled)[0].status,'rejected');assert.equal(state.rpcs,1);assert.equal(state.closes,1);
});
