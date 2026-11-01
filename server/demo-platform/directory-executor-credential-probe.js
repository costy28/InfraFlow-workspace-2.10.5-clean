'use strict';
const fs=require('node:fs');
const {createDirectoryExecutorSqlCheck}=require('./directory-executor-sql-check');
const DIRECTORY='/run/credentials/infraflow-demo-directory-sql-check.service';
function validateCredentialStat(s,uid){
 const mode=s.mode&0o7777;
 if(!Number.isInteger(uid)||uid<61184||uid>65519||!s.isFile()||s.nlink!==1||s.size<16||s.size>128||
  !((s.uid===0&&s.gid===0&&mode===0o440)||(s.uid===uid&&mode===0o400)))throw Error();
}
function readCredential(){
 if(process.env.CREDENTIALS_DIRECTORY!==DIRECTORY)throw Error();
 const fd=fs.openSync(DIRECTORY+'/directory-executor-sql-password',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{validateCredentialStat(fs.fstatSync(fd),process.getuid());return fs.readFileSync(fd);}finally{fs.closeSync(fd);}
}
async function readInput(){
 let raw=Buffer.alloc(0);const timer=setTimeout(()=>process.stdin.destroy(Error('input_timeout')),3000);
 try{for await(const chunk of process.stdin){if(raw.length+chunk.length>128)throw Error();const next=Buffer.concat([raw,chunk]);raw.fill(0);raw=next;}return raw;}
 catch{raw.fill(0);throw Error();}finally{clearTimeout(timer);}
}
async function check({read=readCredential,createSql=createDirectoryExecutorSqlCheck}={}){
 let secret,sql;
 try{secret=await read();if(!Buffer.isBuffer(secret)||secret.length<16||secret.length>128||secret.some(v=>v<32||v>126))throw Error();
  sql=createSql(secret.toString('ascii'));await sql.check();
 }catch{throw Error('directory_executor_credential_check_unconfirmed');}
 finally{if(Buffer.isBuffer(secret))secret.fill(0);if(sql)try{await sql.shutdown();}catch{throw Error('directory_executor_credential_check_unconfirmed');}}
}
async function main(){
 if(process.platform!=='linux'||process.getuid?.()<61184||process.getuid?.()>65519||process.getgid?.()<61184||process.getgid?.()>65519||process.getgroups().some(g=>g!==process.getgid()))throw Error();
 if(process.argv.length===3&&process.argv[2]==='--stdin-check'){await check({read:readInput});console.log('DIRECTORY_EXECUTOR_SQL_INPUT_OK');}
 else if(process.argv.length===2){await check();console.log('DIRECTORY_EXECUTOR_CREDENTIAL_SQL_OK');}
 else throw Error();
}
if(require.main===module)main().catch(()=>{console.error('DIRECTORY_EXECUTOR_SQL_CHECK_UNCONFIRMED');process.exitCode=1;});
module.exports={check,validateCredentialStat};
