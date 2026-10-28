'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createProvisionWorkerCycle}=require('../demo-platform/provision-worker-cycle');
const jobId='00f612ed-a8ac-4688-a26f-679760eee0be';
function fixture({failure,wide=false,pause}={}){
 const calls=[];let revision=0,generation=0;
 const lease={execute:async(op,c)=>{
  calls.push({op,c});if(pause)await pause(op);
  if(op!=='verify')revision++;if(op==='claim')generation++;
  if(op===failure)throw Error(c.leaseToken);
  return {jobId,generation,jobRevision:revision,executionAllowed:wide,leaseExpiresAt:op==='release'?null:'2026-10-28T12:00:00.000'};
 }};return {worker:createProvisionWorkerCycle({lease}),calls};
}
test('bounded cycle claims/verifies/renews/releases; no token or effect authority in output',async()=>{
 const f=fixture(),result=await f.worker.run({jobId,expectedJobRevision:0});
 assert.deepEqual(result.progress,['claim','verify','renew','verify','release']);assert.equal(result.executionAllowed,false);assert.equal(result.status,'checked_and_released');assert.equal(result.jobRevision,3);
 const token=f.calls[0].c.leaseToken;assert.match(token,/^[a-f0-9]{64}$/);assert.equal(new Set(f.calls.map(x=>x.c.leaseToken)).size,1);assert.equal(JSON.stringify(result).includes(token),false);await f.worker.shutdown();
});
test('uncertain claim/renew/release never retries or claims successful cleanup',async()=>{
 for(const failure of ['claim','renew','release']){
  const f=fixture({failure});let error;try{await f.worker.run({jobId,expectedJobRevision:0});}catch(e){error=e;}
  assert.equal(error.message,'worker_cycle_unconfirmed');assert.equal(error.stage,failure);assert.equal(error.leaseMayRemain,true);
  assert.equal(f.calls.filter(x=>x.op===failure).length,1);assert.equal(error.message.includes(f.calls[0].c.leaseToken),false);await f.worker.shutdown();
 }
});
test('unexpected execution authority and stale verification receipt refused',async()=>{
 const wide=fixture({wide:true});await assert.rejects(wide.worker.run({jobId,expectedJobRevision:0}),{code:'worker_cycle_unconfirmed'});assert.equal(wide.calls.length,1);await wide.worker.shutdown();
 let count=0;const worker=createProvisionWorkerCycle({lease:{execute:async()=>({jobId,generation:1,jobRevision:++count,executionAllowed:false,leaseExpiresAt:'fixture'})}});
 await assert.rejects(worker.run({jobId,expectedJobRevision:0}),e=>e.stage==='verify');await worker.shutdown();
});
test('one cycle only; orderly shutdown waits and releases a confirmed lease',async()=>{
 let finish;const f=fixture({pause:async op=>{if(op==='claim')await new Promise(r=>{finish=r;});}});
 const run=f.worker.run({jobId,expectedJobRevision:0});await new Promise(r=>setImmediate(r));await assert.rejects(f.worker.run({jobId,expectedJobRevision:0}),/worker_cycle_unavailable/);
 const stop=f.worker.shutdown();assert.equal(f.worker.shutdown(),stop);finish();const result=await run;await stop;
 assert.equal(result.status,'stopped_and_released');assert.deepEqual(result.progress,['claim','release']);await assert.rejects(f.worker.run({jobId,expectedJobRevision:2}),/worker_cycle_unavailable/);
});
test('invalid and injected cycle fields never reach lease port',async()=>{
 const f=fixture();for(const c of [{jobId,expectedJobRevision:'0'},{jobId,expectedJobRevision:0,path:'/tmp/unsafe'},{jobId,expectedJobRevision:2147483644}])await assert.rejects(f.worker.run(c),/worker_cycle_input_invalid/);
 assert.equal(f.calls.length,0);await f.worker.shutdown();
});
