'use strict'
// Opt-in synthetic local DB only; no VPS, no existing DB, no server login changes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const {createTrialSqlFixture}=require('../server/tests/support/demo-trial-sql-fixture')
const {runOwnedSqlProcess}=require('../server/tests/support/demo-owned-sql-process')
async function main(){
  if(process.env.NODE_ENV!=='test'||process.argv.slice(2).join()!=='--temporary-db-confirmed')throw Error('test_confirmation_required')
  let fixture,error,cleanup=false;const results=[]
  try{
    fixture=await createTrialSqlFixture();const {database,execute}=fixture
    await execute(database,"EXEC(N'CREATE SCHEMA platform AUTHORIZATION dbo');CREATE TABLE platform.bootstrap(singleton bit PRIMARY KEY,format varchar(64));INSERT platform.bootstrap VALUES(1,'infraflow-platform-bootstrap-v1');SELECT 1;")
    for(const file of ['001_company_registry.sql','002_trial_commands.sql','003_operator_security.sql','004_operator_procedures.sql','005_operator_queue_audit.sql']){
      const source=fs.readFileSync(path.join(__dirname,'../db/demo-platform-migrations',file),'utf8')
      assert.equal(source.split("N'INFRAFLOW_DEMO_PLATFORM'").length,2)
      if(file.startsWith('005'))await assert.rejects(execute(database,source),e=>e.sqlNumber===51901)
      const copy=source.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`)
      await execute(database,copy)
      if(file.startsWith('005'))assert.equal(await execute(database,copy),'OPERATOR_QUEUE_AUDIT_ALREADY_APPLIED')
    }
    results.push('guard_apply_reapply')
    await execute(database,"CREATE USER infraflow_demo_registrar WITHOUT LOGIN;GRANT CONNECT TO infraflow_demo_registrar;GRANT EXECUTE ON OBJECT::platform.queue_trial TO infraflow_demo_registrar;SELECT 1;")
    const grantSource=fs.readFileSync(path.join(__dirname,'linux/restrict-demo-platform-registrar.sql'),'utf8')
    await assert.rejects(execute(database,grantSource),e=>e.sqlNumber===52001)
    // Temporary DB USER only: no server login is created. Skip solely the server-login mapping preflight in this test copy.
    const start=grantSource.indexOf("IF SUSER_ID(N'infraflow_demo_registrar')"),end=grantSource.indexOf('DECLARE @impersonating')
    assert.ok(start>0&&end>start)
    const grantCopy=(grantSource.slice(0,start)+"IF USER_ID(N'infraflow_demo_registrar') IS NULL THROW 52003,'test_user_required',1;\n"+grantSource.slice(end))
      .replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`)
    assert.equal(await execute(database,grantCopy),'REGISTRAR_OPERATOR_SCOPE_APPLIED')
    assert.equal(await execute(database,grantCopy),'REGISTRAR_OPERATOR_SCOPE_APPLIED')
    results.push('permission_transition_and_reapply_execute_only_temp_user')
    const operatorId='11111111-1111-4111-8111-111111111111'
    await execute(database,`INSERT operator_security.accounts(operator_id,username,revision,enabled,password_hash,totp_envelope,scopes_json)
      VALUES('${operatorId}','fixture',1,1,'fixture-not-a-login-hash','fixture-not-an-envelope',N'["trial:queue"]');
      CREATE USER registrar_probe WITHOUT LOGIN;GRANT EXECUTE ON OBJECT::platform.queue_trial_by_operator TO registrar_probe;
      DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::platform TO registrar_probe;
      DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::operator_security TO registrar_probe;
      DENY EXECUTE ON OBJECT::platform.queue_trial TO registrar_probe;
      DENY EXECUTE ON OBJECT::platform.activate_trial TO registrar_probe;SELECT 1;`)
    const call=input=>execute(database,"EXECUTE AS USER='registrar_probe';BEGIN TRY EXEC platform.queue_trial_by_operator @json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;",input)
    const input={operatorId,operatorRevision:1,approvalId:'fixture:approval-1',commandId:'fixture:command-1',companyName:'Fixture SRL'}
    const first=await call(input),id=JSON.parse(first).id
    assert.equal(await call(input),first)
    assert.equal(await execute(database,`SELECT CONCAT((SELECT COUNT(*) FROM platform.trials),'|',(SELECT COUNT(*) FROM platform.operator_command_audit),'|',(SELECT COUNT(*) FROM operator_security.audit WHERE action='trial.queue'));`),'1|1|1')
    assert.equal(await execute(database,`SELECT actor_ref FROM platform.trial_events WHERE trial_id='${id}';`),'operator:'+operatorId)
    results.push('execute_only_idempotent_receipt_atomic_human_audit')
    await assert.rejects(call({...input,companyName:'Changed'}),e=>e.sqlNumber===51913)
    await assert.rejects(call({...input,approvalId:'different'}),e=>e.sqlNumber===51913)
    await assert.rejects(call({...input,operatorRevision:0}),e=>e.sqlNumber===51911)
    await assert.rejects(call({...input,extra:true}),e=>e.sqlNumber===51910)
    await assert.rejects(execute(database,"EXECUTE AS USER='registrar_probe';SELECT TOP(0) * FROM operator_security.accounts;REVERT;"),e=>e.sqlNumber===229)
    results.push('changed_payload_revision_extra_keys_and_direct_read_refused')
    const raceInput={...input,approvalId:'fixture:race',commandId:'fixture:race'}
    const race=await Promise.all([call(raceInput),call(raceInput)])
    assert.equal(race[0],race[1])
    results.push('concurrent_same_command_single_receipt')
    await execute(database,`UPDATE operator_security.accounts SET enabled=0 WHERE operator_id='${operatorId}';SELECT 1;`)
    await assert.rejects(call(input),e=>e.sqlNumber===51911)
    await execute(database,`UPDATE operator_security.accounts SET enabled=1,scopes_json=N'["trial:read"]' WHERE operator_id='${operatorId}';SELECT 1;`)
    await assert.rejects(call(input),e=>e.sqlNumber===51911)
    await execute(database,`UPDATE operator_security.accounts SET scopes_json=N'["trial:queue"]' WHERE operator_id='${operatorId}';
      EXEC(N'CREATE TRIGGER platform.fail_command_audit ON platform.operator_command_audit AFTER INSERT AS BEGIN THROW 51999,''fixture_audit_failure'',1;END;');SELECT 1;`)
    await assert.rejects(call({...input,approvalId:'fixture:rollback',commandId:'fixture:rollback'}),e=>e.sqlNumber===51999)
    assert.equal(await execute(database,"SELECT CONCAT((SELECT COUNT(*) FROM platform.trials),'|',(SELECT COUNT(*) FROM platform.trial_commands),'|',(SELECT COUNT(*) FROM platform.trial_events),'|',(SELECT COUNT(*) FROM platform.operator_command_audit),'|',(SELECT COUNT(*) FROM operator_security.audit WHERE action='trial.queue'));"),'2|2|2|2|2')
    results.push('disabled_scope_and_audit_failure_rollback')
  }catch(e){error={code:e.code??'probe_assertion_failed',sqlNumber:e.sqlNumber??null}}
  finally{
    if(fixture){
      const database=fixture.database
      if(!/^INFRAFLOW_TEST_TRIALS_[A-F0-9]{12}$/.test(database))throw Error('cleanup_target_refused')
      const env={};for(const key of ['SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE'])if(process.env[key])env[key]=process.env[key]
      try{const output=await runOwnedSqlProcess({env,script:`$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Data;
        $c=New-Object System.Data.SqlClient.SqlConnection('Server=.\\SQLEXPRESS;Database=master;Integrated Security=True;TrustServerCertificate=True;Connect Timeout=5');
        try{$c.Open();$q=$c.CreateCommand();$q.CommandTimeout=15;$q.CommandText="DROP DATABASE [${database}];SELECT CASE WHEN DB_ID(N'${database}') IS NULL THEN 'CLEAN' ELSE 'REMAINS' END";[Console]::Write($q.ExecuteScalar())}finally{$c.Dispose()}`});cleanup=output==='CLEAN'}catch{error??={code:'cleanup_requires_review'}}
    }
    console.log(JSON.stringify({database:fixture?.database,results,passed:!error&&cleanup,cleanup,error},null,2));if(error||!cleanup)process.exitCode=1
  }
}
main().catch(()=>{console.error('operator_queue_probe_preflight_failed');process.exitCode=1})
