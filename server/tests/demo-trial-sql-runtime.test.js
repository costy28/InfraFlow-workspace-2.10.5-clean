'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {createSqlTestTrialStore}=require('../core/demo-trial-sql-test-store')
const {createTrialSqlFixture}=require('./support/demo-trial-sql-fixture')
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222'
function mode(t){const old=process.env.NODE_ENV;process.env.NODE_ENV='test';t.after(()=>{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old})}
test('generație runtime SQL: input nevalid refuzat înainte de executor',async t=>{
  mode(t)
  const store=createSqlTestTrialStore({database:'INFRAFLOW_TEST_TRIALS_0123456789AB',execute:()=>assert.fail('SQL must not run')})
  const request={trialId:A,commandId:'start',expectedGeneration:0,now:1002}
  for(const patch of [{trialId:'../other'},{commandId:'x;DROP'},{expectedGeneration:-1},{expectedGeneration:2147483647},{now:-1},{epoch:'caller-chosen'}])
    await assert.rejects(store.advanceRuntimeGeneration({...request,...patch}),{code:'invalid_runtime_generation_request'})
  await assert.rejects(store.readRuntimeGeneration({trialId:A,path:'other'}),{code:'invalid_runtime_generation_request'})
})
test('SQL real: generație persistentă, CAS, idempotentă și rollback',{
  skip:process.env.INFRAFLOW_TEST_TRIAL_SQL!=='1',timeout:180000,
},async t=>{
  mode(t);const fixture=await createTrialSqlFixture(),a=createSqlTestTrialStore(fixture),b=createSqlTestTrialStore(fixture)
  await a.initialize()
  for(const id of [A,B]){
    await a.queue({id,approvalId:id,now:1000})
    for(const [action,kind,expectedRevision]of [['provision','worker',0],['ready','worker',1],['activate','activation_agent',2]])
      await a.command({trialId:id,commandId:action,action,expectedRevision,actor:{id:'test',kind},now:1001})
  }
  const baseline=await a.read(),request=(commandId,expectedGeneration,trialId=A,now=2000)=>({trialId,commandId,expectedGeneration,now})
  let first,current,peer
  await t.test('prima generație și recitire prin adaptor nou',async()=>{
    assert.equal(await a.readRuntimeGeneration({trialId:A}),null)
    first=await a.advanceRuntimeGeneration(request('first',0));assert.equal(first.generation,1)
    assert.deepEqual(await b.readRuntimeGeneration({trialId:A}),first)
    assert.deepEqual(await b.advanceRuntimeGeneration(request('first',0)),first)
  })
  await t.test('două conexiuni concurente: un singur avans; B rămâne independent',async()=>{
    peer=await b.advanceRuntimeGeneration(request('peer',0,B))
    const results=await Promise.allSettled([a.advanceRuntimeGeneration(request('race-a',1)),b.advanceRuntimeGeneration(request('race-b',1))])
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
    assert.equal(results.find(r=>r.status==='rejected').reason.code,'runtime_generation_conflict')
    current=await a.readRuntimeGeneration({trialId:A});assert.equal(current.generation,2);assert.notEqual(current.epoch,first.epoch)
    assert.deepEqual(await a.readRuntimeGeneration({trialId:B}),peer)
  })
  await t.test('retry vechi nu reactivează epoca anterioară; reutilizarea ID diferit e refuzată',async()=>{
    assert.deepEqual(await a.advanceRuntimeGeneration(request('first',0)),first)
    assert.deepEqual(await a.readRuntimeGeneration({trialId:A}),current)
    await assert.rejects(a.advanceRuntimeGeneration(request('first',2)),{code:'runtime_command_reused'})
    await assert.rejects(a.advanceRuntimeGeneration(request('stale',1)),{code:'runtime_generation_conflict'})
  })
  await t.test('înainte de commit rollback; după commit ack pierdut reluat idempotent',async()=>{
    await assert.rejects(a.advanceRuntimeGeneration(request('rollback',2),{fault:'before_commit'}))
    assert.deepEqual(await b.readRuntimeGeneration({trialId:A}),current)
    await assert.rejects(a.advanceRuntimeGeneration(request('lost-ack',2),{fault:'after_commit_ack'}),{code:'synthetic_runtime_ack_lost'})
    const committed=await b.readRuntimeGeneration({trialId:A});assert.equal(committed.generation,3)
    assert.deepEqual(await a.advanceRuntimeGeneration(request('lost-ack',2)),committed)
  })
  await t.test('timp invers și termen trial refuzate; lifecycle-ul nu este modificat',async()=>{
    await assert.rejects(a.advanceRuntimeGeneration(request('time-reversal',3,A,1999)),{code:'runtime_time_reversal'})
    await assert.rejects(a.advanceRuntimeGeneration(request('expired',3,A,baseline.trials[0].expiresAt)),{code:'runtime_trial_ineligible'})
    assert.deepEqual(await a.read(),baseline)
    assert.deepEqual(await b.readRuntimeGeneration({trialId:B}),peer)
  })
  console.log('Runtime generation SQL test database:',fixture.database)
})
