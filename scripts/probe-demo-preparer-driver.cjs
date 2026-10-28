'use strict';
// Native driver test, synthetic local DB/login only. No VPS/ERP credentials.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {runProbe}=require('./probe-demo-provision-reservations.cjs');
const {createProvisionRequestClient}=require('../server/demo-platform/provision-request');
const driver=require('../server/demo-platform/node_modules/mssql');
const {spawnSync}=require('node:child_process');
runProbe(async({database,execute,results})=>{
 const suffix=database.replace('INFRAFLOW_TEST_TRIALS_','');
 if(!/^[A-F0-9]{12}$/.test(suffix))throw Error('synthetic_target_required');
 const login='INFRAFLOW_TEST_PREPARER_'+suffix,password='Aa9!'+crypto.randomBytes(32).toString('hex');
 let created=false,pool,client,closed=false;
 try{
  for(const file of ['007_provision_leases.sql','008_operator_prepare_audit.sql','009_operator_prepare_change.sql']){
   const source=fs.readFileSync(path.join(__dirname,'../db/demo-platform-migrations',file),'utf8');
   await execute(database,source.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`));
  }
  const info=JSON.parse(await execute(database,`SELECT CONVERT(int,SERVERPROPERTY('IsIntegratedSecurityOnly')) windowsOnly,
   (SELECT TOP(1) port FROM sys.dm_tcp_listener_states WHERE type_desc='TSQL' AND state_desc='ONLINE' ORDER BY port) port,
   SUSER_ID(N'${login}') existingLogin FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES;`));
  assert.equal(info.windowsOnly,0);assert.equal(info.existingLogin,null);assert.ok(Number.isInteger(info.port)&&info.port>0&&info.port<65536);
  let generated;
  if(process.env.INFRAFLOW_TEST_PYTHON){
   const p=spawnSync(process.env.INFRAFLOW_TEST_PYTHON,['-B',path.join(__dirname,'demo-preparer-installer-sql-fixture.py')],{input:JSON.stringify({password}),encoding:'utf8',timeout:10000,maxBuffer:100000,windowsHide:true});
   if(p.status!==0)throw Error('installer_fixture_generation_failed');generated=JSON.parse(p.stdout);
   for(const key of ['preflight','creation','verification'])generated[key]=generated[key].replaceAll('INFRAFLOW_DEMO_PLATFORM',database).replaceAll('infraflow_demo_preparer',login);
   assert.equal(await execute(database,generated.preflight),'PREPARER_LOGIN_PREFLIGHT_OK');
   assert.equal(await execute(database,generated.creation),'PREPARER_SQL_SCOPE_APPLIED');created=true;
   await assert.rejects(execute(database,generated.creation),e=>e.sqlNumber===53002);
   results.push('preparer_installer_generated_atomic_creation_existing_identity_refused');
  }else{
  await execute(database,`DECLARE @password nvarchar(128)=JSON_VALUE(@json,'$.password');
   DECLARE @sql nvarchar(max)=N'CREATE LOGIN [${login}] WITH PASSWORD='+QUOTENAME(@password,'''')+N',DEFAULT_DATABASE=[${database}],CHECK_POLICY=ON;';EXEC(@sql);SELECT 1;`,{password});created=true;
  await execute(database,`CREATE USER [${login}] FOR LOGIN [${login}];SELECT 1;`);
  }
  await execute(database,`ALTER ROLE db_datareader ADD MEMBER [${login}];SELECT 1;`);
  const original=fs.readFileSync(path.join(__dirname,'linux/restrict-demo-platform-preparer.sql'),'utf8');
  await assert.rejects(execute(database,original),e=>e.sqlNumber===52901);
  const scope=original.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`).replaceAll('infraflow_demo_preparer',login);
  await assert.rejects(execute(database,scope),e=>e.sqlNumber===52904);
  await execute(database,`ALTER ROLE db_datareader DROP MEMBER [${login}];SELECT 1;`);
  assert.equal(await execute(database,scope),'PREPARER_SQL_SCOPE_APPLIED');
  assert.equal(await execute(database,scope),'PREPARER_SQL_SCOPE_APPLIED');
  results.push('preparer_scope_guard_broad_role_refused_apply_reapply');
  pool=new driver.ConnectionPool({server:'127.0.0.1',port:info.port,database,user:login,password,
   connectionTimeout:5000,requestTimeout:10000,pool:{max:1,min:0},options:{encrypt:true,trustServerCertificate:true}});
  pool.on('error',()=>{});await pool.connect();
  if(generated){const proof=await pool.request().query(generated.verification);assert.equal(Object.values(proof.recordset[0])[0],'PREPARER_LOGIN_VERIFIED');results.push('preparer_installer_generated_native_metadata_verification');}
  const identity=(await pool.request().query(`SELECT DB_NAME() db,ORIGINAL_LOGIN() login,USER_NAME() principal,IS_SRVROLEMEMBER('sysadmin') sysadmin,
   HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL') controlDb;`)).recordset[0];
  assert.deepEqual(identity,{db:database,login,principal:login,sysadmin:0,controlDb:0});
  const permissions=(await pool.request().query(`SELECT s.name schema_name,o.name object_name,p.permission_name
   FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
   CROSS APPLY sys.fn_my_permissions(QUOTENAME(s.name)+'.'+QUOTENAME(o.name),'OBJECT') p
   WHERE s.name IN('platform','operator_security') AND p.permission_name IN('SELECT','INSERT','UPDATE','DELETE','EXECUTE','ALTER','CONTROL','TAKE OWNERSHIP','REFERENCES','VIEW DEFINITION');`)).recordset;
  assert.deepEqual(permissions,[{schema_name:'platform',object_name:'request_provision_job',permission_name:'EXECUTE'}]);
  for(const sql of ['SELECT * FROM platform.provision_jobs','SELECT * FROM operator_security.accounts',
   "EXEC platform.activate_trial @json=N'{}'","EXEC platform.provision_lease_command @operation='claim',@json=N'{}'",
   "EXEC platform.queue_trial_by_operator @json=N'{}'","EXEC operator_security.grant_prepare_scope @json=N'{}'"])
   await assert.rejects(pool.request().query(sql),e=>e.number===229);
  results.push('native_preparer_only_request_rpc_no_direct_data_lease_queue_activate_or_scope_grant');
  const rpc=async input=>{
   const result=await pool.request().input('json',driver.NVarChar(driver.MAX),JSON.stringify(input)).execute('platform.request_provision_job');
   return result.recordset.map(row=>Object.values(row)[0]).join('');
  };
  const trialId='22222222-2222-4222-8222-222222222222',operatorId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const command={trialId,expectedRevision:0,operatorId,operatorRevision:1,commandId:'fixture:native-request'};
  // The base fixture left a deliberate audit-failure trigger; remove only that test trigger.
  await execute(database,"DROP TRIGGER platform.fail_provision_audit;UPDATE operator_security.accounts SET scopes_json=N'[\"trial:queue\"]';SELECT 1;");
  await assert.rejects(rpc(command),e=>e.number===52211);
  await execute(database,"UPDATE operator_security.accounts SET scopes_json=N'[\"trial:prepare\"]';SELECT 1;");
  await assert.rejects(rpc({...command,operatorRevision:0}),e=>e.number===52211);
  client=createProvisionRequestClient({execute:async(proc,args)=>{
   assert.equal(proc,'platform.request_provision_job');return rpc(JSON.parse(args.json));
  }});
  const receipt=await client.request(command);assert.equal(receipt.executionAllowed,false);assert.equal(receipt.trialRevision,1);
  assert.deepEqual(await client.request(command),receipt);
  await assert.rejects(rpc({...command,commandId:'fixture:another-request'}),e=>e.number===52213);
  assert.equal(await execute(database,`SELECT CONCAT(state,'|',revision,'|',CASE WHEN activated_at IS NULL AND expires_at IS NULL THEN 1 ELSE 0 END) FROM platform.trials WHERE trial_id='${trialId}';`),'queued|1|1');
  assert.equal(await execute(database,`SELECT CONCAT((SELECT COUNT(*) FROM platform.provision_jobs WHERE trial_id='${trialId}'),'|',(SELECT COUNT(*) FROM platform.resource_reservations WHERE trial_id='${trialId}'),'|',(SELECT COUNT(*) FROM platform.provision_request_audit WHERE trial_id='${trialId}' AND sql_actor='${login}'));`),'1|7|1');
  results.push('native_request_scope_revision_checked_idempotent_one_job_seven_reservations_audited_no_activation');
  if(process.env.INFRAFLOW_TEST_PREPARER_HTTP==='1')results.push(...await require('../server/tests/support/demo-preparer-http-sql-probe').probePreparerHttpSql({database,execute,rpc,login}));
 }finally{
  if(client)await client.shutdown();
  if(pool){await pool.close();closed=true;}
  if(created&&(!pool||closed)){
   await execute(database,`DROP USER IF EXISTS [${login}];DROP LOGIN [${login}];SELECT 1;`);
   assert.equal(await execute(database,`SELECT CASE WHEN SUSER_ID(N'${login}') IS NULL THEN 1 ELSE 0 END;`),'1');
   results.push('temporary_native_preparer_login_removed');
  }
 }
}).catch(()=>{console.error('preparer_driver_probe_preflight_failed');process.exitCode=1;});
