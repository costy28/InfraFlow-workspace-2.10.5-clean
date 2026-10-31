'use strict';
const fs=require('node:fs'),test=require('node:test'),assert=require('node:assert/strict');
const sql=fs.readFileSync('db/demo-platform-migrations/019_prepare_tenant_directories.sql','utf8');
test('directory preparation binds fresh worker lease to an earlier observed OS identity',()=>{
 for(const fragment of ["N''infraflow_demo_lease''","i.step_name=''tenant_directories''","oldi.step_name=''os_identity''",'oldi.generation<@gen','oldi.job_revision<@rev',"r.outcome=''observed_created''",'j.lease_hash=HASHBYTES','i.owner_name COLLATE','t.revision=j.trial_revision','j.execution_ready=0'])assert.ok(sql.includes(fragment),fragment);
 for(const fragment of ['$.storageRoot','$.configRoot','$.osIdentity','DATALENGTH(sr.resource_key)','DATALENGTH(cr.resource_key)'])assert.ok(sql.includes(fragment));
});
test('directory preparation is atomic with audit and exact live replay never extends its deadline',()=>{
 assert.match(sql,/INSERT platform\.directory_attempts/);assert.match(sql,/INSERT platform\.directory_attempt_events/);
 assert.match(sql,/attempt_hash=@hash/);assert.match(sql,/attempt_id=@attempt/);assert.match(sql,/directory_attempt_conflict_requires_review/);
 assert.doesNotMatch(sql,/UPDATE\s+platform\.(directory_attempts|provision_jobs|trials)/i);
 assert.doesNotMatch(sql,/\bGRANT\b|CREATE LOGIN|CREATE USER|xp_cmdshell/i);
 assert.match(sql,/CAST\(0 AS bit\) executionAllowed/);
});
