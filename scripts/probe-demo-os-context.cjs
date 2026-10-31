'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {runOsAcceptanceProbe}=require('./probe-demo-os-acceptance.cjs');
runOsAcceptanceProbe({
 async claimed({database,execute,jobId}){
  // Synthetic fixture only, not a production lease duration change.
  await execute(database,`UPDATE platform.provision_jobs SET lease_expires_at=DATEADD(minute,5,SYSUTCDATETIME()) WHERE job_id='${jobId}';SELECT 1;`);
 },
 async setup({database,execute}){
  for(const [file,marker] of [['016_os_identity_results.sql','OS_IDENTITY_RESULTS'],['017_os_identity_execution_context.sql','OS_EXECUTION_CONTEXT']]){
   const sql=fs.readFileSync('db/demo-platform-migrations/'+file,'utf8').replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`);
   assert.equal(await execute(database,sql),marker+'_APPLIED');
   assert.equal(await execute(database,sql),marker+'_ALREADY_APPLIED');
  }
  await execute(database,'GRANT EXECUTE ON OBJECT::platform.verify_os_identity_execution_context TO infraflow_demo_os_executor;GRANT EXECUTE ON OBJECT::platform.verify_os_identity_execution_context TO os_other;GRANT EXECUTE ON OBJECT::platform.record_os_identity_result TO infraflow_demo_os_executor;SELECT 1;');
 },
 async accepted({database,execute,results,command}){
  const input={intentId:command.intentId,delegationToken:command.delegationToken};
  const call=(value=input,user='infraflow_demo_os_executor')=>execute(database,`EXECUTE AS USER='${user}';BEGIN TRY EXEC platform.verify_os_identity_execution_context @json=@json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;`,value).then(JSON.parse);
  const r=await call();assert.equal(r.executionAllowed,false);assert.equal(r.contextReady,true);assert.ok(r.validForMs>=15000);assert.equal(r.jobId,command.jobId);
  assert.ok(!JSON.stringify(r).includes(command.delegationToken));
  await assert.rejects(call(input,'os_other'),e=>e.sqlNumber===54210);
  await assert.rejects(call({...input,extra:true}),e=>e.sqlNumber===54211);
  await assert.rejects(call({...input,delegationToken:'ff'.repeat(32)}),e=>e.sqlNumber===54212);
  await execute(database,"UPDATE platform.provision_jobs SET resource_manifest=JSON_MODIFY(resource_manifest,'$.osIdentity',UPPER(JSON_VALUE(resource_manifest,'$.osIdentity')));SELECT 1;");
  await assert.rejects(call(),e=>e.sqlNumber===54212);
  await execute(database,"UPDATE platform.provision_jobs SET resource_manifest=JSON_MODIFY(resource_manifest,'$.osIdentity',LOWER(JSON_VALUE(resource_manifest,'$.osIdentity')));SELECT 1;");
  assert.equal((await call()).contextReady,true);
  await execute(database,'UPDATE platform.os_identity_acceptances SET deadline=DATEADD(second,10,SYSUTCDATETIME());SELECT 1;');
  await assert.rejects(call(),e=>e.sqlNumber===54214);
  await execute(database,"EXECUTE AS USER='infraflow_demo_os_executor';EXEC platform.record_os_identity_result @json=@json;REVERT;",{...input,outcome:'uncertain',uid:null,gid:null});
  await assert.rejects(call(),e=>e.sqlNumber===54213);
  results.push('os_context_live_binding_no_authority_role_token_manifest_deadline_result_replay_refused');
 }
}).catch(()=>{console.error('OS_CONTEXT_PROBE_FAILED');process.exitCode=1;});
