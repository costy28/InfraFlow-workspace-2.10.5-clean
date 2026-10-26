'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {createOperatorRuntime,validateCredentialStat,validateMaterial}=require('../demo-platform/operator-runtime')
const {encryptTotpSecret}=require('../demo-platform/operator-store')
test('operator runtime credentials: service-owned read-only regular files only',()=>{
  const stat={isFile:()=>true,uid:995,gid:986,nlink:1,mode:0o100400,size:32}
  validateCredentialStat(stat,995)
  for(const patch of [{uid:0},{nlink:2},{mode:0o100640},{mode:0o104400},{size:129},{isFile:()=>false}])assert.throws(()=>validateCredentialStat({...stat,...patch},995))
  assert.throws(()=>validateCredentialStat(stat,0))
})
test('systemd 255 root ACL credential accepted only with root group and exact read-only mode',()=>{
  const stat={isFile:()=>true,uid:0,gid:0,nlink:1,mode:0o100440,size:32}
  validateCredentialStat(stat,995)
  for(const patch of [{gid:986},{uid:123},{mode:0o100444},{mode:0o100640},{mode:0o104440},{nlink:2}])assert.throws(()=>validateCredentialStat({...stat,...patch},995))
})
test('operator runtime validates exact material without trimming secrets',()=>{
  const material={key:Buffer.alloc(32),password:Buffer.from('test-password-1234'),id:Buffer.from('12345678-1234-4234-8234-123456789abc')}
  validateMaterial(material)
  for(const patch of [{key:Buffer.alloc(31)},{password:Buffer.from('short')},{password:Buffer.from('test-password-1234\n')},{id:Buffer.from('invalid')}])assert.throws(()=>validateMaterial({...material,...patch}))
})
test('operator runtime fails closed, closes client and clears credential buffers',async()=>{
  const values={'operator-key':Buffer.alloc(32,1),'operator-sql-password':Buffer.from('test-password-1234'),'operator-id':Buffer.from('12345678-1234-4234-8234-123456789abc')}
  let closed=0,calls=[]
  await assert.rejects(createOperatorRuntime({read:name=>values[name],createClient:()=>({execute:async(command)=>{calls.push(command);throw Error('sensitive driver detail')},shutdown:async()=>{closed++}})}),{message:'operator_runtime_unavailable'})
  assert.equal(closed,1);assert.deepEqual(calls,['read_account'])
  for(const value of Object.values(values))assert.ok(value.every(byte=>byte===0))
})
test('operator runtime checks account through procedure, no OTP calls, closes once',async()=>{
  const id='12345678-1234-4234-8234-123456789abc',key=Buffer.alloc(32,2)
  const envelope=encryptTotpSecret('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',{key,id,revision:1})
  const values={'operator-key':key,'operator-sql-password':Buffer.from('test-password-1234'),'operator-id':Buffer.from(id)}
  let closed=0,calls=[]
  const runtime=await createOperatorRuntime({read:name=>values[name],createClient:()=>({execute:async command=>{calls.push(command);return JSON.stringify({id,username:'infraop',enabled:true,revision:1,passwordHash:'unused',envelope,scopes:['trial:read']})},shutdown:async()=>{closed++}})})
  assert.deepEqual(await runtime.check(),{ok:true,code:'platform_operator_runtime_verified'})
  assert.deepEqual(calls,['read_account','read_account'])
  const stopping=runtime.shutdown();assert.equal(runtime.shutdown(),stopping);await stopping
  assert.equal(closed,1)
  await assert.rejects(runtime.check())
})
