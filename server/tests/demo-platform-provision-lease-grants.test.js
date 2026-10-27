'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../../scripts/linux/restrict-demo-platform-lease.sql'),'utf8');
test('lease grants only target existing mapped identity after migration and broad-scope guards',()=>{
 assert.match(sql,/007_provision_leases_v1/);assert.match(sql,/DB_NAME\(\).*INFRAFLOW_DEMO_PLATFORM/);
 assert.match(sql,/sys\.server_role_members/);assert.match(sql,/sys\.database_role_members/);
 assert.match(sql,/owner_sid=@sid/);assert.match(sql,/existing_dedicated_lease_mapping_required/);
 assert.doesNotMatch(sql,/CREATE LOGIN|ALTER LOGIN|CREATE USER|DROP LOGIN|PASSWORD\s*=/i);
 assert.equal((sql.match(/GRANT EXECUTE ON OBJECT::/g)||[]).length,1);
 assert.match(sql,/GRANT EXECUTE ON OBJECT::platform\.provision_lease_command TO infraflow_demo_lease/);
});
test('lease grants transactional, verify effective refusals, no worker/job activation',()=>{
 assert.match(sql,/EXECUTE AS LOGIN/);assert.match(sql,/EXECUTE AS USER/);
 assert.match(sql,/fn_my_permissions\(NULL,'SERVER'\)/);
 assert.match(sql,/DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::operator_security/);
 assert.match(sql,/IF @impersonating=1 REVERT/);assert.match(sql,/IF XACT_STATE\(\)<>0 ROLLBACK/);
 assert.doesNotMatch(sql,/UPDATE platform\.|INSERT platform\.|systemctl|execution_ready\s*=\s*1/i);
});
