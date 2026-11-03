'use strict';
// New worker-only cycle; existing OS and metadata brokers remain unchanged.
const {createWorkerDirectoryControlSql,parseDirectoryIntent}=require('./worker-directory-control-sql');
const {createProvisionLeaseClient}=require('./provision-lease-client');
const {parseLeaseCommand}=require('./provision-lease-command');
const {createDirectoryPreparationRpcClient,parseDirectoryPreparationBinding}=require('./directory-preparation-rpc-client');
function exact(v,keys){if(!v||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)throw Error();for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d||!Object.hasOwn(d,'value'))throw Error();}return v;}
function createDirectoryCycleBroker(password,driver){
 let initial,binding,leaseToken,control,lease,preparer,pending,stopping,closed=false,broken=false,intended=false,prepared=false,released=false;
 const fail=()=>Error('directory_cycle_unconfirmed');
 async function action(name,value){
  if(name==='init'){
   if(initial)throw fail();exact(value,['jobId','trialId','intentId','priorOsIntentId','attemptId','uid','gid','expectedJobRevision']);
   if(!Number.isInteger(value.expectedJobRevision)||value.expectedJobRevision<0||value.expectedJobRevision>2147483643)throw fail();
   const {expectedJobRevision,...rest}=value;parseDirectoryPreparationBinding({...rest,generation:1,jobRevision:expectedJobRevision+1});
   initial=Object.freeze({...value});control=createWorkerDirectoryControlSql(password,driver);lease=createProvisionLeaseClient({execute:control.execute});return {initialized:true};
  }
  if(!initial)throw fail();
  if(name==='check'){exact(value,[]);return control.check();}
  if(name==='claim'){
   if(binding||released)throw fail();const p=parseLeaseCommand('claim',value);
   if(p.jobId!==initial.jobId||p.expectedJobRevision!==initial.expectedJobRevision)throw fail();
   const r=await lease.execute('claim',p);leaseToken=p.leaseToken;
   const {expectedJobRevision,...rest}=initial;binding=parseDirectoryPreparationBinding({...rest,generation:r.generation,jobRevision:r.jobRevision});return r;
  }
  if(!binding||released)throw fail();
  if(name==='intent'){
   if(intended)throw fail();const p=parseDirectoryIntent(value);
   if(p.jobId!==binding.jobId||p.generation!==binding.generation||p.expectedJobRevision!==binding.jobRevision||p.intentId!==binding.intentId||p.leaseToken!==leaseToken)throw fail();
   const r=JSON.parse(await control.execute('platform.record_step_intent',{json:JSON.stringify(p)}));
   exact(r,['jobId','generation','intentId','step','state','executionAllowed']);
   if(r.jobId!==binding.jobId||r.generation!==binding.generation||r.intentId!==binding.intentId||r.step!=='tenant_directories'||r.state!=='intent_recorded'||r.executionAllowed!==false)throw fail();
   intended=true;return r;
  }
  if(name==='prepare'){
   if(!intended||prepared)throw fail();exact(value,['leaseToken','attemptToken']);if(value.leaseToken!==leaseToken)throw fail();
   preparer=createDirectoryPreparationRpcClient({password,binding,driver});const r=await preparer.prepare(value);prepared=true;return r;
  }
  if(name==='release'){
   if(!prepared)throw fail();const p=parseLeaseCommand('release',value);
   if(p.jobId!==binding.jobId||p.generation!==binding.generation||p.expectedJobRevision!==binding.jobRevision||p.leaseToken!==leaseToken)throw fail();
   const r=await lease.execute('release',p);released=true;return r;
  }
  throw fail();
 }
 return Object.freeze({request(name,value){
  if(closed||broken||pending)return Promise.reject(fail());
  const task=Promise.resolve().then(()=>action(name,value)).then(r=>{if(closed)throw fail();return r;}).catch(()=>{broken=true;throw fail();});pending=task;
  task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;
 },shutdown(){if(!stopping){closed=true;stopping=(async()=>{
  await Promise.allSettled(pending?[pending]:[]);let failed=false;
  for(const c of [lease,preparer,control])if(c)try{await c.shutdown?.();}catch{failed=true;}
  password=leaseToken=initial=binding=undefined;if(failed)throw fail();
 })();}return stopping;}});
}
module.exports={createDirectoryCycleBroker};
