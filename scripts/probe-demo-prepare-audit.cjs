'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {runProbe}=require('./probe-demo-provision-reservations.cjs');
runProbe(async({database,execute,results})=>{
 for(const file of ['007_provision_leases.sql','008_operator_prepare_audit.sql']){
  const source=fs.readFileSync(path.join(__dirname,'../db/demo-platform-migrations',file),'utf8');
  if(file.startsWith('008'))await assert.rejects(execute(database,source),e=>e.sqlNumber===52601);
  const copy=source.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`);
  await execute(database,copy);
  if(file.startsWith('008'))assert.equal(await execute(database,copy),'OPERATOR_PREPARE_AUDIT_ALREADY_APPLIED');
 }
 const before=await execute(database,"SELECT CONCAT(revision,'|',password_hash,'|',totp_envelope,'|',last_totp_counter,'|',attempt_count,'|',scopes_json) FROM operator_security.accounts;");
 await execute(database,"CREATE USER audit_prepare_probe WITHOUT LOGIN;GRANT EXECUTE ON OBJECT::operator_security.append_audit TO audit_prepare_probe;DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::operator_security TO audit_prepare_probe;SELECT 1;");
 const call=input=>execute(database,"EXECUTE AS USER='audit_prepare_probe';BEGIN TRY EXEC operator_security.append_audit @json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;",input);
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 assert.equal(await call({id,action:'trial.prepare'}),'1');
 await assert.rejects(call({id,action:'trial.purge'}),e=>e.sqlNumber===51810);
 await assert.rejects(call({id,action:'trial.prepare',revision:2}),e=>e.sqlNumber===51810);
 assert.equal(await execute(database,"SELECT COUNT(*) FROM operator_security.audit WHERE action='trial.prepare';"),'1');
 assert.equal(await execute(database,"SELECT CONCAT(revision,'|',password_hash,'|',totp_envelope,'|',last_totp_counter,'|',attempt_count,'|',scopes_json) FROM operator_security.accounts;"),before);
 results.push('prepare_audit_migration_apply_reapply_native_rpc_allowlist_no_account_or_totp_changes');
}).catch(()=>{console.error('prepare_audit_probe_preflight_failed');process.exitCode=1;});
