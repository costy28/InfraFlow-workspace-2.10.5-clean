'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {runChannelReviewCycle}=require('../demo-platform/channel-review-cycle');
const {createChannelReviewSql,parseChannelIntent}=require('../demo-platform/channel-review-sql');
const jobId='00f612ed-a8ac-4688-a26f-679760eee0be';
function ports(failAt){
 const calls=[];let intent;
 const receipt={jobId,generation:2,jobRevision:4,leaseExpiresAt:'2026-10-29T12:01:00.000',executionAllowed:false};
 const sql={check:async()=>{calls.push('scope');if(failAt==='scope')throw Error('secret');},execute:async(proc,args)=>{
  const p=JSON.parse(args.json),op=args.operation||'intent';calls.push(op);if(op===failAt)throw Error(p.leaseToken);
  if(op==='intent'){intent=p;return JSON.stringify({jobId,generation:2,intentId:p.intentId,step:p.step,state:'intent_recorded',executionAllowed:false});}
  if(op==='issue')return JSON.stringify({jobId,generation:2,jobRevision:4,intentId:intent.intentId,step:intent.step,operation:'issue',executionAllowed:false});
  return JSON.stringify(op==='release'?{...receipt,jobRevision:5,leaseExpiresAt:null}:receipt);
 }};
 const channel={execute:async p=>{calls.push('consume');if(failAt==='consume')throw Error(p.ticketToken);return {jobId,generation:2,jobRevision:4,intentId:p.intentId,step:'channel_review_probe',operation:'consume',executionAllowed:false};}};
 return {sql,channel,calls};
}
test('diagnostic cycle claims once, records only diagnostic intent and consumes before release',async()=>{
 const p=ports();const result=await runChannelReviewCycle({...p,jobId,expectedJobRevision:3});
 assert.deepEqual(p.calls,['scope','claim','intent','issue','consume','verify','release']);
 assert.deepEqual(result,{jobId,generation:2,jobRevision:5,status:'channel_checked_and_released',executionAllowed:false});
 assert.equal(JSON.stringify(result).includes('Token'),false);
});
test('every uncertain stage stops without retry or compensating write',async()=>{
 const order=['scope','claim','intent','issue','consume','verify','release'];
 for(const stage of order){const p=ports(stage);await assert.rejects(runChannelReviewCycle({...p,jobId,expectedJobRevision:3}),e=>e.message==='channel_cycle_unconfirmed_no_retry'&&e.stage===stage);assert.deepEqual(p.calls,order.slice(0,order.indexOf(stage)+1));}
});
test('channel receipt cannot authorize execution or substitute the job',async()=>{
 for(const changes of [{executionAllowed:true},{jobId:'bad'},{generation:3},{step:'os_identity'},{jobRevision:5},{extra:'secret'}]){
  const p=ports(),execute=p.channel.execute;p.channel.execute=async x=>({...await execute(x),...changes});
  await assert.rejects(runChannelReviewCycle({...p,jobId,expectedJobRevision:3}),e=>e.stage==='consume');assert.equal(p.calls.includes('release'),false);
 }
});
const input={jobId,generation:2,expectedJobRevision:4,leaseToken:'ab'.repeat(32),intentId:'b1100b43-48d0-42fa-8a1d-73b1286f8242',step:'channel_review_probe'};
test('intent parser rejects actual resource steps, extras and getters without invoking them',()=>{
 assert.deepEqual(parseChannelIntent(input),input);
 for(const x of [{...input,step:'os_identity'},{...input,extra:1},{...input,generation:0}])assert.throws(()=>parseChannelIntent(x));
 let read=false;const x={...input};Object.defineProperty(x,'step',{get(){read=true;}});assert.throws(()=>parseChannelIntent(x));assert.equal(read,false);
});
function fakeDriver({extraScope=false,failRpc=false,block}={}){
 const calls=[],params=[];let connects=0;
 class Pool extends EventEmitter{
  constructor(config){super();calls.push(config);}async connect(){connects++;}
  request(){return {query:async()=>({recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login:'infraflow_demo_lease',principal:'infraflow_demo_lease',sysadmin:0,accessDemo:0}],
   [{permission_name:'CONNECT SQL'}],[{permission_name:'CONNECT'}],['provision_lease_command','record_step_intent','adapter_review_ticket_command',...(extraScope?['activate_trial']:[])].map(object_name=>({schema_name:'platform',object_name,permission_name:'EXECUTE'}))]}),
   input(...p){params.push(p);return this;},execute:async proc=>{calls.push(proc);if(block)await block();if(failRpc)throw Error(input.leaseToken);return {recordsets:[[{json:'ok'}]]};}};}
  async close(){calls.push('close');}
 }
 return {driver:{ConnectionPool:Pool,VarChar:n=>n,NVarChar:n=>n,MAX:-1},calls,params,get connects(){return connects;}};
}
test('diagnostic SQL transport exact three-RPC identity, fixed endpoint, parameters and no consume/renew',async()=>{
 const p=fakeDriver(),sql=createChannelReviewSql('x'.repeat(20),p.driver);
 for(const [proc,args] of [['platform.record_step_intent',{json:JSON.stringify({...input,step:'os_identity'})}],['platform.adapter_review_ticket_command',{operation:'consume',json:'{}'}],['platform.provision_lease_command',{operation:'renew',json:'{}'}],['platform.activate_trial',{json:'{}'}]])await assert.rejects(sql.execute(proc,args));
 assert.equal(p.connects,0);
 assert.equal(await sql.execute('platform.record_step_intent',{json:JSON.stringify(input)}),'ok');
 assert.deepEqual(p.params.map(x=>x[0]),['json']);
 assert.equal(p.calls[0].server,'127.0.0.1');assert.equal(p.calls[0].user,'infraflow_demo_lease');await sql.shutdown();
});
test('broad SQL scope and uncertain RPC poison transport without automatic retry',async()=>{
 for(const settings of [{extraScope:true},{failRpc:true}]){
  const p=fakeDriver(settings),sql=createChannelReviewSql('x'.repeat(20),p.driver);
  await assert.rejects(sql.execute('platform.record_step_intent',{json:JSON.stringify(input)}),/^Error: channel_sql_result_unconfirmed$/);
  await assert.rejects(sql.check());assert.equal(p.connects,1);assert.equal(p.calls.filter(x=>x==='platform.record_step_intent').length,settings.extraScope?0:1);await sql.shutdown();
 }
});
test('SQL transport excludes concurrent operations and refuses a late result after shutdown',async()=>{
 let finish;const p=fakeDriver({block:()=>new Promise(r=>finish=r)}),sql=createChannelReviewSql('x'.repeat(20),p.driver);
 const pending=sql.execute('platform.record_step_intent',{json:JSON.stringify(input)}),settled=Promise.allSettled([pending]);await new Promise(r=>setImmediate(r));
 await assert.rejects(sql.check());const stop=sql.shutdown();finish();await stop;assert.equal((await settled)[0].status,'rejected');
});
