'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{Readable}=require('node:stream');
const {createDirectoryExecutorBroker:create,serve}=require('../demo-platform/directory-executor-sql-broker');
const binding={jobId:'10000000-0000-0000-0000-000000000001',trialId:'20000000-0000-0000-0000-000000000002',intentId:'30000000-0000-0000-0000-000000000003',priorOsIntentId:'40000000-0000-0000-0000-000000000004',attemptId:'50000000-0000-0000-0000-000000000005',generation:5,jobRevision:10,uid:992,gid:983};
const attemptToken='ab'.repeat(32);
function fixture(fail=false){
 const state={calls:[],checks:0,closes:0};
 class Pool extends EventEmitter{async connect(){}request(){let input;return {query:async()=>{state.checks++;return {recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login:'infraflow_demo_directory_executor',principal:'infraflow_demo_directory_executor',sysadmin:0,accessDemo:0}],[{permission_name:'CONNECT SQL'}],[{permission_name:'CONNECT'}],['verify_tenant_directory_context','record_tenant_directory_result'].map(object_name=>({schema_name:'platform',object_name,permission_name:'EXECUTE'}))]};},input(k,t,v){input=JSON.parse(v);return this;},execute:async proc=>{
  state.calls.push(proc);if(fail)throw Error('private-secret');let r;
  if(proc==='platform.verify_tenant_directory_context')r={...binding,storageRoot:'/var/lib/infraflow-demo-tenants/'+binding.trialId,configRoot:'/etc/infraflow-demo-tenants/'+binding.trialId,validForMs:30000,contextReady:true,executionAllowed:false};
  else if(proc==='platform.record_tenant_directory_result'){const {uid,gid,...b}=binding;r={...b,outcome:input.outcome,confirmedCount:0,journalDigest:null,reconciliationRequired:true,executionAllowed:false};}
  else throw Error('unexpected');return {recordsets:[[{json:JSON.stringify(r)}]]};
 }};}async close(){state.closes++;}}
 return {state,broker:create('x'.repeat(20),{ConnectionPool:Pool,NVarChar:()=>0,MAX:-1})};
}
test('executor broker init/check/context/report only and idempotent close',async()=>{
 const {broker:b,state}=fixture();await b.request('init',{binding});assert.equal(state.checks,0);await b.request('check',{});assert.equal(state.calls.length,0);
 assert.equal((await b.request('context',{attemptToken})).executionAllowed,false);
 await b.request('report',{attemptToken,outcome:'uncertain',journalDigest:null,observations:[]});
 await assert.rejects(b.request('context',{attemptToken}));await b.shutdown();await b.shutdown();assert.equal(state.closes,1);assert.equal(state.calls.length,2);
});
test('worker, OS and arbitrary actions poison executor without RPC',async()=>{
 for(const action of ['claim','release','intent','prepare','mkdir','execute']){
  const {broker:b,state}=fixture();await b.request('init',{binding});await assert.rejects(b.request(action,{}));await assert.rejects(b.request('check',{}));await b.shutdown();assert.equal(state.calls.length,0);
 }
});
test('lost response refuses fallback report and masks private error',async()=>{
 const {broker:b,state}=fixture(true);await b.request('init',{binding});await assert.rejects(b.request('context',{attemptToken}),/^Error: directory_broker_unconfirmed$/);
 await assert.rejects(b.request('report',{attemptToken,outcome:'uncertain',journalDigest:null,observations:[]}));await b.shutdown();assert.equal(state.calls.length,1);
});
test('executor IPC sequence and shutdown expose no attempt token',async()=>{
 const {broker,state}=fixture(),out=[];const packets=[{id:1,action:'init',payload:{binding}},{id:2,action:'check',payload:{}},{id:3,action:'context',payload:{attemptToken}},{id:4,action:'shutdown',payload:{}}];
 await serve(broker,Readable.from(packets.map(p=>Buffer.from(JSON.stringify(p)+'\n'))),async line=>out.push(JSON.parse(line)));
 assert.deepEqual(out.map(r=>r.ok),[true,true,true,true]);assert.equal(state.calls.length,1);assert.equal(state.closes,1);assert.ok(!JSON.stringify(out).includes(attemptToken));
});
test('invalid IPC sequence and truncated input close without SQL',async()=>{
 const {broker,state}=fixture(),out=[];await serve(broker,Readable.from([Buffer.from(JSON.stringify({id:2,action:'init',payload:{binding}})+'\n')]),async line=>out.push(JSON.parse(line)));assert.equal(out[0].ok,false);assert.equal(state.calls.length,0);
 let closed=0;await assert.rejects(serve({shutdown:async()=>{closed++;}},Readable.from([Buffer.from('{')]),async()=>{}));assert.equal(closed,1);
});
test('executor metadata probe never calls context/report and uses dedicated credential',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const s=fs.readFileSync(path.join(__dirname,'../../scripts/linux/probe-demo-directory-executor-metadata.py'),'utf8');
 assert.deepEqual([...s.matchAll(/pipe\.call\('([^']+)'/g)].map(m=>m[1]),['init','check']);
 assert.ok(s.includes('/directory-executor.password'));assert.ok(!s.includes('/lease-sql.password'));assert.ok(s.includes('finally:pipe.close()'));
});
