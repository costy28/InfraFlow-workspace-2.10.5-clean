'use strict';
const fs=require('node:fs');
const {validateCredentialStat}=require('./provision-lease-runtime');
const {createChannelReviewSql}=require('./channel-review-sql');
const {createAdapterChannelClient}=require('./adapter-channel-client');
const {runChannelReviewCycle}=require('./channel-review-cycle');
const DIRECTORY='/run/credentials/infraflow-demo-channel-cycle.service';
function readSecret(){
 if(process.platform!=='linux'||process.getuid?.()!==994||process.getgid?.()!==985||process.getgroups().some(x=>x!==985)||process.env.CREDENTIALS_DIRECTORY!==DIRECTORY)throw Error();
 const fd=fs.openSync(DIRECTORY+'/lease-sql-password',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{validateCredentialStat(fs.fstatSync(fd),994);return fs.readFileSync(fd);}finally{fs.closeSync(fd);}
}
async function main(){
 const mode=process.argv.slice(2);
 if(mode.length!==1||!['--check-only','--run-channel-review-confirmed'].includes(mode[0]))throw Error();
 let secret,sql,channel,failed=false;
 try{
  secret=readSecret();if(secret.some(x=>x<32||x>126))throw Error();
  sql=createChannelReviewSql(secret.toString('ascii'));secret.fill(0);secret=undefined;
  if(mode[0]==='--check-only'){await sql.check();}
  else{
   channel=createAdapterChannelClient();
   const result=await runChannelReviewCycle({sql,channel,jobId:'00f612ed-a8ac-4688-a26f-679760eee0be',expectedJobRevision:3});
   console.log(JSON.stringify(result));
  }
 }catch{failed=true;}
 finally{
  secret?.fill(0);
  try{if(channel)await channel.shutdown();}catch{failed=true;}
  try{if(sql)await sql.shutdown();}catch{failed=true;}
 }
 if(failed)throw Error();
 console.log(mode[0]==='--check-only'?'CHANNEL_REVIEW_SQL_SCOPE_OK':'CHANNEL_REVIEW_CYCLE_OK');
}
if(require.main===module)main().catch(()=>{console.error('CHANNEL_REVIEW_UNCONFIRMED_NO_AUTOMATIC_RETRY');process.exitCode=1;});
module.exports={main};
