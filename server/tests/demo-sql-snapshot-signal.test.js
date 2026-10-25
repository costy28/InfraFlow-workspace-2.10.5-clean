'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {createSqlTestTrialStore}=require('../core/demo-trial-sql-test-store')
const {createRegistry}=require('../../scripts/lib/demo-trial-registry')
test('snapshot SQL: semnal propagat, input invalid refuzat, răspuns târziu nedivulgat',async t=>{
  const old=process.env.NODE_ENV;process.env.NODE_ENV='test'
  t.after(()=>{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old})
  let calls=0,abortDuring=false;const controller=new AbortController(),registry=createRegistry()
  const store=createSqlTestTrialStore({database:'INFRAFLOW_TEST_TRIALS_0123456789AB',execute:async(target,sql,input,options)=>{
    calls++;assert.equal(options.signal,controller.signal)
    if(abortDuring)controller.abort()
    return JSON.stringify({version:0,registry})
  }})
  for(const options of [null,{other:true},{signal:{aborted:false}}])await assert.rejects(store.read(options),{code:'invalid_sql_read_options'})
  assert.equal(calls,0)
  assert.deepEqual(await store.read({signal:controller.signal}),registry)
  abortDuring=true;await assert.rejects(store.read({signal:controller.signal}),{code:'synthetic_sql_aborted'})
  await assert.rejects(store.read({signal:controller.signal}),{code:'synthetic_sql_aborted'})
  assert.equal(calls,2)
})
