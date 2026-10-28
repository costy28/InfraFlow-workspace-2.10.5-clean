'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {createOperatorHttp}=require('../demo-platform/operator-http');
const {createProvisionRequestCoordinator,createProvisionRequestClient}=require('../demo-platform/provision-request');
const {preparerEnabled}=require('../demo-platform/service');
const origin='https://operator.example.test',token='a'.repeat(64),csrf='b'.repeat(64);
const input={trialId:'b1100b43-48d0-42fa-8a1d-73b1286f8242',expectedRevision:0,commandId:'fixture:prepare-http',confirmed:true};
test('preparer mode requires explicit valid flag and operator HTTP configuration',()=>{
 assert.equal(preparerEnabled({},null),false);assert.equal(preparerEnabled({INFRAFLOW_DEMO_PLATFORM_PREPARER:'1'},{}),true);
 for(const env of [{INFRAFLOW_DEMO_PLATFORM_PREPARER:'0'},{INFRAFLOW_DEMO_PLATFORM_PREPARER:'1'}])assert.throws(()=>preparerEnabled(env,null));
});
test('preparer health checks metadata only, sanitizes errors and shutdown owns client',async()=>{
 const net=require('node:net'),{createPlatformService}=require('../demo-platform/service');
 const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 let broken=false,writes=0,closed=0;
 const service=createPlatformService({preparer:{check:async()=>{if(broken)throw Error('private');return {ok:true,code:'preparer_sql_scope_verified'};},request:async()=>{writes++;},shutdown:async()=>{closed++;}}});
 const get=()=>new Promise((resolve,reject)=>{http.get({host:'127.0.0.1',port,path:'/health/preparer'},res=>{let text='';res.on('data',c=>{text+=c;});res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));}).on('error',reject);});
 try{await service.start({host:'127.0.0.1',port});assert.equal((await get()).status,200);broken=true;assert.deepEqual(await get(),{status:503,body:{ok:false,code:'preparer_unavailable'}});}finally{await service.shutdown();}
 assert.equal(writes,0);assert.equal(closed,1);
});
test('prepare HTTP: gated POST, explicit confirmation, actor from session, uncertain retry same job',async()=>{
 let allow=true,revoked=false,lose=true,writes=0,attempts=0;const ledger=new Map(),commands=[];
 const runtime={login:async()=>({token,csrfToken:csrf,expiresAt:123,canPrepare:true}),resume:async()=>({csrfToken:csrf,expiresAt:123,canPrepare:allow}),authorize:async c=>{
  if(c.token!==token||!allow||(c.operation==='trial.prepare'&&c.csrfToken!==csrf)||(revoked&&c.operation==='trial.read'))throw Error();
  return {operatorId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',revision:2};
 }};
 const client=createProvisionRequestClient({execute:async(proc,args)=>{
  assert.equal(proc,'platform.request_provision_job');attempts++;const command=JSON.parse(args.json);commands.push(command);
  if(!ledger.has(command.commandId)){writes++;ledger.set(command.commandId,{jobId:'11111111-1111-4111-8111-111111111111',trialId:command.trialId,jobState:'queued',trialRevision:1,executionAllowed:false});}
  if(lose){lose=false;throw Error('lost_response_after_commit');}
  return JSON.stringify(ledger.get(command.commandId));
 }});
 const preparation=createProvisionRequestCoordinator({runtime,client});
 const handler=createOperatorHttp({runtime,preparation,origin,trustLoopbackProxy:true});
 const server=http.createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end('{}');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const call=(payload=input,headers={},method='POST',route='/operator/trials/prepare')=>new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port:server.address().port,path:route,method,agent:false,headers:{host:'operator.example.test',origin,'x-forwarded-proto':'https','content-type':'application/json',cookie:'__Host-infraflow_operator='+token,'x-csrf-token':csrf,...headers}},res=>{let text='';res.on('data',c=>{text+=c;});res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text)}));});req.on('error',reject);req.end(method==='GET'?undefined:JSON.stringify(payload));
 });
 try{
  assert.equal((await call(input,{},'GET')).status,405);
  assert.equal((await call({...input,confirmed:false})).status,400);
  assert.equal((await call({...input,operatorId:'injected'})).status,400);
  assert.equal((await call(input,{'x-csrf-token':'wrong'})).status,401);
  assert.equal((await call(input,{origin:'https://evil.test'})).status,401);
  allow=false;assert.equal((await call()).status,401);allow=true;assert.equal(writes,0);
  const first=await call();assert.equal(first.status,503);assert.equal(writes,1);assert.equal(attempts,1);
  const retry=await call();assert.equal(retry.status,200);assert.equal(retry.data.receipt.executionAllowed,false);assert.equal(writes,1);assert.deepEqual(commands[0],commands[1]);assert.equal(commands[0].operatorRevision,2);
  revoked=true;assert.equal((await call()).status,503);assert.equal(writes,1);
  const session=await call({}, {},'GET','/operator/session');assert.equal(session.data.canPrepare,true);
 }finally{await client.shutdown();await new Promise(r=>server.close(r));}
});
