'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createProvisionLeaseRuntime,validateCredentialStat}=require('../demo-platform/provision-lease-runtime');
test('lease credential accepts systemd ACL metadata or private service file only',()=>{
 const stat={isFile:()=>true,uid:0,gid:0,nlink:1,size:32,mode:0o100440};
 validateCredentialStat(stat,995);validateCredentialStat({...stat,uid:995,gid:986,mode:0o100400},995);
 for(const patch of [{uid:123},{gid:986},{nlink:2},{size:15},{size:129},{mode:0o100444},{mode:0o100640},{mode:0o104440},{isFile:()=>false}])assert.throws(()=>validateCredentialStat({...stat,...patch},995));
 assert.throws(()=>validateCredentialStat(stat,0));
});
test('startup checks metadata only, clears temporary buffer, shutdown owns both layers',async()=>{
 const password=Buffer.from('fixture-password-1234');let checks=0,commands=0,closes=0;
 const runtime=await createProvisionLeaseRuntime({read:()=>password,createSql:value=>{
  assert.equal(value,'fixture-password-1234');return {check:async()=>{checks++;return {ok:true};},execute:async()=>{commands++;},shutdown:async()=>{closes++;}};
 }});
 assert.equal(checks,1);assert.equal(commands,0);assert.ok(password.every(v=>v===0));
 const stop=runtime.shutdown();assert.equal(runtime.shutdown(),stop);await stop;assert.equal(closes,1);
 await assert.rejects(runtime.execute('claim',{jobId:'b1100b43-48d0-42fa-8a1d-73b1286f8242',expectedJobRevision:0,leaseToken:'ab'.repeat(32)}));
});
test('startup fails closed and masks secrets, closes pool and clears buffer',async()=>{
 const password=Buffer.from('fixture-password-1234');let closes=0;
 await assert.rejects(createProvisionLeaseRuntime({read:()=>password,createSql:()=>({check:async()=>{throw Error('private-secret');},shutdown:async()=>{closes++;}})}),{message:'lease_runtime_unavailable'});
 assert.equal(closes,1);assert.ok(password.every(v=>v===0));
});
test('no arbitrary credential directory, old operator unit, env fallback or malformed secret',async()=>{
 let reads=0,creates=0;
 for(const directory of ['/tmp/arbitrary','/run/credentials/infraflow-demo-platform.service'])await assert.rejects(createProvisionLeaseRuntime({directory,read:()=>{reads++;}}),{message:'lease_runtime_unavailable'});
 assert.equal(reads,0);
 for(const value of ['plain-string',Buffer.from('short'),Buffer.from('fixture-password-1234\n')]){
  await assert.rejects(createProvisionLeaseRuntime({read:()=>value,createSql:()=>{creates++;}}),{message:'lease_runtime_unavailable'});
  if(Buffer.isBuffer(value))assert.ok(value.every(v=>v===0));
 }
 assert.equal(creates,0);
});
