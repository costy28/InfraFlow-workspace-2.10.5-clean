'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createDirectoryCycleBroker:create}=require('../demo-platform/directory-cycle-sql-broker');
const initial={jobId:'10000000-0000-0000-0000-000000000001',trialId:'20000000-0000-0000-0000-000000000002',intentId:'30000000-0000-0000-0000-000000000003',priorOsIntentId:'40000000-0000-0000-0000-000000000004',attemptId:'50000000-0000-0000-0000-000000000005',uid:992,gid:983,expectedJobRevision:7};
const token='ab'.repeat(32),attemptToken='cd'.repeat(32);
const lease={jobId:initial.jobId,generation:4,expectedJobRevision:8,leaseToken:token};
function fixture(failPrepare=false){
 const state={calls:[],closed:0};
 class Pool extends EventEmitter{async connect(){}request(){const p={};return {input(k,t,v){p[k]=v;return this;},query:async()=>({recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login:'infraflow_demo_lease',principal:'infraflow_demo_lease',sysadmin:0,accessDemo:0}],[{permission_name:'CONNECT SQL'}],[{permission_name:'CONNECT'}],['provision_lease_command','record_step_intent','adapter_review_ticket_command','prepare_os_identity_delegation','prepare_tenant_directories'].map(object_name=>({schema_name:'platform',object_name,permission_name:'EXECUTE'}))]}),execute:async proc=>{
  state.calls.push(proc+':'+(p.operation||''));let r;
  if(proc==='platform.provision_lease_command')r={jobId:initial.jobId,generation:4,jobRevision:p.operation==='claim'?8:9,leaseExpiresAt:p.operation==='claim'?'2026-11-01T12:00:00.000':null,executionAllowed:false};
  else if(proc==='platform.record_step_intent')r={jobId:initial.jobId,generation:4,intentId:initial.intentId,step:'tenant_directories',state:'intent_recorded',executionAllowed:false};
  else if(proc==='platform.prepare_tenant_directories'){
   if(failPrepare)throw Error('lost-response');const {expectedJobRevision,...b}=initial;r={...b,generation:4,jobRevision:8,storageRoot:'/var/lib/infraflow-demo-tenants/'+initial.trialId,configRoot:'/etc/infraflow-demo-tenants/'+initial.trialId,state:'prepared',executionAllowed:false};
  }else throw Error('unexpected');return {recordsets:[[{json:JSON.stringify(r)}]]};
 }};}async close(){state.closed++;}}
 return {state,broker:create('x'.repeat(20),{ConnectionPool:Pool,NVarChar:()=>0,VarChar:()=>0,MAX:-1})};
}
async function throughIntent(b){await b.request('init',initial);await b.request('claim',{jobId:initial.jobId,expectedJobRevision:7,leaseToken:token});await b.request('intent',{...lease,intentId:initial.intentId,step:'tenant_directories'});}
test('bound claim intent prepare release cycle keeps execution disabled',async()=>{
 const {broker:b,state}=fixture();await throughIntent(b);assert.equal((await b.request('prepare',{leaseToken:token,attemptToken})).executionAllowed,false);
 assert.equal((await b.request('release',lease)).jobRevision,9);await b.shutdown();assert.equal(state.calls.length,4);assert.equal(state.closed,2);
});
test('lost prepare response never triggers retry or compensating release',async()=>{
 const {broker:b,state}=fixture(true);await throughIntent(b);await assert.rejects(b.request('prepare',{leaseToken:token,attemptToken}));await assert.rejects(b.request('release',lease));await b.shutdown();assert.equal(state.calls.length,3);assert.ok(!state.calls.includes('platform.provision_lease_command:release'));
});
test('release before preparation and foreign lease are refused without mutation',async()=>{
 for(const [action,payload]of [['release',lease],['claim',{jobId:initial.intentId,expectedJobRevision:7,leaseToken:token}]]){
  const {broker:b,state}=fixture();await b.request('init',initial);await assert.rejects(b.request(action,payload));assert.equal(state.calls.length,0);await b.shutdown();
 }
});
