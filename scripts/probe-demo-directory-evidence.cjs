'use strict';
// Disposable local SQL database. No OS effects, server logins, or VPS connection.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {runOsAcceptanceProbe}=require('./probe-demo-os-acceptance.cjs');
runOsAcceptanceProbe({
 async claimed({database,execute,jobId}){
  // Fixture only: PS helper round trips are slow. Production lease is unchanged.
  await execute(database,`UPDATE platform.provision_jobs SET lease_expires_at=DATEADD(minute,10,SYSUTCDATETIME()) WHERE job_id='${jobId}';SELECT 1;`);
 },
 async setup({database,execute}){
  for(const name of ['016_os_identity_results.sql','017_os_identity_execution_context.sql','018_tenant_directory_evidence.sql']){
   const raw=fs.readFileSync('db/demo-platform-migrations/'+name,'utf8');
   const sql=raw.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`);
   if(name.startsWith('018'))await assert.rejects(execute(database,raw),e=>e.sqlNumber===54401);
   await execute(database,sql);
   if(name.startsWith('018'))assert.equal(await execute(database,sql),'TENANT_DIRECTORY_EVIDENCE_ALREADY_APPLIED');
  }
  await execute(database,'GRANT EXECUTE ON OBJECT::platform.record_os_identity_result TO infraflow_demo_os_executor;SELECT 1;');
 },
 async accepted({database,execute,results,command}){
  let stage='os_result';
  try{
   const input={intentId:command.intentId,delegationToken:command.delegationToken,outcome:'observed_created',uid:60001,gid:60002};
   await execute(database,"EXECUTE AS USER='infraflow_demo_os_executor';BEGIN TRY EXEC platform.record_os_identity_result @json=@json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;",input);
   const id=crypto.randomUUID(),attempt=crypto.randomUUID();
   stage='directory_intent';
   await execute(database,"EXECUTE AS USER='os_worker';BEGIN TRY EXEC platform.record_step_intent @json=@json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;",{jobId:command.jobId,generation:1,expectedJobRevision:1,leaseToken:command.leaseToken,intentId:id,step:'tenant_directories'});
   stage='attempt_constraints';
   const insert=`INSERT platform.directory_attempts(intent_id,prior_os_intent_id,attempt_id,attempt_hash,generation,job_revision,observed_uid,observed_gid,storage_key,config_key,state,prepared_at,deadline,owner_name,sql_actor)
    VALUES('${id}','${command.intentId}','${attempt}',HASHBYTES('SHA2_256','fixture-attempt'),1,1,60001,60002,'/fixture/storage','/fixture/config','prepared',SYSUTCDATETIME(),DATEADD(second,30,SYSUTCDATETIME()),'os_worker',ORIGINAL_LOGIN());SELECT 1;`;
   await assert.rejects(execute(database,insert.replace("'"+command.intentId+"'","'00000000-0000-0000-0000-000000000000'")),e=>e.sqlNumber===547);
   await execute(database,insert);
   stage='result_constraints';
   const result=`INSERT platform.directory_results(intent_id,outcome,journal_digest,confirmed_count,executor_name,sql_actor,recorded_at) VALUES('${id}','observed_created',HASHBYTES('SHA2_256','fixture-journal'),8,'fixture_executor',ORIGINAL_LOGIN(),SYSUTCDATETIME());SELECT 1;`;
   await assert.rejects(execute(database,result.replace(",8,'fixture_executor'",",7,'fixture_executor'")),e=>e.sqlNumber===547);
   await assert.rejects(execute(database,result.replace("'observed_created'","'uncertain'")),e=>e.sqlNumber===547);
   await execute(database,"EXEC(N'CREATE TRIGGER platform.fail_directory_fixture_audit ON platform.directory_result_events AFTER INSERT AS BEGIN THROW 54499,''fixture_directory_audit_failure'',1;END;');SELECT 1;");
   const transaction=`BEGIN TRY BEGIN TRANSACTION;${result.replace('SELECT 1;','')}
    INSERT platform.directory_result_events(intent_id,action,sql_actor,created_at) VALUES('${id}','directories.result_recorded',ORIGINAL_LOGIN(),SYSUTCDATETIME());COMMIT;SELECT 1;
    END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;`;
   await assert.rejects(execute(database,transaction),e=>e.sqlNumber===54499);
   assert.equal(await execute(database,`SELECT COUNT(*) FROM platform.directory_results WHERE intent_id='${id}';`),'0');
   await execute(database,'DROP TRIGGER platform.fail_directory_fixture_audit;SELECT 1;');
   await execute(database,result);
   stage='observation_constraints';
   const observation=(ordinal,uid,gid,mode,inode=1)=>`INSERT platform.directory_observations(intent_id,ordinal,observed_uid,observed_gid,mode,device,inode) VALUES('${id}',${ordinal},${uid},${gid},'${mode}',1,${inode});SELECT 1;`;
   for(const args of [[0,60001,60002,'0711'],[3,60001,60002,'0750'],[2,60001,60002,'0777'],[8,60001,60002,'0700'],[2,60001,60002,'0700',0]])await assert.rejects(execute(database,observation(...args)),e=>e.sqlNumber===547);
   for(let n=0;n<8;n++)await execute(database,observation(n,n===0||n===1||n===3?0:60001,n<2?0:60002,n<2?'0711':n===3?'0750':'0700',n+1));
   assert.equal(await execute(database,`SELECT COUNT(*) FROM platform.directory_observations WHERE intent_id='${id}';`),'8');
   await assert.rejects(execute(database,observation(0,0,0,'0711')),e=>[2601,2627].includes(e.sqlNumber));
   stage='runtime_denied';
   for(const table of ['directory_attempts','directory_attempt_events','directory_results','directory_observations','directory_result_events'])
    await assert.rejects(execute(database,`EXECUTE AS USER='os_worker';BEGIN TRY SELECT TOP(0) * FROM platform.${table};REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;`),e=>e.sqlNumber===229);
   assert.equal(await execute(database,"SELECT CONCAT(COUNT(*),'|',(SELECT COUNT(*) FROM platform.directory_attempt_events),'|',(SELECT COUNT(*) FROM platform.directory_result_events)) FROM sys.database_permissions p JOIN sys.objects o ON o.object_id=p.major_id WHERE o.schema_id=SCHEMA_ID('platform') AND o.name LIKE 'directory[_]%' AND p.state IN('G','W');"),'0|0|0');
   results.push('directory_evidence_guard_reapply_fk_result_policy_inode_duplicate_and_runtime_denial_no_grants');
   results.push('fixture_transaction_result_rolls_back_when_audit_insert_fails_not_runtime_rpc_proof');
  }catch(error){results.push('directory_evidence_failed_stage_'+stage);throw error;}
 }
}).catch(()=>{console.error('DIRECTORY_EVIDENCE_PROBE_FAILED');process.exitCode=1;});
