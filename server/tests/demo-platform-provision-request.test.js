'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createProvisionRequestClient,createProvisionRequestCoordinator,validateCommand}=require('../demo-platform/provision-request');
const trialId='b1100b43-48d0-42fa-8a1d-73b1286f8242',operatorId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const input=()=>({trialId,expectedRevision:0,commandId:'fixture:prepare',confirmed:true});
const command=()=>({trialId,expectedRevision:0,commandId:'fixture:prepare',operatorId,operatorRevision:1});
const receipt=()=>({jobId:'11111111-1111-4111-8111-111111111111',trialId,jobState:'queued',trialRevision:1,executionAllowed:false});
test('prepare actor only from authorized session and explicit confirmation; post-read required',async()=>{
 const operations=[];const client={request:async c=>{assert.deepEqual(c,command());return receipt();}};
 const coordinator=createProvisionRequestCoordinator({client,runtime:{authorize:async c=>{operations.push(c);return {operatorId,revision:1};}}});
 assert.deepEqual(await coordinator.request({token:'token',csrfToken:'csrf',input:input()}),receipt());
 assert.deepEqual(operations,[{token:'token',csrfToken:'csrf',operation:'trial.prepare'},{token:'token',operation:'trial.read'}]);
 for(const extra of [{operatorId},{path:'/etc/unsafe'},{confirmed:false}])await assert.rejects(coordinator.request({input:{...input(),...extra}}),{code:'provision_request_invalid'});
});
test('denied scope/CSRF writes nothing; revocation after write is uncertain',async()=>{
 let writes=0,calls=0;const client={request:async()=>{writes++;return receipt();}};
 const denied=createProvisionRequestCoordinator({client,runtime:{authorize:async()=>{throw Error('private');}}});
 await assert.rejects(denied.request({input:input()}),{code:'provision_request_access_denied'});assert.equal(writes,0);
 const revoked=createProvisionRequestCoordinator({client,runtime:{authorize:async()=>{if(calls++)throw Error();return {operatorId,revision:1};}}});
 await assert.rejects(revoked.request({input:input()}),{code:'provision_request_result_unconfirmed'});assert.equal(writes,1);
});
test('request port fixed RPC, defensive command and closed execution receipt',async()=>{
 let calls=0;const client=createProvisionRequestClient({execute:async(proc,args)=>{calls++;assert.equal(proc,'platform.request_provision_job');assert.deepEqual(JSON.parse(args.json),command());return JSON.stringify(receipt());}});
 const c=command(),pending=client.request(c);c.commandId='changed';assert.deepEqual(await pending,receipt());assert.equal(calls,1);await client.shutdown();
 await assert.rejects(client.request(command()),{code:'provision_request_result_unconfirmed'});
});
test('uncertain SQL response never automatically retries and rejects widened receipts',async()=>{
 for(const delta of [{executionAllowed:true},{trialRevision:9},{trialId:operatorId},{secret:'private'}]){
  let calls=0;const client=createProvisionRequestClient({execute:async()=>{calls++;return JSON.stringify({...receipt(),...delta});}});
  await assert.rejects(client.request(command()),{code:'provision_request_result_unconfirmed'});assert.equal(calls,1);await client.shutdown();
 }
 assert.throws(()=>validateCommand({...command(),expectedRevision:'0'}));
 const getter=command();Object.defineProperty(getter,'trialId',{get(){throw Error('must-not-run');}});assert.throws(()=>validateCommand(getter),{code:'provision_request_invalid'});
});
test('single flight and orderly shutdown reject late response',async()=>{
 let finish;const client=createProvisionRequestClient({execute:async()=>{await new Promise(r=>{finish=r;});return JSON.stringify(receipt());}});
 const task=client.request(command()),all=Promise.allSettled([task]);await new Promise(r=>setImmediate(r));
 await assert.rejects(client.request(command()));const stop=client.shutdown();assert.equal(client.shutdown(),stop);finish();await stop;assert.equal((await all)[0].status,'rejected');
});
