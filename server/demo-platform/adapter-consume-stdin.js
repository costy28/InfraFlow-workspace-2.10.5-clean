'use strict';
// Future private child bridge. No arguments, TCP listener or credentials in stdout.
const fs=require('node:fs');
const {parseTicketCommand,createAdapterTicketClient}=require('./adapter-ticket-client');
const {createAdapterTicketSql}=require('./adapter-ticket-sql');
const {validateCredentialStat}=require('./provision-lease-runtime');
async function main(){
 if(process.platform!=='linux'||process.getuid()===0||process.argv.length!==2)throw Error();
 let raw='';
 const timer=setTimeout(()=>process.stdin.destroy(Error('input_timeout')),3000);
 try{for await(const chunk of process.stdin){if(chunk.some(v=>v>127))throw Error();raw+=chunk.toString('ascii');if(Buffer.byteLength(raw)>1024)throw Error();}}finally{clearTimeout(timer);}
 const command=parseTicketCommand('consume',JSON.parse(raw));
 const dir='/run/credentials/infraflow-demo-adapter-review.service';
 if(process.env.CREDENTIALS_DIRECTORY!==dir)throw Error();
 let password,sql,client;
 const fd=fs.openSync(dir+'/adapter-sql-password',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{validateCredentialStat(fs.fstatSync(fd),process.getuid());password=fs.readFileSync(fd);}finally{fs.closeSync(fd);}
 try{
  if(password.some(v=>v<32||v>126))throw Error();
  sql=createAdapterTicketSql({role:'consumer',password:password.toString('ascii')});
  client=createAdapterTicketClient({role:'consumer',execute:sql.execute});
  const result=await client.execute(command);
  console.log(JSON.stringify(result));
 }finally{
  password?.fill(0);
  if(client)await client.shutdown();
  if(sql)await sql.shutdown();
 }
}
if(require.main===module)main().catch(()=>{console.error('ADAPTER_CONSUME_UNCONFIRMED');process.exitCode=1;});
