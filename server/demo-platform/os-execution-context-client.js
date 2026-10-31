'use strict';
const {validate,osExecutorIdentityQuery}=require('./os-executor-context-sql-check');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function values(value,keys){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)throw Error();
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))throw Error();out[key]=d.value;}return out;
}
function input(value){const x=values(value,['intentId','delegationToken']);if(typeof x.intentId!=='string'||!UUID.test(x.intentId)||typeof x.delegationToken!=='string'||!/^[0-9a-f]{64}$/.test(x.delegationToken))throw Error();return x;}
function receipt(value,command){
 const r=values(value,['jobId','trialId','intentId','generation','jobRevision','resourceKey','validForMs','contextReady','executionAllowed']);
 for(const key of ['jobId','trialId','intentId'])if(typeof r[key]!=='string'||!UUID.test(r[key]))throw Error();
 if(r.intentId!==command.intentId||r.contextReady!==true||r.executionAllowed!==false||
 !Number.isSafeInteger(r.generation)||r.generation<1||!Number.isSafeInteger(r.jobRevision)||r.jobRevision<1||
 !Number.isSafeInteger(r.validForMs)||r.validForMs<15000||r.validForMs>60000||
 r.resourceKey!=='ift_'+r.trialId.replaceAll('-','').slice(0,28))throw Error();
 return Object.freeze(r);
}
function createOsExecutionContextClient(password,driver){
 if(typeof password!=='string'||!/^[\x20-\x7e]{16,128}$/.test(password))throw Error('os_context_secret_invalid');
 driver??=require('mssql');
 const pool=new driver.ConnectionPool({server:'127.0.0.1',port:1433,database:'INFRAFLOW_DEMO_PLATFORM',user:'infraflow_demo_os_executor',password,
  connectionTimeout:5000,requestTimeout:10000,pool:{min:0,max:1},options:{encrypt:true,trustServerCertificate:true}});
 let pending,connecting,closed=false,broken=false,stopping;pool.on('error',()=>{broken=true;});
 const fail=()=>Error('os_execution_context_unconfirmed');
 return Object.freeze({context(value){
  let command;try{command=input(value);}catch{return Promise.reject(fail());}
  if(closed||broken||pending)return Promise.reject(fail());
  const task=Promise.resolve().then(async()=>{try{
   connecting??=pool.connect();await connecting;
   if(closed||broken)throw fail();validate(await pool.request().query(osExecutorIdentityQuery));
   if(closed||broken)throw fail();
   const result=await pool.request().input('json',driver.NVarChar(driver.MAX),JSON.stringify(command)).execute('platform.verify_os_identity_execution_context');
   if(closed||broken||!Array.isArray(result?.recordsets)||result.recordsets.length!==1||result.recordsets[0].length!==1)throw fail();
   const row=result.recordsets[0][0],fields=Object.values(row);if(fields.length!==1||typeof fields[0]!=='string'||Buffer.byteLength(fields[0])>2048)throw fail();
   return receipt(JSON.parse(fields[0]),command);
  }catch{broken=true;throw fail();}});
  pending=task;task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;
 },shutdown(){if(!stopping){closed=true;stopping=(async()=>{await Promise.allSettled(pending?[pending]:[]);try{await pool.close();}catch{throw fail();}})();}return stopping;}});
}
module.exports={createOsExecutionContextClient,parseContextReceipt:receipt};
