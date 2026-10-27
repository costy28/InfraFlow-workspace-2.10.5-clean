'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createProvisionLeaseClient}=require('../demo-platform/provision-lease-client');
const input=()=>({jobId:'b1100b43-48d0-42fa-8a1d-73b1286f8242',expectedJobRevision:0,leaseToken:'ab'.repeat(32)});
const receipt=()=>({jobId:input().jobId,generation:1,jobRevision:1,leaseExpiresAt:'2026-10-27T12:00:00.123',executionAllowed:false});
test('lease adapter requires explicit transport and sends only fixed RPC with defensive payload',async()=>{
 assert.throws(()=>createProvisionLeaseClient(),/lease_transport_required/);
 let calls=0;
 const client=createProvisionLeaseClient({execute:async(proc,args)=>{calls++;assert.equal(proc,'platform.provision_lease_command');assert.equal(args.operation,'claim');assert.deepEqual(JSON.parse(args.json),input());return JSON.stringify(receipt());}});
 const value=input(),pending=client.execute('claim',value);value.jobId='changed';
 assert.deepEqual(await pending,receipt());assert.equal(calls,1);await client.shutdown();
});
test('invalid fields never reach transport; no automatic retry on uncertain commit',async()=>{
 let calls=0;const client=createProvisionLeaseClient({execute:async()=>{calls++;throw Error(input().leaseToken);}});
 await assert.rejects(client.execute('claim',{...input(),owner:'x'}),/invalid_provision_lease_command/);
 assert.equal(calls,0);
 await assert.rejects(client.execute('claim',input()),/^Error: provision_lease_result_unconfirmed$/);
 assert.equal(calls,1);await client.shutdown();
});
test('rejects widened, redirected and malformed receipts without leaking transport data',async()=>{
 for(const delta of [{executionAllowed:true},{jobId:'other'},{generation:0},{jobRevision:3},{leaseExpiresAt:null},{leaseExpiresAt:'not-date'},{token:input().leaseToken}]){
  const client=createProvisionLeaseClient({execute:async()=>JSON.stringify({...receipt(),...delta})});
  await assert.rejects(client.execute('claim',input()),/^Error: provision_lease_result_unconfirmed$/);await client.shutdown();
 }
});
test('verify preserves generation, release requires null expiry',async()=>{
 const client=createProvisionLeaseClient({execute:async(_,args)=>JSON.stringify({...receipt(),leaseExpiresAt:args.operation==='release'?null:receipt().leaseExpiresAt})});
 const {expectedJobRevision,...verify}=input();
 assert.equal((await client.execute('verify',{...verify,generation:1})).generation,1);
 await assert.rejects(client.execute('verify',{...verify,generation:2}),/result_unconfirmed/);
 assert.equal((await client.execute('release',{...input(),generation:1})).leaseExpiresAt,null);await client.shutdown();
});
test('bounded concurrency and shutdown wait; late success cannot escape after shutdown',async()=>{
 let finish,calls=0;
 const client=createProvisionLeaseClient({execute:async()=>{calls++;await new Promise(r=>{finish=r;});return JSON.stringify(receipt());}});
 const first=client.execute('claim',input());const settled=Promise.allSettled([first]);
 await new Promise(r=>setImmediate(r));await assert.rejects(client.execute('claim',input()),/result_unconfirmed/);
 const stop=client.shutdown();assert.equal(client.shutdown(),stop);finish();await stop;
 assert.equal((await settled)[0].status,'rejected');assert.equal(calls,1);
 await assert.rejects(client.execute('claim',input()),/result_unconfirmed/);
});
