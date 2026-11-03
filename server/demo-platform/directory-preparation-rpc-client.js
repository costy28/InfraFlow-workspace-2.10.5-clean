'use strict';
const {validate,workerDirectoryIdentityQuery}=require('./worker-directory-sql-check');
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const token=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const positive=v=>Number.isSafeInteger(v)&&v>0&&v<2147483647;
function fields(value,keys){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)throw Error();
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);if(!d||!Object.hasOwn(d,'value'))throw Error();out[k]=d.value;}return out;
}
function parseBinding(value){
 const b=fields(value,['jobId','trialId','intentId','priorOsIntentId','attemptId','generation','jobRevision','uid','gid']);
 for(const k of ['jobId','trialId','intentId','priorOsIntentId','attemptId'])if(typeof b[k]!=='string'||!UUID.test(b[k]))throw Error();
 if(new Set([b.intentId,b.priorOsIntentId,b.attemptId]).size!==3)throw Error();
 for(const k of ['generation','jobRevision','uid','gid'])if(!positive(b[k]))throw Error();
 return Object.freeze(b);
}
function parseReceipt(value,b){
 const r=fields(value,['jobId','trialId','intentId','priorOsIntentId','attemptId','generation','jobRevision','uid','gid','storageRoot','configRoot','state','executionAllowed']);
 for(const k of Object.keys(b))if(r[k]!==b[k])throw Error();
 if(r.storageRoot!=='/var/lib/infraflow-demo-tenants/'+b.trialId||r.configRoot!=='/etc/infraflow-demo-tenants/'+b.trialId||r.state!=='prepared'||r.executionAllowed!==false)throw Error();
 return Object.freeze(r);
}
function createDirectoryPreparationRpcClient(config){
 let password,binding,driver;
 try{
  ({password,binding,driver}=fields(config,config&&Object.hasOwn(config,'driver')?['password','binding','driver']:['password','binding']));
  binding=parseBinding(binding);
  if(typeof password!=='string'||!/^[\x20-\x7e]{16,128}$/.test(password))throw Error();
 }catch{throw Error('directory_preparation_config_refused');}
 driver??=require('mssql');
 const pool=new driver.ConnectionPool({server:'127.0.0.1',port:1433,database:'INFRAFLOW_DEMO_PLATFORM',user:'infraflow_demo_lease',password,
  connectionTimeout:5000,requestTimeout:10000,pool:{min:0,max:1},options:{encrypt:true,trustServerCertificate:true}});
 let pending,connecting,closed=false,broken=false,attempted=false,stopping;
 const fail=()=>Error('directory_preparation_rpc_unconfirmed');
 pool.on('error',()=>{broken=true;});
 function run(input){
  if(closed||broken||pending)return Promise.reject(fail());
  const task=Promise.resolve().then(async()=>{try{
   if(closed||broken)throw fail();connecting??=pool.connect();await connecting;
   validate(await pool.request().query(workerDirectoryIdentityQuery));
   if(closed||broken)throw fail();if(input===null)return Object.freeze({ok:true});
   const result=await pool.request().input('json',driver.NVarChar(driver.MAX),JSON.stringify(input)).execute('platform.prepare_tenant_directories');
   if(closed||broken||result?.recordsets?.length!==1||result.recordsets[0].length!==1)throw fail();
   const row=Object.values(result.recordsets[0][0]);
   if(row.length!==1||typeof row[0]!=='string'||Buffer.byteLength(row[0])>2048)throw fail();
   return parseReceipt(JSON.parse(row[0]),binding);
  }catch{broken=true;throw fail();}});
  pending=task;task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;
 }
 return Object.freeze({check:()=>run(null),prepare(value){
  let v;try{v=fields(value,['leaseToken','attemptToken']);if(!token(v.leaseToken)||!token(v.attemptToken)||v.leaseToken===v.attemptToken)throw Error();}catch{return Promise.reject(fail());}
  if(attempted||closed||broken||pending)return Promise.reject(fail());
  attempted=true;
  return run({jobId:binding.jobId,generation:binding.generation,expectedJobRevision:binding.jobRevision,leaseToken:v.leaseToken,
   intentId:binding.intentId,priorOsIntentId:binding.priorOsIntentId,attemptId:binding.attemptId,attemptToken:v.attemptToken});
 },shutdown(){if(!stopping){closed=true;stopping=(async()=>{await Promise.allSettled(pending?[pending]:[]);try{await pool.close();}catch{throw fail();}})();}return stopping;}});
}
module.exports={createDirectoryPreparationRpcClient,parseDirectoryPreparationBinding:parseBinding};
