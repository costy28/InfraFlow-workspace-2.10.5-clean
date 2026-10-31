'use strict';
// Four-RPC worker identity, restricted here to lease claim/release and OS intent.
const {parseLeaseCommand}=require('./provision-lease-command');
const {validate,workerDelegationIdentityQuery}=require('./worker-os-delegation-sql-check');
const LEASE='platform.provision_lease_command',INTENT='platform.record_step_intent';
function parseOsIntent(input){
 const keys=['jobId','generation','expectedJobRevision','leaseToken','intentId','step'];
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||Reflect.ownKeys(input).length!==keys.length)throw Error('invalid_os_intent');
 const value={};
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(input,key);if(!d||!Object.hasOwn(d,'value'))throw Error('invalid_os_intent');value[key]=d.value;}
 if(value.step!=='os_identity')throw Error('invalid_os_intent');
 const clean=parseLeaseCommand('renew',{jobId:value.jobId,generation:value.generation,expectedJobRevision:value.expectedJobRevision,leaseToken:value.leaseToken});
 if(clean.expectedJobRevision<1||typeof value.intentId!=='string'||! /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value.intentId))throw Error('invalid_os_intent');
 return Object.freeze({...clean,intentId:value.intentId,step:value.step});
}
function createWorkerOsControlSql(password,driver){
 if(typeof password!=='string'||! /^[\x20-\x7e]{16,128}$/.test(password))throw Error('worker_os_control_config_invalid');
 driver??=require('mssql');
 const pool=new driver.ConnectionPool({server:'127.0.0.1',port:1433,database:'INFRAFLOW_DEMO_PLATFORM',user:'infraflow_demo_lease',password,
  connectionTimeout:5000,requestTimeout:10000,pool:{min:0,max:1},options:{encrypt:true,trustServerCertificate:true}});
 let connecting,pending,closed=false,broken=false,stopping;
 const fail=()=>Error('worker_os_control_result_unconfirmed');
 pool.on('error',()=>{broken=true;});
 function run(action){
  if(closed||broken||pending)return Promise.reject(fail());
  const task=Promise.resolve().then(async()=>{try{
   if(closed||broken)throw fail();connecting??=pool.connect();await connecting;
   validate(await pool.request().query(workerDelegationIdentityQuery));
   if(closed||broken)throw fail();const result=await action();if(closed||broken)throw fail();return result;
  }catch{broken=true;throw fail();}});
  pending=task;task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;
 }
 return Object.freeze({check(){return run(async()=>({ok:true}));},execute(proc,args){
  let operation,json;
  try{
   const intent=proc===INTENT,keys=intent?['json']:['operation','json'];
   if(![LEASE,INTENT].includes(proc)||!args||Object.getPrototypeOf(args)!==Object.prototype||Reflect.ownKeys(args).length!==keys.length)throw Error();
   const values={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(args,k);if(!d||!Object.hasOwn(d,'value'))throw Error();values[k]=d.value;}
   if(typeof values.json!=='string'||Buffer.byteLength(values.json)>1024)throw Error();
   const input=JSON.parse(values.json);operation=values.operation;
   if(intent)json=JSON.stringify(parseOsIntent(input));
   else if(proc===LEASE){if(!['claim','release'].includes(operation))throw Error();json=JSON.stringify(parseLeaseCommand(operation,input));}
  }catch{return Promise.reject(fail());}
  return run(async()=>{
   const request=pool.request();if(proc!==INTENT)request.input('operation',driver.VarChar(16),operation);
   const result=await request.input('json',driver.NVarChar(driver.MAX),json).execute(proc);
   if(result?.recordsets?.length!==1||!result.recordsets[0].length)throw fail();
   let raw='';for(const row of result.recordsets[0]){const values=Object.values(row);if(values.length!==1||typeof values[0]!=='string')throw fail();raw+=values[0];if(Buffer.byteLength(raw)>2048)throw fail();}return raw;
  });
 },shutdown(){if(!stopping){closed=true;stopping=(async()=>{await Promise.allSettled(pending?[pending]:[]);try{await pool.close();}catch{throw fail();}})();}return stopping;}});
}
module.exports={createWorkerOsControlSql,parseOsIntent};
