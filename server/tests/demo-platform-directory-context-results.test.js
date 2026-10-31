'use strict';
const fs=require('node:fs'),test=require('node:test'),assert=require('node:assert/strict');
const context=fs.readFileSync('db/demo-platform-migrations/020_tenant_directory_context.sql','utf8');
const result=fs.readFileSync('db/demo-platform-migrations/021_tenant_directory_results.sql','utf8');
test('directory context fixed executor and live view preserve closed host authority',()=>{
 assert.match(context,/infraflow_demo_directory_executor/);
 for(const f of ['j.generation=da.generation','j.job_revision=da.job_revision',"i.step_name=''tenant_directories''",'t.revision=j.trial_revision',"r.outcome=''observed_created''",'DATALENGTH(da.storage_key)','directory_result_exists_requires_review','@remaining<15000','@remaining>60000'])assert.ok(context.includes(f),f);
 assert.match(context,/CAST\(0 AS bit\) executionAllowed/);
 assert.doesNotMatch(context,/\bGRANT\b|UPDATE\s+platform\.|INSERT\s+platform\.directory_/i);
});
test('directory result strictly parses eight observations and commits result, observations and audit together',()=>{
 for(const f of ["IF @count=8",'directory_result_live_context_required','COUNT(*) FROM OPENJSON(@obs))<>8','@o<>@n','@u<>CASE','@g<>CASE','18446744073709551615','CONVERT(nvarchar(20),@inode)','GROUP BY device,inode HAVING COUNT(*)<>1','INSERT platform.directory_results','INSERT platform.directory_observations','INSERT platform.directory_result_events','directory_result_exists_requires_review'])assert.ok(result.includes(f),f);
 assert.match(result,/CAST\(1 AS bit\) reconciliationRequired/);
 assert.doesNotMatch(result,/\bGRANT\b|UPDATE\s+platform\.(provision_jobs|trials)|DELETE\s+FROM/i);
});
