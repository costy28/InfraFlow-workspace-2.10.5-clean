'use strict';
const {validate:validateWorker}=require('./worker-os-delegation-sql-check');
const {validate:validateExecutor,osExecutorIdentityQuery}=require('./os-executor-context-sql-check');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function fields(value,keys){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)throw Error();
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))throw Error();out[key]=d.value;}return out;
}
const positive=x=>Number.isSafeInteger(x)&&x>0&&x<2147483647;
const token=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
function parseBinding(value){
 const b=fields(value,['jobId','trialId','intentId','generation','jobRevision']);
 for(const key of ['jobId','trialId','intentId'])if(typeof b[key]!=='string'||!UUID.test(b[key]))throw Error();
 if(!positive(b.generation)||!positive(b.jobRevision))throw Error();return Object.freeze(b);
}
function payload(action,value,b){
 const x=fields(value,action==='prepare'?['leaseToken','delegationToken']:action==='report'?['delegationToken','outcome','uid','gid']:['delegationToken']);
 if(!token(x.delegationToken))throw Error();
 if(action==='prepare'){
  if(!token(x.leaseToken))throw Error();
  return {jobId:b.jobId,generation:b.generation,expectedJobRevision:b.jobRevision,leaseToken:x.leaseToken,intentId:b.intentId,delegationToken:x.delegationToken};
 }
 if(action==='report'){
  if(x.outcome==='uncertain'){if(x.uid!==null||x.gid!==null)throw Error();}
  else if(x.outcome!=='observed_created'||!positive(x.uid)||!positive(x.gid))throw Error();
 }
 return {intentId:b.intentId,...x};
}
function receipt(action,value,b,input){
 const common=['jobId','intentId','generation','jobRevision','executionAllowed'];
 const keys=action==='prepare'?[...common,'resourceKey','state']:action==='accept'?[...common,'trialId','resourceKey','state','nextGate']:
  action==='context'?[...common,'trialId','resourceKey','validForMs','contextReady']:[...common,'outcome','uid','gid','reconciliationRequired'];
 const r=fields(value,keys);
 for(const key of ['jobId','intentId','generation','jobRevision'])if(r[key]!==b[key]||typeof r[key]!==typeof b[key])throw Error();
 if(r.executionAllowed!==false)throw Error();
 if(action!=='report'&&r.resourceKey!=='ift_'+b.trialId.replaceAll('-','').slice(0,28))throw Error();
 if(['accept','context'].includes(action)&&r.trialId!==b.trialId)throw Error();
 if(action==='prepare'&&r.state!=='prepared')throw Error();
 if(action==='accept'&&(r.state!=='accepted'||r.nextGate!=='durable_result_and_reconciliation_protocol'))throw Error();
 if(action==='context'&&(r.contextReady!==true||!Number.isSafeInteger(r.validForMs)||r.validForMs<15000||r.validForMs>60000))throw Error();
 if(action==='report'&&(r.outcome!==input.outcome||r.uid!==input.uid||r.gid!==input.gid||r.reconciliationRequired!==true))throw Error();
 return Object.freeze(r);
}
function createOsDelegationRpcClient(config){
 let role,password,binding,driver;
 try{
  ({role,password,binding,driver}=fields(config,config&&Object.hasOwn(config,'driver')?['role','password','binding','driver']:['role','password','binding']));binding=parseBinding(binding);
  if(!['worker','executor'].includes(role)||typeof password!=='string'||!/^[\x20-\x7e]{16,128}$/.test(password))throw Error();
 }catch{throw Error('os_delegation_client_config_refused');}
 driver??=require('mssql');
 const pool=new driver.ConnectionPool({server:'127.0.0.1',port:1433,database:'INFRAFLOW_DEMO_PLATFORM',user:role==='worker'?'infraflow_demo_lease':'infraflow_demo_os_executor',password,
  connectionTimeout:5000,requestTimeout:10000,pool:{min:0,max:1},options:{encrypt:true,trustServerCertificate:true}});
 const procedures={prepare:'prepare_os_identity_delegation',accept:'accept_os_identity_delegation',context:'verify_os_identity_execution_context',report:'record_os_identity_result'};
 let pending,connecting,closed=false,broken=false,stopping;pool.on('error',()=>{broken=true;});
 const fail=()=>Error('os_delegation_rpc_unconfirmed');
 function run(action,value){
  let input;try{if(action!=='check')input=payload(action,value,binding);}catch{return Promise.reject(fail());}
  if(closed||broken||pending)return Promise.reject(fail());
  const task=Promise.resolve().then(async()=>{try{
   connecting??=pool.connect();await connecting;
   if(closed||broken)throw fail();(role==='worker'?validateWorker:validateExecutor)(await pool.request().query(osExecutorIdentityQuery));
   if(closed||broken)throw fail();if(action==='check')return Object.freeze({ok:true});
   const result=await pool.request().input('json',driver.NVarChar(driver.MAX),JSON.stringify(input)).execute('platform.'+procedures[action]);
   if(closed||broken||result?.recordsets?.length!==1||result.recordsets[0].length!==1)throw fail();
   const row=Object.values(result.recordsets[0][0]);if(row.length!==1||typeof row[0]!=='string'||Buffer.byteLength(row[0])>2048)throw fail();
   return receipt(action,JSON.parse(row[0]),binding,input);
  }catch{broken=true;throw fail();}});
  pending=task;task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;
 }
 const methods={check:()=>run('check'),shutdown(){if(!stopping){closed=true;stopping=(async()=>{await Promise.allSettled(pending?[pending]:[]);try{await pool.close();}catch{throw fail();}})();}return stopping;}};
 for(const action of role==='worker'?['prepare']:['accept','context','report'])methods[action]=value=>run(action,value);
 return Object.freeze(methods);
}
module.exports={createOsDelegationRpcClient,parseOsDelegationBinding:parseBinding};
