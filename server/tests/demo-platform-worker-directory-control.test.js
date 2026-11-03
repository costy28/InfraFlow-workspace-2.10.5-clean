'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createWorkerDirectoryControlSql:create,parseDirectoryIntent:parse}=require('../demo-platform/worker-directory-control-sql');
const input={jobId:'10000000-0000-0000-0000-000000000001',generation:4,expectedJobRevision:8,leaseToken:'ab'.repeat(32),intentId:'30000000-0000-0000-0000-000000000003',step:'tenant_directories'};
function fixture({badScope=false,wait=false}={}){
 const state={calls:[],closes:0,params:{}};
 class Pool extends EventEmitter{async connect(){}request(){return {query:async()=>({recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login:'infraflow_demo_lease',principal:'infraflow_demo_lease',sysadmin:0,accessDemo:0}],[{permission_name:'CONNECT SQL'}],[{permission_name:'CONNECT'}],(badScope?['provision_lease_command']:['provision_lease_command','record_step_intent','adapter_review_ticket_command','prepare_os_identity_delegation','prepare_tenant_directories']).map(object_name=>({schema_name:'platform',object_name,permission_name:'EXECUTE'}))]}),input(k,t,v){state.params[k]=v;return this;},execute:async proc=>{state.calls.push(proc);if(wait)await new Promise(r=>state.finish=r);return {recordsets:[[{json:'{"executionAllowed":false}'}]]};}};}async close(){state.closes++;}}
 return {state,client:create('x'.repeat(20),{ConnectionPool:Pool,NVarChar:()=>0,VarChar:()=>0,MAX:-1})};
}
test('intent parser permits only canonical directory intent and no getters',()=>{
 assert.deepEqual(parse(input),input);for(const bad of [{...input,step:'os_identity'},{...input,path:'/tmp'},{...input,generation:true}])assert.throws(()=>parse(bad));
 let invoked=false;const bad={...input};Object.defineProperty(bad,'step',{get(){invoked=true;return 'tenant_directories';}});assert.throws(()=>parse(bad));assert.equal(invoked,false);
});
test('control transport parameterizes only claim/release and directory intent',async()=>{
 const {client,state}=fixture();await client.check();assert.equal(state.calls.length,0);
 await client.execute('platform.record_step_intent',{json:JSON.stringify(input)});assert.deepEqual(JSON.parse(state.params.json),input);
 const {jobId,leaseToken}=input;await client.execute('platform.provision_lease_command',{operation:'claim',json:JSON.stringify({jobId,leaseToken,expectedJobRevision:7})});
 await client.execute('platform.provision_lease_command',{operation:'release',json:JSON.stringify({jobId,leaseToken,generation:4,expectedJobRevision:8})});
 assert.deepEqual(state.calls,['platform.record_step_intent','platform.provision_lease_command','platform.provision_lease_command']);await client.shutdown();assert.equal(state.closes,1);
});
test('forbidden RPC, renew and OS intent refused before SQL operation',async()=>{
 const {client,state}=fixture();
 for(const [proc,args]of [['platform.prepare_tenant_directories',{json:JSON.stringify(input)}],['platform.record_step_intent',{json:JSON.stringify({...input,step:'os_identity'})}],['platform.provision_lease_command',{operation:'renew',json:JSON.stringify(input)}]])await assert.rejects(client.execute(proc,args));
 assert.equal(state.calls.length,0);await client.shutdown();
});
test('old scope refuses mutation and shutdown rejects late success',async()=>{
 const a=fixture({badScope:true});await assert.rejects(a.client.execute('platform.record_step_intent',{json:JSON.stringify(input)}));assert.equal(a.state.calls.length,0);await a.client.shutdown();
 const {client,state}=fixture({wait:true});const pending=client.execute('platform.record_step_intent',{json:JSON.stringify(input)}),settled=Promise.allSettled([pending]);await new Promise(r=>setImmediate(r));await assert.rejects(client.check());const stop=client.shutdown();state.finish();await stop;assert.equal((await settled)[0].status,'rejected');assert.equal(state.closes,1);
});
