'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../../db/demo-platform-migrations/009_operator_prepare_change.sql'),'utf8');
test('scope change migration gated, no automatic account/grant mutation',()=>{
 assert.match(sql,/008_operator_prepare_audit_v1/);assert.match(sql,/N'INFRAFLOW_DEMO_PLATFORM'/);
 assert.match(sql,/IS_SRVROLEMEMBER\(''sysadmin''\)/);assert.doesNotMatch(sql,/GRANT EXECUTE|CREATE LOGIN|ALTER LOGIN/);
 assert.ok(Buffer.byteLength(sql)<20000);
});
test('CAS locks account, updates revision/envelope/scopes together and audits atomically',()=>{
 assert.match(sql,/WITH\(UPDLOCK,HOLDLOCK\)/);
 assert.match(sql,/SET revision=@new,totp_envelope=.*scopes_json=@newScopes/);
 assert.match(sql,/INSERT operator_security.scope_changes/);
 assert.match(sql,/IF XACT_STATE\(\)<>0 ROLLBACK/);
 assert.doesNotMatch(sql,/SET password_hash|SET last_totp_counter|SET attempt_count/);
});
