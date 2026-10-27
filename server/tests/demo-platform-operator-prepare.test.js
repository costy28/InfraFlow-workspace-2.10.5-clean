'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createOperatorAuth}=require('../demo-platform/operator-auth');
const {hashPassword,totpAtCounter}=require('../demo-platform/operator-credentials');
const {validateCommand}=require('../demo-platform/operator-sql-client');
test('prepare requires its own scope and CSRF; successful authorization audited',async()=>{
 const password='fixture-password-1234',passwordHash=await hashPassword(password),totpSecret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 async function fixture(scopes){
  const events=[];let revision=1;
  const store={readOperator:async()=>({id:'11111111-1111-4111-8111-111111111111',revision,enabled:true,username:'operator',passwordHash,totpSecret,scopes}),
   reserveAttempt:async()=>true,claimTotpCounter:async()=>true,appendAudit:async e=>{events.push(e);}};
  const auth=createOperatorAuth({store,clock:()=>59000});
  const session=await auth.login({username:'operator',password,code:totpAtCounter(totpSecret,1)});
  return {auth,session,events,rotate:()=>{revision++;}};
 }
 const no=await fixture(['trial:read','trial:queue','session:own']);
 await assert.rejects(no.auth.authorize({...no.session,operation:'trial.prepare'}),/operator_access_denied/);
 assert.equal(no.events.some(e=>e.action==='trial.prepare'),false);no.auth.shutdown();
 const yes=await fixture(['trial:read','trial:prepare','session:own']);
 await assert.rejects(yes.auth.authorize({token:yes.session.token,operation:'trial.prepare'}),/operator_access_denied/);
 const actor=await yes.auth.authorize({...yes.session,operation:'trial.prepare'});assert.equal(actor.revision,1);
 assert.equal(yes.events.filter(e=>e.action==='trial.prepare').length,1);
 validateCommand('append_audit',{id:actor.operatorId,action:'trial.prepare'});
 yes.rotate();await assert.rejects(yes.auth.authorize({...yes.session,operation:'trial.prepare'}));yes.auth.shutdown();
});
