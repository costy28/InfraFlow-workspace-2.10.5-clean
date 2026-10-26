'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto')
const fs=require('node:fs'),path=require('node:path')
const {encryptTotpSecret,decryptTotpSecret,createSqlOperatorStore}=require('../demo-platform/operator-store')
const id='11111111-1111-4111-8111-111111111111',secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
test('operator envelope: random nonce, authenticated id/revision/key and ciphertext',()=>{
  const key=crypto.randomBytes(32),options={key,id,revision:1}
  const a=encryptTotpSecret(secret,options),b=encryptTotpSecret(secret,options)
  assert.notEqual(a,b);assert.equal(a.includes(secret),false);assert.equal(decryptTotpSecret(a,options),secret)
  for(const patch of [{key:crypto.randomBytes(32)},{revision:2},{id:'22222222-2222-4222-8222-222222222222'}])
    assert.throws(()=>decryptTotpSecret(a,{...options,...patch}),{message:'operator_store_unavailable'})
  const bytes=Buffer.from(a.slice(7),'base64');bytes[30]^=1
  assert.throws(()=>decryptTotpSecret('gcm-v1:'+bytes.toString('base64'),options))
})
test('operator store: input restrictions, no secret in SQL payload and shutdown',async()=>{
  const key=crypto.randomBytes(32),envelope=encryptTotpSecret(secret,{key,id,revision:1}),calls=[]
  const store=createSqlOperatorStore({operatorId:id,key,execute:async(sql,input)=>{
    calls.push({sql,input})
    if(sql.includes('password_hash passwordHash'))return JSON.stringify({id,username:'operator',revision:1,enabled:true,passwordHash:'hash',envelope,scopes:['trial:read']})
    return '1'
  }})
  assert.equal((await store.readOperator()).totpSecret,secret)
  assert.equal(await store.reserveAttempt({operatorId:id,now:1000,limit:5,windowMs:900000}),true)
  assert.equal(await store.claimTotpCounter({operatorId:id,revision:1,counter:123}),true)
  await store.appendAudit({operatorId:id,action:'operator_login',at:1000})
  assert.equal(JSON.stringify(calls).includes(secret),false)
  await assert.rejects(store.reserveAttempt({operatorId:id,now:1000,limit:999,windowMs:900000}))
  await assert.rejects(store.claimTotpCounter({operatorId:'other',revision:1,counter:1}))
  store.shutdown();assert.equal(key.equals(Buffer.alloc(32)),false)
  await assert.rejects(store.readOperator(),{message:'operator_store_unavailable'})
})
test('operator store: provider errors and corrupt payload fail closed',async()=>{
  for(const execute of [async()=>{throw Error('SECRET')},async()=>'{corrupt']){
    const store=createSqlOperatorStore({operatorId:id,key:crypto.randomBytes(32),execute})
    await assert.rejects(store.readOperator(),{message:'operator_store_unavailable'})
  }
})
test('operator migration: private schema, no identities or access grants',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'../../db/demo-platform-migrations/003_operator_security.sql'),'utf8')
  for(const marker of ['platform_database_required','operator_security.accounts','operator_security.audit','OPERATOR_SECURITY_ALREADY_APPLIED','ROLLBACK'])assert.ok(sql.includes(marker))
  assert.equal(/CREATE LOGIN|GRANT |INSERT operator_security.accounts/.test(sql),false)
})
