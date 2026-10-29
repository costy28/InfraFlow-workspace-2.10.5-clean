'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {runProbe}=require('./probe-demo-provision-reservations.cjs');
const {reviewProvisionResources}=require('../server/demo-platform/provision-resource-review');
runProbe(async({database,execute,receipt,results})=>{
 const dir=path.join(__dirname,'../db/demo-platform-migrations');
 for(const prefix of ['007_','008_','009_','010_','011_']){
  const source=fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(n=>n.startsWith(prefix))),'utf8');
  if(prefix==='011_')await assert.rejects(execute(database,source),e=>e.sqlNumber===53101);
  const migration=source.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`);
  await execute(database,migration);
  if(prefix==='011_')assert.equal(await execute(database,migration),'ADAPTER_REVIEW_ALREADY_APPLIED');
 }
 await execute(database,"CREATE USER adapter_review WITHOUT LOGIN;GRANT EXECUTE ON OBJECT::platform.read_adapter_resource_review TO adapter_review;DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::platform TO adapter_review;DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::operator_security TO adapter_review;SELECT 1;");
 const read=input=>execute(database,"EXECUTE AS USER='adapter_review';BEGIN TRY EXEC platform.read_adapter_resource_review @json=@json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;",input).then(JSON.parse);
 const snapshot=await read({jobId:receipt.jobId}),review=reviewProvisionResources(snapshot);
 assert.equal(review.executionAllowed,false);assert.equal(review.expectedJobRevision,0);assert.equal(Object.keys(review.resources).length,7);
 assert.equal(JSON.stringify(snapshot).includes('lease_hash'),false);assert.equal(JSON.stringify(snapshot).includes('leaseToken'),false);
 await assert.rejects(read({jobId:receipt.jobId,sql:'injected'}),e=>e.sqlNumber===53110);
 await assert.rejects(read({jobId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}),e=>e.sqlNumber===53111);
 results.push('adapter_review_consistent_seven_bindings_native_projection_no_effect_authority');
 for(const sql of ["SELECT * FROM platform.provision_jobs;","SELECT * FROM operator_security.accounts;",
  "EXEC platform.record_step_intent @json=N'{}';","EXEC platform.provision_lease_command @operation='claim',@json=N'{}';"]){
  await assert.rejects(execute(database,"EXECUTE AS USER='adapter_review';BEGIN TRY "+sql+" REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;"),e=>e.sqlNumber===229);
 }
 assert.equal(await execute(database,"SELECT CONCAT(job_revision,'|',generation,'|',CONVERT(int,execution_ready),'|',(SELECT COUNT(*) FROM platform.provision_step_intents)) FROM platform.provision_jobs;"),'0|0|0|0');
 results.push('adapter_direct_operator_data_lease_journal_denied_no_job_changes');
}).catch(()=>{console.error('adapter_review_probe_failed');process.exitCode=1;});
