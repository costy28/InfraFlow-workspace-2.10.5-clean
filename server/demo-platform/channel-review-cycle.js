'use strict';
const crypto=require('node:crypto');
const {createProvisionLeaseClient}=require('./provision-lease-client');
const {createAdapterTicketClient}=require('./adapter-ticket-client');
const {parseLeaseCommand}=require('./provision-lease-command');
// One bounded diagnostic cycle. An uncertain write never triggers release/retry.
async function runChannelReviewCycle({sql,channel,jobId,expectedJobRevision}={}){
 const leaseToken=crypto.randomBytes(32).toString('hex'),ticketToken=crypto.randomBytes(32).toString('hex'),intentId=crypto.randomUUID();
 parseLeaseCommand('claim',{jobId,expectedJobRevision,leaseToken});
 if(typeof sql?.execute!=='function'||typeof sql?.check!=='function'||typeof channel?.execute!=='function')throw Error('channel_cycle_ports_required');
 const lease=createProvisionLeaseClient({execute:sql.execute}),ticket=createAdapterTicketClient({role:'issuer',execute:sql.execute});
 let stage='scope',result;
 try{
  await sql.check();stage='claim';
  const claimed=await lease.execute('claim',{jobId,expectedJobRevision,leaseToken});
  const command={jobId,generation:claimed.generation,expectedJobRevision:claimed.jobRevision,leaseToken,intentId};
  stage='intent';
  const raw=await sql.execute('platform.record_step_intent',{json:JSON.stringify({...command,step:'channel_review_probe'})});
  if(typeof raw!=='string'||Buffer.byteLength(raw)>2048)throw Error();
  const r=JSON.parse(raw);
  if(!r||Object.keys(r).sort().join(',')!=='executionAllowed,generation,intentId,jobId,state,step'||r.executionAllowed!==false||r.jobId!==jobId||r.intentId!==intentId||r.generation!==claimed.generation||r.step!=='channel_review_probe'||r.state!=='intent_recorded')throw Error();
  stage='issue';const issued=await ticket.execute({...command,ticketToken});
  if(issued.step!=='channel_review_probe')throw Error();
  stage='consume';const consumed=await channel.execute({intentId,ticketToken});
  if(!consumed||Object.keys(consumed).sort().join(',')!=='executionAllowed,generation,intentId,jobId,jobRevision,operation,step'||consumed.executionAllowed!==false||consumed.jobId!==jobId||consumed.intentId!==intentId||consumed.generation!==claimed.generation||consumed.jobRevision!==claimed.jobRevision||consumed.operation!=='consume'||consumed.step!=='channel_review_probe')throw Error();
  stage='verify';const verified=await lease.execute('verify',{jobId,generation:claimed.generation,leaseToken});
  if(verified.jobRevision!==claimed.jobRevision)throw Error();
  stage='release';const released=await lease.execute('release',{jobId,generation:claimed.generation,expectedJobRevision:claimed.jobRevision,leaseToken});
  result=Object.freeze({jobId,generation:released.generation,jobRevision:released.jobRevision,status:'channel_checked_and_released',executionAllowed:false});
 }catch{const error=Error('channel_cycle_unconfirmed_no_retry');error.stage=stage;throw error;}
 finally{await Promise.all([lease.shutdown(),ticket.shutdown()]);}
 return result;
}
module.exports={runChannelReviewCycle};
