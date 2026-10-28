'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createProvisionRequestSql,validateIdentity}=require('../demo-platform/provision-request-sql');
const {createProvisionRequestClient}=require('../demo-platform/provision-request');
const identity=()=>({recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login:'infraflow_demo_preparer',principal:'infraflow_demo_preparer',sysadmin:0,canRequest:1,accessDemo:0}],[{permission_name:'CONNECT SQL'},{permission_name:'VIEW ANY DATABASE'}],[{permission_name:'CONNECT'}],[{schema_name:'platform',object_name:'request_provision_job',permission_name:'EXECUTE'}]]});
const command={trialId:'b1100b43-48d0-42fa-8a1d-73b1286f8242',expectedRevision:0,commandId:'fixture:request',operatorId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',operatorRevision:2};
const receipt={jobId:'11111111-1111-4111-8111-111111111111',trialId:command.trialId,jobState:'queued',trialRevision:1,executionAllowed:false};
test('preparer identity is distinct from lease/registrar/auth and refuses broad rights',()=>{
 validateIdentity(identity());
 for(const login of ['infraflow_demo_lease','infraflow_demo_registrar','infraflow_demo_auth','sa']){const r=identity();r.recordsets[0][0].login=login;assert.throws(()=>validateIdentity(r));}
 for(const index of [1,2,3]){const r=identity();r.recordsets[index].push({permission_name:'CONTROL'});assert.throws(()=>validateIdentity(r));}
 const r=identity();r.recordsets[0][0].accessDemo=1;assert.throws(()=>validateIdentity(r));
});
test('real client chain uses fixed connection and one parameterized RPC after metadata check',async()=>{
 let config,checks=0,writes=0,closes=0;
 class Pool extends EventEmitter{constructor(c){super();config=c;}async connect(){}request(){return {async query(){checks++;return identity();},input(name,type,value){assert.equal(name,'json');assert.deepEqual(JSON.parse(value),command);return this;},async execute(proc){writes++;assert.equal(proc,'platform.request_provision_job');return {recordsets:[[{json:JSON.stringify(receipt)}]]};}};}async close(){closes++;}}
 const sql=createProvisionRequestSql('x'.repeat(20),{ConnectionPool:Pool,NVarChar:x=>x,MAX:-1});
 const client=createProvisionRequestClient({execute:sql.execute});
 assert.equal(config.user,'infraflow_demo_preparer');assert.equal(config.server,'127.0.0.1');assert.equal(config.port,1433);assert.equal(config.pool.max,1);
 assert.equal((await sql.check()).ok,true);assert.equal(writes,0);
 assert.deepEqual(await client.request(command),receipt);assert.equal(checks,2);assert.equal(writes,1);
 await client.shutdown();await sql.shutdown();assert.equal(closes,1);
});
test('arbitrary procedure or payload never connects, widened rights never execute',async()=>{
 let connections=0,writes=0;
 class Pool extends EventEmitter{async connect(){connections++;}request(){return {async query(){const r=identity();r.recordsets[3].push({schema_name:'platform',object_name:'provision_lease_command',permission_name:'EXECUTE'});return r;},async execute(){writes++;}};}async close(){}}
 const sql=createProvisionRequestSql('x'.repeat(20),{ConnectionPool:Pool});
 for(const [proc,args]of [['platform.provision_lease_command',{json:'{}'}],['platform.request_provision_job',{json:JSON.stringify({...command,path:'/tmp/unsafe'})}]])await assert.rejects(sql.execute(proc,args),/^Error: preparer_sql_result_unconfirmed$/);
 assert.equal(connections,0);await assert.rejects(sql.check());assert.equal(writes,0);await sql.shutdown();
});
test('one in flight, no queue, shutdown masks late result and does not reopen',async()=>{
 let finish,closes=0;
 class Pool extends EventEmitter{async connect(){}request(){return {async query(){await new Promise(r=>{finish=r;});return identity();}};}async close(){closes++;}}
 const sql=createProvisionRequestSql('x'.repeat(20),{ConnectionPool:Pool});const task=sql.check(),all=Promise.allSettled([task]);await new Promise(r=>setImmediate(r));
 await assert.rejects(sql.check());const stop=sql.shutdown();assert.equal(sql.shutdown(),stop);assert.equal(closes,0);finish();await stop;assert.equal((await all)[0].status,'rejected');assert.equal(closes,1);await assert.rejects(sql.check());
});
