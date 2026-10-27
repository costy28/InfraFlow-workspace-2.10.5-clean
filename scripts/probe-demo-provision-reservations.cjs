'use strict'
// New local synthetic database only. No server login creation, OS identity, resources or VPS calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const {createTrialSqlFixture}=require('../server/tests/support/demo-trial-sql-fixture')
const {runOwnedSqlProcess}=require('../server/tests/support/demo-owned-sql-process')
const {buildProvisioningPlan}=require('../server/demo-platform/provisioning-plan')
const {resources}=require('../server/demo-platform/trial-policy')
async function main(extension){
  if(process.env.NODE_ENV!=='test'||process.argv.slice(2).join()!=='--temporary-db-confirmed')throw Error('test_confirmation_required')
  let fixture,error,cleanup=false,stage='fixture';const results=[]
  try{
    fixture=await createTrialSqlFixture();const {database,execute}=fixture
    await execute(database,"EXEC(N'CREATE SCHEMA platform AUTHORIZATION dbo');CREATE TABLE platform.bootstrap(singleton bit PRIMARY KEY,format varchar(64));INSERT platform.bootstrap VALUES(1,'infraflow-platform-bootstrap-v1');SELECT 1;")
    stage='migrations'
    for(const file of ['001_company_registry.sql','002_trial_commands.sql','003_operator_security.sql','004_operator_procedures.sql','005_operator_queue_audit.sql','006_provision_job_reservations.sql']){
      const source=fs.readFileSync(path.join(__dirname,'../db/demo-platform-migrations',file),'utf8')
      assert.equal(source.split("N'INFRAFLOW_DEMO_PLATFORM'").length,2)
      if(file.startsWith('006'))await assert.rejects(execute(database,source),e=>e.sqlNumber===52201)
      const copy=source.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`)
      await execute(database,copy)
      if(file.startsWith('006'))assert.equal(await execute(database,copy),'PROVISION_RESERVATIONS_ALREADY_APPLIED')
    }
    results.push('platform_guard_apply_reapply')
    stage='fixture_data'
    const operatorId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',collision='11111111-1111-4111-8111-111111112222'
    await execute(database,`INSERT operator_security.accounts(operator_id,username,revision,enabled,password_hash,totp_envelope,scopes_json)
      VALUES('${operatorId}','prepare-test',1,1,'fixture-not-a-login-hash','fixture-not-a-key',N'["trial:queue"]');
      INSERT platform.trials(trial_id,approval_id,company_name,state) VALUES
      ('${id}','fixture:one',N'Fixture One','queued'),('${other}','fixture:two',N'Fixture Two','queued'),('${collision}','fixture:collision',N'Fixture Collision','queued');
      CREATE USER prepare_probe WITHOUT LOGIN;GRANT EXECUTE ON OBJECT::platform.request_provision_job TO prepare_probe;
      DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::platform TO prepare_probe;
      DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::operator_security TO prepare_probe;SELECT 1;`)
    const call=input=>execute(database,"EXECUTE AS USER='prepare_probe';BEGIN TRY EXEC platform.request_provision_job @json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;",input)
    const input={trialId:id,expectedRevision:0,operatorId,operatorRevision:1,commandId:'fixture:prepare-1'}
    stage='separate_scope'
    await assert.rejects(call(input),e=>e.sqlNumber===52211)
    await execute(database,`UPDATE operator_security.accounts SET scopes_json=N'["trial:prepare"]' WHERE operator_id='${operatorId}';SELECT 1;`)
    results.push('queue_scope_does_not_allow_preparation')
    stage='concurrent_idempotence'
    const [first,second]=await Promise.all([call(input),call(input)])
    assert.equal(first,second);const receipt=JSON.parse(first)
    assert.equal(receipt.executionAllowed,false);assert.equal(receipt.trialRevision,1);assert.equal(receipt.jobState,'queued')
    assert.equal(await execute(database,"SELECT CONCAT((SELECT COUNT(*) FROM platform.provision_jobs),'|',(SELECT COUNT(*) FROM platform.resource_reservations),'|',(SELECT COUNT(*) FROM platform.provision_request_audit));"),'1|7|1')
    assert.equal(await execute(database,`SELECT CONCAT(state,'|',revision,'|',CASE WHEN activated_at IS NULL AND expires_at IS NULL THEN 1 ELSE 0 END) FROM platform.trials WHERE trial_id='${id}';`),'queued|1|1')
    const manifest=JSON.parse(await execute(database,`SELECT resource_manifest FROM platform.provision_jobs WHERE job_id='${receipt.jobId}';`))
    const plan=buildProvisioningPlan({id,state:'queued',revision:0,activatedAt:null,expiresAt:null,resources:resources(id)})
    assert.equal(manifest.databaseName,plan.sql.database);assert.equal(manifest.osIdentity,plan.os.user)
    assert.equal(manifest.sqlLogin,plan.sql.login);assert.equal(manifest.unitName,plan.os.unit)
    assert.equal(manifest.runtimePort,null);assert.equal(manifest.codeRelease,null)
    results.push('atomic_job_seven_bindings_human_audit_idempotent_race_no_activation')
    stage='negative_commands'
    await assert.rejects(call({...input,expectedRevision:1}),e=>e.sqlNumber===52213)
    await assert.rejects(call({...input,commandId:'another-command'}),e=>e.sqlNumber===52213)
    await assert.rejects(call({...input,path:'/etc/unsafe'}),e=>e.sqlNumber===52210)
    await assert.rejects(call({...input,operatorRevision:0}),e=>e.sqlNumber===52211)
    await assert.rejects(execute(database,"EXECUTE AS USER='prepare_probe';SELECT TOP(0) * FROM platform.provision_jobs;REVERT;"),e=>e.sqlNumber===229)
    await assert.rejects(execute(database,'UPDATE platform.provision_jobs SET execution_ready=1;SELECT 1;'),e=>e.sqlNumber===547)
    results.push('changed_commands_injection_revision_direct_access_and_execution_refused')
    stage='resource_collision'
    await assert.rejects(call({...input,trialId:collision,commandId:'fixture:collision'}),e=>e.sqlNumber===52216)
    assert.equal(await execute(database,`SELECT revision FROM platform.trials WHERE trial_id='${collision}';`),'0')
    results.push('truncated_os_identity_collision_refused_without_adoption')
    stage='audit_rollback'
    await execute(database,"EXEC(N'CREATE TRIGGER platform.fail_provision_audit ON platform.provision_request_audit AFTER INSERT AS BEGIN THROW 52299,''fixture_audit_failure'',1;END;');SELECT 1;")
    await assert.rejects(call({...input,trialId:other,commandId:'fixture:rollback'}),e=>e.sqlNumber===52299)
    assert.equal(await execute(database,"SELECT CONCAT((SELECT COUNT(*) FROM platform.provision_jobs),'|',(SELECT COUNT(*) FROM platform.resource_reservations),'|',(SELECT COUNT(*) FROM platform.provision_request_audit),'|',(SELECT COUNT(*) FROM platform.trial_commands),'|',(SELECT COUNT(*) FROM platform.trial_events));"),'1|7|1|1|1')
    assert.equal(await execute(database,`SELECT revision FROM platform.trials WHERE trial_id='${other}';`),'0')
    results.push('audit_failure_rolls_back_job_bindings_receipt_event_and_revision')
    if(extension)await extension({database,execute,receipt,results})
  }catch(e){error={stage,code:e.code??'probe_assertion_failed',sqlNumber:e.sqlNumber??null}}
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
if(require.main===module)main().catch(()=>{console.error('provision_reservation_probe_preflight_failed');process.exitCode=1})
module.exports={runProbe:main}
