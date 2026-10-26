'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {hashPassword,verifyPassword,totpAtCounter,acceptedTotpCounter}=require('../demo-platform/operator-credentials')
const {createOperatorAuth}=require('../demo-platform/operator-auth')
const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',password='Test-password-only-123!'
let stored
async function fixture(){
  stored??=await hashPassword(password)
  let at=59000,counter=-1,attempts=0,auditFails=false,disabled=false,revision=1
  const events=[]
  const store={
    async readOperator(){return {id:'11111111-1111-4111-8111-111111111111',revision,enabled:!disabled,username:'operator',passwordHash:stored,totpSecret:secret,scopes:['trial:read','trial:queue','session:own']}},
    async reserveAttempt(){return ++attempts<=5},
    async claimTotpCounter(input){if(input.counter<=counter)return false;counter=input.counter;return true},
    async appendAudit(event){if(auditFails)throw Error('SECRET_STORE_ERROR');events.push(event)},
  }
  return {auth:createOperatorAuth({store,clock:()=>at}),store,events,input:()=>({username:'operator',password,code:totpAtCounter(secret,Math.floor(at/30000))}),
    time:n=>{at=n},auditFailure:()=>{auditFails=true},disable:()=>{disabled=true},rotate:()=>{revision++}}
}
test('operator password: scrypt salt independent, good/bad/malformed hashes',async()=>{
  const a=await hashPassword(password),b=await hashPassword(password)
  assert.notEqual(a,b);assert.equal(await verifyPassword(password,a),true)
  assert.equal(await verifyPassword('Different-password-123!',a),false);assert.equal(await verifyPassword(password,'corrupt'),false)
})
test('operator TOTP: RFC secret vector truncated to 6 digits and bounded window',()=>{
  assert.equal(totpAtCounter(secret,1),'287082')
  assert.equal(acceptedTotpCounter(secret,'287082',59000),1)
  assert.equal(acceptedTotpCounter(secret,'287082',60000),1)
  assert.equal(acceptedTotpCounter(secret,'287082',90000),null)
  assert.equal(acceptedTotpCounter(secret,totpAtCounter(secret,3),60000),null)
})
test('operator login: both factors required, OTP replay refused across auth instances',async()=>{
  const f=await fixture()
  await assert.rejects(f.auth.login({...f.input(),password:'Wrong-password-123!'}),/operator_access_denied/)
  const session=await f.auth.login(f.input());assert.match(session.token,/^[a-f0-9]{64}$/)
  const other=createOperatorAuth({store:f.store,clock:()=>59000})
  await assert.rejects(other.login(f.input()),/operator_access_denied/)
  assert.equal(f.events.length,1);assert.equal(JSON.stringify(f.events).includes(password),false)
})
test('operator sessions: scope, CSRF, logout, idle expiration and closed instance',async()=>{
  const f=await fixture(),s=await f.auth.login(f.input())
  assert.equal((await f.auth.authorize({...s,operation:'trial.read'})).operation,'trial.read')
  await assert.rejects(f.auth.authorize({token:s.token,operation:'trial.queue'}),/operator_access_denied/)
  await f.auth.authorize({...s,operation:'trial.queue'})
  await assert.rejects(f.auth.authorize({...s,operation:'trial.activate'}),/operator_access_denied/)
  const g=await fixture(),t=await g.auth.login(g.input());await g.auth.authorize({...t,operation:'session.logout'})
  await assert.rejects(g.auth.authorize({...t,operation:'trial.read'}))
  const h=await fixture(),u=await h.auth.login(h.input());h.time(59000+15*60000)
  await assert.rejects(h.auth.authorize({...u,operation:'trial.read'}))
  f.auth.shutdown();await assert.rejects(f.auth.login(f.input()))
})

test('session resume restores CSRF after reload, rotates it, and refuses revoked sessions',async()=>{
  const f=await fixture(),session=await f.auth.login(f.input())
  const resumed=await f.auth.resume({token:session.token})
  assert.notEqual(resumed.csrfToken,session.csrfToken)
  assert.equal(resumed.expiresAt,session.expiresAt)
  assert.equal(Object.hasOwn(resumed,'token'),false)
  await assert.rejects(f.auth.authorize({...session,operation:'session.logout'}))
  await f.auth.authorize({token:session.token,csrfToken:resumed.csrfToken,operation:'session.logout'})
  await assert.rejects(f.auth.resume({token:session.token}))
})
test('operator store and audit failure deny access; revision change revokes session',async()=>{
  const f=await fixture();f.auditFailure();await assert.rejects(f.auth.login(f.input()),{message:'operator_access_denied'})
  const g=await fixture(),s=await g.auth.login(g.input());g.rotate();await assert.rejects(g.auth.authorize({...s,operation:'trial.read'}))
  assert.throws(()=>createOperatorAuth({store:{}}),/operator_store_required/)
})
test('operator attempt budget persists through auth instance replacement via store port',async()=>{
  const f=await fixture()
  for(let i=0;i<5;i++)await assert.rejects(f.auth.login({...f.input(),code:'invalid'}))
  const other=createOperatorAuth({store:f.store,clock:()=>59000})
  await assert.rejects(other.login(f.input()),/operator_access_denied/)
})
test('operator revocation during audit denies both login and existing-session authorization',async()=>{
  const f=await fixture(),original=f.store.appendAudit
  f.store.appendAudit=async e=>{await original(e);f.rotate()}
  await assert.rejects(f.auth.login(f.input()),/operator_access_denied/)
  const g=await fixture(),s=await g.auth.login(g.input()),append=g.store.appendAudit
  g.store.appendAudit=async e=>{await append(e);g.rotate()}
  await assert.rejects(g.auth.authorize({...s,operation:'trial.read'}),/operator_access_denied/)
})
