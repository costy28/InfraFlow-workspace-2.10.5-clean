'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events')
const {createOperatorSqlClient,validateCommand}=require('../demo-platform/operator-sql-client')
const {createSqlOperatorStore}=require('../demo-platform/operator-store')
const id='11111111-1111-4111-8111-111111111111'
test('operator procedure client: arbitrary command/extra payload rejected before connect',async()=>{
  let connects=0
  class Pool extends EventEmitter{async connect(){connects++}async close(){}}
  const client=createOperatorSqlClient('x'.repeat(32),{ConnectionPool:Pool})
  for(const [cmd,input]of [['SELECT 1',{id}],['read_account',{id,sql:'x'}],['claim_totp',{id,counter:0,revision:-1}],['append_audit',{id,action:'DROP'}]])await assert.rejects(client.execute(cmd,input))
  assert.equal(connects,0);await client.shutdown()
})
test('operator procedure client: fixed identity, parametrized execute, concurrency cap and orderly close',async()=>{
  let config,release,queries=0,closes=0
  class Pool extends EventEmitter{
    constructor(c){super();config=c}
    async connect(){return this}
    request(){return {input(name,type,value){assert.equal(name,'json');assert.deepEqual(JSON.parse(value),{id});return this},async execute(proc){assert.equal(proc,'operator_security.reserve_attempt');queries++;await new Promise(r=>{release=r});return {recordsets:[[{result:1}]]}}}}
    async close(){closes++}
  }
  const client=createOperatorSqlClient('x'.repeat(32),{ConnectionPool:Pool,NVarChar:()=>'',MAX:-1})
  assert.equal(config.user,'infraflow_demo_auth');assert.equal(config.server,'127.0.0.1')
  const first=client.execute('reserve_attempt',{id});await new Promise(r=>setImmediate(r));release();assert.equal(await first,'1')
  assert.equal(queries,1);const stop=client.shutdown();assert.equal(client.shutdown(),stop);await stop;assert.equal(closes,1)
  await assert.rejects(client.execute('reserve_attempt',{id}))
})
test('operator store procedure mode emits only allowlisted operation names',async()=>{
  const calls=[]
  const store=createSqlOperatorStore({operatorId:id,key:Buffer.alloc(32,1),procedures:true,execute:async(command,input)=>{validateCommand(command,input);calls.push(command);return '1'}})
  await store.reserveAttempt({operatorId:id,now:0,limit:5,windowMs:900000})
  await store.claimTotpCounter({operatorId:id,counter:0,revision:1})
  await store.appendAudit({operatorId:id,action:'operator_login',at:0})
  assert.deepEqual(calls,['reserve_attempt','claim_totp','append_audit']);store.shutdown()
})
test('operator client: no unbounded queue, shutdown waits for both active calls',async()=>{
  const releases=[];let closed=0
  class Pool extends EventEmitter{
    async connect(){return this}
    request(){return {input(){return this},async execute(){await new Promise(r=>releases.push(r));return {recordsets:[[{value:1}]]}}}}
    async close(){closed++}
  }
  const client=createOperatorSqlClient('x'.repeat(32),{ConnectionPool:Pool,NVarChar:()=>'',MAX:-1})
  const a=client.execute('reserve_attempt',{id}),b=client.execute('reserve_attempt',{id})
  const all=Promise.allSettled([a,b])
  await assert.rejects(client.execute('reserve_attempt',{id}))
  await new Promise(r=>setImmediate(r));assert.equal(releases.length,2)
  const stopping=client.shutdown();assert.equal(closed,0)
  releases.forEach(r=>r());await stopping
  assert.equal(closed,1);assert.equal((await all).every(r=>r.status==='rejected'),true)
})
