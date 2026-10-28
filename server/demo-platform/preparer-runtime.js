'use strict';
const fs=require('node:fs');
const {createProvisionRequestSql}=require('./provision-request-sql');
const {createProvisionRequestClient}=require('./provision-request');
const DIRECTORIES=Object.freeze(['/run/credentials/infraflow-demo-platform.service','/run/credentials/infraflow-preparer-check.service']);
function validateCredentialStat(s,uid){
 const mode=s.mode&0o7777;
 if(!Number.isInteger(uid)||uid<=0||!s.isFile()||s.nlink!==1||s.size<16||s.size>128||!((s.uid===uid&&mode===0o400)||(s.uid===0&&s.gid===0&&mode===0o440)))throw Error('preparer_credential_invalid');
}
function readCredential(directory){
 if(process.platform!=='linux'||!DIRECTORIES.includes(directory))throw Error('preparer_credential_invalid');
 const fd=fs.openSync(directory+'/preparer-password',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{validateCredentialStat(fs.fstatSync(fd),process.getuid());return fs.readFileSync(fd);}finally{fs.closeSync(fd);}
}
async function createPreparerRuntime({directory=DIRECTORIES[0],read=readCredential,createSql=createProvisionRequestSql}={}){
 let password,sql,client;
 try{
  if(!DIRECTORIES.includes(directory))throw Error();password=read(directory);
  if(!Buffer.isBuffer(password)||password.length<16||password.length>128||password.some(v=>v<32||v>126))throw Error();
  sql=createSql(password.toString('ascii'));await sql.check();client=createProvisionRequestClient({execute:sql.execute.bind(sql)});
  let stopping;
  return Object.freeze({request:client.request,check:sql.check.bind(sql),shutdown(){if(!stopping)stopping=(async()=>{await client.shutdown();await sql.shutdown();})();return stopping;}});
 }catch{if(client)await client.shutdown().catch(()=>{});if(sql)await sql.shutdown().catch(()=>{});throw Error('preparer_runtime_unavailable');}
 finally{if(Buffer.isBuffer(password))password.fill(0);}
}
module.exports={createPreparerRuntime,validateCredentialStat};
