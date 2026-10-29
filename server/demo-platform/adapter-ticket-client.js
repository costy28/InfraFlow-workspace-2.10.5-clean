'use strict';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const TOKEN=/^[a-f0-9]{64}$/;
function parseTicketCommand(operation,input){
 const keys=operation==='issue'?['jobId','generation','expectedJobRevision','leaseToken','intentId','ticketToken']:
  operation==='consume'?['intentId','ticketToken']:null;
 if(!keys||!input||Object.getPrototypeOf(input)!==Object.prototype||Reflect.ownKeys(input).length!==keys.length)throw Error('invalid_ticket_command');
 const value={};
 for(const key of keys){
  const d=Object.getOwnPropertyDescriptor(input,key);if(!d||!Object.hasOwn(d,'value'))throw Error('invalid_ticket_command');
  const v=d.value;
  if(key.endsWith('Id')?(typeof v!=='string'||!UUID.test(v)):key.endsWith('Token')?(typeof v!=='string'||!TOKEN.test(v)):
   (!Number.isInteger(v)||v<1||v>=2147483647))throw Error('invalid_ticket_command');
  value[key]=v;
 }
 return Object.freeze(value);
}
function createAdapterTicketClient({role,execute}={}){
 if(!['issuer','consumer'].includes(role)||typeof execute!=='function')throw Error('ticket_transport_required');
 const operation=role==='issuer'?'issue':'consume';let pending,closed=false,stopping;
 const fail=()=>Error('adapter_ticket_result_unconfirmed');
 return Object.freeze({
  execute(input){
   let command;try{command=parseTicketCommand(operation,input);}catch{return Promise.reject(Error('invalid_ticket_command'));}
   if(closed||pending)return Promise.reject(fail());
   const task=Promise.resolve().then(async()=>{try{
    if(closed)throw fail();
    const raw=await execute('platform.adapter_review_ticket_command',{operation,json:JSON.stringify(command)});
    if(closed||typeof raw!=='string'||Buffer.byteLength(raw)>2048)throw fail();
    const r=JSON.parse(raw);
    if(!r||Object.getPrototypeOf(r)!==Object.prototype||Object.keys(r).sort().join(',')!=='executionAllowed,generation,intentId,jobId,jobRevision,operation,step'||
     r.executionAllowed!==false||r.operation!==operation||r.intentId!==command.intentId||typeof r.jobId!=='string'||!UUID.test(r.jobId)||
     !Number.isInteger(r.generation)||r.generation<1||r.generation>=2147483647||!Number.isInteger(r.jobRevision)||r.jobRevision<1||r.jobRevision>=2147483647||
     !['os_identity','tenant_directories','tenant_key','sql_database','sql_login','schema_bootstrap','runtime_unit'].includes(r.step)||
     (role==='issuer'&&(r.jobId!==command.jobId||r.generation!==command.generation||r.jobRevision!==command.expectedJobRevision)))throw fail();
    return Object.freeze(r);
   }catch{throw fail();}});
   pending=task;task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;
  },
  shutdown(){if(!stopping){closed=true;stopping=Promise.allSettled(pending?[pending]:[]).then(()=>undefined);}return stopping;},
 });
}
module.exports={parseTicketCommand,createAdapterTicketClient};
