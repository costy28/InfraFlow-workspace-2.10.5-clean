'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'../../scripts/linux',f),'utf8');
test('first directory SQL cycle preflight binds completed OS evidence and untouched job',()=>{
 const s=read('preflight-demo-directory-first-cycle.sql');
 for(const v of ['DIRECTORY_CYCLE_FINAL_SQL_PREFLIGHT_OK',"r.observed_uid=992 AND r.observed_gid=983","j.job_revision=7 AND j.generation=3 AND j.execution_ready=0","i.intent_id='40f385e6-c722-429a-a8fe-46c6119c4834'",'platform.directory_attempt_events','platform.directory_result_events'])assert.ok(s.includes(v),v);
 assert.ok(!/\b(?:GRANT|DENY|REVOKE|INSERT|UPDATE|DELETE|CREATE|ALTER|EXEC)\s/i.test(s));
});
test('directory cycle backup is fixed platform copy-only, checksum and verify-only',()=>{
 const s=read('backup-demo-platform-pre-directory-cycle.sql');
 assert.ok(s.includes('BACKUP DATABASE [INFRAFLOW_DEMO_PLATFORM]'));assert.ok(s.includes('WITH COPY_ONLY,CHECKSUM'));assert.ok(s.includes('RESTORE VERIFYONLY'));
 assert.ok(!/RESTORE DATABASE|WITH\s+REPLACE|DROP DATABASE|GRANT EXECUTE/i.test(s));assert.ok(s.includes('NEWID()'));
});
