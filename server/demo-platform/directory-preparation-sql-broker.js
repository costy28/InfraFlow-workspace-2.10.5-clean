'use strict';
// Private stdin/stdout only: fixed preparation RPC, no lease, host or arbitrary SQL.
const fs=require('node:fs');
const {createDirectoryPreparationRpcClient}=require('./directory-preparation-rpc-client');
function exact(value,keys){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)throw Error();
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);if(!d||!Object.hasOwn(d,'value'))throw Error();}return value;
}
function createDirectoryPreparationBroker(password,driver){
 if(typeof password!=='string'||!/^[\x20-\x7e]{16,128}$/.test(password))throw Error('directory_broker_config_refused');
 let client,pending,closed=false,broken=false,stopping;
 const fail=()=>Error('directory_broker_unconfirmed');
 return Object.freeze({request(action,payload){
  if(closed||broken||pending)return Promise.reject(fail());
  const task=Promise.resolve().then(async()=>{
   if(action==='init'){
    if(client)throw fail();exact(payload,['binding']);
    client=createDirectoryPreparationRpcClient({password,binding:payload.binding,driver});password=undefined;
    return Object.freeze({initialized:true});
   }
   if(!client)throw fail();
   if(action==='check'){exact(payload,[]);return client.check();}
   if(action==='prepare')return client.prepare(payload);
   throw fail();
  }).then(value=>{if(closed)throw fail();return value;}).catch(()=>{broken=true;throw fail();});
  pending=task;task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;
 },shutdown(){
  if(!stopping){closed=true;stopping=(async()=>{await Promise.allSettled(pending?[pending]:[]);password=undefined;if(client)await client.shutdown();})();}
  return stopping;
 }});
}
function readSecret(){
 const dir='/run/credentials/infraflow-demo-directory-preparer.service';
 if(process.platform!=='linux'||process.env.CREDENTIALS_DIRECTORY!==dir||process.getuid()!==994||process.getgid()!==985||process.getgroups().some(g=>g!==985))throw Error();
 const fd=fs.openSync(dir+'/sql-password',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{
  const s=fs.fstatSync(fd),mode=s.mode&0o7777;
  if(!s.isFile()||s.nlink!==1||s.size<16||s.size>128||!((s.uid===0&&s.gid===0&&mode===0o440)||(s.uid===994&&mode===0o400)))throw Error();
  return fs.readFileSync(fd);
 }finally{fs.closeSync(fd);}
}
async function serve(broker,input,write){
 let buffer=Buffer.alloc(0),lastId=0;
 try{
  for await(const chunk of input){
   const next=Buffer.concat([buffer,chunk]);buffer.fill(0);buffer=next;
   if(buffer.length>4096)throw Error();
   while(buffer.includes(10)){
    const at=buffer.indexOf(10),line=Buffer.from(buffer.subarray(0,at)),rest=Buffer.from(buffer.subarray(at+1));buffer.fill(0);buffer=rest;
    let id=null;
    try{
     const p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(line));exact(p,['id','action','payload']);
     if(!Number.isSafeInteger(p.id)||p.id!==lastId+1)throw Error();id=p.id;lastId=id;
     if(p.action==='shutdown'){exact(p.payload,[]);await broker.shutdown();await write(JSON.stringify({id,ok:true,value:{closed:true}})+'\n');return;}
     const value=await broker.request(p.action,p.payload),reply=JSON.stringify({id,ok:true,value})+'\n';
     if(Buffer.byteLength(reply)>4096)throw Error();await write(reply);
    }catch{await write(JSON.stringify({id,ok:false,code:'directory_broker_unconfirmed'})+'\n');return;}
    finally{line.fill(0);}
   }
  }
  if(buffer.length)throw Error();
 }finally{buffer.fill(0);await broker.shutdown();}
}
async function main(){
 if(process.argv.length!==2||!/^[0-9a-f]{32}$/.test(process.env.INVOCATION_ID||''))throw Error();
 let secret,broker;
 try{
  secret=readSecret();if(secret.some(v=>v<32||v>126))throw Error();broker=createDirectoryPreparationBroker(secret.toString('ascii'));secret.fill(0);
  const bound={request:async(action,payload)=>{const value=await broker.request(action,payload);return action==='init'?{...value,invocationId:process.env.INVOCATION_ID}:value;},shutdown:()=>broker.shutdown()};
  await serve(bound,process.stdin,line=>new Promise((resolve,reject)=>process.stdout.write(line,error=>error?reject(error):resolve())));
 }finally{if(secret)secret.fill(0);if(broker)await broker.shutdown();}
}
if(require.main===module)main().catch(()=>{console.error('DIRECTORY_PREPARATION_BROKER_UNCONFIRMED');process.exitCode=1;});
module.exports={createDirectoryPreparationBroker,serve};
