'use strict';
const {parseLeaseCommand}=require('./provision-lease-command');
const PROC='platform.provision_lease_command';
const IDENTITY=`SET NOCOUNT ON;
SELECT DB_NAME() db,ORIGINAL_LOGIN() login,USER_NAME() principal,
IS_SRVROLEMEMBER('sysadmin') sysadmin,
HAS_PERMS_BY_NAME('platform.provision_lease_command','OBJECT','EXECUTE') canLease,
HAS_DBACCESS(N'INFRAFLOW_DEMO') accessDemo;
SELECT permission_name FROM sys.fn_my_permissions(NULL,'SERVER');
SELECT permission_name FROM sys.fn_my_permissions(NULL,'DATABASE');
SELECT s.name schema_name,o.name object_name,p.permission_name
FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
CROSS APPLY sys.fn_my_permissions(QUOTENAME(s.name)+'.'+QUOTENAME(o.name),'OBJECT') p
WHERE s.name IN('platform','operator_security')
AND p.permission_name IN('SELECT','INSERT','UPDATE','DELETE','EXECUTE','ALTER','CONTROL','TAKE OWNERSHIP','REFERENCES','VIEW DEFINITION');`;
function validateIdentity(result){
 const sets=result?.recordsets,r=sets?.[0]?.[0];
 if(!r||r.db!=='INFRAFLOW_DEMO_PLATFORM'||r.login!=='infraflow_demo_lease'||r.principal!=='infraflow_demo_lease'||r.sysadmin!==0||r.canLease!==1||r.accessDemo!==0)throw Error();
 const allowed=[['CONNECT SQL','VIEW ANY DATABASE'],['CONNECT','VIEW ANY COLUMN ENCRYPTION KEY DEFINITION','VIEW ANY COLUMN MASTER KEY DEFINITION']];
 for(let i=0;i<2;i++)if(!Array.isArray(sets[i+1])||!sets[i+1].some(p=>p.permission_name===allowed[i][0])||sets[i+1].some(p=>!allowed[i].includes(p.permission_name)))throw Error();
 if(!Array.isArray(sets[3])||sets[3].length!==1||sets[3][0].schema_name!=='platform'||sets[3][0].object_name!=='provision_lease_command'||sets[3][0].permission_name!=='EXECUTE')throw Error();
}
function createProvisionLeaseSql(password,driver){
 if(typeof password!=='string'||!/^[\x20-\x7e]{16,128}$/.test(password))throw Error('lease_sql_secret_invalid');
 driver??=require('mssql');
 const pool=new driver.ConnectionPool({server:'127.0.0.1',port:1433,database:'INFRAFLOW_DEMO_PLATFORM',user:'infraflow_demo_lease',password,
  connectionTimeout:5000,requestTimeout:10000,pool:{min:0,max:1,idleTimeoutMillis:10000},options:{encrypt:true,trustServerCertificate:true}});
 let connecting,pending,closed=false,broken=false,stopping;
 pool.on('error',()=>{broken=true;});
 const fail=()=>Error('lease_sql_result_unconfirmed');
 function run(action){
  if(closed||broken||pending)return Promise.reject(fail());
  const task=Promise.resolve().then(async()=>{try{
   if(closed||broken)throw fail();connecting??=pool.connect();await connecting;
   if(closed||broken)throw fail();validateIdentity(await pool.request().query(IDENTITY));
   if(closed||broken)throw fail();const value=await action();if(closed||broken)throw fail();return value;
  }catch{throw fail();}});
  pending=task;task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;
 }
 return Object.freeze({
  check(){return run(async()=>Object.freeze({ok:true,code:'lease_sql_scope_verified'}));},
  execute(proc,args){
   let operation,json;
   try{
    if(proc!==PROC||!args||Object.getPrototypeOf(args)!==Object.prototype||Reflect.ownKeys(args).length!==2)throw Error();
    const a=Object.getOwnPropertyDescriptor(args,'operation'),b=Object.getOwnPropertyDescriptor(args,'json');
    if(!a||!Object.hasOwn(a,'value')||!b||!Object.hasOwn(b,'value')||typeof b.value!=='string'||Buffer.byteLength(b.value)>2048)throw Error();
    operation=a.value;const command=parseLeaseCommand(operation,JSON.parse(b.value));json=JSON.stringify(command);
   }catch{return Promise.reject(fail());}
   return run(async()=>{
    const result=await pool.request().input('operation',driver.VarChar(16),operation).input('json',driver.NVarChar(driver.MAX),json).execute(PROC);
    if(!Array.isArray(result?.recordsets)||result.recordsets.length!==1||!result.recordsets[0].length)throw fail();
    let raw='';for(const row of result.recordsets[0]){const values=Object.values(row);if(values.length!==1||typeof values[0]!=='string')throw fail();raw+=values[0];if(Buffer.byteLength(raw)>2048)throw fail();}return raw;
   });
  },
  shutdown(){if(!stopping){closed=true;stopping=(async()=>{await Promise.allSettled(pending?[pending]:[]);try{await pool.close();}catch{throw fail();}})();}return stopping;},
 });
}
module.exports={createProvisionLeaseSql,validateIdentity};
