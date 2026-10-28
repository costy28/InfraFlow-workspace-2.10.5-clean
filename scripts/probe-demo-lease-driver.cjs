'use strict';
// Local synthetic DB/login only. Never accepts production credentials or targets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {runProbe}=require('./probe-demo-provision-reservations.cjs');
const {createProvisionLeaseClient}=require('../server/demo-platform/provision-lease-client');
const driver=require('../server/demo-platform/node_modules/mssql');
const {spawnSync}=require('node:child_process');
runProbe(async({database,execute,receipt,results})=>{
 const suffix=database.replace('INFRAFLOW_TEST_TRIALS_','');
 if(!/^[A-F0-9]{12}$/.test(suffix))throw Error('synthetic_target_required');
 const login='INFRAFLOW_TEST_LEASE_'+suffix,password='Aa9!'+crypto.randomBytes(32).toString('hex');
 let created=false,pool,client,closed=false;
 try{
  const source=fs.readFileSync(path.join(__dirname,'../db/demo-platform-migrations/007_provision_leases.sql'),'utf8');
  await execute(database,source.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`));
  const info=JSON.parse(await execute(database,`SELECT CONVERT(int,SERVERPROPERTY('IsIntegratedSecurityOnly')) windowsOnly,
   (SELECT TOP(1) port FROM sys.dm_tcp_listener_states WHERE type_desc='TSQL' AND state_desc='ONLINE' ORDER BY port) port,
   SUSER_ID(N'${login}') existingLogin FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES;`));
  assert.equal(info.windowsOnly,0);assert.equal(info.existingLogin,null);assert.ok(Number.isInteger(info.port)&&info.port>0&&info.port<65536);
  let generated;
  if(process.env.INFRAFLOW_TEST_PYTHON){
   const p=spawnSync(process.env.INFRAFLOW_TEST_PYTHON,['-B',path.join(__dirname,'demo-lease-installer-sql-fixture.py')],{input:JSON.stringify({password}),encoding:'utf8',timeout:10000,maxBuffer:100000,windowsHide:true});
   if(p.status!==0)throw Error('installer_fixture_generation_failed');
   generated=JSON.parse(p.stdout);
   for(const key of ['preflight','creation','verification'])generated[key]=generated[key].replaceAll('INFRAFLOW_DEMO_PLATFORM',database).replaceAll('infraflow_demo_lease',login);
   assert.equal(await execute(database,generated.preflight),'LEASE_LOGIN_PREFLIGHT_OK');
   assert.equal(await execute(database,generated.creation),'LEASE_SQL_SCOPE_APPLIED');created=true;
   await assert.rejects(execute(database,generated.creation),e=>e.sqlNumber===52502);
   results.push('installer_generated_sql_atomic_creation_and_existing_identity_refusal');
  }else{
  await execute(database,`DECLARE @password nvarchar(128)=JSON_VALUE(@json,'$.password');
   DECLARE @sql nvarchar(max)=N'CREATE LOGIN [${login}] WITH PASSWORD='+QUOTENAME(@password,'''')+N',DEFAULT_DATABASE=[${database}],CHECK_POLICY=ON;';EXEC(@sql);SELECT 1;`,{password});created=true;
  await execute(database,`CREATE USER [${login}] FOR LOGIN [${login}];
   GRANT EXECUTE ON OBJECT::platform.provision_lease_command TO [${login}];
   DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::platform TO [${login}];
   DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::operator_security TO [${login}];SELECT 1;`);
  }
  const scope=fs.readFileSync(path.join(__dirname,'linux/restrict-demo-platform-lease.sql'),'utf8')
   .replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`).replaceAll('infraflow_demo_lease',login);
  assert.equal(await execute(database,scope),'LEASE_SQL_SCOPE_APPLIED');
  assert.equal(await execute(database,scope),'LEASE_SQL_SCOPE_APPLIED');
  results.push('lease_scope_script_native_apply_reapply');
  pool=new driver.ConnectionPool({server:'127.0.0.1',port:info.port,database,user:login,password,
   connectionTimeout:5000,requestTimeout:10000,pool:{max:1,min:0},options:{encrypt:true,trustServerCertificate:true}});
  pool.on('error',()=>{});await pool.connect();
  if(generated){
   const proof=await pool.request().query(generated.verification);
   assert.equal(Object.values(proof.recordset[0])[0],'LEASE_LOGIN_VERIFIED');
   results.push('installer_generated_native_verification_metadata_only');
  }
  const identity=(await pool.request().query(`SELECT DB_NAME() db,ORIGINAL_LOGIN() login,USER_NAME() principal,IS_SRVROLEMEMBER('sysadmin') sysadmin,
   HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL') controlDb;`)).recordset[0];
  assert.deepEqual(identity,{db:database,login,principal:login,sysadmin:0,controlDb:0});
  for(const sql of ['SELECT * FROM platform.provision_jobs','SELECT * FROM operator_security.accounts',"EXEC platform.activate_trial @json=N'{}'","EXEC platform.request_provision_job @json=N'{}'"])
   await assert.rejects(pool.request().query(sql),e=>e.number===229);
  results.push('native_driver_dedicated_login_no_dbowner_direct_data_and_other_commands_denied');
  client=createProvisionLeaseClient({execute:async(proc,args)=>{
   assert.equal(proc,'platform.provision_lease_command');
   const response=await pool.request().input('operation',driver.VarChar(16),args.operation).input('json',driver.NVarChar(driver.MAX),args.json).execute(proc);
   return response.recordset.map(row=>Object.values(row)[0]).join('');
  }});
  const token=crypto.randomBytes(32).toString('hex'),base={jobId:receipt.jobId,expectedJobRevision:0,leaseToken:token};
  const claim=await client.execute('claim',base);assert.equal(claim.executionAllowed,false);assert.equal(claim.generation,1);
  assert.deepEqual(await client.execute('claim',base),claim);
  const verify={jobId:base.jobId,generation:1,leaseToken:token};
  assert.equal((await client.execute('verify',verify)).jobRevision,1);
  assert.equal((await client.execute('renew',{...verify,expectedJobRevision:1})).jobRevision,2);
  assert.equal((await client.execute('release',{...verify,expectedJobRevision:2})).leaseExpiresAt,null);
  assert.equal(await execute(database,"SELECT CONCAT(state,'|',execution_ready,'|',job_revision) FROM platform.provision_jobs;"),'queued|0|3');
  results.push('native_rpc_adapter_claim_replay_verify_renew_release_execution_closed');
  if(process.env.INFRAFLOW_TEST_WORKER_CYCLE==='1'){
   const {createProvisionWorkerCycle}=require('../server/demo-platform/provision-worker-cycle');
   const worker=createProvisionWorkerCycle({lease:client});
   try{
    const checked=await worker.run({jobId:receipt.jobId,expectedJobRevision:3});
    assert.equal(checked.status,'checked_and_released');assert.equal(checked.generation,2);assert.equal(checked.jobRevision,6);assert.equal(checked.executionAllowed,false);
   }finally{await worker.shutdown();}
   results.push('worker_native_bounded_cycle_no_effects');
   let abandoned;
   const interrupted=createProvisionWorkerCycle({lease:{execute:async(op,c)=>{
    const value=await client.execute(op,c);
    if(op==='claim'){abandoned={...c,generation:value.generation};throw Error('fixture_lost_claim_receipt_after_commit');}
    return value;
   }}});
   try{await assert.rejects(interrupted.run({jobId:receipt.jobId,expectedJobRevision:6}),e=>e.stage==='claim'&&e.leaseMayRemain===true);}finally{await interrupted.shutdown();}
   assert.equal(await execute(database,"SELECT CONCAT(state,'|',generation,'|',job_revision,'|',execution_ready) FROM platform.provision_jobs;"),'leased|3|7|0');
   // Fixture-admin clock simulation only; never a production lease bypass.
   await execute(database,"UPDATE platform.provision_jobs SET lease_expires_at=DATEADD(second,-1,SYSUTCDATETIME());SELECT 1;");
   const recovered=createProvisionWorkerCycle({lease:client});
   try{const checked=await recovered.run({jobId:receipt.jobId,expectedJobRevision:7});assert.equal(checked.generation,4);assert.equal(checked.jobRevision,10);}finally{await recovered.shutdown();}
   await assert.rejects(client.execute('verify',{jobId:receipt.jobId,generation:abandoned.generation,leaseToken:abandoned.leaseToken}));
   assert.equal(await execute(database,"SELECT CONCAT(j.state COLLATE Latin1_General_100_BIN2,'|',j.generation,'|',j.job_revision,'|',j.execution_ready,'|',t.state COLLATE Latin1_General_100_BIN2,'|',CASE WHEN t.activated_at IS NULL AND t.expires_at IS NULL THEN 1 ELSE 0 END) FROM platform.provision_jobs j JOIN platform.trials t ON t.trial_id=j.trial_id;"),'queued|4|10|0|queued|1');
   results.push('worker_native_lost_claim_receipt_no_retry_expiry_recovery_new_generation');
  }
 }finally{
  if(client)await client.shutdown();
  if(pool){await pool.close();closed=true;}
  if(created&&(!pool||closed)){
   await execute(database,`DROP USER IF EXISTS [${login}];DROP LOGIN [${login}];SELECT 1;`);
   assert.equal(await execute(database,`SELECT CASE WHEN SUSER_ID(N'${login}') IS NULL THEN 1 ELSE 0 END;`),'1');
   results.push('temporary_native_login_removed');
  }
 }
}).catch(()=>{console.error('lease_driver_probe_preflight_failed');process.exitCode=1;});
