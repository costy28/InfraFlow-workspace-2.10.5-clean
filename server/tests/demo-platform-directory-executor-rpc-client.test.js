'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createDirectoryExecutorRpcClient:create,parseDirectoryResultInput:parse}=require('../demo-platform/directory-executor-rpc-client');
const binding={jobId:'10000000-0000-0000-0000-000000000001',trialId:'20000000-0000-0000-0000-000000000002',intentId:'30000000-0000-0000-0000-000000000003',priorOsIntentId:'40000000-0000-0000-0000-000000000004',attemptId:'50000000-0000-0000-0000-000000000005',generation:5,jobRevision:10,uid:992,gid:983};
const attemptToken='ab'.repeat(32);
function report(){return {attemptToken,outcome:'observed_created',journalDigest:'cd'.repeat(32),observations:Array.from({length:8},(_,ordinal)=>({ordinal,uid:[0,1,3].includes(ordinal)?0:992,gid:ordinal<2?0:983,mode:ordinal<2?'0711':ordinal===3?'0750':'0700',device:'1',inode:(18446744073709551615n-BigInt(ordinal)).toString()}))};}
function fixture({mutate=x=>x,badScope=false,fail=false,wait=false}={}){
 const state={calls:[],closes:0,inputs:[]};
 class Pool extends EventEmitter{constructor(c){super();state.config=c;}async connect(){}request(){return {query:async()=>({recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login:'infraflow_demo_directory_executor',principal:'infraflow_demo_directory_executor',sysadmin:0,accessDemo:0}],[{permission_name:'CONNECT SQL'}],[{permission_name:'CONNECT'}],(badScope?['verify_tenant_directory_context']:['verify_tenant_directory_context','record_tenant_directory_result']).map(object_name=>({schema_name:'platform',object_name,permission_name:'EXECUTE'}))]}),input(k,t,v){state.inputs.push(JSON.parse(v));return this;},execute:async proc=>{
  state.calls.push(proc);if(fail)throw Error('private-driver-error');if(wait)await new Promise(r=>state.finish=r);
  let r;if(proc.endsWith('context'))r={...binding,storageRoot:'/var/lib/infraflow-demo-tenants/'+binding.trialId,configRoot:'/etc/infraflow-demo-tenants/'+binding.trialId,validForMs:30000,contextReady:true,executionAllowed:false};
  else{const p=state.inputs.at(-1),{uid,gid,...common}=binding;r={...common,outcome:p.outcome,confirmedCount:p.outcome==='uncertain'?0:8,journalDigest:p.journalDigest,executionAllowed:false,reconciliationRequired:true};}
  return {recordsets:[[{json:JSON.stringify(mutate(r))}]]};
 }};}async close(){state.closes++;}}
 return {state,client:create({password:'x'.repeat(20),binding,driver:{ConnectionPool:Pool,NVarChar:()=>0,MAX:-1}})};
}
test('context and exact eight-row report are bound and parameterized, single terminal report',async()=>{
 const {client,state}=fixture();await client.check();const c=await client.context({attemptToken});assert.equal(c.executionAllowed,false);
 const r=await client.report(report());assert.equal(r.confirmedCount,8);assert.equal(state.inputs[1].observations[0].inode,'18446744073709551615');assert.equal(state.config.user,'infraflow_demo_directory_executor');
 await assert.rejects(client.report(report()));await assert.rejects(client.context({attemptToken}));assert.equal(state.calls.length,2);await client.shutdown();assert.equal(state.closes,1);
});
test('uncertain result allowed explicitly with null digest and zero rows only',async()=>{
 const {client,state}=fixture();const r=await client.report({attemptToken,outcome:'uncertain',journalDigest:null,observations:[]});assert.equal(r.confirmedCount,0);assert.equal(state.calls.length,1);await client.shutdown();
});
test('invalid ownership, decimal strings, duplicates and getters refused before RPC',()=>{
 for(const mutate of [p=>p.observations[0].uid=true,p=>p.observations[3].gid=1,p=>p.observations[0].device='1 ',p=>p.observations[0].inode='18446744073709551616',p=>p.observations[0].inode='01',p=>p.observations[0].inode=123,p=>p.observations[1].inode=p.observations[0].inode,p=>p.observations.push({})]){const p=report();mutate(p);assert.throws(()=>parse(p,binding));}
 const p=report();let invoked=false;Object.defineProperty(p.observations,'0',{get(){invoked=true;return {};}});assert.throws(()=>parse(p,binding));assert.equal(invoked,false);
});
test('scope, stale/mismatched receipts and uncertain connection poison client without fallback write',async()=>{
 for(const mutate of [r=>({...r,executionAllowed:true}),r=>({...r,validForMs:14999}),r=>({...r,jobRevision:8}),r=>({...r,attemptId:binding.intentId})]){
  const {client,state}=fixture({mutate});await assert.rejects(client.context({attemptToken}));await assert.rejects(client.report({attemptToken,outcome:'uncertain',journalDigest:null,observations:[]}));assert.equal(state.calls.length,1);await client.shutdown();
 }
 const a=fixture({badScope:true});await assert.rejects(a.client.context({attemptToken}));assert.equal(a.state.calls.length,0);await a.client.shutdown();
 const b=fixture({fail:true});await assert.rejects(b.client.context({attemptToken}),/^Error: directory_executor_rpc_unconfirmed$/);await assert.rejects(b.client.context({attemptToken}));assert.equal(b.state.calls.length,1);await b.client.shutdown();
});
test('observed report requires context; token substitution and late success refused',async()=>{
 const a=fixture();await assert.rejects(a.client.report(report()));assert.equal(a.state.calls.length,0);await a.client.context({attemptToken});await assert.rejects(a.client.context({attemptToken:'ff'.repeat(32)}));assert.equal(a.state.calls.length,1);await a.client.shutdown();
 const {client,state}=fixture({wait:true});const task=client.context({attemptToken}),settled=Promise.allSettled([task]);await new Promise(r=>setImmediate(r));await assert.rejects(client.check());const stop=client.shutdown();state.finish();await stop;assert.equal((await settled)[0].status,'rejected');assert.equal(state.closes,1);
});
