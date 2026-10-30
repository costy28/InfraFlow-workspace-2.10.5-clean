'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {runProbe}=require('./probe-demo-provision-reservations.cjs');
const {runChannelReviewCycle}=require('../server/demo-platform/channel-review-cycle');
runProbe(async({database,execute,receipt,results})=>{
 const dir=path.join(__dirname,'../db/demo-platform-migrations');
 for(const prefix of ['007_','008_','009_','010_','011_','012_','013_']){
  const source=fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(n=>n.startsWith(prefix))),'utf8');
  await execute(database,source.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`));
 }
 await execute(database,"CREATE USER channel_worker WITHOUT LOGIN;CREATE USER infraflow_demo_adapter_review WITHOUT LOGIN;GRANT EXECUTE ON OBJECT::platform.provision_lease_command TO channel_worker;GRANT EXECUTE ON OBJECT::platform.record_step_intent TO channel_worker;GRANT EXECUTE ON OBJECT::platform.adapter_review_ticket_command TO channel_worker;GRANT EXECUTE ON OBJECT::platform.adapter_review_ticket_command TO infraflow_demo_adapter_review;SELECT 1;");
 const allowed=['platform.provision_lease_command','platform.record_step_intent','platform.adapter_review_ticket_command'];
 const sql={check:async()=>({ok:true}),execute:async(proc,args)=>{
  assert.ok(allowed.includes(proc));
  return execute(database,`EXECUTE AS USER='channel_worker';BEGIN TRY EXEC ${proc} ${args.operation?"@operation='"+args.operation+"',":''}@json=@json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;`,JSON.parse(args.json));
 }};
 const channel={execute:async input=>JSON.parse(await execute(database,"EXECUTE AS USER='infraflow_demo_adapter_review';BEGIN TRY EXEC platform.adapter_review_ticket_command @operation='consume',@json=@json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;",input))};
 const result=await runChannelReviewCycle({sql,channel,jobId:receipt.jobId,expectedJobRevision:0});
 assert.equal(result.status,'channel_checked_and_released');assert.equal(result.jobRevision,2);assert.equal(result.generation,1);assert.equal(result.executionAllowed,false);
 assert.equal(await execute(database,"SELECT CONCAT(j.state,'|',j.job_revision,'|',j.generation,'|',j.execution_ready,'|',(SELECT COUNT(*) FROM platform.provision_step_intents WHERE step_name='channel_review_probe'),'|',(SELECT COUNT(*) FROM platform.adapter_review_tickets WHERE consumed_at IS NOT NULL)) FROM platform.provision_jobs j;"),'queued|2|1|0|1|1');
 results.push('real_sql_cycle_diagnostic_intent_ticket_consumed_lease_released_gate_closed');
 await assert.rejects(runChannelReviewCycle({sql,channel,jobId:receipt.jobId,expectedJobRevision:0}),e=>e.stage==='claim');
 results.push('stale_revision_stops_at_claim_no_automatic_retry');
}).catch(()=>{console.error('channel_review_cycle_probe_failed');process.exitCode=1;});
