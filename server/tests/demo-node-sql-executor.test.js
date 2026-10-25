'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events')
const {createNodeSqlTestExecutor}=require('../core/demo-trial-node-sql-test-executor')
const database='INFRAFLOW_TEST_TRIALS_0123456789AB'
const config={database,user:'INFRAFLOW_TEST_CP_0123456789AB',password:'x'.repeat(40),port:1433}
function mode(t){const old=process.env.NODE_ENV;process.env.NODE_ENV='test';t.after(()=>{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old})}
function fakeDriver(query){
  const observed={connect:0,close:0,cancel:0,queries:0,config:null,inputs:[]}
  class ConnectionPool extends EventEmitter{
    constructor(c){super();observed.config=c}
    async connect(){observed.connect++;return this}
    async close(){observed.close++}
    request(){
      return {
        input:(...args)=>{observed.inputs.push(args)},
        cancel:()=>{observed.cancel++},
        query:async sql=>{observed.queries++;return query?query(sql,observed):{recordsets:[[{value:'123'}]]}},
      }
    }
  }
  return {driver:{ConnectionPool,NVarChar:length=>({length}),MAX:-1},observed}
}
test('Node SQL: pool privat, conexiune locală fixă, JSON parametrizat și rezultat compatibil',async t=>{
  mode(t);const {driver,observed}=fakeDriver(),adapter=createNodeSqlTestExecutor(config,driver)
  assert.equal(await adapter.execute(database,'SELECT @json;',{a:1}),'123')
  assert.equal(observed.config.server,'127.0.0.1');assert.equal(observed.config.pool.max,2)
  assert.deepEqual(observed.inputs[0],['json',{length:-1},'{"a":1}'])
  await adapter.shutdown();assert.equal(observed.connect,1);assert.equal(observed.close,1)
})
test('Node SQL: configurație ERP/arbitrară refuzată înainte de driver',t=>{
  mode(t);const {driver,observed}=fakeDriver()
  for(const patch of [{database:'INFRAFLOW_DEMO'},{user:'sa'},{port:0},{password:'short'},{server:'external.test'}])
    assert.throws(()=>createNodeSqlTestExecutor({...config,...patch},driver),/invalid_node_sql_test_config/)
  assert.equal(observed.config,null)
})
test('Node SQL: țintă greșită, opțiuni nepermise și pre-abort nu fac query',async t=>{
  mode(t);const {driver,observed}=fakeDriver(),adapter=createNodeSqlTestExecutor(config,driver),controller=new AbortController()
  await assert.rejects(adapter.execute('master','SELECT 1'),/invalid_node_sql_test_request/)
  await assert.rejects(adapter.execute(database,'SELECT 1',{}, {path:'other'}),/invalid_node_sql_test_request/)
  controller.abort();await assert.rejects(adapter.execute(database,'SELECT 1',{}, {signal:controller.signal}),{code:'synthetic_sql_aborted'})
  assert.equal(observed.connect,0);assert.equal(observed.queries,0);await adapter.shutdown()
})
test('Node SQL: abort cere cancel și nu eliberează operația înainte de confirmarea driverului',async t=>{
  mode(t);let rejectQuery,started
  const ready=new Promise(r=>{started=r}),{driver,observed}=fakeDriver(()=>new Promise((_,reject)=>{rejectQuery=reject;started()}))
  const adapter=createNodeSqlTestExecutor(config,driver),controller=new AbortController()
  const result=adapter.execute(database,'SELECT 1',{}, {signal:controller.signal})
  await ready;controller.abort();assert.equal(observed.cancel,1)
  let stopped=false;const stop=adapter.shutdown().then(()=>{stopped=true})
  await new Promise(r=>setImmediate(r));assert.equal(stopped,false)
  const rejected=assert.rejects(result,{code:'synthetic_sql_aborted'})
  rejectQuery(Error('PRIVATE_PROVIDER_CREDENTIALS'));await rejected;await stop;assert.equal(observed.close,1)
})
test('Node SQL: erori mascate și shutdown idempotent, fără reopen',async t=>{
  mode(t);const {driver}=fakeDriver(()=>{throw Error('PRIVATE_SQL_TEXT')})
  const adapter=createNodeSqlTestExecutor(config,driver)
  await assert.rejects(adapter.execute(database,'SELECT 1'),{code:'synthetic_node_sql_failed'})
  const stop=adapter.shutdown();assert.equal(adapter.shutdown(),stop);await stop
  await assert.rejects(adapter.execute(database,'SELECT 1'),{code:'synthetic_sql_pool_closed'})
})
test('Node SQL: construcție refuzată în afara testelor',()=>{
  const old=process.env.NODE_ENV;process.env.NODE_ENV='production'
  try{assert.throws(()=>createNodeSqlTestExecutor(config),/synthetic_test_only/)}
  finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old}
})
