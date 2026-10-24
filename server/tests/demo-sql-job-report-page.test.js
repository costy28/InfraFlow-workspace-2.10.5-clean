'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { normalizePageRequest, prepareJobReportPage } = require('../../scripts/lib/demo-sql-job-report-page')
const { renderJobReport } = require('../../scripts/lib/demo-sql-job-report')
const { createSqlTestTrialStore } = require('../core/demo-trial-sql-test-store')
const { createTrialSqlFixture } = require('./support/demo-trial-sql-fixture')
const trialId = '11111111-1111-4111-8111-111111111111'
const input = { trialId, now: 3000, pageSize: 1 }
const row = revision => ({ revision,generation:0,state:'pending',claimedAt:null,leaseUntil:null,completedAt:null,receiptPresent:false,firstEffectGeneration:null })
const data = jobs => ({ trialId,currentRevision:2,fingerprint:'a'.repeat(64),totalJobs:3,totalMatched:3,jobs })
test('paginare: cursor legat de trial, filtre, timp și dimensiune; totalul nu este rezumatul paginii', () => {
  const first = prepareJobReportPage(data([row(0),row(1)]), input)
  assert.equal(first.jobs.length, 1); assert.equal(first.totalMatched, 3); assert.equal(first.summaryScope,'page')
  assert.equal(first.nextCursor.afterRevision, 0)
  const last = prepareJobReportPage(data([row(2)]), { ...input,cursor:{ ...first.nextCursor,afterRevision:1 } })
  assert.equal(last.jobs[0].revision,2); assert.equal(last.nextCursor,null)
  for (const extra of [{ now:3001 },{ trialId:'22222222-2222-4222-8222-222222222222' },{ state:'pending' },{ receipt:'present' },{ pageSize:2 }]) {
    assert.throws(() => normalizePageRequest({ ...input,cursor:first.nextCursor,...extra }), { code:'invalid_synthetic_page_request' })
  }
})
test('paginare: schimbarea amprentei refuză continuarea, iar filtrele sunt verificate și în prezentare', () => {
  const first = prepareJobReportPage(data([row(0),row(1)]), input)
  assert.throws(() => prepareJobReportPage({ ...data([row(1)]),fingerprint:'b'.repeat(64) },{ ...input,cursor:first.nextCursor }), { code:'job_report_changed' })
  assert.throws(() => prepareJobReportPage(data([row(0)]),{ ...input,state:'pending' }), { code:'invalid_synthetic_job_page' })
  assert.throws(() => prepareJobReportPage(data([row(2)]),{ ...input,receipt:'present' }), { code:'invalid_synthetic_job_page' })
})
test('paginare: pagină goală și limita 100+1 fără trunchiere ascunsă; rendererul integral refuză pagina', () => {
  const empty = prepareJobReportPage({ ...data([]),totalMatched:0 },{ ...input,state:'leased' })
  assert.equal(empty.nextCursor,null); assert.equal(empty.jobs.length,0)
  const large = prepareJobReportPage({ ...data(Array.from({length:101},(_,i)=>row(i))),currentRevision:100,totalJobs:101,totalMatched:101 },{ ...input,pageSize:100 })
  assert.equal(large.jobs.length,100); assert.equal(large.nextCursor.afterRevision,99)
  assert.throws(() => renderJobReport(large),{code:'invalid_synthetic_job_report'})
})
test('paginare: input invalid refuzat înainte de SQL', async t => {
  const old=process.env.NODE_ENV;process.env.NODE_ENV='test'
  t.after(()=>{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old})
  const store=createSqlTestTrialStore({database:'INFRAFLOW_TEST_TRIALS_0123456789AB',execute:()=>assert.fail('must not execute')})
  for(const extra of [{pageSize:0},{pageSize:101},{state:'arbitrary'},{receipt:'unknown'},{path:'../other'},{cursor:{}}]) {
    await assert.rejects(store.readJobReportPage({...input,...extra}),{code:'invalid_synthetic_page_request'})
  }
})
test('SQL real: filtre, pagini consistente și schimbări fără revizie nouă', {
  skip:process.env.INFRAFLOW_TEST_TRIAL_SQL!=='1',timeout:180000,
},async t=>{
  const old=process.env.NODE_ENV;process.env.NODE_ENV='test'
  t.after(()=>{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old})
  const fixture=await createTrialSqlFixture(),store=createSqlTestTrialStore(fixture)
  await store.initialize();await store.queue({id:trialId,approvalId:'page-test',now:1000})
  const command=(commandId,action,expectedRevision)=>({trialId,commandId,action,expectedRevision,now:1001,actor:{id:'controller',kind:'worker'}})
  await store.command(command('start','provision',0));await store.command(command('ready','ready',1))
  let first,job
  const identity=now=>({trialId,workerId:job.workerId,revision:job.revision,generation:job.generation,now})
  await t.test('toate paginile fără dubluri și fără modificări ale registrului',async()=>{
    const before=await store.read()
    first=await store.readJobReportPage(input)
    const second=await store.readJobReportPage({...input,cursor:first.nextCursor})
    const third=await store.readJobReportPage({...input,cursor:second.nextCursor})
    assert.deepEqual([...first.jobs,...second.jobs,...third.jobs].map(j=>j.revision),[0,1,2])
    assert.equal(third.nextCursor,null);assert.equal(first.totalJobs,3)
    await assert.rejects(store.readJobReportPage({...input,now:3001,cursor:{...first.nextCursor,asOf:3001}}),{code:'job_report_changed'})
    assert.deepEqual(await store.read(),before)
    const filtered=await store.readJobReportPage({...input,state:'superseded',pageSize:2})
    assert.deepEqual(filtered.jobs.map(j=>j.revision),[0,1]);assert.equal(filtered.totalMatched,2)
    assert.equal((await store.readJobReportPage({...input,state:'completed'})).totalMatched,0)
  })
  await t.test('claim și heartbeat schimbă amprenta fără a avansa revizia trialului',async()=>{
    job=(await store.claimJob({trialId,workerId:'page-worker',now:2000,leaseMs:100})).job
    await assert.rejects(store.readJobReportPage({...input,cursor:first.nextCursor}),{code:'job_report_changed'})
    first=await store.readJobReportPage(input)
    await store.renewJob({...identity(2050),expectedLeaseUntil:2100,leaseMs:200})
    await assert.rejects(store.readJobReportPage({...input,cursor:first.nextCursor}),{code:'job_report_changed'})
  })
  await t.test('receipt și confirmare invalidează cursorul; filtrul receipt și expirarea sunt corecte',async()=>{
    first=await store.readJobReportPage(input)
    await store.applySyntheticEffect(identity(2100))
    await assert.rejects(store.readJobReportPage({...input,cursor:first.nextCursor}),{code:'job_report_changed'})
    const expired=await store.readJobReportPage({...input,state:'lease_expired',receipt:'present'})
    assert.equal(expired.totalMatched,1);assert.equal(expired.jobs[0].revision,2)
    first=await store.readJobReportPage(input)
    await store.completeJob(identity(2101))
    await assert.rejects(store.readJobReportPage({...input,cursor:first.nextCursor}),{code:'job_report_changed'})
    const complete=await store.readJobReportPage({...input,state:'completed',receipt:'present'})
    assert.equal(complete.totalMatched,1);assert.equal(complete.jobs[0].receiptPresent,true)
    assert.equal((await store.readJobReportPage({...input,state:'pending',receipt:'missing'})).totalMatched,0)
  })
})
