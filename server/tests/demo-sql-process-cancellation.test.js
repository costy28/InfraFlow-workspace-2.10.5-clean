'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {runOwnedSqlProcess}=require('./support/demo-owned-sql-process')
const {createTrialSqlFixture}=require('./support/demo-trial-sql-fixture')
const {createSqlTestTrialStore}=require('../core/demo-trial-sql-test-store')
const A='11111111-1111-4111-8111-111111111111'
function mode(t){const old=process.env.NODE_ENV;process.env.NODE_ENV='test';t.after(()=>{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old})}
test('anulare: semnal deja anulat nu pornește proces sau executor SQL',async t=>{
  mode(t);const controller=new AbortController();controller.abort()
  await assert.rejects(runOwnedSqlProcess({script:'',env:{},signal:controller.signal,onProcess:()=>assert.fail('must not spawn')}),{code:'synthetic_sql_aborted'})
  const store=createSqlTestTrialStore({database:'INFRAFLOW_TEST_TRIALS_0123456789AB',execute:()=>assert.fail('must not execute')})
  await assert.rejects(store.readRuntimeGeneration({trialId:A},{signal:controller.signal}),{code:'synthetic_sql_aborted'})
})
test('anulare: readRuntimeGeneration transmite semnalul fără să îl includă în payload',async t=>{
  mode(t);const controller=new AbortController()
  const store=createSqlTestTrialStore({database:'INFRAFLOW_TEST_TRIALS_0123456789AB',execute:async(target,sql,input,options)=>{
    assert.deepEqual(input,{trialId:A});assert.equal(options.signal,controller.signal);return 'null'
  }})
  assert.equal(await store.readRuntimeGeneration({trialId:A},{signal:controller.signal}),null)
  await assert.rejects(store.readRuntimeGeneration({trialId:A},{signal:{}}),{code:'invalid_runtime_generation_request'})
})
test('executorul de proces este refuzat în runtime normal',()=>{
  const old=process.env.NODE_ENV;process.env.NODE_ENV='production'
  try{assert.throws(()=>runOwnedSqlProcess({}),/synthetic_test_only/)}
  finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old}
})
test('SQL real: procesul cererii anulate se închide; procesul vecin continuă',{
  skip:process.env.INFRAFLOW_TEST_TRIAL_SQL!=='1',timeout:120000,
},async t=>{
  mode(t);let abortRead=false,slow,peer,readChild,closed=false
  const readAbort=new AbortController()
  const fixture=await createTrialSqlFixture({onProcess:(child,{tag})=>{
    if(tag==='slow'){slow=child;child.once('close',()=>{closed=true})}
    if(tag==='peer')peer=child
    if(abortRead){readChild=child;child.once('spawn',()=>readAbort.abort())}
  }})
  await fixture.execute(fixture.database,'CREATE TABLE dbo.cancel_probe(id int NOT NULL PRIMARY KEY); SELECT 1;')
  const controller=new AbortController()
  const slowResult=fixture.execute(fixture.database,"INSERT dbo.cancel_probe VALUES(1); WAITFOR DELAY '00:00:08'; SELECT 123;",{}, {signal:controller.signal,processTag:'slow'})
    .then(()=>({ok:true}),error=>({code:error.code}))
  let started=false
  for(let i=0;i<3&&!started;i++)started=Number(await fixture.execute(fixture.database,'SELECT COUNT(*) FROM dbo.cancel_probe WHERE id=1;'))===1
  assert.equal(started,true,'SQL batch must have started before cancellation')
  const peerResult=fixture.execute(fixture.database,"WAITFOR DELAY '00:00:02'; SELECT 321;",{}, {processTag:'peer'})
  controller.abort()
  assert.deepEqual(await slowResult,{code:'synthetic_sql_aborted'})
  assert.equal(closed,true);assert.equal(slow.killed,true)
  assert.equal(Number(await peerResult),321);assert.equal(peer.killed,false)
  assert.equal(Number(await fixture.execute(fixture.database,'SELECT COUNT(*) FROM dbo.cancel_probe;')),1)
  // Check the same signal path through the store's read method, not only direct execute.
  const store=createSqlTestTrialStore(fixture)
  abortRead=true
  await assert.rejects(store.readRuntimeGeneration({trialId:A},{signal:readAbort.signal}),{code:'synthetic_sql_aborted'})
  assert.equal(readChild.killed,true)
  console.log('Cancellation SQL test database:',fixture.database)
})
