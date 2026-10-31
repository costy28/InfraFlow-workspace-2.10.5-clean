'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
test('OS preparation migration closed by default, no grants or host effects',()=>{
 const s=read('db/demo-platform-migrations/014_os_identity_delegations.sql');
 for(const text of ['013_channel_review_probe_v1','sp_getapplock',"CHECK(state='prepared')","i.step_name=''os_identity''",'HASHBYTES','platform.os_identity_delegation_events','SET @now=SYSUTCDATETIME();','@expires<=@now','CAST(0 AS bit) executionAllowed'])assert.ok(s.includes(text));
 assert.ok(!/\bGRANT\b|\buseradd\b|\bgroupadd\b|\bxp_cmdshell\b/i.test(s.replace(/^--.*$/gm,'')));
 assert.ok(!s.includes('UPDATE platform.provision_jobs'));
});
test('OS delegation package preflight read-only and backup only on fixed platform',()=>{
 const p=read('scripts/linux/preflight-demo-os-delegation.sql');
 assert.ok(!/\b(INSERT|UPDATE|DELETE|ALTER|GRANT|EXEC)\b/i.test(p));
 assert.ok(p.includes('j.job_revision=5'));assert.ok(p.includes('j.generation=2'));
 const b=read('scripts/linux/backup-demo-platform-pre014.sql');assert.ok(b.includes('COPY_ONLY,CHECKSUM'));assert.ok(b.includes('RESTORE VERIFYONLY'));
 assert.ok(!b.includes('RESTORE DATABASE'));
});
