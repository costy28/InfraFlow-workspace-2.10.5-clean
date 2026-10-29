'use strict';
// Explicit one-shot lease mutation only; never provisions or activates a tenant.
const {createProvisionLeaseRuntime}=require('./provision-lease-runtime');
const {createProvisionWorkerCycle}=require('./provision-worker-cycle');
function parseArguments(args){
 if(args.length!==3||args[0]!=='--lease-cycle-confirmed'||
  !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(args[1])||
  !/^(0|[1-9][0-9]{0,9})$/.test(args[2])||Number(args[2])>2147483643)throw Error('arguments_invalid');
 return {jobId:args[1],expectedJobRevision:Number(args[2])};
}
async function runProbe(input,{createRuntime=createProvisionLeaseRuntime,createWorker=createProvisionWorkerCycle}={}){
 let runtime,worker;
 try{
  runtime=await createRuntime({directory:'/run/credentials/infraflow-demo-lease-check.service'});
  worker=createWorker({lease:runtime});
  return await worker.run(input);
 }finally{
  if(worker)await worker.shutdown();
  if(runtime)await runtime.shutdown();
 }
}
async function main(){
 const input=parseArguments(process.argv.slice(2));
 if(process.platform!=='linux'||process.getuid?.()!==994||process.getgid?.()!==985)throw Error('identity_invalid');
 // The cycle is bounded. RuntimeMaxSec is a final safety limit, not successful cleanup.
 const result=await runProbe(input);
 if(result.status!=='checked_and_released'||result.executionAllowed!==false)throw Error('result_unconfirmed');
 console.log('WORKER_LEASE_CYCLE_OK');
 console.log(JSON.stringify(result));
}
if(require.main===module)main().catch(()=>{
 console.error('WORKER_LEASE_CYCLE_UNCONFIRMED');
 console.error('NO_AUTOMATIC_RETRY_REVIEW_SQL_STATE');
 process.exitCode=1;
});
module.exports={parseArguments,runProbe};
