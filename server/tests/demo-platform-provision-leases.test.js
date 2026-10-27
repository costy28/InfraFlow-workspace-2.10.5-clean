'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../../db/demo-platform-migrations/007_provision_leases.sql'),'utf8');
test('lease migration is private, transactional and never opens execution or grants',()=>{
 assert.match(sql,/N'INFRAFLOW_DEMO_PLATFORM'/);
 assert.match(sql,/006_provision_reservations_v1/);
 assert.match(sql,/j\.execution_ready=0/);
 assert.match(sql,/CAST\(0 AS bit\) executionAllowed/);
 assert.doesNotMatch(sql,/\bGRANT\s+|DROP\s+CONSTRAINT|execution_ready\s*=\s*1|CREATE\s+LOGIN/i);
 assert.ok(Buffer.byteLength(sql)<20000);
});
test('SQL clock, principal, hashed token and rollback are authoritative',()=>{
 assert.match(sql,/USER_NAME\(\)/);assert.match(sql,/ORIGINAL_LOGIN\(\)/);
 assert.match(sql,/HASHBYTES\(''SHA2_256''/);
 assert.match(sql,/SET @now=SYSUTCDATETIME\(\)/);
 assert.match(sql,/DATEADD\(second,60,@now\)/);
 assert.match(sql,/@expiry<=@now/);assert.match(sql,/@gen<>@requestedGen/);
 assert.match(sql,/WITH\(UPDLOCK,HOLDLOCK\)/);
 assert.match(sql,/INSERT platform\.provision_lease_events/);
 assert.match(sql,/IF XACT_STATE\(\)<>0 ROLLBACK/);
});
