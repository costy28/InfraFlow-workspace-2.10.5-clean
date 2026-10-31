'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {runProbe}=require('./probe-demo-provision-reservations.cjs');
function runOsDelegationProbe(extension={}){return runProbe(async({database,execute,receipt,results})=>{
 const dir=path.join(__dirname,'../db/demo-platform-migrations');
 for(const prefix of ['007_','008_','009_','010_','011_','012_','013_','014_']){
  const source=fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(n=>n.startsWith(prefix))),'utf8');
  const migration=source.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`);
  await execute(database,migration);
  if(prefix==='014_')assert.equal(await execute(database,migration),'OS_IDENTITY_DELEGATIONS_ALREADY_APPLIED');
 }
 if(extension.setup)await extension.setup({database,execute,results});
 await execute(database,"CREATE USER os_worker WITHOUT LOGIN;GRANT EXECUTE ON OBJECT::platform.provision_lease_command TO os_worker;GRANT EXECUTE ON OBJECT::platform.record_step_intent TO os_worker;GRANT EXECUTE ON OBJECT::platform.prepare_os_identity_delegation TO os_worker;SELECT 1;");
 const call=(proc,input,op)=>execute(database,`EXECUTE AS USER='os_worker';BEGIN TRY EXEC platform.${proc} ${op?"@operation='"+op+"',":''}@json=@json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;`,input).then(JSON.parse);
 const jobId=receipt.jobId,leaseToken='ab'.repeat(32),intentId=crypto.randomUUID();
 await call('provision_lease_command',{jobId,expectedJobRevision:0,leaseToken},'claim');
 if(extension.claimed)await extension.claimed({database,execute,jobId});
 const intent={jobId,generation:1,expectedJobRevision:1,leaseToken,intentId,step:'os_identity'};
 await call('record_step_intent',intent);
 const command={jobId,generation:1,expectedJobRevision:1,leaseToken,intentId,delegationToken:'cd'.repeat(32)};
 await execute(database,"UPDATE platform.provision_jobs SET resource_manifest=JSON_MODIFY(resource_manifest,'$.osIdentity',JSON_VALUE(resource_manifest,'$.osIdentity')+' ');SELECT 1;");
 await assert.rejects(call('prepare_os_identity_delegation',command),e=>e.sqlNumber===53911);
 await execute(database,"UPDATE platform.provision_jobs SET resource_manifest=JSON_MODIFY(resource_manifest,'$.osIdentity',RTRIM(JSON_VALUE(resource_manifest,'$.osIdentity')));SELECT 1;");
 await assert.rejects(call('prepare_os_identity_delegation',{...command,path:'/etc'}),e=>e.sqlNumber===53910);
 await assert.rejects(call('prepare_os_identity_delegation',{...command,leaseToken:'ff'.repeat(32)}),e=>e.sqlNumber===53911);
 await execute(database,"EXEC(N'CREATE TRIGGER platform.fail_os_delegation_audit ON platform.os_identity_delegation_events AFTER INSERT AS BEGIN THROW 53999,''fixture_os_audit_failure'',1;END;');SELECT 1;");
 await assert.rejects(call('prepare_os_identity_delegation',command),e=>e.sqlNumber===53999);
 assert.equal(await execute(database,'SELECT COUNT(*) FROM platform.os_identity_delegations;'),'0');
 await execute(database,'DROP TRIGGER platform.fail_os_delegation_audit;SELECT 1;');
 const first=await call('prepare_os_identity_delegation',command),again=await call('prepare_os_identity_delegation',command);
 assert.deepEqual(first,again);assert.equal(first.executionAllowed,false);assert.equal(first.state,'prepared');
 assert.equal(Object.keys(first).sort().join(','),'executionAllowed,generation,intentId,jobId,jobRevision,resourceKey,state');
 assert.equal(JSON.stringify(first).includes(command.delegationToken),false);
 assert.equal(await execute(database,'SELECT CONCAT((SELECT COUNT(*) FROM platform.os_identity_delegations),\'|\',(SELECT COUNT(*) FROM platform.os_identity_delegation_events));'),'1|1');
 await assert.rejects(call('prepare_os_identity_delegation',{...command,delegationToken:'ef'.repeat(32)}),e=>e.sqlNumber===53912);
 await assert.rejects(execute(database,"EXECUTE AS USER='os_worker';SELECT * FROM platform.os_identity_delegations;REVERT;"),e=>e.sqlNumber===229);
 results.push('os_delegation_atomic_audit_rollback_exact_replay_token_conflict_direct_read_denied_no_effect_authority');
 if(extension.prepared)await extension.prepared({database,execute,results,command});
 await call('provision_lease_command',{jobId,generation:1,expectedJobRevision:1,leaseToken},'release');
 await assert.rejects(call('prepare_os_identity_delegation',command),e=>e.sqlNumber===53911);
 assert.equal(await execute(database,'SELECT CONCAT(state,\'|\',job_revision,\'|\',generation,\'|\',execution_ready) FROM platform.provision_jobs;'),'queued|2|1|0');
 results.push('released_lease_refuses_delegation_replay_execution_gate_unchanged');
});}
if(require.main===module)runOsDelegationProbe().catch(()=>{console.error('OS_DELEGATION_PROBE_FAILED');process.exitCode=1;});
module.exports={runOsDelegationProbe};
