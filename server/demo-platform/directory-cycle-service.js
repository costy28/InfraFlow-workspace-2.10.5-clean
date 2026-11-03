'use strict';
const fs=require('node:fs');
const {createDirectoryCycleBroker}=require('./directory-cycle-sql-broker');
const {serve}=require('./directory-preparation-sql-broker');
function validateCredentialStat(s){
 const mode=s.mode&0o7777;
 if(!s.isFile()||s.nlink!==1||s.size<16||s.size>128||!((s.uid===0&&s.gid===0&&mode===0o440)||(s.uid===994&&mode===0o400)))throw Error();
}
function readSecret(){
 const dir='/run/credentials/infraflow-demo-directory-cycle.service';
 if(process.platform!=='linux'||process.env.CREDENTIALS_DIRECTORY!==dir||process.getuid()!==994||process.getgid()!==985||process.getgroups().some(g=>g!==985))throw Error();
 const fd=fs.openSync(dir+'/sql-password',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{validateCredentialStat(fs.fstatSync(fd));return fs.readFileSync(fd);}finally{fs.closeSync(fd);}
}
async function main(){
 if(process.argv.length!==2||!/^[0-9a-f]{32}$/.test(process.env.INVOCATION_ID||''))throw Error();
 let secret,broker;
 try{
  secret=readSecret();if(secret.some(v=>v<32||v>126))throw Error();
  broker=createDirectoryCycleBroker(secret.toString('ascii'));secret.fill(0);
  const bound={request:async(action,payload)=>{const r=await broker.request(action,payload);return action==='init'?{...r,invocationId:process.env.INVOCATION_ID}:r;},shutdown:()=>broker.shutdown()};
  await serve(bound,process.stdin,line=>new Promise((resolve,reject)=>process.stdout.write(line,error=>error?reject(error):resolve())));
 }finally{if(secret)secret.fill(0);if(broker)await broker.shutdown();}
}
if(require.main===module)main().catch(()=>{console.error('DIRECTORY_CYCLE_SERVICE_UNCONFIRMED');process.exitCode=1;});
module.exports={validateCredentialStat};
