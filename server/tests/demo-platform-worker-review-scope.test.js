'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../../scripts/linux',name),'utf8');
test('worker scope transition fixed existing login, idle guard, exactly three grants',()=>{
 const sql=read('restrict-demo-platform-worker-review.sql');
 for(const text of ['IS_SRVROLEMEMBER','012_adapter_review_tickets_v1','worker_not_idle_stop_no_changes','WITH(UPDLOCK,HOLDLOCK)',
  'worker_unexpected_effective_scope','WORKER_REVIEW_SQL_SCOPE_APPLIED','ROLLBACK','sys.server_role_members','sys.database_role_members'])assert.ok(sql.includes(text),text);
 const grants=[...sql.matchAll(/GRANT EXECUTE ON OBJECT::platform\.(\w+) TO infraflow_demo_lease/g)].map(r=>r[1]).sort();
 assert.deepEqual(grants,['adapter_review_ticket_command','provision_lease_command','record_step_intent']);
 assert.doesNotMatch(sql,/CREATE LOGIN|ALTER LOGIN|UPDATE platform|INSERT platform|DELETE FROM platform/i);
});
test('worker preflight is read-only, no granting or job operations',()=>{
 const sql=read('preflight-demo-worker-review-scope.sql');
 assert.match(sql,/WORKER_REVIEW_PREFLIGHT_READ_ONLY/);
 assert.doesNotMatch(sql,/\bGRANT\s|\bCREATE\s|\bUPDATE\s|\bINSERT\s|\bDELETE\s|EXEC platform\./i);
 const verify=read('verify-demo-worker-review-scope.sql');
 assert.match(verify,/WORKER_REVIEW_SCOPE_VERIFIED/);
 assert.doesNotMatch(verify,/\bGRANT\s|\bCREATE\s|\bUPDATE\s|\bINSERT\s|\bDELETE\s|EXEC platform\./i);
});
