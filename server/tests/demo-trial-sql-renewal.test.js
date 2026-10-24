'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { createSqlTestTrialStore } = require('../core/demo-trial-sql-test-store')
const { createTrialSqlFixture } = require('./support/demo-trial-sql-fixture')
const trialId = '11111111-1111-4111-8111-111111111111'
test('reînnoire: durate, câmpuri și termene invalide nu ajung la SQL', async () => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  try {
    const store = createSqlTestTrialStore({ database: 'INFRAFLOW_TEST_TRIALS_0123456789AB', execute: () => assert.fail('must not execute') })
    const input = { trialId, workerId: 'worker-a', revision: 0, generation: 1, now: 2050, leaseMs: 150, expectedLeaseUntil: 2100 }
    for (const extra of [{ leaseMs: 0 },{ leaseMs: 60001 },{ expectedLeaseUntil: null },{ expectedLeaseUntil: -1 },{ generation: 0 },{ resource: '../other' }]) {
      await assert.rejects(store.renewJob({ ...input, ...extra }), { code: 'invalid_synthetic_job_request' })
    }
    await assert.rejects(store.applySyntheticEffect({ ...input }), { code: 'invalid_synthetic_job_request' })
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous }
})
test('SQL real: heartbeat și reluare cu efect sintetic idempotent', {
  skip: process.env.INFRAFLOW_TEST_TRIAL_SQL !== '1', timeout: 180000,
}, async t => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  t.after(() => { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous })
  const fixture = await createTrialSqlFixture(), make = () => createSqlTestTrialStore(fixture), a = make(), b = make()
  await a.initialize()
  await a.queue({ id: trialId, approvalId: 'renew-and-replay', now: 1000 })
  let job = (await a.claimJob({ trialId, workerId: 'worker-a', now: 2000, leaseMs: 100 })).job
  const identity = (j, now) => ({ trialId: j.trialId, workerId: j.workerId, revision: j.revision, generation: j.generation, now })
  const renew = (j, now, expectedLeaseUntil, leaseMs = 150) => ({ ...identity(j, now), expectedLeaseUntil, leaseMs })
  await t.test('reînnoirea activă păstrează generația și împiedică preluarea la vechiul termen', async () => {
    assert.deepEqual(await a.renewJob(renew(job, 2050, 2100)), { status: 'renewed', leaseUntil: 2200, generation: 1 })
    assert.equal((await b.claimJob({ trialId, workerId: 'worker-b', now: 2100, leaseMs: 100 })).job, null)
    await assert.rejects(a.renewJob(renew(job, 2060, 2100)), { code: 'job_lease_refused' })
    await assert.rejects(a.renewJob(renew(job, 2060, 2200, 10)), { code: 'job_lease_refused' })
  })
  await t.test('heartbeat simultan pe același termen are un câștigător; alt worker și timpul anterior claimului sunt refuzate', async () => {
    await assert.rejects(a.renewJob({ ...renew(job, 2100, 2200), workerId: 'worker-b' }), { code: 'job_lease_refused' })
    await assert.rejects(a.renewJob(renew(job, 1999, 2200)), { code: 'job_lease_refused' })
    const results = await Promise.allSettled([a.renewJob(renew(job, 2100, 2200, 300)), b.renewJob(renew(job, 2100, 2200, 300))])
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'job_lease_refused')
  })
  await t.test('efectul se persistă înainte de confirmare; workerul expirat nu reînnoiește și nu repetă efectul', async () => {
    const effects = await Promise.all([a.applySyntheticEffect(identity(job, 2201)), b.applySyntheticEffect(identity(job, 2201))])
    assert.deepEqual(effects.map(result => result.status).sort(), ['applied','replayed'])
    assert.ok(effects.every(result => result.effectCount === 1))
    // Deliberately omit completeJob: simulate lost coordinator/ack after the effect was saved.
    await assert.rejects(a.renewJob(renew(job, 2400, 2400)), { code: 'job_lease_refused' })
    await assert.rejects(a.applySyntheticEffect(identity(job, 2400)), { code: 'job_lease_refused' })
    await assert.rejects(a.completeJob(identity(job, 2400)), { code: 'job_lease_refused' })
  })
  await t.test('client și generație noi regăsesc efectul fără dublare și confirmă o singură execuție sintetică', async () => {
    const next = (await make().claimJob({ trialId, workerId: 'worker-b', now: 2400, leaseMs: 100 })).job
    assert.equal(next.generation, 2)
    await assert.rejects(a.renewJob(renew(job, 2401, 2500)), { code: 'job_lease_refused' })
    assert.deepEqual(await b.applySyntheticEffect(identity(next, 2401)), { status: 'replayed', effectCount: 1 })
    assert.deepEqual(await b.completeJob(identity(next, 2402)), { status: 'completed' })
    assert.deepEqual(await make().completeJob(identity(next, 2403)), { status: 'already_completed' })
    await assert.rejects(b.renewJob(renew(next, 2403, 2500)), { code: 'job_lease_refused' })
    const receipt = JSON.parse(await fixture.execute(fixture.database,
      `SELECT COUNT(*) AS receipts,SUM(effect_count) AS effects,MIN(first_generation) AS firstGeneration FROM dbo.demo_synthetic_effects FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`))
    assert.deepEqual(receipt, { receipts: 1, effects: 1, firstGeneration: 1 })
    job = next
  })
  await t.test('revizia nouă refuză și heartbeatul, și efectul unui job anterior încă neexpirat', async () => {
    const command = (commandId, action, expectedRevision) => ({ trialId, commandId, action, expectedRevision,
      now: 3000, actor: { id: 'test-controller', kind: 'worker' } })
    await a.command(command('start-after-replay', 'provision', 0))
    const stale = (await a.claimJob({ trialId, workerId: 'stale-worker', now: 3000, leaseMs: 100 })).job
    await b.command(command('ready-after-replay', 'ready', 1))
    await assert.rejects(a.renewJob(renew(stale, 3001, 3100)), { code: 'job_lease_refused' })
    await assert.rejects(a.applySyntheticEffect(identity(stale, 3001)), { code: 'job_lease_refused' })
  })
})
