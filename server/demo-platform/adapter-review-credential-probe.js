'use strict';
const fs=require('node:fs');
const {createAdapterTicketSql}=require('./adapter-ticket-sql');
const DIRECTORY='/run/credentials/infraflow-demo-adapter-sql-check.service';
function validateCredentialStat(s){
 const mode=s.mode&0o7777;
 if(!s.isFile()||s.nlink!==1||s.size<16||s.size>128||
  !((s.uid===0&&s.gid===0&&mode===0o440)||(s.uid===993&&mode===0o400)))throw Error('adapter_credential_refused');
}
function readCredential(){
 if(process.env.CREDENTIALS_DIRECTORY!==DIRECTORY)throw Error();
 const fd=fs.openSync(DIRECTORY+'/adapter-sql-password',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{validateCredentialStat(fs.fstatSync(fd));return fs.readFileSync(fd);}finally{fs.closeSync(fd);}
}
async function readInput(){
 let buffer=Buffer.alloc(0);const timer=setTimeout(()=>process.stdin.destroy(Error('input_timeout')),3000);
 try{
  for await(const chunk of process.stdin){if(buffer.length+chunk.length>128)throw Error();buffer=Buffer.concat([buffer,chunk]);}
  return buffer;
 }catch{buffer.fill(0);throw Error('adapter_input_refused');}finally{clearTimeout(timer);}
}
async function check({read=readCredential,createSql=createAdapterTicketSql}={}){
 let password,sql;
 try{
  password=await read();
  if(!Buffer.isBuffer(password)||password.length<16||password.length>128||password.some(v=>v<32||v>126))throw Error();
  sql=createSql({role:'consumer',password:password.toString('ascii')});
  await sql.check(); // Metadata only. Never calls .execute(), issue or consume.
 }catch{throw Error('adapter_credential_check_unconfirmed');}
 finally{if(Buffer.isBuffer(password))password.fill(0);if(sql){try{await sql.shutdown();}catch{throw Error('adapter_credential_check_unconfirmed');}}}
}
async function main(){
 if(process.platform!=='linux'||process.getuid?.()!==993||process.getgid?.()!==984||process.getgroups().some(g=>g!==984))throw Error();
 if(process.argv.length===3&&process.argv[2]==='--stdin-check'){
  await check({read:readInput});console.log('ADAPTER_REVIEW_SQL_INPUT_OK');
 }else if(process.argv.length===2){
  await check();console.log('ADAPTER_REVIEW_CREDENTIAL_SQL_OK');
 }else throw Error();
}
if(require.main===module)main().catch(()=>{console.error('ADAPTER_REVIEW_SQL_CHECK_UNCONFIRMED');process.exitCode=1;});
module.exports={validateCredentialStat,check};
