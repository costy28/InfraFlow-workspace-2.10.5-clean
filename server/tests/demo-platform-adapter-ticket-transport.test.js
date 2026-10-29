'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAdapterTicketClient,parseTicketCommand}=require('../demo-platform/adapter-ticket-client');
const {validateTicketIdentity,createAdapterTicketSql}=require('../demo-platform/adapter-ticket-sql');
const {EventEmitter}=require('node:events');
const input={jobId:'00f612ed-a8ac-4688-a26f-679760eee0be',intentId:'b1100b43-48d0-42fa-8a1d-73b1286f8242',generation:1,expectedJobRevision:1,leaseToken:'ab'.repeat(32),ticketToken:'cd'.repeat(32)};
const receipt=()=>({jobId:input.jobId,intentId:input.intentId,generation:1,jobRevision:1,step:'os_identity',operation:'issue',executionAllowed:false});
test('ticket client exact input and receipt contain no secret',async()=>{
 let calls=0;const client=createAdapterTicketClient({role:'issuer',execute:async(proc,args)=>{calls++;assert.equal(proc,'platform.adapter_review_ticket_command');assert.equal(args.operation,'issue');assert.equal(JSON.parse(args.json).ticketToken,input.ticketToken);return JSON.stringify(receipt());}});
 const result=await client.execute(input);assert.equal(JSON.stringify(result).includes(input.ticketToken),false);
 await assert.rejects(client.execute({...input,path:'/etc'}));assert.equal(calls,1);await client.shutdown();
 let read=false;const bad={...input};Object.defineProperty(bad,'leaseToken',{get(){read=true;}});assert.throws(()=>parseTicketCommand('issue',bad));assert.equal(read,false);
});
test('fixed SQL consumer transport checks scope before parameterized RPC and refuses issue',async()=>{
 let config,queries=0,calls=0,connects=0,closes=0;const params=[];
 class Pool extends EventEmitter{
  constructor(c){super();config=c;}async connect(){connects++;}
  request(){return {query:async()=>{queries++;return {recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login:'infraflow_demo_adapter_review',principal:'infraflow_demo_adapter_review',sysadmin:0,accessDemo:0}],
   [{permission_name:'CONNECT SQL'}],[{permission_name:'CONNECT'}],['read_adapter_resource_review','adapter_review_ticket_command'].map(object_name=>({schema_name:'platform',object_name,permission_name:'EXECUTE'}))]};},
   input(...p){params.push(p);return this;},async execute(proc){calls++;assert.equal(proc,'platform.adapter_review_ticket_command');return {recordsets:[[{json:'receipt'}]]};}};}
  async close(){closes++;}
 }
 const sql=createAdapterTicketSql({role:'consumer',password:'x'.repeat(20),driver:{ConnectionPool:Pool,VarChar:n=>n,NVarChar:n=>n,MAX:-1}});
 assert.equal(config.server,'127.0.0.1');assert.equal(config.port,1433);assert.equal(config.user,'infraflow_demo_adapter_review');assert.equal(config.options.encrypt,true);
 await assert.rejects(sql.execute('platform.adapter_review_ticket_command',{operation:'issue',json:JSON.stringify(input)}));assert.equal(connects,0);
 assert.equal(await sql.execute('platform.adapter_review_ticket_command',{operation:'consume',json:JSON.stringify({intentId:input.intentId,ticketToken:input.ticketToken})}),'receipt');
 assert.equal(queries,1);assert.equal(calls,1);assert.deepEqual(params.map(p=>p[0]),['operation','json']);await sql.shutdown();assert.equal(closes,1);
});
test('uncertain result never retries, broad/stale receipt refused',async()=>{
 for(const value of [()=>{throw Error(input.ticketToken);},()=>JSON.stringify({...receipt(),executionAllowed:true}),()=>JSON.stringify({...receipt(),generation:2})]){
  let calls=0;const client=createAdapterTicketClient({role:'issuer',execute:async()=>{calls++;return value();}});
  await assert.rejects(client.execute(input),/^Error: adapter_ticket_result_unconfirmed$/);assert.equal(calls,1);await client.shutdown();
 }
});
test('ticket client shutdown waits and refuses late success',async()=>{
 let finish;const client=createAdapterTicketClient({role:'issuer',execute:async()=>{await new Promise(r=>finish=r);return JSON.stringify(receipt());}});
 const pending=client.execute(input),settled=Promise.allSettled([pending]);await new Promise(r=>setImmediate(r));
 await assert.rejects(client.execute(input));const stop=client.shutdown();finish();await stop;assert.equal((await settled)[0].status,'rejected');
});
test('separate exact SQL scope profiles refuse exchanged identities and extra permissions',()=>{
 for(const role of ['issuer','consumer']){
  const login=role==='issuer'?'infraflow_demo_lease':'infraflow_demo_adapter_review';
  const procedures=role==='issuer'?['provision_lease_command','record_step_intent','adapter_review_ticket_command']:['read_adapter_resource_review','adapter_review_ticket_command'];
  const result={recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login,principal:login,sysadmin:0,accessDemo:0}],
   [{permission_name:'CONNECT SQL'}],[{permission_name:'CONNECT'}],procedures.map(object_name=>({schema_name:'platform',object_name,permission_name:'EXECUTE'}))]};
  validateTicketIdentity(role,result);assert.throws(()=>validateTicketIdentity(role==='issuer'?'consumer':'issuer',result));
  result.recordsets[3].push({schema_name:'platform',object_name:'trials',permission_name:'SELECT'});assert.throws(()=>validateTicketIdentity(role,result));
 }
});
