'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {prepareOperatorScopeChange}=require('../demo-platform/operator-prepare-change');
const {encryptTotpSecret,decryptTotpSecret}=require('../demo-platform/operator-store');
const {totpAtCounter}=require('../demo-platform/operator-credentials');
const {hashPassword}=require('../demo-platform/operator-credentials');
const {createOperatorAuth}=require('../demo-platform/operator-auth');
const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',key=Buffer.alloc(32,7),id='11111111-1111-4111-8111-111111111111';
function record(){return {id,revision:1,enabled:true,envelope:encryptTotpSecret(secret,{key,id,revision:1}),scopesJson:JSON.stringify(['trial:read','trial:queue','trial:activate','session:own'])};}
test('scope change preserves TOTP, binds new revision and retains exact CAS snapshot',()=>{
 const old=record(),snapshot=JSON.stringify(old),plan=prepareOperatorScopeChange({record:old,key});
 assert.equal(JSON.stringify(old),snapshot);assert.equal(Object.isFrozen(plan),true);
 assert.equal(plan.expectedEnvelope,old.envelope);assert.equal(plan.expectedScopesJson,old.scopesJson);assert.equal(plan.expectedRevision,1);assert.equal(plan.revision,2);
 const decrypted=decryptTotpSecret(plan.envelope,{key,id,revision:2});assert.equal(decrypted,secret);
 assert.equal(totpAtCounter(decrypted,123),totpAtCounter(secret,123));
 assert.throws(()=>decryptTotpSecret(plan.envelope,{key,id,revision:1}));
 assert.throws(()=>decryptTotpSecret(old.envelope,{key,id,revision:2}));
 assert.deepEqual(JSON.parse(plan.scopesJson),[...JSON.parse(old.scopesJson),'trial:prepare']);
 assert.equal(JSON.stringify(plan).includes(secret),false);assert.equal(JSON.stringify(plan).includes(key.toString('hex')),false);
});
test('disabled, duplicate, unknown, already granted scopes or exhausted revisions refused',()=>{
 for(const patch of [{enabled:false},{revision:2147483647},{revision:'1'},{scopesJson:'["trial:read","trial:read"]'},{scopesJson:'["trial:read","trial:purge"]'},{scopesJson:'["trial:read","trial:prepare"]'},{scopesJson:'["trial:queue"]'},{scopesJson:'{}'}])
  assert.throws(()=>prepareOperatorScopeChange({record:{...record(),...patch},key}),/^Error: operator_prepare_change_refused$/);
});
test('wrong key, wrong binding and corrupt envelope fail without secret-bearing errors',()=>{
 const r=record();
 for(const args of [{record:r,key:Buffer.alloc(32,9)},{record:{...r,revision:2},key},{record:{...r,envelope:r.envelope+'x'},key}])
  assert.throws(()=>prepareOperatorScopeChange(args),/^Error: operator_prepare_change_refused$/);
 assert.ok(key.every(v=>v===7));
});
test('same Authenticator works after re-encryption; old session rejected on revision change',async()=>{
 const password='fixture-password-1234',passwordHash=await hashPassword(password);
 let r=record(),at=59000,lastCounter=-1;
 const events=[];
 const store={
  readOperator:async()=>({id,revision:r.revision,enabled:r.enabled,username:'operator',passwordHash,
   totpSecret:decryptTotpSecret(r.envelope,{key,id,revision:r.revision}),scopes:JSON.parse(r.scopesJson)}),
  reserveAttempt:async()=>true,
  claimTotpCounter:async({counter})=>{if(counter<=lastCounter)return false;lastCounter=counter;return true;},
  appendAudit:async event=>events.push(event),
 };
 const auth=createOperatorAuth({store,clock:()=>at});
 const old=await auth.login({username:'operator',password,code:totpAtCounter(secret,1)});
 const plan=prepareOperatorScopeChange({record:r,key});
 // In-memory fixture swap, not a claim about SQL transaction acceptance.
 r={...r,revision:plan.revision,envelope:plan.envelope,scopesJson:plan.scopesJson};
 await assert.rejects(auth.authorize({...old,operation:'trial.read'}));
 at=89000;
 const fresh=await auth.login({username:'operator',password,code:totpAtCounter(secret,2)});
 assert.equal((await auth.authorize({...fresh,operation:'trial.prepare'})).revision,2);
 assert.equal(lastCounter,2);assert.equal(events.at(-1).action,'trial.prepare');auth.shutdown();
});
