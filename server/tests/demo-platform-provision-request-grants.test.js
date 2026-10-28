'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../../scripts/linux/restrict-demo-platform-preparer.sql'),'utf8');
test('preparer scope script targets existing mapping, rejects ownership and role membership',()=>{
 assert.match(sql,/009_operator_prepare_change_v1/);assert.match(sql,/existing_preparer_mapping_required/);
 for(const marker of ['sys.server_role_members','sys.database_role_members','sys.schemas','sys.objects','sys.databases'])assert.ok(sql.includes(marker));
 assert.doesNotMatch(sql,/CREATE LOGIN|ALTER LOGIN|CREATE USER|DROP LOGIN|PASSWORD\s*=/i);
 assert.equal((sql.match(/GRANT EXECUTE ON OBJECT::/g)||[]).length,1);
 assert.match(sql,/GRANT EXECUTE ON OBJECT::platform\.request_provision_job TO infraflow_demo_preparer/);
});
test('preparer grants transactional and separates lease, activation and operator administration',()=>{
 for(const proc of ['provision_lease_command','activate_trial','queue_trial_by_operator','grant_prepare_scope','read_account'])assert.ok(sql.includes(proc));
 assert.match(sql,/DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::operator_security/);
 assert.match(sql,/IF @impersonating=1 REVERT/);assert.match(sql,/IF XACT_STATE\(\)<>0 ROLLBACK/);
 assert.doesNotMatch(sql,/INSERT platform\.|UPDATE platform\.|systemctl|execution_ready\s*=\s*1/i);
});
