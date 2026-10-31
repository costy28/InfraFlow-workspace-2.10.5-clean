'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const sql=fs.readFileSync('db/demo-platform-migrations/017_os_identity_execution_context.sql','utf8');
test('context RPC does not grant authority or mutate operational rows',()=>{
 const procedure=sql.slice(sql.indexOf("EXEC(N'CREATE PROCEDURE"),sql.indexOf("INSERT platform.schema_migrations"));
 assert.ok(procedure.includes('CAST(0 AS bit) executionAllowed'));
 assert.ok(!/\b(?:GRANT|UPDATE|DELETE|MERGE|xp_cmdshell)\b|INSERT\s+(?!@keys\b)/i.test(procedure.replace(/^\s*--.*$/gm,'')));
});
test('context binds executor, token, live fence, canonical reservation and terminal result',()=>{
 for(const s of ["N''infraflow_demo_os_executor''",'SHA2_256','j.generation','j.job_revision=d.job_revision','j.job_revision=i.job_revision','t.revision=j.trial_revision','DATALENGTH(r.resource_key)=32','DATALENGTH(d.resource_key)=32','DATALENGTH(JSON_VALUE','platform.os_identity_results WITH(HOLDLOCK)','@remaining<15000','os_context_result_exists_requires_review'])assert.ok(sql.includes(s),s);
 assert.ok(sql.indexOf('SET @now=SYSUTCDATETIME()')>sql.indexOf('platform.os_identity_results WITH(HOLDLOCK)'));
});
