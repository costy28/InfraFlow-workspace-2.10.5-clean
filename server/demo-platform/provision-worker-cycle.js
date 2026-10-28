'use strict';
// One bounded control-plane cycle only. No shell, filesystem, tenant SQL or effects.
const crypto=require('node:crypto');
function createProvisionWorkerCycle({lease}={}){
 if(typeof lease?.execute!=='function')throw Error('worker_lease_required');
 let closed=false,pending,stopping;
 const fail=(stage,mayRemain)=>Object.assign(Error('worker_cycle_unconfirmed'),{code:'worker_cycle_unconfirmed',stage,leaseMayRemain:mayRemain});
 return Object.freeze({
  run(input){
   let jobId,expectedJobRevision;
   try{
    if(!input||Object.getPrototypeOf(input)!==Object.prototype||Reflect.ownKeys(input).length!==2)throw Error();
    const id=Object.getOwnPropertyDescriptor(input,'jobId'),rev=Object.getOwnPropertyDescriptor(input,'expectedJobRevision');
    if(!id||!rev||!Object.hasOwn(id,'value')||!Object.hasOwn(rev,'value'))throw Error();
    jobId=id.value;expectedJobRevision=rev.value;
    if(typeof jobId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(jobId)||!Number.isInteger(expectedJobRevision)||expectedJobRevision<0||expectedJobRevision>2147483643)throw Error();
   }catch{return Promise.reject(Error('worker_cycle_input_invalid'));}
   if(closed||pending)return Promise.reject(Error('worker_cycle_unavailable'));
   const task=Promise.resolve().then(async()=>{
    let stage='before_claim',claimed=false;const progress=[];
    if(closed)throw fail(stage,false);
    let leaseToken,receipt;
    async function step(operation,revision){
     stage=operation;
     const command={jobId,leaseToken};
     if(operation!=='claim')command.generation=receipt.generation;
     if(operation!=='verify')command.expectedJobRevision=revision;
     const result=await lease.execute(operation,command);
     // Defense in depth even when a test/custom lease port bypasses receipt parser.
     if(!result||result.jobId!==jobId||result.executionAllowed!==false||!Number.isInteger(result.generation)||result.generation<1||result.generation>=2147483647||
      !Number.isInteger(result.jobRevision)||result.jobRevision<1||result.jobRevision>=2147483647||
      (operation!=='claim'&&result.generation!==receipt.generation)||
      (operation==='verify'?result.jobRevision!==receipt.jobRevision:result.jobRevision!==revision+1)||
      (operation==='release'?result.leaseExpiresAt!==null:typeof result.leaseExpiresAt!=='string'))throw Error();
     progress.push(operation);return result;
    }
    try{
     leaseToken=crypto.randomBytes(32).toString('hex');
     receipt=await step('claim',expectedJobRevision);claimed=true;
     for(const operation of ['verify','renew','verify']){
      if(closed)break;
      receipt=await step(operation,receipt.jobRevision);
     }
     // Orderly stop releases only a confirmed current lease; failures are not retried.
     receipt=await step('release',receipt.jobRevision);
     return Object.freeze({jobId,generation:receipt.generation,jobRevision:receipt.jobRevision,
      status:closed?'stopped_and_released':'checked_and_released',executionAllowed:false,
      progress:Object.freeze(progress)});
    }catch{throw fail(stage,claimed||stage==='claim');}
   });
   pending=task;task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;
  },
  shutdown(){if(!stopping){closed=true;stopping=Promise.allSettled(pending?[pending]:[]).then(()=>undefined);}return stopping;},
 });
}
module.exports={createProvisionWorkerCycle};
