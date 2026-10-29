'use strict';
// Authenticated synthetic SQL identities only. No production passwords or targets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {runProbe}=require('./probe-demo-provision-reservations.cjs');
const {createAdapterTicketClient}=require('../server/demo-platform/adapter-ticket-client');
const driver=require('../server/demo-platform/node_modules/mssql');
runProbe(async({database,execute,receipt,results})=>{
 const suffix=database.replace('INFRAFLOW_TEST_TRIALS_','');if(!/^[A-F0-9]{12}$/.test(suffix))throw Error();
 const identities=[{login:'INFRAFLOW_TEST_TI_'+suffix,user:'infraflow_demo_lease',role:'issuer'},
  {login:'INFRAFLOW_TEST_TC_'+suffix,user:'infraflow_demo_adapter_review',role:'consumer'}];
 const pools=[],clients=[],created=[];
 try{
  const dir=path.join(__dirname,'../db/demo-platform-migrations');
  for(const prefix of ['007_','008_','009_','010_','011_','012_']){
   const source=fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(n=>n.startsWith(prefix))),'utf8');
   await execute(database,source.replace("N'INFRAFLOW_DEMO_PLATFORM'",`N'${database}'`));
  }
  const info=JSON.parse(await execute(database,"SELECT CONVERT(int,SERVERPROPERTY('IsIntegratedSecurityOnly')) windowsOnly,(SELECT TOP(1) port FROM sys.dm_tcp_listener_states WHERE type_desc='TSQL' AND state_desc='ONLINE' ORDER BY port) port FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;"));
  assert.equal(info.windowsOnly,0);assert.ok(Number.isInteger(info.port)&&info.port>0&&info.port<65536);
  for(const identity of identities){
   const {login,user,role}=identity,password='Aa9!'+crypto.randomBytes(32).toString('hex');
   assert.equal(await execute(database,`SELECT CASE WHEN SUSER_ID(N'${login}') IS NULL AND USER_ID(N'${user}') IS NULL THEN 1 ELSE 0 END;`),'1');
   await execute(database,`DECLARE @p nvarchar(128)=JSON_VALUE(@json,'$.password');DECLARE @s nvarchar(max)=N'CREATE LOGIN [${login}] WITH PASSWORD='+QUOTENAME(@p,'''')+N',DEFAULT_DATABASE=[${database}],CHECK_POLICY=ON;';EXEC(@s);SELECT 1;`,{password});created.push(identity);
   const procedures=role==='issuer'?['provision_lease_command','record_step_intent','adapter_review_ticket_command']:['read_adapter_resource_review','adapter_review_ticket_command'];
   await execute(database,`CREATE USER [${user}] FOR LOGIN [${login}];DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::platform TO [${user}];DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::operator_security TO [${user}];`+procedures.map(p=>`GRANT EXECUTE ON OBJECT::platform.${p} TO [${user}];`).join('')+'SELECT 1;');
   const pool=new driver.ConnectionPool({server:'127.0.0.1',port:info.port,database,user:login,password,connectionTimeout:5000,requestTimeout:10000,pool:{max:1,min:0},options:{encrypt:true,trustServerCertificate:true}});
   pools.push(pool);pool.on('error',()=>{});await pool.connect();
   const actual=(await pool.request().query("SELECT ORIGINAL_LOGIN() login,USER_NAME() principal,IS_SRVROLEMEMBER('sysadmin') sysadmin,HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL') controlDb;")).recordset[0];
   assert.deepEqual(actual,{login,principal:user,sysadmin:0,controlDb:0});
   for(const sql of ['SELECT * FROM platform.adapter_review_tickets','SELECT * FROM operator_security.accounts',"EXEC platform.activate_trial @json=N'{}'"])
    await assert.rejects(pool.request().query(sql),e=>e.number===229);
   const client=createAdapterTicketClient({role,execute:async(proc,args)=>{
    assert.equal(proc,'platform.adapter_review_ticket_command');
    const r=await pool.request().input('operation',driver.VarChar(16),args.operation).input('json',driver.NVarChar(driver.MAX),args.json).execute(proc);
    return r.recordset.map(row=>Object.values(row)[0]).join('');
   }});clients.push(client);
  }
  results.push('two_authenticated_native_logins_separate_principals_no_admin_direct_data_denied');
  const rpc=async(pool,proc,input,operation)=>{
   const q=pool.request().input('json',driver.NVarChar(driver.MAX),JSON.stringify(input));
   if(operation)q.input('operation',driver.VarChar(16),operation);
   return q.execute(proc);
  };
  const jobId=receipt.jobId,leaseToken=crypto.randomBytes(32).toString('hex'),ticketToken=crypto.randomBytes(32).toString('hex'),intentId=crypto.randomUUID();
  await rpc(pools[0],'platform.provision_lease_command',{jobId,leaseToken,expectedJobRevision:0},'claim');
  await rpc(pools[0],'platform.record_step_intent',{jobId,leaseToken,generation:1,expectedJobRevision:1,intentId,step:'os_identity'});
  const issued=await clients[0].execute({jobId,leaseToken,generation:1,expectedJobRevision:1,intentId,ticketToken});assert.equal(issued.executionAllowed,false);
  const consumed=await clients[1].execute({intentId,ticketToken});assert.equal(consumed.executionAllowed,false);assert.equal(consumed.jobId,jobId);
  await assert.rejects(clients[1].execute({intentId,ticketToken}),/^Error: adapter_ticket_result_unconfirmed$/);
  await assert.rejects(rpc(pools[0],'platform.adapter_review_ticket_command',{intentId,ticketToken},'consume'),e=>e.number===53211);
  await assert.rejects(rpc(pools[1],'platform.provision_lease_command',{jobId,leaseToken,expectedJobRevision:1},'claim'),e=>e.number===229);
  await rpc(pools[0],'platform.provision_lease_command',{jobId,leaseToken,generation:1,expectedJobRevision:1},'release');
  assert.equal(await execute(database,"SELECT CONCAT(job_revision,'|',generation,'|',CONVERT(int,execution_ready)) FROM platform.provision_jobs;"),'2|1|0');
  results.push('native_rpc_ticket_handoff_no_lease_secret_to_consumer_replay_and_wrong_actor_denied');
 }finally{
  for(const c of clients)await c.shutdown();
  for(const p of pools)await p.close();
  for(const {login,user} of created.reverse()){
   await execute(database,`DROP USER IF EXISTS [${user}];DROP LOGIN [${login}];SELECT 1;`);
   assert.equal(await execute(database,`SELECT CASE WHEN SUSER_ID(N'${login}') IS NULL THEN 1 ELSE 0 END;`),'1');
  }
  if(created.length)results.push('temporary_authenticated_logins_removed');
 }
}).catch(()=>{console.error('ticket_native_login_probe_failed');process.exitCode=1;});
