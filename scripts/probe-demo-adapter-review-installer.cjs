'use strict';
// Exact generated installer SQL in a fresh synthetic DB/login, never production targets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {runProbe}=require('./probe-demo-provision-reservations.cjs');
const {reviewProvisionResources}=require('../server/demo-platform/provision-resource-review');
const driver=require('../server/demo-platform/node_modules/mssql');
runProbe(async({database,execute,receipt,results})=>{
 const suffix=database.replace('INFRAFLOW_TEST_TRIALS_','');if(!/^[A-F0-9]{12}$/.test(suffix)||!process.env.INFRAFLOW_TEST_PYTHON)throw Error();
 const login='INFRAFLOW_TEST_AR_'+suffix,password='Aa9!'+crypto.randomBytes(32).toString('hex');
 let created=false,pool;
 try{
  const dir=path.join(__dirname,'../db/demo-platform-migrations');
  for(const prefix of ['007_','008_','009_','010_','011_','012_']){
   const sql=fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(n=>n.startsWith(prefix))),'utf8');
   await execute(database,sql.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`));
  }
  const p=spawnSync(process.env.INFRAFLOW_TEST_PYTHON,['-B',path.join(__dirname,'demo-adapter-review-installer-sql-fixture.py')],{input:JSON.stringify({password}),encoding:'utf8',timeout:10000,maxBuffer:100000,windowsHide:true});
  if(p.status!==0)throw Error('private_generation_failed');
  const generated=JSON.parse(p.stdout);
  for(const key of Object.keys(generated))generated[key]=generated[key].replaceAll('INFRAFLOW_DEMO_PLATFORM',database).replaceAll('infraflow_demo_adapter_review',login);
  assert.equal(await execute(database,generated.preflight),'ADAPTER_REVIEW_LOGIN_PREFLIGHT_OK');
  assert.equal(await execute(database,generated.creation),'ADAPTER_REVIEW_SQL_SCOPE_APPLIED');created=true;
  await assert.rejects(execute(database,generated.creation),e=>e.sqlNumber===53502);
  await execute(database,`ALTER ROLE db_datareader ADD MEMBER [${login}];SELECT 1;`);
  await assert.rejects(execute(database,generated.scope),e=>e.sqlNumber===53404);
  await execute(database,`ALTER ROLE db_datareader DROP MEMBER [${login}];SELECT 1;`);
  assert.equal(await execute(database,generated.scope),'ADAPTER_REVIEW_SQL_SCOPE_APPLIED');
  results.push('exact_creator_sql_atomic_creation_existing_identity_and_broad_role_refused');
  const info=JSON.parse(await execute(database,"SELECT CONVERT(int,SERVERPROPERTY('IsIntegratedSecurityOnly')) windowsOnly,(SELECT TOP(1) port FROM sys.dm_tcp_listener_states WHERE type_desc='TSQL' AND state_desc='ONLINE' ORDER BY port) port FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;"));
  assert.equal(info.windowsOnly,0);assert.ok(Number.isInteger(info.port)&&info.port>0&&info.port<65536);
  pool=new driver.ConnectionPool({server:'127.0.0.1',port:info.port,database,user:login,password,connectionTimeout:5000,requestTimeout:10000,pool:{min:0,max:1},options:{encrypt:true,trustServerCertificate:true}});
  pool.on('error',()=>{});await pool.connect();
  const verified=await pool.request().query(generated.verification);assert.equal(Object.values(verified.recordset[0])[0],'ADAPTER_REVIEW_LOGIN_VERIFIED');
  const response=await pool.request().input('json',driver.NVarChar(driver.MAX),JSON.stringify({jobId:receipt.jobId})).execute('platform.read_adapter_resource_review');
  const review=reviewProvisionResources(JSON.parse(response.recordset.map(r=>Object.values(r)[0]).join('')));assert.equal(review.executionAllowed,false);
  for(const sql of ['SELECT * FROM platform.provision_jobs','SELECT * FROM platform.adapter_review_tickets','SELECT * FROM operator_security.accounts',
   "EXEC platform.provision_lease_command @operation='claim',@json=N'{}'","EXEC platform.record_step_intent @json=N'{}'","EXEC platform.activate_trial @json=N'{}'","EXEC operator_security.grant_prepare_scope @json=N'{}'"])
   await assert.rejects(pool.request().query(sql),e=>e.number===229);
  assert.equal(await execute(database,"SELECT CONCAT(job_revision,'|',generation,'|',execution_ready,'|',(SELECT COUNT(*) FROM platform.adapter_review_tickets)) FROM platform.provision_jobs;"),'0|0|0|0');
  results.push('native_login_exact_verifier_projection_success_direct_data_lease_admin_commands_denied');
 }finally{
  if(pool)await pool.close();
  if(created){
   await execute(database,`DROP USER IF EXISTS [${login}];DROP LOGIN [${login}];SELECT 1;`);
   assert.equal(await execute(database,`SELECT CASE WHEN SUSER_ID(N'${login}') IS NULL THEN 1 ELSE 0 END;`),'1');
   results.push('temporary_adapter_review_login_removed');
  }
 }
}).catch(()=>{console.error('adapter_installer_probe_failed');process.exitCode=1;});
