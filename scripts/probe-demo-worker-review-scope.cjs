'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {runProbe}=require('./probe-demo-provision-reservations.cjs');
const driver=require('../server/demo-platform/node_modules/mssql');
runProbe(async({database,execute,receipt,results})=>{
 const suffix=database.replace('INFRAFLOW_TEST_TRIALS_','');if(!/^[A-F0-9]{12}$/.test(suffix))throw Error();
 const login='INFRAFLOW_TEST_WR_'+suffix,password='Aa9!'+crypto.randomBytes(32).toString('hex');
 let created=false,pool;
 try{
  const dir=path.join(__dirname,'../db/demo-platform-migrations');
  for(const prefix of ['007_','008_','009_','010_','011_','012_']){
   const sql=fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(n=>n.startsWith(prefix))),'utf8');
   await execute(database,sql.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`));
  }
  await execute(database,`DECLARE @p nvarchar(128)=JSON_VALUE(@json,'$.password');DECLARE @s nvarchar(max)=N'CREATE LOGIN [${login}] WITH PASSWORD='+QUOTENAME(@p,'''')+N',DEFAULT_DATABASE=[${database}],CHECK_POLICY=ON;';EXEC(@s);SELECT 1;`,{password});created=true;
  await execute(database,`CREATE USER [${login}] FOR LOGIN [${login}];SELECT 1;`);
  const adapt=sql=>sql.replaceAll('INFRAFLOW_DEMO_PLATFORM',database).replaceAll('infraflow_demo_lease',login);
  assert.equal(await execute(database,adapt(fs.readFileSync(path.join(__dirname,'linux/restrict-demo-platform-lease.sql'),'utf8'))),'LEASE_SQL_SCOPE_APPLIED');
  const scope=adapt(fs.readFileSync(path.join(__dirname,'linux/restrict-demo-platform-worker-review.sql'),'utf8'));
  await execute(database,`ALTER ROLE db_datareader ADD MEMBER [${login}];SELECT 1;`);
  await assert.rejects(execute(database,scope),e=>e.sqlNumber===53604);
  await execute(database,`ALTER ROLE db_datareader DROP MEMBER [${login}];SELECT 1;`);
  assert.equal(await execute(database,scope),'WORKER_REVIEW_SQL_SCOPE_APPLIED');
  assert.equal(await execute(database,scope),'WORKER_REVIEW_SQL_SCOPE_APPLIED');
  results.push('worker_old_deny_contract_transition_exact_three_rpc_broad_role_refused_idempotent');
  const info=JSON.parse(await execute(database,"SELECT CONVERT(int,SERVERPROPERTY('IsIntegratedSecurityOnly')) windowsOnly,(SELECT TOP(1) port FROM sys.dm_tcp_listener_states WHERE type_desc='TSQL' AND state_desc='ONLINE' ORDER BY port) port FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;"));
  assert.equal(info.windowsOnly,0);assert.ok(Number.isInteger(info.port)&&info.port>0&&info.port<65536);
  pool=new driver.ConnectionPool({server:'127.0.0.1',port:info.port,database,user:login,password,connectionTimeout:5000,requestTimeout:10000,pool:{min:0,max:1},options:{encrypt:true,trustServerCertificate:true}});
  pool.on('error',()=>{});await pool.connect();
  const graph=(await pool.request().query("SELECT o.name FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id CROSS APPLY sys.fn_my_permissions(QUOTENAME(s.name)+'.'+QUOTENAME(o.name),'OBJECT') p WHERE s.name IN('platform','operator_security') AND p.permission_name IN('SELECT','INSERT','UPDATE','DELETE','EXECUTE','ALTER','CONTROL','TAKE OWNERSHIP','REFERENCES','VIEW DEFINITION') ORDER BY o.name;")).recordset.map(r=>r.name);
  assert.deepEqual(graph,['adapter_review_ticket_command','provision_lease_command','record_step_intent']);
  for(const sql of ['SELECT * FROM platform.provision_jobs','SELECT * FROM platform.adapter_review_tickets','SELECT * FROM operator_security.accounts',
   "EXEC platform.activate_trial @json=N'{}'","EXEC platform.request_provision_job @json=N'{}'","EXEC platform.read_adapter_resource_review @json=N'{}'","EXEC operator_security.grant_prepare_scope @json=N'{}'"])
   await assert.rejects(pool.request().query(sql),e=>e.number===229);
  const rpc=async(proc,input,operation)=>{const q=pool.request().input('json',driver.NVarChar(driver.MAX),JSON.stringify(input));if(operation)q.input('operation',driver.VarChar(16),operation);return q.execute('platform.'+proc);};
  const jobId=receipt.jobId,leaseToken='ab'.repeat(32),ticketToken='cd'.repeat(32),intentId=crypto.randomUUID();
  await rpc('provision_lease_command',{jobId,leaseToken,expectedJobRevision:0},'claim');
  await assert.rejects(execute(database,scope),e=>e.sqlNumber===53605);
  await rpc('record_step_intent',{jobId,leaseToken,generation:1,expectedJobRevision:1,intentId,step:'os_identity'});
  const issued=await rpc('adapter_review_ticket_command',{jobId,leaseToken,generation:1,expectedJobRevision:1,intentId,ticketToken},'issue');
  assert.equal(JSON.parse(issued.recordset.map(r=>Object.values(r)[0]).join('')).executionAllowed,false);
  await assert.rejects(rpc('adapter_review_ticket_command',{intentId,ticketToken},'consume'),e=>e.number===53211);
  await rpc('provision_lease_command',{jobId,leaseToken,generation:1,expectedJobRevision:1},'release');
  assert.equal(await execute(database,"SELECT CONCAT(job_revision,'|',generation,'|',execution_ready,'|',(SELECT COUNT(*) FROM platform.provision_step_intents),'|',(SELECT COUNT(*) FROM platform.adapter_review_tickets WHERE consumed_at IS NULL)) FROM platform.provision_jobs;"),'2|1|0|1|1');
  results.push('native_worker_lease_intent_issue_allowed_consume_denied_active_lease_scope_change_refused');
 }finally{
  if(pool)await pool.close();
  if(created){await execute(database,`DROP USER IF EXISTS [${login}];DROP LOGIN [${login}];SELECT 1;`);assert.equal(await execute(database,`SELECT CASE WHEN SUSER_ID(N'${login}') IS NULL THEN 1 ELSE 0 END;`),'1');results.push('temporary_worker_scope_login_removed');}
 }
}).catch(()=>{console.error('worker_review_scope_probe_failed');process.exitCode=1;});
