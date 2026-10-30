'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {runProbe}=require('./probe-demo-provision-reservations.cjs');
runProbe(async({database,execute,receipt,results})=>{
 const dir=path.join(__dirname,'../db/demo-platform-migrations');
 for(const prefix of ['007_','008_','009_','010_','011_','012_','013_']){
  const source=fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(n=>n.startsWith(prefix))),'utf8');
  if(prefix==='013_'){
   await assert.rejects(execute(database,source),e=>e.sqlNumber===53701);
   await execute(database,"CREATE USER channel_worker WITHOUT LOGIN;CREATE USER infraflow_demo_adapter_review WITHOUT LOGIN;GRANT EXECUTE ON OBJECT::platform.provision_lease_command TO channel_worker;GRANT EXECUTE ON OBJECT::platform.record_step_intent TO channel_worker;GRANT EXECUTE ON OBJECT::platform.adapter_review_ticket_command TO channel_worker;GRANT EXECUTE ON OBJECT::platform.adapter_review_ticket_command TO infraflow_demo_adapter_review;SELECT 1;");
  }
  const migration=source.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`);
  await execute(database,migration);
  if(prefix==='013_')assert.equal(await execute(database,migration),'CHANNEL_REVIEW_PROBE_ALREADY_APPLIED');
 }
 const call=(proc,input,op)=>execute(database,`EXECUTE AS USER='channel_worker';BEGIN TRY EXEC platform.${proc} ${op?"@operation='"+op+"',":''}@json=@json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;`,input).then(JSON.parse);
 const jobId=receipt.jobId,leaseToken='ab'.repeat(32);
 await call('provision_lease_command',{jobId,leaseToken,expectedJobRevision:0},'claim');
 const intent={jobId,leaseToken,generation:1,expectedJobRevision:1,step:'channel_review_probe',intentId:crypto.randomUUID()};
 assert.equal((await call('record_step_intent',intent)).executionAllowed,false);
 const ticketToken='ef'.repeat(32);
 assert.equal((await call('adapter_review_ticket_command',{jobId,leaseToken,generation:1,expectedJobRevision:1,intentId:intent.intentId,ticketToken},'issue')).executionAllowed,false);
 const consumed=JSON.parse(await execute(database,"EXECUTE AS USER='infraflow_demo_adapter_review';BEGIN TRY EXEC platform.adapter_review_ticket_command @operation='consume',@json=@json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;",{intentId:intent.intentId,ticketToken}));
 assert.equal(consumed.step,'channel_review_probe');assert.equal(consumed.executionAllowed,false);
 results.push('alter_preserves_existing_rpc_grants_review_probe_ticket_consumed_without_effect_authority');
 await assert.rejects(call('record_step_intent',{...intent,step:'arbitrary_command',intentId:crypto.randomUUID()}),e=>e.sqlNumber===52810);
 await call('provision_lease_command',{jobId,leaseToken,generation:1,expectedJobRevision:1},'release');
 const next='cd'.repeat(32);
 await call('provision_lease_command',{jobId,leaseToken:next,expectedJobRevision:2},'claim');
 const real={jobId,leaseToken:next,generation:2,expectedJobRevision:3,step:'os_identity',intentId:crypto.randomUUID()};
 assert.equal((await call('record_step_intent',real)).executionAllowed,false);
 await assert.rejects(call('record_step_intent',{...real,step:'channel_review_probe',intentId:crypto.randomUUID()}),e=>e.sqlNumber===52813);
 await call('provision_lease_command',{jobId,leaseToken:next,generation:2,expectedJobRevision:3},'release');
 assert.equal(await execute(database,"SELECT CONCAT((SELECT COUNT(*) FROM platform.provision_step_intents WHERE step_name='channel_review_probe'),'|',(SELECT COUNT(*) FROM platform.provision_step_intents WHERE step_name='os_identity'),'|',execution_ready) FROM platform.provision_jobs;"),'1|1|0');
 results.push('dedicated_probe_step_does_not_occupy_real_steps_unknown_step_and_unreconciled_probe_retry_refused');
}).catch(()=>{console.error('channel_review_step_probe_failed');process.exitCode=1;});
