'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {createRegistrarRuntime,validateCredentialStat}=require('../demo-platform/registrar-runtime')
test('registrar credential: exact systemd root ACL or private service-owned file',()=>{
  const stat={isFile:()=>true,uid:0,gid:0,nlink:1,mode:0o100440,size:32}
  validateCredentialStat(stat,995);validateCredentialStat({...stat,uid:995,gid:986,mode:0o100400},995)
  for(const patch of [{gid:986},{mode:0o100444},{mode:0o100640},{mode:0o104440},{nlink:2},{size:129},{isFile:()=>false}])assert.throws(()=>validateCredentialStat({...stat,...patch},995))
})
test('registrar runtime checks identity only and zeroes temporary password buffer',async()=>{
  const password=Buffer.from('fixture-password-1234');let checks=0,queues=0
  const client={check:async()=>{checks++},queue:()=>{queues++},shutdown:async()=>{}}
  const result=await createRegistrarRuntime({read:()=>password,createClient:value=>{assert.equal(value,'fixture-password-1234');return client}})
  assert.equal(result,client);assert.equal(checks,1);assert.equal(queues,0)
  assert.ok(password.every(byte=>byte===0));await result.shutdown()
})
test('registrar runtime closes failed client, masks errors, rejects invalid directories',async()=>{
  let closes=0
  await assert.rejects(createRegistrarRuntime({read:()=>Buffer.from('fixture-password-1234'),createClient:()=>({check:async()=>{throw Error('private-error')},shutdown:async()=>{closes++}})}),{message:'registrar_runtime_unavailable'})
  assert.equal(closes,1)
  await assert.rejects(createRegistrarRuntime({directory:'/tmp/arbitrary',read:()=>{throw Error('must-not-read')}}),{message:'registrar_runtime_unavailable'})
})
