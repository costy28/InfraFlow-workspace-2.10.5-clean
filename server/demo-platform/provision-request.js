'use strict';
// Unmounted request boundary. Does not provision resources or alter operator scopes.
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const failure=code=>Object.assign(Error(code),{code});
function exact(input,keys){
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||Reflect.ownKeys(input).length!==keys.length)throw failure('provision_request_invalid');
 const result={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(input,key);if(!d||!Object.hasOwn(d,'value'))throw failure('provision_request_invalid');result[key]=d.value;}return result;
}
function validUuid(value){return typeof value==='string'&&UUID.test(value);}
function revision(value){return Number.isInteger(value)&&value>=0&&value<2147483647;}
function validateCommand(input){
 const c=exact(input,['trialId','expectedRevision','operatorId','operatorRevision','commandId']);
 if(!validUuid(c.trialId)||!validUuid(c.operatorId)||!revision(c.expectedRevision)||!revision(c.operatorRevision)||
  typeof c.commandId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(c.commandId))throw failure('provision_request_invalid');
 return Object.freeze(c);
}
function createProvisionRequestClient({execute}={}){
 if(typeof execute!=='function')throw failure('provision_request_configuration_invalid');
 let closed=false,pending,stopping;
 return Object.freeze({
  request(input){
   let c;try{c=validateCommand(input);}catch(e){return Promise.reject(e);}
   if(closed||pending)return Promise.reject(failure('provision_request_result_unconfirmed'));
   const task=Promise.resolve().then(async()=>{try{
    if(closed)throw Error();
    const raw=await execute('platform.request_provision_job',Object.freeze({json:JSON.stringify(c)}));
    if(closed||typeof raw!=='string'||Buffer.byteLength(raw)>2048)throw Error();
    const r=exact(JSON.parse(raw),['jobId','trialId','jobState','trialRevision','executionAllowed']);
    if(!validUuid(r.jobId)||r.trialId!==c.trialId||r.jobState!=='queued'||r.trialRevision!==c.expectedRevision+1||r.executionAllowed!==false)throw Error();
    return Object.freeze(r);
   }catch{throw failure('provision_request_result_unconfirmed');}});
   pending=task;task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;
  },
  shutdown(){if(!stopping){closed=true;stopping=Promise.allSettled(pending?[pending]:[]).then(()=>undefined);}return stopping;},
 });
}
function createProvisionRequestCoordinator({runtime,client}={}){
 if(typeof runtime?.authorize!=='function'||typeof client?.request!=='function')throw failure('provision_request_configuration_invalid');
 return Object.freeze({async request({token,csrfToken,input}){
  let c;try{
   c=exact(input,['trialId','expectedRevision','commandId','confirmed']);
   if(c.confirmed!==true)throw Error();
   validateCommand({trialId:c.trialId,expectedRevision:c.expectedRevision,commandId:c.commandId,operatorId:'00000000-0000-0000-0000-000000000000',operatorRevision:0});
  }catch{throw failure('provision_request_invalid');}
  let actor;try{actor=await runtime.authorize({token,csrfToken,operation:'trial.prepare'});}catch{throw failure('provision_request_access_denied');}
  let command;try{command=validateCommand({trialId:c.trialId,expectedRevision:c.expectedRevision,commandId:c.commandId,operatorId:actor.operatorId,operatorRevision:actor.revision});}catch{throw failure('provision_request_access_denied');}
  let result;try{result=await client.request(command);}catch{throw failure('provision_request_result_unconfirmed');}
  // Revocation after commit must not disclose the receipt or imply no write occurred.
  try{await runtime.authorize({token,operation:'trial.read'});}catch{throw failure('provision_request_result_unconfirmed');}
  return result;
 }});
}
module.exports={validateCommand,createProvisionRequestClient,createProvisionRequestCoordinator};
