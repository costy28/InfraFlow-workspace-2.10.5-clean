'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { runSyntheticJobCycle } = require('./support/demo-sql-worker-cycle')
const { createSqlTestTrialStore } = require('../core/demo-trial-sql-test-store')
const { createTrialSqlFixture } = require('./support/demo-trial-sql-fixture')
const trialId = '11111111-1111-4111-8111-111111111111'
function clock(values) { return () => { assert.ok(values.length, 'unexpected clock call'); return values.shift() } }
function fake() {
  const calls = [], options = { trialId, workerId: 'worker-a', clock: clock([2000,2050,2051,2052]), leaseMs: 100 }
  const results = { claimJob: { job: { trialId, workerId: options.workerId, revision: 0, generation: 1, leaseUntil: 2100 } },
    renewJob: { status: 'renewed', generation: 1, leaseUntil: 2150 }, applySyntheticEffect: { status: 'applied', effectCount: 1 }, completeJob: { status: 'completed' } }
  options.store = Object.fromEntries(Object.keys(results).map(method => [method, async input => { calls.push({ method, input }); return results[method] }]))
  return { options, results, calls }
}
async function testMode(t) {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  t.after(() => { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous })
}
test('worker: runtime normal și configurații arbitrare sunt refuzate', async t => {
  await testMode(t)
  const f = fake(); process.env.NODE_ENV = 'production'
  await assert.rejects(runSyntheticJobCycle(f.options), { code: 'synthetic_test_only' })
  process.env.NODE_ENV = 'test'
  for (const change of [{ leaseMs: 0 },{ interruptAt: 'shell' },{ path: '../other' },{ trialId: '../other' }]) {
    await assert.rejects(runSyntheticJobCycle({ ...f.options, ...change }), { code: 'invalid_synthetic_cycle' })
  }
  assert.equal(f.calls.length, 0)
})
test('worker: ordinea este claim → heartbeat → efect → confirmare', async t => {
  await testMode(t); const f = fake()
  assert.equal((await runSyntheticJobCycle(f.options)).status, 'completed')
  assert.deepEqual(f.calls.map(c => c.method), ['claimJob','renewJob','applySyntheticEffect','completeJob'])
  assert.equal(f.calls[1].input.expectedLeaseUntil, 2100)
  assert.equal(f.calls[3].input.generation, 1)
})
test('worker: fără job nu există heartbeat sau efect', async t => {
  await testMode(t); const f = fake(); f.results.claimJob = { job: null }
  assert.deepEqual(await runSyntheticJobCycle(f.options), { status: 'idle' })
  assert.equal(f.calls.length, 1)
})
test('worker: refuzul sau răspunsul incert al heartbeatului oprește efectul', async t => {
  await testMode(t)
  for (const throws of [false,true]) {
    const f = fake(); f.results.renewJob = { status: 'refused' }
    if (throws) f.options.store.renewJob = async () => { throw Object.assign(Error('lease refused'), { code: 'job_lease_refused' }) }
    await assert.rejects(runSyntheticJobCycle(f.options), { code: throws ? 'job_lease_refused' : 'invalid_synthetic_renewal' })
    assert.ok(!f.calls.some(c => ['applySyntheticEffect','completeJob'].includes(c.method)))
  }
})
test('worker: receipt invalid sau efect eșuat nu se confirmă', async t => {
  await testMode(t)
  for (const throws of [false,true]) {
    const f = fake(); f.results.applySyntheticEffect = { status: 'applied', effectCount: 2 }
    if (throws) f.options.store.applySyntheticEffect = async () => { throw Object.assign(Error('effect failed'), { code: 'test_effect_failed' }) }
    await assert.rejects(runSyntheticJobCycle(f.options), { code: throws ? 'test_effect_failed' : 'invalid_synthetic_effect_receipt' })
    assert.ok(!f.calls.some(c => c.method === 'completeJob'))
  }
})
test('worker: întreruperea injectată după efect nu execută confirmarea', async t => {
  await testMode(t); const f = fake()
  await assert.rejects(runSyntheticJobCycle({ ...f.options, interruptAt: 'after_effect' }), { code: 'synthetic_cycle_interrupted', phase: 'after_effect' })
  assert.equal(f.calls.length, 3)
})
test('worker: identitate străină sau timp înapoi sunt refuzate înainte de efect', async t => {
  await testMode(t); let f = fake(); f.results.claimJob.job.workerId = 'other-worker'
  await assert.rejects(runSyntheticJobCycle(f.options), { code: 'invalid_synthetic_claim' })
  f = fake(); f.options.clock = clock([2000,1999])
  await assert.rejects(runSyntheticJobCycle(f.options), { code: 'invalid_synthetic_cycle_time' })
  assert.equal(f.calls.length, 1)
})
test('SQL real: două cicluri de worker, întrerupere și reluare fără efect dublat', {
  skip: process.env.INFRAFLOW_TEST_TRIAL_SQL !== '1', timeout: 180000,
}, async t => {
  await testMode(t)
  const fixture = await createTrialSqlFixture(), make = () => createSqlTestTrialStore(fixture), store = make()
  await store.initialize(); await store.queue({ id: trialId, approvalId: 'worker-cycle', now: 1000 })
  const options = (workerId, times, extra = {}) => ({ store: make(), trialId, workerId, clock: clock(times), leaseMs: 100, ...extra })
  await t.test('ciclul întrerupt după efect păstrează jobul leased', async () => {
    await assert.rejects(runSyntheticJobCycle(options('first-worker', [2000,2050,2051], { interruptAt: 'after_effect' })),
      { code: 'synthetic_cycle_interrupted', phase: 'after_effect' })
    assert.deepEqual(await runSyntheticJobCycle(options('too-early', [2100])), { status: 'idle' })
  })
  await t.test('alt worker reia după termen, reînnoiește și confirmă receipt-ul existent', async () => {
    assert.deepEqual(await runSyntheticJobCycle(options('replacement', [2150,2200,2201,2202])),
      { status: 'completed', trialId, revision: 0, generation: 2, effectStatus: 'replayed' })
    assert.deepEqual(await runSyntheticJobCycle(options('later', [2300])), { status: 'idle' })
  })
  await t.test('lease pierdut înainte de heartbeat nu produce efect', async () => {
    const secondId = '22222222-2222-4222-8222-222222222222'
    await store.queue({ id: secondId, approvalId: 'lost-before-heartbeat', now: 1000 })
    await assert.rejects(runSyntheticJobCycle({ ...options('expired', [3000,3100]), trialId: secondId }), { code: 'job_lease_refused' })
    const result = JSON.parse(await fixture.execute(fixture.database,
      `SELECT COUNT(*) AS receipts,SUM(effect_count) AS effects FROM dbo.demo_synthetic_effects FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`))
    assert.deepEqual(result, { receipts: 1, effects: 1 })
  })
  await t.test('întrerupere după confirmarea SQL nu redeschide sau repetă jobul', async () => {
    const thirdId = '33333333-3333-4333-8333-333333333333'
    await store.queue({ id: thirdId, approvalId: 'lost-completion-response', now: 1000 })
    await assert.rejects(runSyntheticJobCycle({ ...options('completed', [4000,4050,4051,4052], { interruptAt: 'after_complete' }), trialId: thirdId }),
      { code: 'synthetic_cycle_interrupted', phase: 'after_complete' })
    assert.deepEqual(await runSyntheticJobCycle({ ...options('retry', [4200]), trialId: thirdId }), { status: 'idle' })
    const result = JSON.parse(await fixture.execute(fixture.database,
      `SELECT COUNT(*) AS receipts,SUM(effect_count) AS effects FROM dbo.demo_synthetic_effects FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`))
    assert.deepEqual(result, { receipts: 2, effects: 2 })
  })
})
