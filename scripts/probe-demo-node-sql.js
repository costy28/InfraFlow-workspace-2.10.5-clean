'use strict'
// Explicitly authorized local probe only. No ERP credentials, no production imports.
const assert=require('node:assert/strict'),crypto=require('node:crypto')
const {runOwnedSqlProcess}=require('../server/tests/support/demo-owned-sql-process')
const {createNodeSqlTestExecutor}=require('../server/core/demo-trial-node-sql-test-executor')
const {createSqlTestTrialStore}=require('../server/core/demo-trial-sql-test-store')
async function main(){
  if(process.env.NODE_ENV!=='test'||process.argv.slice(2).join(' ')!=='--create-temporary-sql-confirmed')throw Error('explicit_test_confirmation_required')
  const suffix=crypto.randomBytes(6).toString('hex').toUpperCase()
  const database=`INFRAFLOW_TEST_TRIALS_${suffix}`,user=`INFRAFLOW_TEST_CP_${suffix}`
  const password=`Aa9!${crypto.randomBytes(32).toString('hex')}`
  const manifest={database,user,createdDatabase:false,createdLogin:false}
  const results=[];let adapter,closed=false,stage='preflight',error=null,cleanup=false
  async function admin(sql,input={}){
    const env={};for(const key of ['SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE'])if(process.env[key])env[key]=process.env[key]
    env.PROBE_SQL=Buffer.from(sql).toString('base64');env.PROBE_JSON=Buffer.from(JSON.stringify(input)).toString('base64')
    return runOwnedSqlProcess({env,script:`$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Data;
      $c=New-Object System.Data.SqlClient.SqlConnection('Server=.\\SQLEXPRESS;Database=master;Integrated Security=True;TrustServerCertificate=True;Connect Timeout=5');
      try {$c.Open();$q=$c.CreateCommand();$q.CommandTimeout=15;
      $q.CommandText=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:PROBE_SQL));
      $p=$q.Parameters.Add('@json',[Data.SqlDbType]::NVarChar,-1);$p.Value=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:PROBE_JSON));
      $r=$q.ExecuteReader();$b=New-Object Text.StringBuilder;while($r.Read()){[void]$b.Append([string]$r.GetValue(0))};$r.Close();[Console]::Write($b.ToString())}
      catch {[Console]::Write('ADMIN_SQL_FAILED');exit 1}finally {$c.Dispose()}`})
  }
  try{
    const info=JSON.parse(await admin(`SELECT CONVERT(int,SERVERPROPERTY('IsIntegratedSecurityOnly')) AS windowsOnly,
      (SELECT TOP(1) port FROM sys.dm_tcp_listener_states WHERE type_desc='TSQL' AND state_desc='ONLINE' ORDER BY port) AS port,
      DB_ID(N'${database}') AS existingDb,SUSER_ID(N'${user}') AS existingLogin FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES;`))
    assert.equal(info.windowsOnly,0);assert.equal(info.existingDb,null);assert.equal(info.existingLogin,null)
    assert.ok(Number.isInteger(info.port)&&info.port>=1024&&info.port<=65535)
    stage='create_database'
    await admin(`CREATE DATABASE [${database}]; SELECT 1;`);manifest.createdDatabase=true
    stage='create_login'
    await admin(`DECLARE @p nvarchar(128)=JSON_VALUE(@json,'$.password');
      DECLARE @s nvarchar(max)=N'CREATE LOGIN [${user}] WITH PASSWORD='+QUOTENAME(@p,'''')+N', DEFAULT_DATABASE=[${database}], CHECK_POLICY=ON;';
      EXEC(@s); SELECT 1;`,{password});manifest.createdLogin=true
    await admin(`USE [${database}]; CREATE USER [${user}] FOR LOGIN [${user}]; ALTER ROLE db_owner ADD MEMBER [${user}]; SELECT 1;`)
    adapter=createNodeSqlTestExecutor({database,user,password,port:info.port})
    stage='schema_and_identity'
    const identity=JSON.parse(await adapter.execute(database,`SELECT DB_NAME() AS db,ORIGINAL_LOGIN() AS login,IS_SRVROLEMEMBER('sysadmin') AS sysadmin FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`))
    assert.deepEqual(identity,{db:database,login:user,sysadmin:0})
    const store=createSqlTestTrialStore({database,execute:adapter.execute})
    await store.initialize();results.push('schema_and_dedicated_identity')
    stage='runtime_cas'
    const trialId=crypto.randomUUID();await store.queue({id:trialId,approvalId:trialId,now:1000})
    for(const [action,kind,expectedRevision]of [['provision','worker',0],['ready','worker',1],['activate','activation_agent',2]])
      await store.command({trialId,commandId:action,action,expectedRevision,actor:{id:'probe',kind},now:1001})
    const req=commandId=>({trialId,commandId,expectedGeneration:0,now:2000})
    const race=await Promise.allSettled([store.advanceRuntimeGeneration(req('race-a')),store.advanceRuntimeGeneration(req('race-b'))])
    assert.equal(race.filter(r=>r.status==='fulfilled').length,1)
    assert.equal(race.find(r=>r.status==='rejected').reason.code,'runtime_generation_conflict')
    const winner=race.findIndex(r=>r.status==='fulfilled'),commandId=winner===0?'race-a':'race-b'
    assert.deepEqual(await store.advanceRuntimeGeneration(req(commandId)),race[winner].value)
    results.push('runtime_cas_and_idempotent_retry')
    stage='cancellation'
    await adapter.execute(database,'CREATE TABLE dbo.node_cancel_probe(id int NOT NULL PRIMARY KEY); SELECT 1;')
    const controller=new AbortController()
    const pending=adapter.execute(database,`INSERT dbo.node_cancel_probe VALUES(1); WAITFOR DELAY '00:00:10'; INSERT dbo.node_cancel_probe VALUES(2); SELECT N'late';`,{},{signal:controller.signal})
    const outcome=assert.rejects(pending,{code:'synthetic_sql_aborted'})
    try{
      const deadline=performance.now()+4000
      let started=false
      while(performance.now()<deadline){
        started=await adapter.execute(database,'SELECT COUNT(*) FROM dbo.node_cancel_probe WHERE id=1;')==='1'
        if(started)break
        await new Promise(resolve=>setTimeout(resolve,30))
      }
      assert.equal(started,true,'SQL start marker required before cancellation')
      assert.equal(adapter.status().limiter.active,1)
      const peer=adapter.execute(database,"WAITFOR DELAY '00:00:01'; SELECT N'peer-healthy';")
      const abortedAt=performance.now();controller.abort();await outcome
      assert.ok(performance.now()-abortedAt<4000,'cancellation must settle before WAITFOR completes')
      assert.equal(await peer,'peer-healthy')
      assert.equal(await adapter.execute(database,'SELECT COUNT(*) FROM dbo.node_cancel_probe WHERE id=2;'),'0')
      assert.equal(await adapter.execute(database,'SELECT COUNT(*) FROM dbo.node_cancel_probe WHERE id=1;'),'1')
      results.push('sql_start_marker_observed','cancel_before_late_statement','concurrent_peer_unaffected','prior_committed_marker_preserved')
    }finally{controller.abort();await outcome}
    assert.equal(await adapter.execute(database,"SELECT N'healthy';"),'healthy');results.push('cancel_and_pool_reuse')
    stage='gateway_session_integration'
    results.push(...await require('../server/tests/support/demo-node-gateway-probe').probeNodeGateway({store,adapter,trialA:trialId,database}))
    stage='shutdown';await adapter.shutdown();closed=true
    assert.equal(adapter.status().state,'closed')
    await assert.rejects(adapter.execute(database,'SELECT 1;'),{code:'synthetic_sql_pool_closed'})
    results.push('shutdown_no_reopen');stage='completed'
  }catch(e){error={code:typeof e.code==='string'?e.code:'probe_assertion_or_setup_failed',stage}}
  finally{
    if(adapter&&!closed){try{await adapter.shutdown();closed=true}catch{error??={code:'pool_close_failed',stage}}}
    if(!adapter||closed){
      try{
        // Only names generated above, verified absent before creation, and acknowledged created.
        if(manifest.createdDatabase)await admin(`IF DB_ID(N'${database}') IS NOT NULL DROP DATABASE [${database}]; SELECT 1;`)
        if(manifest.createdLogin)await admin(`IF SUSER_ID(N'${user}') IS NOT NULL DROP LOGIN [${user}]; SELECT 1;`)
        const remaining=JSON.parse(await admin(`SELECT DB_ID(N'${database}') AS db,SUSER_ID(N'${user}') AS login FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES;`))
        cleanup=remaining.db===null&&remaining.login===null
      }catch{error??={code:'cleanup_requires_review',stage}}
    }
    console.log(JSON.stringify({database,user,results,passed:stage==='completed'&&!error,cleanup,error},null,2))
    if(error||!cleanup)process.exitCode=1
  }
}
main().catch(()=>{console.error('probe_preflight_failed');process.exitCode=1})
