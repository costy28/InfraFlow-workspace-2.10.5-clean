'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createOsExecutionContextClient,parseContextReceipt}=require('../demo-platform/os-execution-context-client');
const command={intentId:'11111111-1111-4111-8111-111111111111',delegationToken:'ab'.repeat(32)};
const good={jobId:'00f612ed-a8ac-4688-a26f-679760eee0be',trialId:'b1100b43-48d0-42fa-8a1d-73b1286f8242',intentId:command.intentId,generation:3,jobRevision:6,resourceKey:'ift_b1100b4348d042fa8a1d73b1286f',validForMs:30000,contextReady:true,executionAllowed:false};
function metadata(){return {recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login:'infraflow_demo_os_executor',principal:'infraflow_demo_os_executor',sysadmin:0,accessDemo:0}],[{permission_name:'CONNECT SQL'}],[{permission_name:'CONNECT'}],['accept_os_identity_delegation','record_os_identity_result','verify_os_identity_execution_context'].map(object_name=>({schema_name:'platform',object_name,permission_name:'EXECUTE'}))]};}
test('context receipt is bounded, canonical and never host authority',()=>{
 assert.equal(parseContextReceipt(good,command).executionAllowed,false);
 for(const change of [{executionAllowed:true},{validForMs:60001},{intentId:good.jobId},{resourceKey:'root'},{extra:1},{generation:true}])assert.throws(()=>parseContextReceipt({...good,...change},command));
 let called=false;const c={...good};Object.defineProperty(c,'validForMs',{get(){called=true;}});assert.throws(()=>parseContextReceipt(c,command));assert.equal(called,false);
});
test('transport checks exact scope before parameterized context RPC only',async()=>{
 const calls=[];let config;
 class Pool extends EventEmitter{constructor(c){super();config=c;}async connect(){calls.push('connect');}request(){return {query:async()=>{calls.push('metadata');return metadata();},input(name,type,value){assert.equal(name,'json');assert.deepEqual(JSON.parse(value),command);return this;},execute:async proc=>{calls.push(proc);return {recordsets:[[{json:JSON.stringify(good)}]]};}};}async close(){calls.push('close');}}
 const c=createOsExecutionContextClient('x'.repeat(20),{ConnectionPool:Pool,NVarChar:()=>0,MAX:0});
 assert.deepEqual(Object.keys(c).sort(),['context','shutdown']);assert.equal(config.user,'infraflow_demo_os_executor');
 assert.deepEqual(await c.context(command),good);await c.context(command);await c.shutdown();
 assert.deepEqual(calls,['connect','metadata','platform.verify_os_identity_execution_context','metadata','platform.verify_os_identity_execution_context','close']);
});
test('uncertain RPC poisons connection; no retry or secret-bearing error',async()=>{
 let rpc=0;
 class Pool extends EventEmitter{async connect(){}request(){return {query:async()=>metadata(),input(){return this;},execute:async()=>{rpc++;throw Error(command.delegationToken);}};}async close(){}}
 const c=createOsExecutionContextClient('x'.repeat(20),{ConnectionPool:Pool,NVarChar:()=>0,MAX:0});
 await assert.rejects(c.context(command),/^Error: os_execution_context_unconfirmed$/);await assert.rejects(c.context(command));assert.equal(rpc,1);await c.shutdown();
});
