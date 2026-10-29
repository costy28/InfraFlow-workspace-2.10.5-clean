'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../../scripts/linux',name),'utf8');
test('pilot preflight reads only and refuses partial/new schema and changed job',()=>{
 const sql=read('preflight-demo-platform-010012.sql');
 for(const text of ['PRE010012_PREFLIGHT_OK','j.job_revision=3','j.generation=1','j.execution_ready=0','j.lease_hash IS NULL','new_schema_exists_requires_review_no_retry'])assert.ok(sql.includes(text));
 assert.doesNotMatch(sql,/\b(?:GRANT|CREATE|ALTER|UPDATE|INSERT|DELETE|BACKUP|RESTORE|EXEC)\b/i);
});
test('backup fixed platform only, copy-only checksum and unique output, no actual restore',()=>{
 const sql=read('backup-demo-platform-pre010012.sql');
 assert.match(sql,/BACKUP DATABASE \[INFRAFLOW_DEMO_PLATFORM\]/);assert.match(sql,/COPY_ONLY,CHECKSUM/);
 assert.match(sql,/RESTORE VERIFYONLY/);assert.match(sql,/NEWID\(\)/);assert.match(sql,/PRE010012_BACKUP_VERIFIED/);
 assert.doesNotMatch(sql,/RESTORE DATABASE|\bGRANT\b|CREATE LOGIN|WITH REPLACE/i);
});
