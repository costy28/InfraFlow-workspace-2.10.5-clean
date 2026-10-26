'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto')
const {createEnrollmentMaterial}=require('../demo-platform/enrollment-material')
const {verifyPassword}=require('../demo-platform/operator-credentials')
const {decryptTotpSecret}=require('../demo-platform/operator-store')
test('enrollment material: encrypted secret and hash only, bound to id',async()=>{
  const key=crypto.randomBytes(32),input={id:crypto.randomUUID(),username:'operator',password:'Test-operator-password-123!',totpSecret:'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',keyHex:key.toString('hex')}
  const r=await createEnrollmentMaterial(input)
  assert.deepEqual(Object.keys(r).sort(),['envelope','id','passwordHash','revision','username'])
  assert.equal(JSON.stringify(r).includes(input.password),false);assert.equal(JSON.stringify(r).includes(input.totpSecret),false)
  assert.equal(await verifyPassword(input.password,r.passwordHash),true)
  assert.equal(decryptTotpSecret(r.envelope,{key,id:r.id,revision:1}),input.totpSecret)
})
test('enrollment material: wrong username, extra fields and caller revision refused',async()=>{
  const input={id:crypto.randomUUID(),username:'operator',password:'Test-operator-password-123!',totpSecret:'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',keyHex:crypto.randomBytes(32).toString('hex')}
  for(const patch of [{username:'admin/root'},{revision:5},{keyHex:'x'}])await assert.rejects(createEnrollmentMaterial({...input,...patch}))
})
