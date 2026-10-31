'use strict';
// Metadata-only transport: deliberately no execute/RPC method.
const QUERY=`SET NOCOUNT ON;
SELECT DB_NAME() db,ORIGINAL_LOGIN() login,USER_NAME() principal,IS_SRVROLEMEMBER('sysadmin') sysadmin,HAS_DBACCESS(N'INFRAFLOW_DEMO') accessDemo;
SELECT permission_name FROM sys.fn_my_permissions(NULL,'SERVER');
SELECT permission_name FROM sys.fn_my_permissions(NULL,'DATABASE');
SELECT s.name schema_name,o.name object_name,p.permission_name FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
CROSS APPLY sys.fn_my_permissions(QUOTENAME(s.name)+'.'+QUOTENAME(o.name),'OBJECT') p
WHERE s.name IN('platform','operator_security') AND p.permission_name IN('SELECT','INSERT','UPDATE','DELETE','EXECUTE','ALTER','CONTROL','TAKE OWNERSHIP','REFERENCES','VIEW DEFINITION');`;
function validate(result){
 const sets=result?.recordsets,r=sets?.[0]?.[0];
 if(sets?.length!==4||sets[0].length!==1||r.db!=='INFRAFLOW_DEMO_PLATFORM'||r.login!=='infraflow_demo_os_executor'||r.principal!==r.login||r.sysadmin!==0||r.accessDemo!==0)throw Error();
 const allowed=[['CONNECT SQL','VIEW ANY DATABASE'],['CONNECT','VIEW ANY COLUMN ENCRYPTION KEY DEFINITION','VIEW ANY COLUMN MASTER KEY DEFINITION']];
 for(let i=0;i<2;i++)if(!Array.isArray(sets[i+1])||!sets[i+1].some(x=>x.permission_name===allowed[i][0])||sets[i+1].some(x=>!allowed[i].includes(x.permission_name)))throw Error();
 const procs=['accept_os_identity_delegation','record_os_identity_result','verify_os_identity_execution_context'];
 if(!Array.isArray(sets[3])||sets[3].length!==3||new Set(sets[3].map(x=>x.object_name)).size!==3||sets[3].some(x=>x.schema_name!=='platform'||x.permission_name!=='EXECUTE'||!procs.includes(x.object_name)))throw Error();
}
function createOsExecutorSqlCheck(password,driver){
 if(typeof password!=='string'||!/^[\x20-\x7e]{16,128}$/.test(password))throw Error('os_sql_secret_invalid');
 driver??=require('mssql');
 const pool=new driver.ConnectionPool({server:'127.0.0.1',port:1433,database:'INFRAFLOW_DEMO_PLATFORM',user:'infraflow_demo_os_executor',password,
  connectionTimeout:5000,requestTimeout:10000,pool:{min:0,max:1},options:{encrypt:true,trustServerCertificate:true}});
 let pending,connecting,closed=false,broken=false,stopping;
 const fail=()=>Error('os_executor_sql_check_unconfirmed');
 pool.on('error',()=>{broken=true;});
 return Object.freeze({check(){
  if(closed||broken||pending)return Promise.reject(fail());
  const task=Promise.resolve().then(async()=>{try{
   if(closed||broken)throw fail();connecting??=pool.connect();await connecting;
   validate(await pool.request().query(QUERY));if(closed||broken)throw fail();return Object.freeze({ok:true});
  }catch{broken=true;throw fail();}});
  pending=task;task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;
 },shutdown(){if(!stopping){closed=true;stopping=(async()=>{await Promise.allSettled(pending?[pending]:[]);try{await pool.close();}catch{throw fail();}})();}return stopping;}});
}
module.exports={createOsExecutorSqlCheck,validate};
