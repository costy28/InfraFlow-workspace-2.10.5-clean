'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {runOsDelegationProbe}=require('./probe-demo-os-delegation.cjs');
function runOsAcceptanceProbe(extension={}){return runOsDelegationProbe({
 claimed:extension.claimed,
 async setup({database,execute}){
  const source=fs.readFileSync('db/demo-platform-migrations/015_os_identity_acceptance.sql','utf8').replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`);
  assert.equal(await execute(database,source),'OS_IDENTITY_ACCEPTANCE_APPLIED');
  assert.equal(await execute(database,source),'OS_IDENTITY_ACCEPTANCE_ALREADY_APPLIED');
  await execute(database,"CREATE USER infraflow_demo_os_executor WITHOUT LOGIN;CREATE USER os_other WITHOUT LOGIN;GRANT EXECUTE ON OBJECT::platform.accept_os_identity_delegation TO infraflow_demo_os_executor;GRANT EXECUTE ON OBJECT::platform.accept_os_identity_delegation TO os_other;SELECT 1;");
  if(extension.setup)await extension.setup({database,execute});
 },
 async prepared({database,execute,results,command}){
  const input={intentId:command.intentId,delegationToken:command.delegationToken};
  const call=(user,value)=>execute(database,`EXECUTE AS USER='${user}';BEGIN TRY EXEC platform.accept_os_identity_delegation @json=@json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;`,value).then(JSON.parse);
  await assert.rejects(call('os_other',input),e=>e.sqlNumber===54010);
  await assert.rejects(call('infraflow_demo_os_executor',{...input,delegationToken:'00'.repeat(32)}),e=>e.sqlNumber===54012);
  await execute(database,"EXEC(N'CREATE TRIGGER platform.fail_os_accept_audit ON platform.os_identity_acceptance_events AFTER INSERT AS BEGIN THROW 54099,''fixture_audit_failure'',1;END;');SELECT 1;");
  await assert.rejects(call('infraflow_demo_os_executor',input),e=>e.sqlNumber===54099);
  assert.equal(await execute(database,'SELECT COUNT(*) FROM platform.os_identity_acceptances;'),'0');
  await execute(database,'DROP TRIGGER platform.fail_os_accept_audit;SELECT 1;');
  const r=await call('infraflow_demo_os_executor',input);
  assert.equal(r.executionAllowed,false);assert.equal(r.state,'accepted');assert.equal(r.jobId,command.jobId);
  assert.equal(JSON.stringify(r).includes(command.delegationToken),false);
  await assert.rejects(call('infraflow_demo_os_executor',input),e=>e.sqlNumber===54013);
  assert.equal(await execute(database,"SELECT CONCAT((SELECT COUNT(*) FROM platform.os_identity_acceptances),'|',(SELECT COUNT(*) FROM platform.os_identity_acceptance_events));"),'1|1');
  results.push('os_acceptance_fixed_executor_token_binding_audit_atomic_single_use_no_host_authority');
  if(extension.accepted)await extension.accepted({database,execute,results,command});
 }
});}
if(require.main===module)runOsAcceptanceProbe().catch(()=>{console.error('OS_ACCEPTANCE_PROBE_FAILED');process.exitCode=1;});
module.exports={runOsAcceptanceProbe};
