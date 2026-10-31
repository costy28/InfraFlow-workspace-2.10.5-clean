'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('acceptance is fixed executor, single-use, audit-atomic and not host execution authority',()=>{
 const s=fs.readFileSync('db/demo-platform-migrations/015_os_identity_acceptance.sql','utf8');
 for(const text of ['014_os_identity_delegations_v1',"N''infraflow_demo_os_executor''",'os_acceptance_already_consumed_requires_review','platform.os_identity_acceptance_events','SET @now=SYSUTCDATETIME();','@deadline<=@now','DATALENGTH(r.resource_key)=32','CAST(0 AS bit) executionAllowed','durable_result_and_reconciliation_protocol'])assert.ok(s.includes(text));
 assert.ok(!/\bGRANT\b|\buseradd\b|\bgroupadd\b|\bxp_cmdshell\b/i.test(s.replace(/^--.*$/gm,'')));
 assert.ok(!s.includes('UPDATE platform.provision_jobs'));
});
test('acceptance preflight has no writes and backup does not restore a database',()=>{
 const p=fs.readFileSync('scripts/linux/preflight-demo-os-acceptance.sql','utf8');
 assert.ok(!/\b(INSERT|UPDATE|DELETE|ALTER|GRANT|EXEC)\b/i.test(p));assert.ok(p.includes('j.job_revision=5'));
 const b=fs.readFileSync('scripts/linux/backup-demo-platform-pre015.sql','utf8');assert.ok(b.includes('COPY_ONLY,CHECKSUM'));assert.ok(b.includes('RESTORE VERIFYONLY'));assert.ok(!b.includes('RESTORE DATABASE'));
});
