'use strict';
const {parseTicketCommand}=require('./adapter-ticket-client');
const PROFILES=Object.freeze({issuer:{login:'infraflow_demo_lease',procedures:['provision_lease_command','record_step_intent','adapter_review_ticket_command']},
 consumer:{login:'infraflow_demo_adapter_review',procedures:['read_adapter_resource_review','adapter_review_ticket_command']}});
const IDENTITY=`SET NOCOUNT ON;
SELECT DB_NAME() db,ORIGINAL_LOGIN() login,USER_NAME() principal,IS_SRVROLEMEMBER('sysadmin') sysadmin,HAS_DBACCESS(N'INFRAFLOW_DEMO') accessDemo;
SELECT permission_name FROM sys.fn_my_permissions(NULL,'SERVER');
SELECT permission_name FROM sys.fn_my_permissions(NULL,'DATABASE');
SELECT s.name schema_name,o.name object_name,p.permission_name FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
CROSS APPLY sys.fn_my_permissions(QUOTENAME(s.name)+'.'+QUOTENAME(o.name),'OBJECT') p
WHERE s.name IN('platform','operator_security') AND p.permission_name IN('SELECT','INSERT','UPDATE','DELETE','EXECUTE','ALTER','CONTROL','TAKE OWNERSHIP','REFERENCES','VIEW DEFINITION');`;
function validateTicketIdentity(role,result){
 const p=PROFILES[role],s=result?.recordsets,r=s?.[0]?.[0];
 if(!p||s?.length!==4||s[0].length!==1||r.db!=='INFRAFLOW_DEMO_PLATFORM'||r.login!==p.login||r.principal!==p.login||r.sysadmin!==0||r.accessDemo!==0)throw Error('ticket_identity_refused');
 const allowed=[['CONNECT SQL','VIEW ANY DATABASE'],['CONNECT','VIEW ANY COLUMN ENCRYPTION KEY DEFINITION','VIEW ANY COLUMN MASTER KEY DEFINITION']];
 for(let i=0;i<2;i++)if(!Array.isArray(s[i+1])||!s[i+1].some(x=>x.permission_name===allowed[i][0])||s[i+1].some(x=>!allowed[i].includes(x.permission_name)))throw Error('ticket_identity_refused');
 if(!Array.isArray(s[3])||s[3].length!==p.procedures.length||new Set(s[3].map(x=>x.object_name)).size!==p.procedures.length||
  s[3].some(x=>x.schema_name!=='platform'||x.permission_name!=='EXECUTE'||!p.procedures.includes(x.object_name)))throw Error('ticket_identity_refused');
}
function createAdapterTicketSql({role,password,driver}={}){
 const profile=PROFILES[role];if(!profile||typeof password!=='string'||!/^[\x20-\x7e]{16,128}$/.test(password))throw Error('ticket_sql_config_invalid');
 driver??=require('mssql');
 const pool=new driver.ConnectionPool({server:'127.0.0.1',port:1433,database:'INFRAFLOW_DEMO_PLATFORM',user:profile.login,password,
  connectionTimeout:5000,requestTimeout:10000,pool:{min:0,max:1},options:{encrypt:true,trustServerCertificate:true}});
 let pending,connecting,closed=false,broken=false,stopping;pool.on('error',()=>{broken=true;});
 const fail=()=>Error('adapter_ticket_sql_unconfirmed');
 function run(action){
  if(closed||broken||pending)return Promise.reject(fail());
  const task=Promise.resolve().then(async()=>{try{
   if(closed||broken)throw fail();connecting??=pool.connect();await connecting;
   validateTicketIdentity(role,await pool.request().query(IDENTITY));
   if(closed||broken)throw fail();const value=await action();if(closed||broken)throw fail();return value;
  }catch{throw fail();}});pending=task;task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;
 }
 return Object.freeze({check(){return run(async()=>({ok:true}));},
  execute(proc,args){
   let operation,json;
   try{
    if(proc!=='platform.adapter_review_ticket_command'||!args||Object.getPrototypeOf(args)!==Object.prototype||Reflect.ownKeys(args).length!==2)throw Error();
    const a=Object.getOwnPropertyDescriptor(args,'operation'),b=Object.getOwnPropertyDescriptor(args,'json');
    if(!a||!b||!Object.hasOwn(a,'value')||!Object.hasOwn(b,'value')||a.value!==(role==='issuer'?'issue':'consume')||typeof b.value!=='string'||Buffer.byteLength(b.value)>2048)throw Error();
    operation=a.value;json=JSON.stringify(parseTicketCommand(operation,JSON.parse(b.value)));
   }catch{return Promise.reject(fail());}
   return run(async()=>{
    const result=await pool.request().input('operation',driver.VarChar(16),operation).input('json',driver.NVarChar(driver.MAX),json).execute(proc);
    if(!Array.isArray(result?.recordsets)||result.recordsets.length!==1||!result.recordsets[0].length)throw fail();
    let raw='';for(const row of result.recordsets[0]){const values=Object.values(row);if(values.length!==1||typeof values[0]!=='string')throw fail();raw+=values[0];if(Buffer.byteLength(raw)>2048)throw fail();}return raw;
   });
  },
  shutdown(){if(!stopping){closed=true;stopping=(async()=>{await Promise.allSettled(pending?[pending]:[]);try{await pool.close();}catch{throw fail();}})();}return stopping;},
 });
}
module.exports={createAdapterTicketSql,validateTicketIdentity};
