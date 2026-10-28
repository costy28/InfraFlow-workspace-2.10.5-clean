'use strict';
// Native SQL command path + real auth/HTTP code. Auth store is a synthetic fixture,
// not the deployed SQL-auth identity; no TLS/Cloudflare deployment claim.
const assert=require('node:assert/strict'),http=require('node:http');
const {createOperatorAuth}=require('../../demo-platform/operator-auth');
const {createOperatorHttp}=require('../../demo-platform/operator-http');
const {createProvisionRequestClient,createProvisionRequestCoordinator}=require('../../demo-platform/provision-request');
const {hashPassword,totpAtCounter}=require('../../demo-platform/operator-credentials');
async function probePreparerHttpSql({database,execute,rpc,login}){
 if(process.env.NODE_ENV!=='test'||!/^INFRAFLOW_TEST_TRIALS_[A-F0-9]{12}$/.test(database)||!/^INFRAFLOW_TEST_PREPARER_[A-F0-9]{12}$/.test(login))throw Error('synthetic_target_required');
 const trialId='44444444-4444-4444-8444-444444444444',operatorId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 await execute(database,`INSERT platform.trials(trial_id,approval_id,company_name,state) VALUES('${trialId}','fixture:http-native',N'HTTP SQL Fixture','queued');SELECT 1;`);
 const password='Fixture-only-password-123!',secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',passwordHash=await hashPassword(password);
 let at=59000,counter=-1,enabled=true,lose=true,revokeAfterRpc=false,rpcCalls=0;
 const events=[],commands=[];
 const runtime=createOperatorAuth({clock:()=>at,store:{
  readOperator:async()=>({id:operatorId,username:'fixture',revision:1,enabled,passwordHash,totpSecret:secret,scopes:['trial:read','trial:prepare','session:own']}),
  reserveAttempt:async()=>true,
  claimTotpCounter:async input=>{if(input.counter<=counter)return false;counter=input.counter;return true;},
  appendAudit:async event=>{events.push(event.action);},
 }});
 const client=createProvisionRequestClient({execute:async(proc,args)=>{
  assert.equal(proc,'platform.request_provision_job');const command=JSON.parse(args.json);commands.push(command);rpcCalls++;
  const value=await rpc(command);
  if(lose){lose=false;throw Error('fixture_lost_response_after_native_commit');}
  if(revokeAfterRpc)enabled=false;
  return value;
 }});
 const preparation=createProvisionRequestCoordinator({runtime,client}),origin='https://operator.example.test';
 const handler=createOperatorHttp({runtime,preparation,origin,trustLoopbackProxy:true});
 const server=http.createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end('{}');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let cookie='';
 const call=(route,method='GET',payload,csrf)=>new Promise((resolve,reject)=>{
  const headers={host:'operator.example.test',origin,'x-forwarded-proto':'https'};
  if(cookie)headers.cookie=cookie;if(payload!==undefined)headers['content-type']='application/json';if(csrf)headers['x-csrf-token']=csrf;
  const req=http.request({host:'127.0.0.1',port:server.address().port,path:route,method,headers,agent:false},res=>{
   let raw='';res.on('data',chunk=>{raw+=chunk;});res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,data:JSON.parse(raw)}));
  });req.on('error',reject);req.end(payload===undefined?undefined:JSON.stringify(payload));
 });
 try{
  const credentials=()=>({username:'fixture',password,code:totpAtCounter(secret,Math.floor(at/30000))});
  const session=await call('/operator/login','POST',credentials());assert.equal(session.status,200);assert.equal(session.data.canPrepare,true);
  assert.match(session.headers['set-cookie'][0],/Secure; HttpOnly; SameSite=Strict/);cookie=session.headers['set-cookie'][0].split(';')[0];
  const command={trialId,expectedRevision:0,commandId:'fixture:http-native-prepare',confirmed:true};
  assert.equal((await call('/operator/trials/prepare','POST',command)).status,401);
  assert.equal((await call('/operator/trials/prepare','POST',{...command,operatorId},session.data.csrfToken)).status,400);assert.equal(rpcCalls,0);
  const first=await call('/operator/trials/prepare','POST',command,session.data.csrfToken);assert.equal(first.status,503);assert.equal(rpcCalls,1);
  const retry=await call('/operator/trials/prepare','POST',command,session.data.csrfToken);assert.equal(retry.status,200);assert.equal(retry.data.receipt.executionAllowed,false);assert.equal(rpcCalls,2);assert.deepEqual(commands[0],commands[1]);
  assert.equal(commands[0].operatorId,operatorId);assert.equal(commands[0].operatorRevision,1);
  assert.equal(await execute(database,`SELECT CONCAT((SELECT COUNT(*) FROM platform.provision_jobs WHERE trial_id='${trialId}'),'|',(SELECT COUNT(*) FROM platform.resource_reservations WHERE trial_id='${trialId}'),'|',(SELECT COUNT(*) FROM platform.provision_request_audit WHERE trial_id='${trialId}' AND sql_actor='${login}'));`),'1|7|1');
  const resumed=await call('/operator/session');assert.equal(resumed.status,200);
  assert.equal((await call('/operator/logout','POST',{},resumed.data.csrfToken)).status,200);assert.equal((await call('/operator/session')).status,401);
  at=89000;const fresh=await call('/operator/login','POST',credentials());assert.equal(fresh.status,200);cookie=fresh.headers['set-cookie'][0].split(';')[0];revokeAfterRpc=true;
  const revoked=await call('/operator/trials/prepare','POST',command,fresh.data.csrfToken);assert.equal(revoked.status,503);assert.equal((await call('/operator/session')).status,401);
  assert.equal(await execute(database,`SELECT CONCAT(t.state,'|',t.revision,'|',j.execution_ready,'|',CASE WHEN t.activated_at IS NULL AND t.expires_at IS NULL THEN 1 ELSE 0 END) FROM platform.trials t JOIN platform.provision_jobs j ON j.trial_id=t.trial_id WHERE t.trial_id='${trialId}';`),'queued|1|0|1');
  assert.ok(events.includes('trial.prepare'));assert.ok(events.includes('session.logout'));
  return ['http_native_sql_auth_csrf_actor_scope_lost_response_retry_one_job','http_native_sql_logout_revocation_after_commit_no_receipt_no_activation'];
 }finally{runtime.shutdown();await client.shutdown();await new Promise(resolve=>server.close(resolve));}
}
module.exports={probePreparerHttpSql};
