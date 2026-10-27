'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createProvisionLeaseSql,validateIdentity}=require('../demo-platform/provision-lease-sql');
const identity=()=>({recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login:'infraflow_demo_lease',principal:'infraflow_demo_lease',sysadmin:0,canLease:1,accessDemo:0}],[{permission_name:'CONNECT SQL'},{permission_name:'VIEW ANY DATABASE'}],[{permission_name:'CONNECT'}],[{schema_name:'platform',object_name:'provision_lease_command',permission_name:'EXECUTE'}]]});
const command={jobId:'b1100b43-48d0-42fa-8a1d-73b1286f8242',expectedJobRevision:0,leaseToken:'ab'.repeat(32)};
test('lease identity rejects widened scope, missing evidence, ERP access and impersonation',()=>{
 validateIdentity(identity());
 for(const key of ['db','login','principal','sysadmin','canLease','accessDemo']){const r=identity();r.recordsets[0][0][key]='wrong';assert.throws(()=>validateIdentity(r));}
 for(const index of [1,2,3]){const r=identity();r.recordsets[index].push({permission_name:'CONTROL'});assert.throws(()=>validateIdentity(r));}
 assert.throws(()=>validateIdentity({}));
});
test('fixed private connection, preflight before parameterized RPC, adapter compatible',async()=>{
 let config,queries=0,rpcs=0,closed=0;const bindings=[];
 class Pool extends EventEmitter{constructor(c){super();config=c;}async connect(){}request(){return {async query(){queries++;return identity();},input(...args){bindings.push(args);return this;},async execute(proc){rpcs++;assert.equal(proc,'platform.provision_lease_command');return {recordsets:[[{json:'receipt'}]]};}};}async close(){closed++;}}
 const sql=createProvisionLeaseSql('x'.repeat(20),{ConnectionPool:Pool,VarChar:n=>n,NVarChar:n=>n,MAX:-1});
 assert.equal(config.user,'infraflow_demo_lease');assert.equal(config.server,'127.0.0.1');assert.equal(config.pool.max,1);
 assert.equal(await sql.execute('platform.provision_lease_command',{operation:'claim',json:JSON.stringify(command)}),'receipt');
 assert.equal(queries,1);assert.equal(rpcs,1);assert.deepEqual(bindings.map(x=>x[0]),['operation','json']);
 assert.equal((await sql.check()).ok,true);assert.equal(rpcs,1);await sql.shutdown();assert.equal(closed,1);
});
test('invalid RPC never connects; broad identity never executes; errors mask secrets',async()=>{
 let connects=0,rpcs=0;
 class Pool extends EventEmitter{async connect(){connects++;}request(){return {async query(){const r=identity();r.recordsets[2].push({permission_name:'CONTROL'});return r;},async execute(){rpcs++;throw Error(command.leaseToken);}};}async close(){}}
 const sql=createProvisionLeaseSql('x'.repeat(20),{ConnectionPool:Pool});
 await assert.rejects(sql.execute('arbitrary',{}),/^Error: lease_sql_result_unconfirmed$/);assert.equal(connects,0);
 await assert.rejects(sql.execute('platform.provision_lease_command',{operation:'claim',json:JSON.stringify(command)}),/^Error: lease_sql_result_unconfirmed$/);assert.equal(rpcs,0);await sql.shutdown();
});
test('single flight, shutdown waits and rejects late results',async()=>{
 let finish,closes=0;
 class Pool extends EventEmitter{async connect(){}request(){return {async query(){await new Promise(r=>{finish=r;});return identity();}};}async close(){closes++;}}
 const sql=createProvisionLeaseSql('x'.repeat(20),{ConnectionPool:Pool});const a=sql.check(),settled=Promise.allSettled([a]);
 await new Promise(r=>setImmediate(r));await assert.rejects(sql.check());const stop=sql.shutdown();assert.equal(sql.shutdown(),stop);assert.equal(closes,0);finish();await stop;assert.equal(closes,1);assert.equal((await settled)[0].status,'rejected');await assert.rejects(sql.check());
});
