'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {runDirectoryPreparationProbe}=require('./probe-demo-directory-preparation.cjs');
runDirectoryPreparationProbe({
 async setup({database,execute}){
  for(const [file,label] of [['020_tenant_directory_context.sql','DIRECTORY_CONTEXT'],['021_tenant_directory_results.sql','DIRECTORY_RESULTS']]){
   const raw=fs.readFileSync('db/demo-platform-migrations/'+file,'utf8'),sql=raw.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`);
   await execute(database,sql);assert.equal(await execute(database,sql),label+'_ALREADY_APPLIED');
  }
  await execute(database,"CREATE USER infraflow_demo_directory_executor WITHOUT LOGIN;GRANT EXECUTE ON OBJECT::platform.verify_tenant_directory_context TO infraflow_demo_directory_executor;GRANT EXECUTE ON OBJECT::platform.record_tenant_directory_result TO infraflow_demo_directory_executor;GRANT EXECUTE ON OBJECT::platform.verify_tenant_directory_context TO os_other;GRANT EXECUTE ON OBJECT::platform.record_tenant_directory_result TO os_other;SELECT 1;");
 },
 async prepared({database,execute,results,input}){
  let stage='context';
  const context={intentId:input.intentId,attemptToken:input.attemptToken};
  const call=(proc,value,user='infraflow_demo_directory_executor')=>execute(database,`EXECUTE AS USER='${user}';BEGIN TRY EXEC platform.${proc} @json=@json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;`,value).then(JSON.parse);
  try{
   const r=await call('verify_tenant_directory_context',context);assert.equal(r.contextReady,true);assert.equal(r.executionAllowed,false);assert.equal(r.uid,60001);assert.ok(r.validForMs>=15000&&r.validForMs<=60000);
   await assert.rejects(call('verify_tenant_directory_context',context,'os_other'),e=>e.sqlNumber===54610);
   await assert.rejects(call('verify_tenant_directory_context',{...context,extra:true}),e=>e.sqlNumber===54611);
   await assert.rejects(call('verify_tenant_directory_context',{...context,attemptToken:'ff'.repeat(32)}),e=>e.sqlNumber===54612);
   await execute(database,"UPDATE platform.provision_jobs SET resource_manifest=JSON_MODIFY(resource_manifest,'$.configRoot',UPPER(JSON_VALUE(resource_manifest,'$.configRoot')));SELECT 1;");
   await assert.rejects(call('verify_tenant_directory_context',context),e=>e.sqlNumber===54612);
   await execute(database,"UPDATE platform.provision_jobs SET resource_manifest=JSON_MODIFY(resource_manifest,'$.configRoot',LOWER(JSON_VALUE(resource_manifest,'$.configRoot')));UPDATE platform.directory_attempts SET deadline=DATEADD(millisecond,1,prepared_at);SELECT 1;");
   await assert.rejects(call('verify_tenant_directory_context',context),e=>e.sqlNumber===54614);
   stage='uncertain_after_deadline_outer_fixture_rollback';
   const uncertain=JSON.parse(await execute(database,"BEGIN TRANSACTION;EXECUTE AS USER='infraflow_demo_directory_executor';BEGIN TRY EXEC platform.record_tenant_directory_result @json=@json;REVERT;ROLLBACK;END TRY BEGIN CATCH REVERT;IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;",{...context,outcome:'uncertain',journalDigest:null,observations:[]}));
   assert.equal(uncertain.outcome,'uncertain');assert.equal(uncertain.confirmedCount,0);assert.equal(uncertain.executionAllowed,false);
   assert.equal(await execute(database,'SELECT COUNT(*) FROM platform.directory_results;'),'0');
   await execute(database,'UPDATE platform.directory_attempts SET deadline=DATEADD(minute,5,SYSUTCDATETIME());SELECT 1;');
   stage='result_validation';
   const observations=Array.from({length:8},(_,n)=>({ordinal:n,uid:[0,1,3].includes(n)?0:60001,gid:n<2?0:60002,mode:n<2?'0711':n===3?'0750':'0700',device:'1',inode:(18446744073709551615n-BigInt(n)).toString()}));
   const result={...context,outcome:'observed_created',journalDigest:'ab'.repeat(32),observations};
   await assert.rejects(call('record_tenant_directory_result',result,'os_other'),e=>e.sqlNumber===54710);
   const change=(n,key,value)=>({...result,observations:observations.map((r,i)=>i===n?{...r,[key]:value}:r)});
   for(const bad of [{...result,observations:observations.slice(1)},change(2,'mode','0777'),change(3,'uid',60001),change(4,'gid',60003),change(0,'inode','01'),change(0,'device',1),change(0,'device','1 '),change(0,'inode',observations[0].inode+' '),change(0,'ordinal',true),change(1,'inode',observations[0].inode)])await assert.rejects(call('record_tenant_directory_result',bad),e=>e.sqlNumber===54711);
   stage='result_audit_rollback';
   await execute(database,"EXEC(N'CREATE TRIGGER platform.fail_directory_result_audit ON platform.directory_result_events AFTER INSERT AS BEGIN THROW 54799,''fixture_audit_failure'',1;END;');SELECT 1;");
   await assert.rejects(call('record_tenant_directory_result',result),e=>e.sqlNumber===54799);
   assert.equal(await execute(database,"SELECT CONCAT((SELECT COUNT(*) FROM platform.directory_results),'|',(SELECT COUNT(*) FROM platform.directory_observations),'|',(SELECT COUNT(*) FROM platform.directory_result_events));"),'0|0|0');
   await execute(database,'DROP TRIGGER platform.fail_directory_result_audit;SELECT 1;');
   stage='successful_result_and_terminal_refusals';
   const receipt=await call('record_tenant_directory_result',result);assert.equal(receipt.confirmedCount,8);assert.equal(receipt.executionAllowed,false);assert.equal(receipt.reconciliationRequired,true);
   assert.equal(await execute(database,"SELECT CONCAT((SELECT COUNT(*) FROM platform.directory_results),'|',(SELECT COUNT(*) FROM platform.directory_observations),'|',(SELECT COUNT(*) FROM platform.directory_result_events),'|',(SELECT CONVERT(varchar(20),inode) FROM platform.directory_observations WHERE ordinal=0));"),'1|8|1|18446744073709551615');
   await assert.rejects(call('record_tenant_directory_result',result),e=>e.sqlNumber===54713);
   await assert.rejects(call('verify_tenant_directory_context',context),e=>e.sqlNumber===54613);
   await assert.rejects(execute(database,"EXECUTE AS USER='infraflow_demo_directory_executor';BEGIN TRY SELECT TOP(0) * FROM platform.directory_live_bindings;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;"),e=>e.sqlNumber===229);
   results.push('directory_live_context_role_token_manifest_deadline_terminal_result_refused');
   results.push('directory_result_uint64_exact_policy_uncertain_late_atomic_audit_rollback_eight_observations_no_authority');
  }catch(error){results.push('directory_context_result_failed_stage_'+stage);throw error;}
 }
}).catch(()=>{console.error('DIRECTORY_CONTEXT_RESULT_PROBE_FAILED');process.exitCode=1;});
