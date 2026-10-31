'use strict';
// Synthetic local SQL login only; no VPS calls, leases or OS accounts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {runProbe}=require('./probe-demo-provision-reservations.cjs');
const driver=require('../server/demo-platform/node_modules/mssql');
runProbe(async({database,execute,results})=>{
 const suffix=database.replace('INFRAFLOW_TEST_TRIALS_','');if(!/^[A-F0-9]{12}$/.test(suffix)||!process.env.INFRAFLOW_TEST_PYTHON)throw Error();
 const login='INFRAFLOW_TEST_WD_'+suffix,password='Aa9!'+crypto.randomBytes(32).toString('hex');
 let created=false,pool,step='fixture_setup';
 try{
  const dir=path.join(__dirname,'../db/demo-platform-migrations');
  for(const prefix of ['007_','008_','009_','010_','011_','012_','013_','014_','015_','016_','017_']){
   const sql=fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(n=>n.startsWith(prefix))),'utf8');
   await execute(database,sql.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`));
  }
  const p=spawnSync(process.env.INFRAFLOW_TEST_PYTHON,['-B',path.join(__dirname,'demo-os-executor-login-sql-fixture.py')],{input:JSON.stringify({password}),encoding:'utf8',timeout:10000,maxBuffer:100000,windowsHide:true});
  if(p.status!==0)throw Error('private_generation_failed');
  const generated=JSON.parse(p.stdout);
  for(const key of Object.keys(generated))generated[key]=generated[key].replaceAll('INFRAFLOW_DEMO_PLATFORM',database).replaceAll('infraflow_demo_os_executor',login)
   .replaceAll('accept_os_identity_delegation','provision_lease_command').replaceAll('record_os_identity_result','record_step_intent');
  assert.equal(await execute(database,generated.creation),'OS_EXECUTOR_SQL_SCOPE_APPLIED');created=true;
  const info=JSON.parse(await execute(database,"SELECT (SELECT TOP(1) port FROM sys.dm_tcp_listener_states WHERE type_desc='TSQL' AND state_desc='ONLINE' ORDER BY port) port FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;"));
  pool=new driver.ConnectionPool({server:'127.0.0.1',port:info.port,database,user:login,password,connectionTimeout:5000,requestTimeout:10000,pool:{min:0,max:1},options:{encrypt:true,trustServerCertificate:true}});
  pool.on('error',()=>{});await pool.connect();
  const verified=await pool.request().query(generated.verification);assert.equal(Object.values(verified.recordset[0])[0],'OS_EXECUTOR_LOGIN_VERIFIED');
  await execute(database,`GRANT EXECUTE ON OBJECT::platform.adapter_review_ticket_command TO [${login}];SELECT 1;`);
  const adapt=file=>fs.readFileSync(file,'utf8').replaceAll('INFRAFLOW_DEMO_PLATFORM',database).replaceAll('infraflow_demo_lease',login);
  const preflight=adapt('scripts/linux/preflight-demo-worker-os-delegation-scope.sql'),scope=adapt('scripts/linux/grant-demo-worker-os-delegation-scope.sql');
  step='preflight';assert.equal(await execute(database,preflight),'WORKER_OS_DELEGATION_SCOPE_PREFLIGHT_OK');
  await execute(database,`ALTER ROLE db_datareader ADD MEMBER [${login}];SELECT 1;`);
  step='broad_role_refusal';await assert.rejects(execute(database,scope),e=>e.sqlNumber===54404);
  await execute(database,`ALTER ROLE db_datareader DROP MEMBER [${login}];SELECT 1;`);
  step='grant';assert.equal(await execute(database,scope),'WORKER_OS_DELEGATION_SCOPE_APPLIED');
  step='replay_refusal';await assert.rejects(execute(database,scope),e=>e.sqlNumber===54407);
  step='native_permissions';
  const rights=await pool.request().query("SELECT HAS_PERMS_BY_NAME('platform.prepare_os_identity_delegation','OBJECT','EXECUTE') allowed;");assert.equal(rights.recordset[0].allowed,1);
  await assert.rejects(pool.request().input('json',driver.NVarChar(driver.MAX),'{}').execute('platform.prepare_os_identity_delegation'),e=>e.number===53910);
  for(const sql of ['SELECT * FROM platform.provision_jobs','SELECT * FROM platform.os_identity_delegations','SELECT * FROM operator_security.accounts',
   "EXEC platform.accept_os_identity_delegation @json=N'{}'","EXEC platform.record_os_identity_result @json=N'{}'","EXEC platform.verify_os_identity_execution_context @json=N'{}'","EXEC platform.activate_trial @json=N'{}'"])
   await assert.rejects(pool.request().query(sql),e=>e.number===229);
  assert.equal(await execute(database,"SELECT CONCAT(state,'|',job_revision,'|',generation,'|',execution_ready) FROM platform.provision_jobs;"),'queued|0|0|0');
  assert.equal(await execute(database,'SELECT COUNT(*) FROM platform.os_identity_delegations;'),'0');
  results.push('worker_native_three_to_four_rpc_no_direct_data_no_executor_or_activation_no_job_claim');
 }catch(error){results.push('failed_step_'+step);throw error;}finally{
  if(pool)await pool.close();
  if(created){await execute(database,`DROP USER IF EXISTS [${login}];DROP LOGIN [${login}];SELECT 1;`);assert.equal(await execute(database,`SELECT CASE WHEN SUSER_ID(N'${login}') IS NULL THEN 1 ELSE 0 END;`),'1');results.push('temporary_worker_delegation_login_removed');}
 }
}).catch(()=>{console.error('WORKER_OS_DELEGATION_SCOPE_PROBE_FAILED');process.exitCode=1;});
