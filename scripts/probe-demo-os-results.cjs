'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {runOsAcceptanceProbe}=require('./probe-demo-os-acceptance.cjs');
runOsAcceptanceProbe({
 async claimed({database,execute,jobId}){
  // Synthetic fixture only: PowerShell-per-query setup can exceed the production
  // 60s lease. Keep test setup bounded, then explicitly expire acceptance below.
  await execute(database,`UPDATE platform.provision_jobs SET lease_expires_at=DATEADD(minute,5,SYSUTCDATETIME()) WHERE job_id='${jobId}';SELECT 1;`);
 },
 async setup({database,execute}){
  const sql=fs.readFileSync('db/demo-platform-migrations/016_os_identity_results.sql','utf8').replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`);
  assert.equal(await execute(database,sql),'OS_IDENTITY_RESULTS_APPLIED');
  assert.equal(await execute(database,sql),'OS_IDENTITY_RESULTS_ALREADY_APPLIED');
  await execute(database,"GRANT EXECUTE ON OBJECT::platform.record_os_identity_result TO infraflow_demo_os_executor;GRANT EXECUTE ON OBJECT::platform.record_os_identity_result TO os_other;SELECT 1;");
 },
 async accepted({database,execute,results,command}){
  const call=(input,user='infraflow_demo_os_executor')=>execute(database,`EXECUTE AS USER='${user}';BEGIN TRY EXEC platform.record_os_identity_result @json=@json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;`,input).then(JSON.parse);
  const input={intentId:command.intentId,delegationToken:command.delegationToken,outcome:'observed_created',uid:10001,gid:10002};
  await assert.rejects(call(input,'os_other'),e=>e.sqlNumber===54110);
  await assert.rejects(call({...input,uid:0}),e=>e.sqlNumber===54111);
  await assert.rejects(call({...input,outcome:'uncertain '}),e=>e.sqlNumber===54111);
  await assert.rejects(call({...input,delegationToken:'ff'.repeat(32)}),e=>e.sqlNumber===54112);
  await execute(database,"EXEC(N'CREATE TRIGGER platform.fail_os_result_audit ON platform.os_identity_result_events AFTER INSERT AS BEGIN THROW 54199,''fixture_audit_failure'',1;END;');SELECT 1;");
  await assert.rejects(call(input),e=>e.sqlNumber===54199);
  assert.equal(await execute(database,'SELECT COUNT(*) FROM platform.os_identity_results;'),'0');
  await execute(database,'DROP TRIGGER platform.fail_os_result_audit;SELECT 1;');
  // Simulate a lost fence without touching the lease, then record uncertainty.
  await execute(database,'UPDATE platform.os_identity_acceptances SET deadline=DATEADD(millisecond,1,accepted_at);SELECT 1;');
  await assert.rejects(call(input),e=>e.sqlNumber===54113);
  const r=await call({...input,outcome:'uncertain',uid:null,gid:null});
  assert.equal(r.outcome,'uncertain');assert.equal(r.executionAllowed,false);assert.equal(r.reconciliationRequired,true);assert.equal(r.uid,null);
  await assert.rejects(call({...input,outcome:'uncertain',uid:null,gid:null}),e=>e.sqlNumber===54114);
  assert.equal(await execute(database,"SELECT CONCAT((SELECT COUNT(*) FROM platform.os_identity_results),'|',(SELECT COUNT(*) FROM platform.os_identity_result_events));"),'1|1');
  results.push('os_result_fixed_executor_bad_uid_token_refused_audit_rollback_lost_fence_uncertainty_immutable_journal');
 }
}).catch(()=>{console.error('OS_RESULTS_PROBE_FAILED');process.exitCode=1;});
