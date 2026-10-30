'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createAdapterTicketClient}=require('../demo-platform/adapter-ticket-client');
test('migration adds only the distinct review step, guards prior shape and preserves effect gate',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../../db/demo-platform-migrations/013_channel_review_probe.sql'),'utf8');
 for(const value of ['012_adapter_review_tickets_v1','channel_review_probe','step_constraint_requires_review','step_procedure_requires_review',
  'worker_not_idle','ROLLBACK','ALTER TABLE platform.provision_step_intents WITH CHECK'])assert.ok(sql.includes(value));
 assert.doesNotMatch(sql,/\bGRANT\s|UPDATE platform|DELETE FROM platform|CREATE LOGIN|CREATE DATABASE|execution_ready\s*=\s*1/i);
 const preflight=fs.readFileSync(path.join(__dirname,'../../scripts/linux/preflight-demo-channel-review-step.sql'),'utf8');
 assert.match(preflight,/CHANNEL_PROBE_PREFLIGHT_OK/);
 assert.doesNotMatch(preflight,/\bGRANT\s|\bUPDATE\s|\bINSERT\s|\bDELETE\s|\bCREATE\s|\bALTER\s|EXEC platform\./i);
 const backup=fs.readFileSync(path.join(__dirname,'../../scripts/linux/backup-demo-platform-pre013.sql'),'utf8');
 assert.match(backup,/COPY_ONLY,CHECKSUM/);assert.match(backup,/RESTORE VERIFYONLY/);
 assert.doesNotMatch(backup,/RESTORE DATABASE|WITH REPLACE/i);
});
test('ticket client accepts dedicated review receipt only with execution false',async()=>{
 const input={intentId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',ticketToken:'ab'.repeat(32)};
 const receipt={jobId:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',intentId:input.intentId,generation:2,jobRevision:4,
  step:'channel_review_probe',operation:'consume',executionAllowed:false};
 const client=createAdapterTicketClient({role:'consumer',execute:async()=>JSON.stringify(receipt)});
 assert.equal((await client.execute(input)).step,'channel_review_probe');
 receipt.executionAllowed=true;await assert.rejects(client.execute(input));await client.shutdown();
});
