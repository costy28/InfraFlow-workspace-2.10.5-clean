'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../../db/demo-platform-migrations/012_adapter_review_tickets.sql'),'utf8');
test('review tickets are hashed, expiring, single-use and effect authority stays closed',()=>{
 for(const text of ['ticket_hash binary(32)','DATEADD(second,10,','consumed_at IS NOT NULL','USER_NAME()',
  'j.execution_ready=0','@savedRev<>@rev','@intentGen<>@gen','@ticketExpiry<=@now',
  'infraflow_demo_adapter_review','CAST(0 AS bit) executionAllowed'])assert.ok(sql.includes(text),text);
 assert.doesNotMatch(sql,/\bGRANT\s|CREATE\s+(?:LOGIN|DATABASE)|UPDATE\s+platform\.provision_jobs/i);
});
