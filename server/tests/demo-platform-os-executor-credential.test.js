'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {validate,createOsExecutorSqlCheck}=require('../demo-platform/os-executor-sql-check');
const {check,validateCredentialStat}=require('../demo-platform/os-executor-credential-probe');
function metadata(){return {recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login:'infraflow_demo_os_executor',principal:'infraflow_demo_os_executor',sysadmin:0,accessDemo:0}],
 [{permission_name:'CONNECT SQL'}],[{permission_name:'CONNECT'}],['accept_os_identity_delegation','record_os_identity_result'].map(object_name=>({schema_name:'platform',object_name,permission_name:'EXECUTE'}))]};}
test('executor metadata requires exact fixed identity and two RPCs',()=>{
 validate(metadata());
 for(const change of [r=>r.recordsets[0][0].sysadmin=1,r=>r.recordsets[0][0].accessDemo=1,r=>r.recordsets[0][0].login='sa',r=>r.recordsets[3].push({schema_name:'platform',object_name:'trials',permission_name:'SELECT'})]){
  const r=metadata();change(r);assert.throws(()=>validate(r));
 }
});
test('transport is metadata-only, refuses parallel checks and waits on shutdown',async()=>{
 let finish,queries=0,closes=0,config;
 class Pool extends EventEmitter{constructor(c){super();config=c;}async connect(){}request(){return {query:async()=>{queries++;await new Promise(r=>finish=r);return metadata();}};}async close(){closes++;}}
 const sql=createOsExecutorSqlCheck('x'.repeat(20),{ConnectionPool:Pool});assert.deepEqual(Object.keys(sql).sort(),['check','shutdown']);
 assert.equal(config.user,'infraflow_demo_os_executor');assert.equal(config.server,'127.0.0.1');
 const task=sql.check(),settled=Promise.allSettled([task]);await new Promise(r=>setImmediate(r));await assert.rejects(sql.check());
 const stop=sql.shutdown();finish();await stop;assert.equal((await settled)[0].status,'rejected');assert.equal(queries,1);assert.equal(closes,1);
});
test('credential metadata accepts systemd root ACL or dynamic-user private mode only',()=>{
 const s={uid:0,gid:0,mode:0o440,nlink:1,size:24,isFile:()=>true};validateCredentialStat(s,62001);
 validateCredentialStat({...s,uid:62001,mode:0o400},62001);
 for(const [stat,uid] of [[s,0],[{...s,mode:0o644},62001],[{...s,nlink:2},62001],[{...s,uid:993},62001]])assert.throws(()=>validateCredentialStat(stat,uid));
});
test('credential check wipes buffer and calls no RPC, even on error',async()=>{
 for(const fail of [false,true]){
  const secret=Buffer.from('x'.repeat(20));let checked=0,closed=0;
  const operation=check({read:()=>secret,createSql:()=>({check:async()=>{checked++;if(fail)throw Error('secret');},execute:()=>{throw Error('RPC forbidden');},shutdown:async()=>{closed++;}})});
  if(fail)await assert.rejects(operation,/os_executor_credential_check_unconfirmed/);else await operation;
  assert.equal(checked,1);assert.equal(closed,1);assert.ok(secret.every(x=>x===0));
 }
});
