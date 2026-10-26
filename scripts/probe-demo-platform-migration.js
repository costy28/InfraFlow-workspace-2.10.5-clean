'use strict'
// Local test database only. Never connects to the VPS or production platform DB.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {createTrialSqlFixture}=require('../server/tests/support/demo-trial-sql-fixture')
const {runOwnedSqlProcess}=require('../server/tests/support/demo-owned-sql-process')
async function main(){
  if(process.env.NODE_ENV!=='test'||process.argv.slice(2).join(' ')!=='--temporary-db-confirmed')throw Error('explicit_test_confirmation_required')
  let fixture,error=null,cleanup=false;const results=[]
  try{
    fixture=await createTrialSqlFixture()
    const {database,execute}=fixture
    if(process.env.INFRAFLOW_TEST_OPERATOR_PROCEDURES_ONLY==='1'){
      results.push(...await require('../server/tests/support/demo-operator-procedure-sql-probe').probeOperatorProcedures(fixture))
      return
    }
    const original=fs.readFileSync(path.join(__dirname,'../db/demo-platform-migrations/001_company_registry.sql'),'utf8')
    assert.equal(original.split("N'INFRAFLOW_DEMO_PLATFORM'").length,2)
    await assert.rejects(execute(database,original),e=>e.sqlNumber===51201)
    results.push('unmodified_migration_refuses_wrong_database')
    // Only the database guard literal is substituted in this in-memory test copy.
    // All SQL schema/transaction/index/constraint statements stay byte-identical.
    const migration=original.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`)
    await execute(database,"EXEC(N'CREATE SCHEMA platform AUTHORIZATION dbo'); CREATE TABLE platform.bootstrap(singleton bit PRIMARY KEY,format varchar(64)); INSERT platform.bootstrap VALUES(1,'infraflow-platform-bootstrap-v1'); SELECT 1;")
    await execute(database,'CREATE TABLE platform.trial_events(sentinel int); SELECT 1;')
    await assert.rejects(execute(database,migration),e=>e.sqlNumber===51204)
    assert.equal(await execute(database,"SELECT COUNT(*) FROM sys.tables WHERE name='schema_migrations' AND schema_id=SCHEMA_ID('platform');"),'0')
    results.push('partial_schema_refused_and_ddl_transaction_rolled_back')
    await execute(database,'DROP TABLE platform.trial_events; SELECT 1;')
    assert.equal(await execute(database,migration),'PLATFORM_REGISTRY_APPLIED')
    assert.equal(await execute(database,migration),'PLATFORM_REGISTRY_ALREADY_APPLIED')
    results.push('apply_and_reapply')
    const A='11111111-1111-4111-8111-111111111111'
    await execute(database,`INSERT platform.trials(trial_id,approval_id,company_name,state) VALUES('${A}','approval-1',N'Companie test','queued'); SELECT 1;`)
    const row=JSON.parse(await execute(database,`SELECT database_name,storage_key,runtime_key,key_ref FROM platform.trials FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`))
    assert.deepEqual(row,{database_name:'INFRAFLOW_DEMO_T_'+A.replaceAll('-',''),storage_key:A,runtime_key:A,key_ref:'trial:'+A})
    await assert.rejects(execute(database,"INSERT platform.trials(trial_id,approval_id,company_name,state) VALUES(NEWID(),'approval-1',N'Duplicat','queued'); SELECT 1;"),e=>[2601,2627].includes(e.sqlNumber))
    await assert.rejects(execute(database,`UPDATE platform.trials SET state='active' WHERE trial_id='${A}'; SELECT 1;`),e=>e.sqlNumber===547)
    await execute(database,`DECLARE @at datetime2(3)=SYSUTCDATETIME(); UPDATE platform.trials SET state='active',activated_at=@at,expires_at=DATEADD(day,15,@at),revision=1 WHERE trial_id='${A}'; SELECT 1;`)
    assert.equal(await execute(database,'SELECT DATEDIFF_BIG(millisecond,activated_at,expires_at) FROM platform.trials;'),String(15*86400000))
    results.push('derived_bindings_unique_approval_activation_constraint_and_15_day_storage')
    await assert.rejects(execute(database,`INSERT platform.trial_commands VALUES('${A}','invalid',CONVERT(binary(32),0),1,N'invalid-json',SYSUTCDATETIME()); SELECT 1;`),e=>e.sqlNumber===547)
    results.push('invalid_receipt_json_refused')
    const commandsOriginal=fs.readFileSync(path.join(__dirname,'../db/demo-platform-migrations/002_trial_commands.sql'),'utf8')
    await assert.rejects(execute(database,commandsOriginal),e=>e.sqlNumber===51301)
    const commands=commandsOriginal.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`)
    assert.equal(await execute(database,commands),'PLATFORM_COMMANDS_APPLIED')
    assert.equal(await execute(database,commands),'PLATFORM_COMMANDS_ALREADY_APPLIED')
    // SQL EXEC does not permit function expressions as parameter values: use variables.
    const queueSql="DECLARE @a nvarchar(max)=JSON_VALUE(@json,'$.approval'),@n nvarchar(max)=JSON_VALUE(@json,'$.company'),@c nvarchar(max)=JSON_VALUE(@json,'$.command'); EXEC platform.queue_trial @a,@n,@c;"
    const q=(approval,company,command)=>execute(database,queueSql,{approval,company,command})
    const [receipt1,receipt2]=await Promise.all([q('approval-cas','Companie CAS','queue-once'),q('approval-cas','Companie CAS','queue-once')])
    assert.equal(receipt1,receipt2);const queued=JSON.parse(receipt1)
    await assert.rejects(q('approval-cas','Changed','queue-once'),e=>e.sqlNumber===51312)
    const activateSql="DECLARE @id uniqueidentifier=CONVERT(uniqueidentifier,JSON_VALUE(@json,'$.id')),@c nvarchar(max)=JSON_VALUE(@json,'$.command'),@r int=CONVERT(int,JSON_VALUE(@json,'$.revision')); EXEC platform.activate_trial @id,@c,@r;"
    const activate=(command,revision)=>execute(database,activateSql,{id:queued.id,command,revision})
    await assert.rejects(activate('too-early',0),e=>e.sqlNumber===51316)
    // Setup-only state simulation: not a real provisioning workflow or worker.
    await execute(database,`UPDATE platform.trials SET state='awaiting_activation',revision=2 WHERE trial_id='${queued.id}'; SELECT 1;`)
    const race=await Promise.allSettled([activate('activate-a',2),activate('activate-b',2)])
    assert.equal(race.filter(r=>r.status==='fulfilled').length,1)
    assert.equal(race.find(r=>r.status==='rejected').reason.sqlNumber,51315)
    const winner=race.findIndex(r=>r.status==='fulfilled'),command=winner===0?'activate-a':'activate-b'
    assert.equal(await activate(command,2),race[winner].value)
    await assert.rejects(activate(command,3),e=>e.sqlNumber===51314)
    assert.equal(await execute(database,`SELECT COUNT(*) FROM platform.trial_events WHERE trial_id='${queued.id}' AND action='activate';`),'1')
    assert.equal(await execute(database,`SELECT DATEDIFF_BIG(millisecond,activated_at,expires_at) FROM platform.trials WHERE trial_id='${queued.id}';`),String(15*86400000))
    results.push('command_migration_apply_retry_queue_dedup_activation_cas_and_audit')
    await execute(database,"EXEC(N'CREATE TRIGGER platform.test_reject_event ON platform.trial_events AFTER INSERT AS BEGIN THROW 51499,''test_audit_failure'',1; END;'); SELECT 1;")
    await assert.rejects(q('rollback-approval','Rollback','rollback-cmd'),e=>e.sqlNumber===51499)
    assert.equal(await execute(database,"SELECT COUNT(*) FROM platform.trials WHERE approval_id='rollback-approval';"),'0')
    await execute(database,'DROP TRIGGER platform.test_reject_event; SELECT 1;')
    results.push('audit_failure_rolls_back_trial_and_receipt')
    const securityOriginal=fs.readFileSync(path.join(__dirname,'../db/demo-platform-migrations/003_operator_security.sql'),'utf8')
    await assert.rejects(execute(database,securityOriginal),e=>e.sqlNumber===51601)
    const security=securityOriginal.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`)
    assert.equal(await execute(database,security),'OPERATOR_SECURITY_APPLIED')
    assert.equal(await execute(database,security),'OPERATOR_SECURITY_ALREADY_APPLIED')
    const {encryptTotpSecret,createSqlOperatorStore}=require('../server/demo-platform/operator-store')
    const crypto=require('node:crypto'),operatorId=crypto.randomUUID(),key=crypto.randomBytes(32),totp='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
    const envelope=encryptTotpSecret(totp,{key,id:operatorId,revision:1})
    await execute(database,`INSERT operator_security.accounts(operator_id,username,revision,enabled,password_hash,totp_envelope,scopes_json)
      SELECT CONVERT(uniqueidentifier,JSON_VALUE(@json,'$.id')),'test-operator',1,1,'test-hash',JSON_VALUE(@json,'$.envelope'),N'["trial:read"]';SELECT 1;`,{id:operatorId,envelope})
    const makeStore=()=>createSqlOperatorStore({operatorId,key,execute:(sql,input)=>execute(database,sql,input)})
    const firstStore=makeStore(),secondStore=makeStore()
    assert.equal((await firstStore.readOperator()).totpSecret,totp)
    const budgets=await Promise.all(Array.from({length:8},(_,i)=>(i%2?firstStore:secondStore).reserveAttempt({operatorId,now:Date.now(),limit:5,windowMs:900000})))
    assert.equal(budgets.filter(Boolean).length,5)
    firstStore.shutdown()
    const restarted=makeStore();assert.equal(await restarted.reserveAttempt({operatorId,now:Date.now(),limit:5,windowMs:900000}),false)
    const counter=Number(await execute(database,"SELECT DATEDIFF_BIG(second,CONVERT(datetime2,'1970-01-01'),SYSUTCDATETIME())/30;"))
    const claims=await Promise.all([secondStore.claimTotpCounter({operatorId,revision:1,counter}),restarted.claimTotpCounter({operatorId,revision:1,counter})])
    assert.equal(claims.filter(Boolean).length,1)
    const third=makeStore();assert.equal(await third.claimTotpCounter({operatorId,revision:1,counter}),false)
    results.push('operator_encrypted_sql_storage_durable_budget_and_single_use_counter')
    await execute(database,`CREATE USER operator_probe_reader WITHOUT LOGIN;GRANT SELECT ON SCHEMA::platform TO operator_probe_reader;
      DECLARE @denied bit=0;EXECUTE AS USER='operator_probe_reader';
      BEGIN TRY SELECT password_hash FROM operator_security.accounts; END TRY BEGIN CATCH IF ERROR_NUMBER()=229 SET @denied=1;ELSE BEGIN REVERT;THROW;END; END CATCH;
      REVERT;SELECT CONVERT(int,@denied);`).then(value=>assert.equal(value,'1'))
    await execute(database,`UPDATE operator_security.accounts SET attempt_count=0,window_started_at=NULL,last_totp_counter=-1 WHERE operator_id='${operatorId}';
      EXEC(N'CREATE TRIGGER operator_security.test_reject_audit ON operator_security.audit AFTER INSERT AS BEGIN THROW 51699,''test_audit_failure'',1;END;');SELECT 1;`)
    await assert.rejects(third.reserveAttempt({operatorId,now:Date.now(),limit:5,windowMs:900000}))
    assert.equal(await execute(database,`SELECT attempt_count FROM operator_security.accounts WHERE operator_id='${operatorId}';`),'0')
    await assert.rejects(third.claimTotpCounter({operatorId,revision:1,counter}))
    assert.equal(await execute(database,`SELECT last_totp_counter FROM operator_security.accounts WHERE operator_id='${operatorId}';`),'-1')
    await execute(database,'DROP TRIGGER operator_security.test_reject_audit; SELECT 1;')
    secondStore.shutdown();restarted.shutdown();third.shutdown();key.fill(0)
    results.push('operator_schema_hidden_from_reader_and_audit_failure_rollback')
    const python=process.env.INFRAFLOW_TEST_PYTHON
    if(!python)throw Error('explicit_test_python_required')
    const {createEnrollmentMaterial}=require('../server/demo-platform/enrollment-material')
    const {createOperatorAuth}=require('../server/demo-platform/operator-auth')
    const {totpAtCounter}=require('../server/demo-platform/operator-credentials')
    const enrollmentKey=crypto.randomBytes(32),password='Isolated-enrollment-test-123!'
    const material=await createEnrollmentMaterial({id:crypto.randomUUID(),username:'enrollment-test',password,totpSecret:totp,keyHex:enrollmentKey.toString('hex')})
    const counterNow=Number(await execute(database,"SELECT DATEDIFF_BIG(second,CONVERT(datetime2,'1970-01-01'),SYSUTCDATETIME())/30;"))
    const helperCode="import importlib.util,json,sys;spec=importlib.util.spec_from_file_location('enroll',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);data=json.load(sys.stdin);print(m.creation_sql(data['record'],data['counter']))"
    const enrollmentSql=require('node:child_process').execFileSync(python,['-c',helperCode,path.join(__dirname,'linux/enroll-demo-platform-operator.py')],
      {input:JSON.stringify({record:material,counter:counterNow-1}),encoding:'utf8',windowsHide:true})
    await execute(database,'DELETE FROM operator_security.audit;DELETE FROM operator_security.accounts;SELECT 1;')
    assert.equal(await execute(database,enrollmentSql),'OPERATOR_ENROLLED')
    await assert.rejects(execute(database,enrollmentSql),e=>e.sqlNumber===51702)
    const enrolledStore=createSqlOperatorStore({operatorId:material.id,key:enrollmentKey,execute:(sql,input)=>execute(database,sql,input)})
    const auth=createOperatorAuth({store:enrolledStore})
    const loginCode=totpAtCounter(totp,Math.floor(Date.now()/30000))
    const session=await auth.login({username:material.username,password,code:loginCode})
    assert.equal((await auth.authorize({...session,operation:'trial.read'})).operatorId,material.id)
    await assert.rejects(auth.login({username:material.username,password,code:loginCode}),/operator_access_denied/)
    auth.shutdown();enrolledStore.shutdown();enrollmentKey.fill(0)
    results.push('first_operator_enrollment_singleton_and_full_sql_password_totp_session')
    const procOriginal=fs.readFileSync(path.join(__dirname,'../db/demo-platform-migrations/004_operator_procedures.sql'),'utf8')
    await assert.rejects(execute(database,procOriginal),e=>e.sqlNumber===51801)
    const procSql=procOriginal.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`)
    assert.equal(await execute(database,procSql),'OPERATOR_PROCEDURES_APPLIED')
    assert.equal(await execute(database,procSql),'OPERATOR_PROCEDURES_ALREADY_APPLIED')
    await execute(database,`CREATE USER auth_procedure_probe WITHOUT LOGIN;
      GRANT EXECUTE ON OBJECT::operator_security.read_account TO auth_procedure_probe;
      GRANT EXECUTE ON OBJECT::operator_security.reserve_attempt TO auth_procedure_probe;
      GRANT EXECUTE ON OBJECT::operator_security.claim_totp TO auth_procedure_probe;
      GRANT EXECUTE ON OBJECT::operator_security.append_audit TO auth_procedure_probe;
      DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::operator_security TO auth_procedure_probe;
      UPDATE operator_security.accounts SET attempt_count=0,window_started_at=NULL,last_totp_counter=-1;SELECT 1;`)
    const allowed=new Set(['read_account','reserve_attempt','claim_totp','append_audit'])
    const limitedExecute=(command,input)=>{
      assert.ok(allowed.has(command))
      return execute(database,`EXECUTE AS USER='auth_procedure_probe';
        BEGIN TRY EXEC operator_security.${command} @json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;`,input)
    }
    // Read-only validation and mutations through the same procedure-mode store port.
    const procKey=crypto.randomBytes(32),procEnvelope=encryptTotpSecret(totp,{key:procKey,id:material.id,revision:1})
    await execute(database,'UPDATE operator_security.accounts SET totp_envelope=JSON_VALUE(@json,\'$.envelope\');SELECT 1;',{envelope:procEnvelope})
    const limitedStore=createSqlOperatorStore({operatorId:material.id,key:procKey,execute:limitedExecute,procedures:true})
    assert.equal((await limitedStore.readOperator()).totpSecret,totp)
    assert.equal(await limitedStore.reserveAttempt({operatorId:material.id,now:Date.now(),limit:5,windowMs:900000}),true)
    const currentCounter=Number(await execute(database,"SELECT DATEDIFF_BIG(second,CONVERT(datetime2,'1970-01-01'),SYSUTCDATETIME())/30;"))
    assert.equal(await limitedStore.claimTotpCounter({operatorId:material.id,revision:1,counter:currentCounter}),true)
    assert.equal(await limitedStore.claimTotpCounter({operatorId:material.id,revision:1,counter:currentCounter}),false)
    await limitedStore.appendAudit({operatorId:material.id,action:'operator_login',at:Date.now()})
    await assert.rejects(execute(database,"EXECUTE AS USER='auth_procedure_probe'; SELECT password_hash FROM operator_security.accounts; REVERT;"),e=>e.sqlNumber===229)
    await assert.rejects(execute(database,"EXECUTE AS USER='auth_procedure_probe'; UPDATE operator_security.accounts SET enabled=0 WHERE 1=0; REVERT;"),e=>e.sqlNumber===229)
    await assert.rejects(limitedExecute('read_account',{id:material.id,extra:true}),e=>e.sqlNumber===51810)
    limitedStore.shutdown();procKey.fill(0)
    results.push('operator_procedures_work_under_execute_only_user_direct_access_denied')
  }catch(e){error={code:typeof e.code==='string'?e.code:'probe_assertion_failed',sqlNumber:e.sqlNumber??null}}
  finally{
    if(fixture){
      const database=fixture.database
      if(!/^INFRAFLOW_TEST_TRIALS_[A-F0-9]{12}$/.test(database))throw Error('cleanup_target_refused')
      const env={};for(const key of ['SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE'])if(process.env[key])env[key]=process.env[key]
      try{
        const output=await runOwnedSqlProcess({env,script:`$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Data;
          $c=New-Object System.Data.SqlClient.SqlConnection('Server=.\\SQLEXPRESS;Database=master;Integrated Security=True;TrustServerCertificate=True;Connect Timeout=5');
          try{$c.Open();$q=$c.CreateCommand();$q.CommandTimeout=15;$q.CommandText="DROP DATABASE [${database}]; SELECT CASE WHEN DB_ID(N'${database}') IS NULL THEN 'CLEAN' ELSE 'REMAINS' END";[Console]::Write($q.ExecuteScalar())}finally{$c.Dispose()}`})
        cleanup=output==='CLEAN'
      }catch{error??={code:'cleanup_requires_review'}}
    }
    console.log(JSON.stringify({database:fixture?.database,results,passed:!error&&cleanup,cleanup,error},null,2))
    if(error||!cleanup)process.exitCode=1
  }
}
main().catch(()=>{console.error('migration_probe_preflight_failed');process.exitCode=1})
