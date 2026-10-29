'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {runProbe}=require('./probe-demo-provision-reservations.cjs');
runProbe(async({database,execute,receipt,results})=>{
 const dir=path.join(__dirname,'../db/demo-platform-migrations');
 for(const prefix of ['007_','008_','009_','010_','011_','012_']){
  const source=fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(n=>n.startsWith(prefix))),'utf8');
  if(prefix==='012_')await assert.rejects(execute(database,source),e=>e.sqlNumber===53201);
  const migration=source.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`);
  await execute(database,migration);
  if(prefix==='012_')assert.equal(await execute(database,migration),'ADAPTER_REVIEW_TICKETS_ALREADY_APPLIED');
 }
 await execute(database,"CREATE USER ticket_worker WITHOUT LOGIN;CREATE USER infraflow_demo_adapter_review WITHOUT LOGIN;GRANT EXECUTE ON OBJECT::platform.provision_lease_command TO ticket_worker;GRANT EXECUTE ON OBJECT::platform.record_step_intent TO ticket_worker;GRANT EXECUTE ON OBJECT::platform.adapter_review_ticket_command TO ticket_worker;GRANT EXECUTE ON OBJECT::platform.adapter_review_ticket_command TO infraflow_demo_adapter_review;DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::platform TO infraflow_demo_adapter_review;SELECT 1;");
 const call=(user,proc,input,operation)=>execute(database,`EXECUTE AS USER='${user}';BEGIN TRY EXEC platform.${proc} ${operation?"@operation='"+operation+"',":''}@json=@json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;`,input).then(JSON.parse);
 const jobId=receipt.jobId,leaseToken='ab'.repeat(32),intentId=crypto.randomUUID(),ticketToken='cd'.repeat(32);
 await call('ticket_worker','provision_lease_command',{jobId,leaseToken,expectedJobRevision:0},'claim');
 await call('ticket_worker','record_step_intent',{jobId,leaseToken,generation:1,expectedJobRevision:1,step:'os_identity',intentId});
 const issue={jobId,leaseToken,generation:1,expectedJobRevision:1,intentId,ticketToken};
 const first=await call('ticket_worker','adapter_review_ticket_command',issue,'issue');assert.equal(first.executionAllowed,false);
 const consume={intentId,ticketToken};
 const race=await Promise.allSettled([call('infraflow_demo_adapter_review','adapter_review_ticket_command',consume,'consume'),call('infraflow_demo_adapter_review','adapter_review_ticket_command',consume,'consume')]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.find(r=>r.status==='rejected').reason.sqlNumber,53211);
 assert.equal(race.find(r=>r.status==='fulfilled').value.executionAllowed,false);
 await assert.rejects(call('ticket_worker','adapter_review_ticket_command',consume,'consume'),e=>e.sqlNumber===53211);
 await assert.rejects(call('ticket_worker','adapter_review_ticket_command',issue,'issue'),e=>e.sqlNumber===53212);
 await assert.rejects(call('infraflow_demo_adapter_review','adapter_review_ticket_command',{...consume,ticketToken:'ef'.repeat(32)},'consume'),e=>e.sqlNumber===53211);
 results.push('review_ticket_single_consumer_race_wrong_actor_replay_wrong_secret_denied');
 const second=crypto.randomUUID(),nextTicket='12'.repeat(32);
 await call('ticket_worker','record_step_intent',{jobId,leaseToken,generation:1,expectedJobRevision:1,step:'tenant_key',intentId:second});
 await call('ticket_worker','adapter_review_ticket_command',{...issue,intentId:second,ticketToken:nextTicket},'issue');
 // Administrator fixture only: simulate expiry without a real 10-second wait.
 await execute(database,`UPDATE platform.adapter_review_tickets SET issued_at=DATEADD(second,-20,SYSUTCDATETIME()),expires_at=DATEADD(second,-10,SYSUTCDATETIME()) WHERE intent_id='${second}';SELECT 1;`);
 await assert.rejects(call('infraflow_demo_adapter_review','adapter_review_ticket_command',{intentId:second,ticketToken:nextTicket},'consume'),e=>e.sqlNumber===53211);
 await assert.rejects(execute(database,"EXECUTE AS USER='infraflow_demo_adapter_review';SELECT * FROM platform.adapter_review_tickets;REVERT;"),e=>e.sqlNumber===229);
 assert.equal(await execute(database,"SELECT CONCAT(COUNT(*),'|',SUM(CASE WHEN consumed_at IS NOT NULL THEN 1 ELSE 0 END)) FROM platform.adapter_review_tickets;"),'2|1');
 await call('ticket_worker','provision_lease_command',{jobId,leaseToken,generation:1,expectedJobRevision:1},'release');
 assert.equal(await execute(database,"SELECT CONCAT(job_revision,'|',generation,'|',CONVERT(int,execution_ready)) FROM platform.provision_jobs;"),'2|1|0');
 results.push('expired_ticket_direct_secret_read_refused_execution_gate_unchanged');
}).catch(()=>{console.error('adapter_ticket_probe_failed');process.exitCode=1;});
