'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {createTrialRegistration}=require('../demo-platform/trial-registration')
const input={approvalId:'fixture:lead-1',companyName:'Fixture SRL',commandId:'fixture:queue-1',confirmed:true}
const actor={operatorId:'11111111-1111-4111-8111-111111111111',revision:3}
test('registration actor is taken only from authorized session and writes follow CSRF authorization',async()=>{
  const calls=[]
  const command=createTrialRegistration({runtime:{authorize:async value=>{calls.push(value);return actor}},registrar:{queue:async value=>{calls.push(value);return {state:'queued'}}}})
  assert.equal((await command.queue({token:'token',csrfToken:'csrf',input})).state,'queued')
  assert.equal(calls[0].operation,'trial.queue');assert.equal(calls[0].csrfToken,'csrf')
  assert.deepEqual(calls[1],{operatorId:actor.operatorId,operatorRevision:3,approvalId:input.approvalId,companyName:input.companyName,commandId:input.commandId})
  assert.equal(calls[2].operation,'trial.read')
  for(const patch of [{operatorId:actor.operatorId},{operatorRevision:0},{confirmed:false}])await assert.rejects(command.queue({input:{...input,...patch}}),{code:'registration_input_invalid'})
})
test('denied scope or CSRF never calls registrar',async()=>{
  let writes=0
  const command=createTrialRegistration({runtime:{authorize:async()=>{throw Error()}},registrar:{queue:async()=>{writes++}}})
  await assert.rejects(command.queue({input}),{code:'registration_access_denied'});assert.equal(writes,0)
})
test('conflict distinct from uncertain result; revocation after commit is not represented as no-write',async()=>{
  for(const reason of ['trial_registration_conflict','transport-private']){
    let writes=0
    const command=createTrialRegistration({runtime:{authorize:async()=>actor},registrar:{queue:async()=>{writes++;throw Error(reason)}}})
    await assert.rejects(command.queue({input}),{code:reason==='trial_registration_conflict'?'registration_conflict':'registration_result_unconfirmed'})
    assert.equal(writes,1)
  }
  let checks=0
  const command=createTrialRegistration({runtime:{authorize:async()=>{if(++checks>1)throw Error();return actor}},registrar:{queue:async()=>({state:'queued'})}})
  await assert.rejects(command.queue({input}),{code:'registration_result_unconfirmed'})
})
