'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../../db/demo-platform-migrations/010_provision_step_journal.sql'),'utf8');
test('journal stays an intent-only migration without grants or external effects',()=>{
 assert.match(sql,/DB_NAME\(\)/);assert.match(sql,/009_operator_prepare_change_v1/);
 assert.match(sql,/CHECK\(state='intent_recorded'\)/);assert.match(sql,/CAST\(0 AS bit\) executionAllowed/);
 assert.doesNotMatch(sql,/\bGRANT\s|\bCREATE\s+(?:LOGIN|DATABASE)|\bxp_cmdshell\b|UPDATE\s+platform\.provision_jobs/i);
});
test('journal binds transaction to live SQL lease, current trial and fixed step',()=>{
 for(const fragment of ['WITH(UPDLOCK,HOLDLOCK)','j.job_revision=@rev','j.generation=@gen','j.lease_hash=HASHBYTES',
  'j.lease_expires_at>SYSUTCDATETIME()','j.execution_ready=0','t.revision=j.trial_revision','USER_NAME()',
  'ORIGINAL_LOGIN()','step_reconciliation_required','step_intent_conflict'])assert.ok(sql.includes(fragment),fragment);
 assert.match(sql,/PRIMARY KEY\(job_id,generation,step_name\)/);
 assert.match(sql,/IF XACT_STATE\(\)<>0 ROLLBACK/);
});
