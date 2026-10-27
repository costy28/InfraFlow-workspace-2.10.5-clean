'use strict';
const fs=require('node:fs');
const {createProvisionLeaseSql}=require('./provision-lease-sql');
const {createProvisionLeaseClient}=require('./provision-lease-client');
// Separate future worker/probe units, never credentials from the ERP/operator unit.
const DIRECTORIES=Object.freeze(['/run/credentials/infraflow-demo-lease-worker.service','/run/credentials/infraflow-demo-lease-check.service']);
function validateCredentialStat(stat,uid){
 const mode=stat.mode&0o7777;
 if(!Number.isInteger(uid)||uid<=0||!stat.isFile()||stat.nlink!==1||stat.size<16||stat.size>128||
  !((stat.uid===uid&&mode===0o400)||(stat.uid===0&&stat.gid===0&&mode===0o440)))throw Error('lease_credential_invalid');
}
function readCredential(directory){
 if(process.platform!=='linux'||!DIRECTORIES.includes(directory))throw Error('lease_credential_invalid');
 const fd=fs.openSync(directory+'/lease-sql-password',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{validateCredentialStat(fs.fstatSync(fd),process.getuid());return fs.readFileSync(fd);}finally{fs.closeSync(fd);}
}
async function createProvisionLeaseRuntime({directory=DIRECTORIES[0],read=readCredential,createSql=createProvisionLeaseSql}={}){
 let password,sql,client;
 try{
  if(!DIRECTORIES.includes(directory))throw Error();
  password=read(directory);
  if(!Buffer.isBuffer(password)||password.length<16||password.length>128||password.some(v=>v<32||v>126))throw Error();
  sql=createSql(password.toString('ascii'));
  await sql.check(); // Metadata only. Does not claim or renew a job.
  client=createProvisionLeaseClient({execute:sql.execute.bind(sql)});
  let stopping;
  return Object.freeze({
   execute:client.execute,
   check:sql.check.bind(sql),
   shutdown(){if(!stopping)stopping=(async()=>{await client.shutdown();await sql.shutdown();})();return stopping;},
  });
 }catch{
  if(client)await client.shutdown().catch(()=>{});
  if(sql)await sql.shutdown().catch(()=>{});
  throw Error('lease_runtime_unavailable');
 }finally{if(Buffer.isBuffer(password))password.fill(0);}
}
module.exports={createProvisionLeaseRuntime,validateCredentialStat};
