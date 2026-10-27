'use strict'
const {validateInput}=require('./trial-registrar')
const failure=code=>Object.assign(Error(code),{code})
function createTrialRegistration({runtime,registrar}){
  if(typeof runtime?.authorize!=='function'||typeof registrar?.queue!=='function')throw Error('registration_configuration_invalid')
  return {
    async queue({token,csrfToken,input}){
      if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).sort().join(',')!=='approvalId,commandId,companyName,confirmed'||input.confirmed!==true)throw failure('registration_input_invalid')
      let actor
      try{actor=await runtime.authorize({token,csrfToken,operation:'trial.queue'})}catch{throw failure('registration_access_denied')}
      let command
      try{command=validateInput({operatorId:actor.operatorId,operatorRevision:actor.revision,approvalId:input.approvalId,commandId:input.commandId,companyName:input.companyName})}catch{throw failure('registration_input_invalid')}
      let result
      try{result=await registrar.queue(command)}catch(error){
        if(error.message==='trial_registration_conflict')throw failure('registration_conflict')
        throw failure('registration_result_unconfirmed')
      }
      // A revoked session must not receive the receipt. The command may already be committed.
      try{await runtime.authorize({token,operation:'trial.read'})}catch{throw failure('registration_result_unconfirmed')}
      return result
    },
  }
}
module.exports={createTrialRegistration}
