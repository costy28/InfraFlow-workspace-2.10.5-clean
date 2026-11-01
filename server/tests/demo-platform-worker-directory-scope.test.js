'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../../scripts/linux',name),'utf8');
test('directory worker transition has exactly one fixed grant and transactional four-to-five scope',()=>{
 const s=read('grant-demo-worker-directory-scope.sql');
 assert.deepEqual(s.match(/GRANT EXECUTE ON OBJECT::[^;]+;/g),['GRANT EXECUTE ON OBJECT::platform.prepare_tenant_directories TO infraflow_demo_lease;']);
 for(const text of ['BEGIN TRANSACTION','IF XACT_STATE()<>0 ROLLBACK','IF @impersonating=1 REVERT','worker_four_rpc_baseline_required','worker_five_rpc_scope_unconfirmed',"j.job_revision=7 AND j.generation=3 AND j.execution_ready=0","t.activated_at IS NULL AND t.expires_at IS NULL"]){assert.ok(s.includes(text),text);}
 assert.ok(s.includes("'prepare_os_identity_delegation','prepare_tenant_directories')"));
 assert.ok(!/CREATE LOGIN|CREATE USER|ALTER LOGIN|EXEC platform\./i.test(s));
});
test('worker preflight and verification execute metadata only and enforce distinct scopes',()=>{
 const before=read('preflight-demo-worker-directory-scope.sql'),after=read('verify-demo-worker-directory-scope.sql');
 for(const s of [before,after]){
  assert.ok(!/\b(?:GRANT|DENY|REVOKE|INSERT|UPDATE|DELETE|CREATE|ALTER)\s/i.test(s));
  assert.ok(s.includes('sys.fn_my_permissions'));assert.ok(s.includes("HAS_DBACCESS(N'INFRAFLOW_DEMO')"));
 }
 assert.ok(before.includes("'platform.prepare_tenant_directories','OBJECT','EXECUTE'),-1)<>0"));
 assert.ok(after.includes("'platform.prepare_tenant_directories','OBJECT','EXECUTE'),0)<>1"));
 assert.ok(after.includes('WORKER_DIRECTORY_SCOPE_VERIFIED'));
});
