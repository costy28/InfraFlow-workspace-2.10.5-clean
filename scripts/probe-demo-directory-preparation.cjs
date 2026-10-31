'use strict';
// Own disposable SQL database only. No host resources, server logins or VPS.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {runOsAcceptanceProbe}=require('./probe-demo-os-acceptance.cjs');
function runDirectoryPreparationProbe(extension={}){return runOsAcceptanceProbe({
 async claimed({database,execute,jobId}){
  await execute(database,`UPDATE platform.provision_jobs SET lease_expires_at=DATEADD(minute,10,SYSUTCDATETIME()) WHERE job_id='${jobId}';SELECT 1;`);
 },
 async setup({database,execute}){
  for(const name of ['016_os_identity_results.sql','017_os_identity_execution_context.sql','018_tenant_directory_evidence.sql','019_prepare_tenant_directories.sql']){
   const raw=fs.readFileSync('db/demo-platform-migrations/'+name,'utf8'),sql=raw.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`);
   if(name.startsWith('019'))await assert.rejects(execute(database,raw),e=>e.sqlNumber===54501);
   await execute(database,sql);
   if(name.startsWith('019'))assert.equal(await execute(database,sql),'DIRECTORY_PREPARATION_ALREADY_APPLIED');
  }
  await execute(database,"GRANT EXECUTE ON OBJECT::platform.record_os_identity_result TO infraflow_demo_os_executor;CREATE USER infraflow_demo_lease WITHOUT LOGIN;GRANT EXECUTE ON OBJECT::platform.provision_lease_command TO infraflow_demo_lease;GRANT EXECUTE ON OBJECT::platform.record_step_intent TO infraflow_demo_lease;GRANT EXECUTE ON OBJECT::platform.prepare_tenant_directories TO infraflow_demo_lease;GRANT EXECUTE ON OBJECT::platform.prepare_tenant_directories TO os_other;SELECT 1;");
  if(extension.setup)await extension.setup({database,execute});
 },
 async accepted({database,execute,command}){
  await execute(database,"EXECUTE AS USER='infraflow_demo_os_executor';BEGIN TRY EXEC platform.record_os_identity_result @json=@json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;",{intentId:command.intentId,delegationToken:command.delegationToken,outcome:'observed_created',uid:60001,gid:60002});
 },
 async afterReleased({database,execute,results,command}){
  let stage='new_lease';
  const call=(proc,value,user='infraflow_demo_lease',operation)=>execute(database,`EXECUTE AS USER='${user}';BEGIN TRY EXEC platform.${proc} ${operation?"@operation='"+operation+"',":''}@json=@json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;`,value).then(JSON.parse);
  try{
   const leaseToken='ef'.repeat(32),id=crypto.randomUUID();
   const claimed=await call('provision_lease_command',{jobId:command.jobId,expectedJobRevision:2,leaseToken},undefined,'claim');
   assert.equal(claimed.generation,2);assert.equal(claimed.jobRevision,3);
   // Only this synthetic fixture gets a longer lease for slow PS round-trips.
   await execute(database,'UPDATE platform.provision_jobs SET lease_expires_at=DATEADD(minute,10,SYSUTCDATETIME());SELECT 1;');
   await call('record_step_intent',{jobId:command.jobId,generation:2,expectedJobRevision:3,leaseToken,intentId:id,step:'tenant_directories'});
   const input={jobId:command.jobId,generation:2,expectedJobRevision:3,leaseToken,intentId:id,priorOsIntentId:command.intentId,attemptId:crypto.randomUUID(),attemptToken:'12'.repeat(32)};
   stage='roles_and_input';
   await assert.rejects(call('prepare_tenant_directories',input,'os_other'),e=>e.sqlNumber===54510);
   for(const bad of [{...input,path:'/etc'}, {...input,attemptId:input.intentId}, {...input,attemptToken:leaseToken}])await assert.rejects(call('prepare_tenant_directories',bad),e=>e.sqlNumber===54511);
   await assert.rejects(call('prepare_tenant_directories',{...input,leaseToken:'00'.repeat(32)}),e=>e.sqlNumber===54512);
   stage='prior_evidence';
   await assert.rejects(call('prepare_tenant_directories',{...input,priorOsIntentId:crypto.randomUUID()}),e=>e.sqlNumber===54512);
   await execute(database,"UPDATE platform.provision_jobs SET resource_manifest=JSON_MODIFY(resource_manifest,'$.storageRoot',JSON_VALUE(resource_manifest,'$.storageRoot')+' ');SELECT 1;");
   await assert.rejects(call('prepare_tenant_directories',input),e=>e.sqlNumber===54512);
   await execute(database,"UPDATE platform.provision_jobs SET resource_manifest=JSON_MODIFY(resource_manifest,'$.storageRoot',RTRIM(JSON_VALUE(resource_manifest,'$.storageRoot')));SELECT 1;");
   stage='audit_rollback';
   await execute(database,"EXEC(N'CREATE TRIGGER platform.fail_directory_prepare_audit ON platform.directory_attempt_events AFTER INSERT AS BEGIN THROW 54599,''fixture_audit_failure'',1;END;');SELECT 1;");
   await assert.rejects(call('prepare_tenant_directories',input),e=>e.sqlNumber===54599);
   assert.equal(await execute(database,'SELECT COUNT(*) FROM platform.directory_attempts;'),'0');
   await execute(database,'DROP TRIGGER platform.fail_directory_prepare_audit;SELECT 1;');
   stage='prepare_and_replay';
   const first=await call('prepare_tenant_directories',input),again=await call('prepare_tenant_directories',input);
   assert.deepEqual(first,again);assert.equal(first.uid,60001);assert.equal(first.gid,60002);assert.equal(first.executionAllowed,false);
   assert.equal(first.priorOsIntentId,command.intentId);assert.equal(first.state,'prepared');
   assert.ok(!JSON.stringify(first).includes(input.attemptToken));
   assert.equal(await execute(database,"SELECT CONCAT((SELECT COUNT(*) FROM platform.directory_attempts),'|',(SELECT COUNT(*) FROM platform.directory_attempt_events));"),'1|1');
   await assert.rejects(call('prepare_tenant_directories',{...input,attemptToken:'34'.repeat(32)}),e=>e.sqlNumber===54513);
   if(extension.prepared)await extension.prepared({database,execute,results,input});
   stage='no_direct_access_or_replay_after_release';
   await assert.rejects(execute(database,"EXECUTE AS USER='infraflow_demo_lease';BEGIN TRY SELECT TOP(0) * FROM platform.directory_attempts;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;"),e=>e.sqlNumber===229);
   await call('provision_lease_command',{jobId:command.jobId,generation:2,expectedJobRevision:3,leaseToken},undefined,'release');
   await assert.rejects(call('prepare_tenant_directories',input),e=>e.sqlNumber===54512);
   assert.equal(await execute(database,"SELECT CONCAT(state,'|',job_revision,'|',generation,'|',execution_ready) FROM platform.provision_jobs;"),'queued|4|2|0');
   results.push('directory_prepare_fresh_lease_prior_os_exact_paths_role_json_token_audit_rollback_replay_and_release_refusal');
  }catch(error){results.push('directory_prepare_failed_stage_'+stage);throw error;}
 }
});}
if(require.main===module)runDirectoryPreparationProbe().catch(()=>{console.error('DIRECTORY_PREPARATION_PROBE_FAILED');process.exitCode=1;});
module.exports={runDirectoryPreparationProbe};
