'use strict'
// Pure policy only: no SQL, provisioning, authority decisions or deletion effects.
const DAY=86400000,TRIAL_DAYS=15
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
const fail=code=>{throw Object.assign(Error(code),{code})}
const time=n=>{if(!Number.isSafeInteger(n)||n<0||n>253402300799999-TRIAL_DAYS*DAY)fail('invalid_trial_time')}
function resources(id){if(!uuid(id))fail('invalid_trial_id');return {database:'INFRAFLOW_DEMO_T_'+id.replaceAll('-','').toUpperCase(),storageKey:id,runtimeKey:id,keyRef:'trial:'+id}}
function createTrialRecord(input,{id,now}){
  if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).sort().join(',')!=='approvalId,companyName'
    ||typeof input.approvalId!=='string'||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(input.approvalId)
    ||typeof input.companyName!=='string')fail('invalid_trial_request')
  const companyName=input.companyName.trim().normalize('NFC')
  if(!companyName||companyName.length>200||/[\x00-\x1f\x7f]/.test(companyName))fail('invalid_trial_company')
  time(now)
  return {id,approvalId:input.approvalId,companyName,state:'queued',revision:0,createdAt:now,activatedAt:null,expiresAt:null,resources:resources(id)}
}
function activateTrialRecord(record,now){
  time(now)
  if(!record||!uuid(record.id)||record.state!=='awaiting_activation'||record.activatedAt!==null||record.expiresAt!==null
    ||!Number.isSafeInteger(record.createdAt)||record.createdAt<0||now<record.createdAt
    ||!Number.isSafeInteger(record.revision)||record.revision<0||record.revision>=2147483647)fail('trial_not_activatable')
  if(JSON.stringify(record.resources)!==JSON.stringify(resources(record.id)))fail('invalid_resource_binding')
  return {...structuredClone(record),state:'active',revision:record.revision+1,activatedAt:now,expiresAt:now+TRIAL_DAYS*DAY}
}
function canAccessTrialRecord(record,now){
  return !!record&&uuid(record.id)&&record.state==='active'&&Number.isSafeInteger(now)&&Number.isSafeInteger(record.activatedAt)
    &&Number.isSafeInteger(record.expiresAt)&&record.activatedAt>=0&&record.expiresAt>record.activatedAt
    &&now>=record.activatedAt&&now<record.expiresAt
}
module.exports={createTrialRecord,activateTrialRecord,canAccessTrialRecord,resources,TRIAL_DAYS}
