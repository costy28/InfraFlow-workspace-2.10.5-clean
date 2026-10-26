'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const {encryptTotpSecret,createSqlOperatorStore}=require('../../demo-platform/operator-store')
async function probeOperatorProcedures({database,execute}){
  if(process.env.NODE_ENV!=='test'||!/^INFRAFLOW_TEST_TRIALS_[A-F0-9]{12}$/.test(database))throw Error('synthetic_test_only')
  await execute(database,"EXEC(N'CREATE SCHEMA platform AUTHORIZATION dbo'); CREATE TABLE platform.bootstrap(singleton bit PRIMARY KEY,format varchar(64));INSERT platform.bootstrap VALUES(1,'infraflow-platform-bootstrap-v1');SELECT 1;")
  for(const file of ['001_company_registry.sql','002_trial_commands.sql','003_operator_security.sql','004_operator_procedures.sql']){
    const source=fs.readFileSync(path.join(__dirname,'../../../db/demo-platform-migrations',file),'utf8')
    assert.equal(source.split("N'INFRAFLOW_DEMO_PLATFORM'").length,2)
    if(file.startsWith('004'))await assert.rejects(execute(database,source),e=>e.sqlNumber===51801)
    const copy=source.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`)
    await execute(database,copy)
    if(file.startsWith('004'))assert.equal(await execute(database,copy),'OPERATOR_PROCEDURES_ALREADY_APPLIED')
  }
  const id=crypto.randomUUID(),key=crypto.randomBytes(32),secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
  const envelope=encryptTotpSecret(secret,{key,id,revision:1})
  await execute(database,`INSERT operator_security.accounts(operator_id,username,revision,enabled,password_hash,totp_envelope,scopes_json)
    SELECT CONVERT(uniqueidentifier,JSON_VALUE(@json,'$.id')),'procedure-test',1,1,'non-login-test-hash',JSON_VALUE(@json,'$.envelope'),N'["trial:read"]';
    CREATE USER auth_procedure_probe WITHOUT LOGIN;
    GRANT EXECUTE ON OBJECT::operator_security.read_account TO auth_procedure_probe;
    GRANT EXECUTE ON OBJECT::operator_security.reserve_attempt TO auth_procedure_probe;
    GRANT EXECUTE ON OBJECT::operator_security.claim_totp TO auth_procedure_probe;
    GRANT EXECUTE ON OBJECT::operator_security.append_audit TO auth_procedure_probe;
    DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::operator_security TO auth_procedure_probe;SELECT 1;`,{id,envelope})
  const allowed=new Set(['read_account','reserve_attempt','claim_totp','append_audit'])
  const limited=(command,input)=>{
    assert.ok(allowed.has(command))
    return execute(database,`EXECUTE AS USER='auth_procedure_probe'; BEGIN TRY
      EXEC operator_security.${command} @json;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;`,input)
  }
  const a=createSqlOperatorStore({operatorId:id,key,procedures:true,execute:limited})
  const b=createSqlOperatorStore({operatorId:id,key,procedures:true,execute:limited})
  try{
    assert.equal((await a.readOperator()).totpSecret,secret)
    const budget=await Promise.all(Array.from({length:8},(_,i)=>(i%2?a:b).reserveAttempt({operatorId:id,now:Date.now(),limit:5,windowMs:900000})))
    assert.equal(budget.filter(Boolean).length,5)
    const counter=Number(await execute(database,"SELECT DATEDIFF_BIG(second,CONVERT(datetime2,'1970-01-01'),SYSUTCDATETIME())/30;"))
    const claims=await Promise.all([a.claimTotpCounter({operatorId:id,revision:1,counter}),b.claimTotpCounter({operatorId:id,revision:1,counter})])
    assert.equal(claims.filter(Boolean).length,1)
    assert.equal(await a.claimTotpCounter({operatorId:id,revision:1,counter}),false)
    await a.appendAudit({operatorId:id,action:'operator_login',at:Date.now()})
    for(const statement of ['SELECT password_hash FROM operator_security.accounts;','UPDATE operator_security.accounts SET enabled=0 WHERE 1=0;','EXEC platform.queue_trial NULL,NULL,NULL;'])
      await assert.rejects(execute(database,"EXECUTE AS USER='auth_procedure_probe';"+statement+'REVERT;'),e=>e.sqlNumber===229)
    await assert.rejects(limited('read_account',{id,extra:true}),e=>e.sqlNumber===51810)
    await execute(database,`UPDATE operator_security.accounts SET attempt_count=0,window_started_at=NULL,last_totp_counter=-1 WHERE operator_id='${id}';
      EXEC(N'CREATE TRIGGER operator_security.test_audit_failure ON operator_security.audit AFTER INSERT AS BEGIN THROW 51899,''synthetic_audit_failure'',1;END;');SELECT 1;`)
    await assert.rejects(a.reserveAttempt({operatorId:id,now:Date.now(),limit:5,windowMs:900000}))
    // Counter computed inside this one SQL batch, avoiding stale test OTP timing.
    await assert.rejects(execute(database,`DECLARE @counter bigint=DATEDIFF_BIG(second,CONVERT(datetime2,'1970-01-01'),SYSUTCDATETIME())/30;
      DECLARE @payload nvarchar(max)=(SELECT '${id}' id,@counter counter,1 revision FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
      EXECUTE AS USER='auth_procedure_probe';BEGIN TRY EXEC operator_security.claim_totp @payload;REVERT;END TRY BEGIN CATCH REVERT;THROW;END CATCH;`),e=>e.sqlNumber===51899)
    assert.equal(await execute(database,`SELECT CONCAT(attempt_count,':',last_totp_counter) FROM operator_security.accounts WHERE operator_id='${id}';`),'0:-1')
    await execute(database,'DROP TRIGGER operator_security.test_audit_failure;SELECT 1;')
    return ['operator_procedures_apply_reapply_guard','execute_only_read_budget_cas_audit','direct_select_update_and_trial_command_denied','strict_payload_and_atomic_audit_failure']
  }finally{a.shutdown();b.shutdown();key.fill(0)}
}
module.exports={probeOperatorProcedures}
