'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),test=require('node:test');
const sql=fs.readFileSync('db/demo-platform-migrations/018_tenant_directory_evidence.sql','utf8');
test('directory evidence migration is a closed storage foundation, not execution authority',()=>{
 assert.match(sql,/017_os_identity_execution_context_v1/);
 assert.match(sql,/018_tenant_directory_evidence_v1/);
 assert.match(sql,/worker_not_idle/);assert.match(sql,/directory_schema_partial_requires_review/);
 assert.equal((sql.match(/CREATE TABLE platform\.directory_/g)||[]).length,5);
 assert.doesNotMatch(sql,/\b(?:GRANT|ALTER\s+PROCEDURE|CREATE\s+(?:LOGIN|USER|PROCEDURE))\b/i);
 assert.doesNotMatch(sql,/UPDATE\s+platform\.(?:trials|provision_jobs)/i);
 assert.doesNotMatch(sql,/\b(?:xp_cmdshell|sp_configure|EXECUTE AS)\b/i);
});
test('prior OS result, per-attempt identity and restricted observed policy remain explicit',()=>{
 assert.match(sql,/prior_os_intent_id uniqueidentifier NOT NULL REFERENCES platform\.os_identity_results/);
 assert.match(sql,/attempt_hash binary\(32\) NOT NULL UNIQUE/);
 assert.match(sql,/CHECK\(intent_id<>prior_os_intent_id\)/);
 assert.match(sql,/PRIMARY KEY\(intent_id,ordinal\)/);
 for(const mode of ['0711','0750','0700'])assert.ok(sql.includes("mode='"+mode+"'"));
 assert.match(sql,/confirmed_count=8 AND journal_digest IS NOT NULL/);
 assert.match(sql,/confirmed_count=0 AND journal_digest IS NULL/);
});
