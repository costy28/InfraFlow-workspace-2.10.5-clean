'use strict';
// Private service IPC only. No network listener, host commands or arbitrary SQL.
const fs=require('node:fs');
const {createWorkerOsControlSql,parseOsIntent}=require('./worker-os-control-sql');
const {createProvisionLeaseClient}=require('./provision-lease-client');
const {parseLeaseCommand}=require('./provision-lease-command');
const {createOsDelegationRpcClient,parseOsDelegationBinding}=require('./os-delegation-rpc-client');
function exact(value,keys){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)throw Error();for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);if(!d||!Object.hasOwn(d,'value'))throw Error();}return value;}
function createPilotSqlBroker(role,password,driver){
 if(!['worker','executor'].includes(role))throw Error('pilot_broker_config_refused');
 let initial,binding,leaseToken,executorToken,control,lease,delegation,pending,closed=false,broken=false,intended=false,prepared=false,accepted=false,reported=false,released=false;
 const fail=()=>Error('pilot_sql_broker_unconfirmed');
 async function close(){closed=true;await Promise.allSettled(pending?[pending]:[]);for(const client of [lease,delegation,control])if(client)await client.shutdown();leaseToken=executorToken=password=initial=binding=undefined;}
 async function action(name,value){
  if(name==='init'){
   if(initial)throw fail();
   if(role==='worker'){
    exact(value,['jobId','trialId','intentId','expectedJobRevision']);
    if(!Number.isInteger(value.expectedJobRevision)||value.expectedJobRevision<0||value.expectedJobRevision>2147483643)throw fail();
    parseOsDelegationBinding({jobId:value.jobId,trialId:value.trialId,intentId:value.intentId,generation:1,jobRevision:value.expectedJobRevision+1});
    initial=Object.freeze({...value});control=createWorkerOsControlSql(password,driver);lease=createProvisionLeaseClient({execute:control.execute});
   }else{
    exact(value,['binding']);binding=parseOsDelegationBinding(value.binding);initial=true;
    delegation=createOsDelegationRpcClient({role,password,binding,driver});
   }
   return {initialized:true};
  }
  if(!initial)throw fail();
  if(name==='check'){exact(value,[]);return await(role==='worker'?control:delegation).check();}
  if(role==='worker'){
   if(name==='claim'){
    if(binding||released)throw fail();const p=parseLeaseCommand('claim',value);
    if(p.jobId!==initial.jobId||p.expectedJobRevision!==initial.expectedJobRevision)throw fail();
    const r=await lease.execute('claim',p);leaseToken=p.leaseToken;
    binding=parseOsDelegationBinding({jobId:initial.jobId,trialId:initial.trialId,intentId:initial.intentId,generation:r.generation,jobRevision:r.jobRevision});return r;
   }
   if(!binding||released)throw fail();
   if(name==='intent'){
    if(intended)throw fail();const p=parseOsIntent(value);
    if(p.jobId!==binding.jobId||p.generation!==binding.generation||p.expectedJobRevision!==binding.jobRevision||p.intentId!==binding.intentId||p.leaseToken!==leaseToken)throw fail();
    const r=JSON.parse(await control.execute('platform.record_step_intent',{json:JSON.stringify(p)}));
    exact(r,['jobId','generation','intentId','step','state','executionAllowed']);
    if(r.jobId!==binding.jobId||r.generation!==binding.generation||r.intentId!==binding.intentId||r.step!=='os_identity'||r.state!=='intent_recorded'||r.executionAllowed!==false)throw fail();
    intended=true;return r;
   }
   if(name==='prepare'){
    if(!intended||prepared)throw fail();exact(value,['leaseToken','delegationToken']);if(value.leaseToken!==leaseToken)throw fail();
    delegation=createOsDelegationRpcClient({role,password,binding,driver});const r=await delegation.prepare(value);prepared=true;return r;
   }
   if(name==='release'){
    if(!prepared)throw fail();const p=parseLeaseCommand('release',value);
    if(p.jobId!==binding.jobId||p.generation!==binding.generation||p.expectedJobRevision!==binding.jobRevision||p.leaseToken!==leaseToken)throw fail();
    const r=await lease.execute('release',p);released=true;return r;
   }
  }else{
   if(name==='accept'){
    if(accepted)throw fail();const r=await delegation.accept(value);executorToken=value.delegationToken;accepted=true;return r;
   }
   if(['context','report'].includes(name)){
    exact(value,name==='context'?['delegationToken']:['delegationToken','outcome','uid','gid']);
    if(!accepted||reported||!value||value.delegationToken!==executorToken)throw fail();
    const r=await delegation[name](value);if(name==='report')reported=true;return r;
   }
  }
  throw fail();
 }
 return Object.freeze({request(name,value){
  if(closed||broken||pending||typeof name!=='string')return Promise.reject(fail());
  const task=Promise.resolve().then(async()=>{const result=await action(name,value);if(closed)throw fail();return result;}).catch(()=>{broken=true;throw fail();});pending=task;
  task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;
 },shutdown:close});
}
function readSecret(role){
 const worker=role==='worker',unit=worker?'infraflow-demo-os-pilot-worker.service':'infraflow-demo-os-pilot-executor.service';
 const dir='/run/credentials/'+unit;
 if(process.platform!=='linux'||process.env.CREDENTIALS_DIRECTORY!==dir||process.getgroups().some(g=>g!==process.getgid()))throw Error();
 if(worker?(process.getuid()!==994||process.getgid()!==985):(process.getuid()<61184||process.getuid()>65519||process.getgid()<61184||process.getgid()>65519))throw Error();
 const fd=fs.openSync(dir+'/sql-password',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{
  const s=fs.fstatSync(fd),mode=s.mode&0o7777;
  if(!s.isFile()||s.nlink!==1||s.size<16||s.size>128||!((s.uid===0&&s.gid===0&&mode===0o440)||(s.uid===process.getuid()&&mode===0o400)))throw Error();
  return fs.readFileSync(fd);
 }finally{fs.closeSync(fd);}
}
async function serve(broker,input,write){
 let buffer=Buffer.alloc(0),lastId=0;
 try{
  for await(const chunk of input){
   buffer=Buffer.concat([buffer,chunk]);if(buffer.length>4096)throw Error();
   while(buffer.includes(10)){
    const at=buffer.indexOf(10),line=buffer.subarray(0,at);buffer=buffer.subarray(at+1);
    let id=null;
    try{
     const p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(line));exact(p,['id','action','payload']);
     if(!Number.isSafeInteger(p.id)||p.id!==lastId+1)throw Error();id=p.id;lastId=id;
     if(p.action==='shutdown'){
      exact(p.payload,[]);await broker.shutdown();await write(JSON.stringify({id,ok:true,value:{closed:true}})+'\n');return;
     }
     const value=await broker.request(p.action,p.payload);const reply=JSON.stringify({id,ok:true,value})+'\n';if(Buffer.byteLength(reply)>4096)throw Error();await write(reply);
    }catch{await write(JSON.stringify({id,ok:false,code:'pilot_sql_broker_unconfirmed'})+'\n');return;}
   }
  }
  if(buffer.length)throw Error();
 }finally{await broker.shutdown();buffer.fill(0);}
}
async function main(){
 if(process.argv.length!==3||!['--worker','--executor'].includes(process.argv[2]))throw Error();
 const role=process.argv[2].slice(2);let secret,broker;
 try{
  if(!/^[0-9a-f]{32}$/.test(process.env.INVOCATION_ID||''))throw Error();
  secret=readSecret(role);if(secret.some(x=>x<32||x>126))throw Error();broker=createPilotSqlBroker(role,secret.toString('ascii'));
  const bound={request:async(action,payload)=>{const value=await broker.request(action,payload);return action==='init'?{...value,invocationId:process.env.INVOCATION_ID}:value;},shutdown:()=>broker.shutdown()};
  secret.fill(0);await serve(bound,process.stdin,line=>new Promise((resolve,reject)=>process.stdout.write(line,error=>error?reject(error):resolve())));
 }finally{if(secret)secret.fill(0);if(broker)await broker.shutdown();}
}
if(require.main===module)main().catch(()=>{console.error('OS_PILOT_SQL_BROKER_UNCONFIRMED');process.exitCode=1;});
module.exports={createPilotSqlBroker,serve};
