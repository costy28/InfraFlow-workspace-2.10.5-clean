'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseArguments,runProbe}=require('../demo-platform/worker-cycle-probe');
const id='00f612ed-a8ac-4688-a26f-679760eee0be';
test('worker probe requires explicit consent, canonical UUID and bounded revision',()=>{
 assert.deepEqual(parseArguments(['--lease-cycle-confirmed',id,'0']),{jobId:id,expectedJobRevision:0});
 for(const args of [[],[id,'0'],['--lease-cycle-confirmed',id,'01'],['--lease-cycle-confirmed',id,'2147483644'],['--lease-cycle-confirmed',id,'0','extra']])assert.throws(()=>parseArguments(args));
});
test('probe drains worker before closing its transport, including failure',async()=>{
 for(const fails of [false,true]){
  const order=[];
  const deps={createRuntime:async({directory})=>{assert.equal(directory,'/run/credentials/infraflow-demo-lease-check.service');return {shutdown:async()=>order.push('transport')};},
   createWorker:()=>({run:async()=>{order.push('run');if(fails)throw Error('private');return {executionAllowed:false};},shutdown:async()=>order.push('worker')})};
  if(fails)await assert.rejects(runProbe({},deps));else assert.equal((await runProbe({},deps)).executionAllowed,false);
  assert.deepEqual(order,['run','worker','transport']);
 }
});
