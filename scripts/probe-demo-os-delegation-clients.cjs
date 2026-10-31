'use strict';
// Real procedures in a disposable SQL database through an injected fixture driver.
// Metadata is synthetic here; native login/scope validation is a separate probe.
const fs=require('node:fs'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {runOsDelegationProbe}=require('./probe-demo-os-delegation.cjs');
const {createOsDelegationRpcClient}=require('../server/demo-platform/os-delegation-rpc-client');
function metadata(role){const login=role==='worker'?'infraflow_demo_lease':'infraflow_demo_os_executor';return {recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login,principal:login,sysadmin:0,accessDemo:0}],[{permission_name:'CONNECT SQL'}],[{permission_name:'CONNECT'}],(role==='worker'?['provision_lease_command','record_step_intent','adapter_review_ticket_command','prepare_os_identity_delegation']:['accept_os_identity_delegation','record_os_identity_result','verify_os_identity_execution_context']).map(object_name=>({schema_name:'platform',object_name,permission_name:'EXECUTE'}))]};}
runOsDelegationProbe({
 async setup({database,execute}){
  for(const name of ['015_os_identity_acceptance.sql','016_os_identity_results.sql','017_os_identity_execution_context.sql'])await execute(database,fs.readFileSync('db/demo-platform-migrations/'+name,'utf8').replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`));
  await execute(database,"CREATE USER infraflow_demo_os_executor WITHOUT LOGIN;GRANT EXECUTE ON OBJECT::platform.accept_os_identity_delegation TO infraflow_demo_os_executor;GRANT EXECUTE ON OBJECT::platform.verify_os_identity_execution_context TO infraflow_demo_os_executor;GRANT EXECUTE ON OBJECT::platform.record_os_identity_result TO infraflow_demo_os_executor;SELECT 1;");
 },
 async claimed({database,execute,jobId}){await execute(database,`UPDATE platform.provision_jobs SET lease_expires_at=DATEADD(minute,5,SYSUTCDATETIME()) WHERE job_id='${jobId}';SELECT 1;`);},
 async prepared({database,execute,results,command}){
  const binding={jobId:command.jobId,trialId:'11111111-1111-4111-8111-111111111111',intentId:command.intentId,generation:1,jobRevision:1};
  function client(role){
   class Pool extends EventEmitter{async connect(){}request(){let input;return {query:async()=>metadata(role),input(name,type,json){input=JSON.parse(json);return this;},execute:async proc=>{
    const allowed=role==='worker'?['platform.prepare_os_identity_delegation']:['platform.accept_os_identity_delegation','platform.verify_os_identity_execution_context','platform.record_os_identity_result'];assert.ok(allowed.includes(proc));
    const user=role==='worker'?'os_worker':'infraflow_demo_os_executor';
    const raw=await execute(database,`EXECUTE AS USER='${user}';BEGIN TRY EXEC ${proc} @json=@json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;`,input);
    return {recordsets:[[{json:raw}]]};
   }};}async close(){}}
   return createOsDelegationRpcClient({role,password:'fixture-password-not-used',binding,driver:{ConnectionPool:Pool,NVarChar:()=>0,MAX:0}});
  }
  const w=client('worker'),e=client('executor');
  try{
   assert.equal((await w.prepare({leaseToken:command.leaseToken,delegationToken:command.delegationToken})).state,'prepared');
   assert.equal((await e.accept({delegationToken:command.delegationToken})).state,'accepted');
   // Test-only shorter deadline keeps the real receipt inside the production 60s bound.
   await execute(database,'UPDATE platform.os_identity_acceptances SET deadline=DATEADD(second,45,SYSUTCDATETIME());SELECT 1;');
   assert.equal((await e.context({delegationToken:command.delegationToken})).contextReady,true);
   const r=await e.report({delegationToken:command.delegationToken,outcome:'uncertain',uid:null,gid:null});
   assert.equal(r.outcome,'uncertain');assert.equal(r.executionAllowed,false);
   await assert.rejects(e.report({delegationToken:command.delegationToken,outcome:'uncertain',uid:null,gid:null}));
   assert.equal(await execute(database,"SELECT CONCAT((SELECT COUNT(*) FROM platform.os_identity_delegations),'|',(SELECT COUNT(*) FROM platform.os_identity_acceptances),'|',(SELECT COUNT(*) FROM platform.os_identity_results));"),'1|1|1');
   results.push('real_sql_prepare_replay_accept_context_uncertain_result_through_bound_clients_no_os_effect');
  }finally{await w.shutdown();await e.shutdown();}
 }
}).catch(()=>{console.error('OS_DELEGATION_CLIENTS_PROBE_FAILED');process.exitCode=1;});
