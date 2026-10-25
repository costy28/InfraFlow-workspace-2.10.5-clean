'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events')
const {validateSecretStat,validateProbe,createSqlReader}=require('../demo-platform/sql-reader')
const result=()=>({recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login:'infraflow_demo_platform',sysadmin:0,controlDb:0,createTable:0,insertBootstrap:0,accessDemo:0}],[{permission_name:'CONNECT SQL'},{permission_name:'VIEW ANY DATABASE'}],[{singleton:true,format:'infraflow-platform-bootstrap-v1'}]]})
test('SQL reader: strict secret file metadata',()=>{
  const good={isFile:()=>true,uid:0,gid:995,mode:0o100640,nlink:1,size:40}
  validateSecretStat(good,995)
  for(const patch of [{uid:1000},{gid:0},{mode:0o100644},{nlink:2},{size:1024},{isFile:()=>false}])assert.throws(()=>validateSecretStat({...good,...patch},995))
})
test('SQL reader: result validation fails closed on NULL or extra permission',()=>{
  validateProbe(result())
  for(const patch of [{sysadmin:1},{controlDb:null},{accessDemo:1},{login:'sa'}]){
    const r=result();Object.assign(r.recordsets[0][0],patch);assert.throws(()=>validateProbe(r))
  }
  const r=result();r.recordsets[1].push({permission_name:'CONTROL SERVER'});assert.throws(()=>validateProbe(r))
})
test('SQL reader: private fixed pool, shared in-flight probe, sanitized failure and shutdown',async()=>{
  let config,queries=0,closed=0,release,fail=false
  class Pool extends EventEmitter{
    constructor(c){super();config=c}
    async connect(){return this}
    request(){return {query:async()=>{queries++;await new Promise(r=>{release=r});if(fail)throw Error('SECRET');return result()}}}
    async close(){closed++}
  }
  const reader=createSqlReader('x'.repeat(32),{ConnectionPool:Pool})
  assert.equal(config.database,'INFRAFLOW_DEMO_PLATFORM');assert.equal(config.user,'infraflow_demo_platform');assert.equal(config.server,'127.0.0.1')
  const first=reader.check();assert.equal(reader.check(),first)
  await new Promise(r=>setImmediate(r));release();assert.equal((await first).ok,true);assert.equal(queries,1)
  fail=true;const next=reader.check();await new Promise(r=>setImmediate(r));release();await assert.rejects(next,{message:'platform_sql_unavailable'})
  const stop=reader.shutdown();assert.equal(reader.shutdown(),stop);await stop;assert.equal(closed,1)
  await assert.rejects(reader.check(),{message:'platform_sql_unavailable'})
})
