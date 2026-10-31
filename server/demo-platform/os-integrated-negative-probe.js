'use strict';
// Fixed read-only negative RPC. No caller-supplied identifier, token or SQL.
const fs=require('node:fs');
const {validate,osExecutorIdentityQuery}=require('./os-executor-context-sql-check');
const DIRECTORY='/run/credentials/infraflow-demo-os-integrated-sql.service';
function readCredential(){
 if(process.env.CREDENTIALS_DIRECTORY!==DIRECTORY)throw Error();
 const fd=fs.openSync(DIRECTORY+'/os-executor-sql-password',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{
  const s=fs.fstatSync(fd),uid=process.getuid(),mode=s.mode&0o7777;
  if(!s.isFile()||s.nlink!==1||s.size<16||s.size>128||!((s.uid===0&&s.gid===0&&mode===0o440)||(s.uid===uid&&mode===0o400)))throw Error();
  return fs.readFileSync(fd);
 }finally{fs.closeSync(fd);}
}
async function probe({read=readCredential,driver}={}){
 let secret,pool;
 try{
  secret=read();if(!Buffer.isBuffer(secret)||secret.length<16||secret.length>128||secret.some(x=>x<32||x>126))throw Error();
  driver??=require('mssql');
  pool=new driver.ConnectionPool({server:'127.0.0.1',port:1433,database:'INFRAFLOW_DEMO_PLATFORM',user:'infraflow_demo_os_executor',password:secret.toString('ascii'),
   connectionTimeout:5000,requestTimeout:10000,pool:{min:0,max:1},options:{encrypt:true,trustServerCertificate:true}});
  pool.on('error',()=>{});await pool.connect();validate(await pool.request().query(osExecutorIdentityQuery));
  let denied=false;
  try{
   await pool.request().input('json',driver.NVarChar(driver.MAX),JSON.stringify({intentId:'00000000-0000-0000-0000-000000000000',delegationToken:'00'.repeat(32)}))
    .execute('platform.verify_os_identity_execution_context');
  }catch(error){if(error.number!==54212)throw Error();denied=true;}
  if(!denied)throw Error();
 }catch{throw Error('integrated_sql_negative_gate_unconfirmed');}
 finally{
  if(Buffer.isBuffer(secret))secret.fill(0);
  if(pool)try{await pool.close();}catch{throw Error('integrated_sql_negative_gate_unconfirmed');}
 }
}
async function main(){
 if(process.platform!=='linux'||process.argv.length!==2||process.getuid()<61184||process.getuid()>65519||process.getgid()<61184||process.getgid()>65519||process.getgroups().some(g=>g!==process.getgid()))throw Error();
 await probe();console.log('OS_INTEGRATED_REAL_SQL_NEGATIVE_GATE_OK');
}
if(require.main===module)main().catch(()=>{console.error('OS_INTEGRATED_SQL_PROBE_UNCONFIRMED');process.exitCode=1;});
module.exports={probe};
