'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { createSqlTestTrialStore } = require('../core/demo-trial-sql-test-store')
const { createTrialSqlFixture } = require('./support/demo-trial-sql-fixture')
const trialId = '11111111-1111-4111-8111-111111111111', otherId = '22222222-2222-4222-8222-222222222222'
test('joburi SQL: intrările invalide sunt refuzate înainte de executor', async () => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  try {
    let calls = 0
    const store = createSqlTestTrialStore({ database: 'INFRAFLOW_TEST_TRIALS_0123456789AB', execute: () => { calls++; assert.fail('must not execute') } })
    const valid = { trialId, workerId: 'worker-a', now: 2000, leaseMs: 100 }
    for (const change of [{ trialId: '../foreign' },{ workerId: 123 },{ workerId: 'a;DROP' },{ now: -1 },
      { leaseMs: 0 },{ leaseMs: 60001 },{ now: Number.MAX_SAFE_INTEGER },{ path: 'storage/other' }]) {
      await assert.rejects(store.claimJob({ ...valid, ...change }), { code: 'invalid_synthetic_job_request' })
    }
    const ack = { trialId, workerId: 'worker-a', now: 2001, revision: 0, generation: 1 }
    for (const change of [{ generation: 0 },{ revision: 2147483648 },{ revision: -1 },{ leaseUntil: 9000 }]) {
      await assert.rejects(store.completeJob({ ...ack, ...change }), { code: 'invalid_synthetic_job_request' })
    }
    assert.equal(calls, 0)
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous }
})
test('SQL real: revendicare unică, lease expirat și confirmare cu generație', {
  skip: process.env.INFRAFLOW_TEST_TRIAL_SQL !== '1', timeout: 180000,
}, async t => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  t.after(() => { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous })
  const fixture = await createTrialSqlFixture(), make = () => createSqlTestTrialStore(fixture), a = make(), b = make()
  await a.initialize(); await b.initialize()
  console.log(`Bază SQL joburi de test păstrată: ${fixture.database}`)
  await a.queue({ id: trialId, approvalId: 'jobs-a', now: 1000 })
  await b.queue({ id: otherId, approvalId: 'jobs-b', now: 1000 })
  const baseline = await a.read()
  let first, peer
  const claim = (id, workerId, now = 2000) => ({ trialId: id, workerId, now, leaseMs: 100 })
  const ack = (job, now, extra = {}) => ({ trialId: job.trialId, workerId: job.workerId,
    revision: job.revision, generation: job.generation, now, ...extra })
  await t.test('doi workeri concurenți: unul primește jobul, celălalt nu; trialul vecin rămâne disponibil', async () => {
    const results = await Promise.all([a.claimJob(claim(trialId, 'worker-a')), b.claimJob(claim(trialId, 'worker-b'))])
    assert.equal(results.filter(r => r.job).length, 1)
    first = results.find(r => r.job).job
    assert.equal(first.generation, 1); assert.equal(first.leaseUntil, 2100)
    peer = (await b.claimJob(claim(otherId, 'peer-worker'))).job
    assert.equal(peer.trialId, otherId)
    assert.deepEqual(await a.read(), baseline)
  })
  await t.test('la termen ack-ul vechi este refuzat; reatribuirea crește generația și confirmarea este idempotentă', async () => {
    await assert.rejects(a.completeJob(ack(first, 2100)), { code: 'job_lease_refused' })
    const second = (await b.claimJob(claim(trialId, 'new-worker', 2100))).job
    assert.equal(second.generation, 2)
    await assert.rejects(a.completeJob(ack(first, 2101)), { code: 'job_lease_refused' })
    await assert.rejects(a.completeJob(ack(second, 2101, { workerId: 'NEW-WORKER' })), { code: 'job_lease_refused' })
    assert.deepEqual(await make().completeJob(ack(second, 2101)), { status: 'completed' })
    assert.deepEqual(await a.completeJob(ack(second, 3000)), { status: 'already_completed' })
    assert.equal((await a.claimJob(claim(trialId, 'third-worker', 3000))).job, null)
  })
  await t.test('același worker reia cu generație nouă; vechea generație și timpul anterior claimului nu confirmă', async () => {
    const renewed = (await b.claimJob(claim(otherId, 'peer-worker', 2100))).job
    assert.equal(renewed.generation, peer.generation + 1)
    await assert.rejects(b.completeJob(ack(peer, 2101)), { code: 'job_lease_refused' })
    await assert.rejects(b.completeJob(ack(renewed, 2099)), { code: 'job_lease_refused' })
    assert.deepEqual(await b.completeJob(ack(renewed, 2101)), { status: 'completed' })
  })
  await t.test('o revizie nouă invalidează jobul vechi chiar înainte de expirarea lease-ului', async () => {
    const command = (commandId, action, revision) => ({ trialId, commandId, action, expectedRevision: revision,
      now: 4000, actor: { kind: 'worker', id: 'test-controller' } })
    await a.command(command('start', 'provision', 0))
    const stale = (await a.claimJob(claim(trialId, 'slow-worker', 4000))).job
    assert.equal(stale.revision, 1)
    await b.command(command('ready', 'ready', 1))
    await assert.rejects(a.completeJob(ack(stale, 4001)), { code: 'job_lease_refused' })
    const current = (await b.claimJob(claim(trialId, 'current-worker', 4001))).job
    assert.equal(current.revision, 2)
    assert.deepEqual(await b.completeJob(ack(current, 4002)), { status: 'completed' })
    const state = JSON.parse(await fixture.execute(fixture.database,
      `SELECT state FROM dbo.demo_outbox WHERE trial_id=CONVERT(uniqueidentifier,JSON_VALUE(@json,'$.trialId')) AND revision=1 FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`, { trialId }))
    assert.equal(state.state, 'superseded')
    const final = await a.read()
    assert.deepEqual(final.trials.find(r => r.id === otherId), baseline.trials.find(r => r.id === otherId))
  })
  await t.test('trial inexistent nu poate crea sau confirma un job', async () => {
    const unknown = '33333333-3333-4333-8333-333333333333'
    assert.equal((await a.claimJob(claim(unknown, 'unknown-worker'))).job, null)
    await assert.rejects(a.completeJob({ trialId: unknown, workerId: 'unknown-worker', now: 2000, revision: 0, generation: 1 }), { code: 'job_lease_refused' })
  })
})
