'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {probe}=require('../demo-platform/os-integrated-negative-probe');
function metadata(){return {recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login:'infraflow_demo_os_executor',principal:'infraflow_demo_os_executor',sysadmin:0,accessDemo:0}],[{permission_name:'CONNECT SQL'}],[{permission_name:'CONNECT'}],['accept_os_identity_delegation','record_os_identity_result','verify_os_identity_execution_context'].map(object_name=>({schema_name:'platform',object_name,permission_name:'EXECUTE'}))]};}
function driver({error=54212,broad=false,success=false}={}){
 const calls=[];
 class Pool extends EventEmitter{constructor(c){super();assert.equal(c.user,'infraflow_demo_os_executor');assert.equal(c.server,'127.0.0.1');}async connect(){calls.push('connect');}request(){return {query:async()=>{calls.push('metadata');const r=metadata();if(broad)r.recordsets[0][0].sysadmin=1;return r;},input(name,type,value){assert.equal(name,'json');assert.deepEqual(JSON.parse(value),{intentId:'00000000-0000-0000-0000-000000000000',delegationToken:'00'.repeat(32)});return this;},execute:async proc=>{assert.equal(proc,'platform.verify_os_identity_execution_context');calls.push('context');if(success)return {recordsets:[]};throw Object.assign(Error('private driver detail'),{number:error});}};}async close(){calls.push('close');}}
 return {value:{ConnectionPool:Pool,NVarChar:()=>0,MAX:0},calls};
}
test('integrated real SQL negative probe accepts only expected binding refusal and wipes secret',async()=>{
 const d=driver(),secret=Buffer.from('x'.repeat(20));await probe({read:()=>secret,driver:d.value});
 assert.deepEqual(d.calls,['connect','metadata','context','close']);assert.ok(secret.every(x=>x===0));
});
test('network, wrong SQL errors or unexpected success never count as a denied gate',async()=>{
 for(const opts of [{error:229},{error:'ETIMEOUT'},{success:true},{broad:true}]){
  const d=driver(opts),secret=Buffer.from('x'.repeat(20));
  await assert.rejects(probe({read:()=>secret,driver:d.value}),/^Error: integrated_sql_negative_gate_unconfirmed$/);
  assert.equal(d.calls.filter(x=>x==='context').length,opts.broad?0:1);assert.equal(d.calls.at(-1),'close');assert.ok(secret.every(x=>x===0));
 }
});
