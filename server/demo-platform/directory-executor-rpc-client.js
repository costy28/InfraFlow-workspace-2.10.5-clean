'use strict';
const {validate}=require('./directory-executor-sql-check');
const {workerDirectoryIdentityQuery:QUERY}=require('./worker-directory-sql-check');
const {parseDirectoryPreparationBinding:parseBinding}=require('./directory-preparation-rpc-client');
function fields(v,keys){
 if(!v||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)throw Error();
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d||!Object.hasOwn(d,'value'))throw Error();out[k]=d.value;}return out;
}
const token=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const uint64=(v,positive=false)=>typeof v==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(v)&&BigInt(v)<=18446744073709551615n&&(!positive||v!=='0');
function reportInput(value,b){
 const p=fields(value,['attemptToken','outcome','journalDigest','observations']);
 if(!token(p.attemptToken)||!Array.isArray(p.observations))throw Error();
 const descriptors=Object.getOwnPropertyDescriptors(p.observations);
 if(Reflect.ownKeys(p.observations).length!==p.observations.length+1)throw Error();
 if(p.outcome==='uncertain'){
  if(p.journalDigest!==null||p.observations.length!==0)throw Error();return {...p,observations:[]};
 }
 if(p.outcome!=='observed_created'||!token(p.journalDigest)||p.observations.length!==8)throw Error();
 const seen=new Set(),rows=[];
 for(let i=0;i<8;i++){
  const d=descriptors[String(i)];if(!d||!Object.hasOwn(d,'value'))throw Error();
  const r=fields(d.value,['ordinal','uid','gid','mode','device','inode']);
  if(r.ordinal!==i||r.uid!==([0,1,3].includes(i)?0:b.uid)||r.gid!==(i<2?0:b.gid)||r.mode!==(i<2?'0711':i===3?'0750':'0700')||!uint64(r.device)||!uint64(r.inode,true))throw Error();
  const pair=r.device+':'+r.inode;if(seen.has(pair))throw Error();seen.add(pair);rows.push(Object.freeze(r));
 }
 return {...p,observations:Object.freeze(rows)};
}
function receipt(action,value,b,input){
 const common=['jobId','trialId','intentId','priorOsIntentId','attemptId','generation','jobRevision','executionAllowed'];
 const r=fields(value,action==='context'?[...common,'uid','gid','storageRoot','configRoot','validForMs','contextReady']:[...common,'outcome','confirmedCount','journalDigest','reconciliationRequired']);
 for(const k of common)if(k!=='executionAllowed'&&r[k]!==b[k])throw Error();
 if(r.executionAllowed!==false)throw Error();
 if(action==='context'){
  if(r.uid!==b.uid||r.gid!==b.gid||r.storageRoot!=='/var/lib/infraflow-demo-tenants/'+b.trialId||r.configRoot!=='/etc/infraflow-demo-tenants/'+b.trialId||r.contextReady!==true||!Number.isSafeInteger(r.validForMs)||r.validForMs<15000||r.validForMs>60000)throw Error();
 }else if(r.outcome!==input.outcome||r.confirmedCount!==(input.outcome==='uncertain'?0:8)||r.journalDigest!==input.journalDigest||r.reconciliationRequired!==true)throw Error();
 return Object.freeze(r);
}
function createDirectoryExecutorRpcClient(config){
 let password,binding,driver;
 try{({password,binding,driver}=fields(config,config&&Object.hasOwn(config,'driver')?['password','binding','driver']:['password','binding']));binding=parseBinding(binding);if(typeof password!=='string'||!/^[\x20-\x7e]{16,128}$/.test(password))throw Error();}
 catch{throw Error('directory_executor_config_refused');}
 driver??=require('mssql');
 const pool=new driver.ConnectionPool({server:'127.0.0.1',port:1433,database:'INFRAFLOW_DEMO_PLATFORM',user:'infraflow_demo_directory_executor',password,connectionTimeout:5000,requestTimeout:10000,pool:{min:0,max:1},options:{encrypt:true,trustServerCertificate:true}});
 let connecting,pending,closed=false,broken=false,reported=false,attemptToken,contextChecked=false,stopping;
 const fail=()=>Error('directory_executor_rpc_unconfirmed');pool.on('error',()=>{broken=true;});
 function run(action,value){
  let input;
  try{
   if(action==='context'){input=fields(value,['attemptToken']);if(!token(input.attemptToken))throw Error();}
   else if(action==='report'){input=reportInput(value,binding);if(input.outcome==='observed_created'&&!contextChecked)throw Error();}
   if(input&&attemptToken!==undefined&&input.attemptToken!==attemptToken)throw Error();
  }catch{return Promise.reject(fail());}
  if(closed||broken||reported||pending)return Promise.reject(fail());
  if(input)attemptToken=input.attemptToken;if(action==='report')reported=true;
  const task=Promise.resolve().then(async()=>{try{
   if(closed||broken)throw fail();connecting??=pool.connect();await connecting;
   validate(await pool.request().query(QUERY));if(closed||broken)throw fail();if(action==='check')return Object.freeze({ok:true});
   const p={intentId:binding.intentId,...input};
   const result=await pool.request().input('json',driver.NVarChar(driver.MAX),JSON.stringify(p)).execute('platform.'+(action==='context'?'verify_tenant_directory_context':'record_tenant_directory_result'));
   if(closed||broken||result?.recordsets?.length!==1||result.recordsets[0].length!==1)throw fail();
   const values=Object.values(result.recordsets[0][0]);if(values.length!==1||typeof values[0]!=='string'||Buffer.byteLength(values[0])>2048)throw fail();
   const r=receipt(action,JSON.parse(values[0]),binding,input);if(action==='context')contextChecked=true;return r;
  }catch{broken=true;throw fail();}});
  pending=task;task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;
 }
 return Object.freeze({check:()=>run('check'),context:v=>run('context',v),report:v=>run('report',v),shutdown(){if(!stopping){closed=true;stopping=(async()=>{await Promise.allSettled(pending?[pending]:[]);attemptToken=undefined;try{await pool.close();}catch{throw fail();}})();}return stopping;}});
}
module.exports={createDirectoryExecutorRpcClient,parseDirectoryResultInput:reportInput};
