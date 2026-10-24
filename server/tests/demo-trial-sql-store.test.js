'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { createSqlTestTrialStore } = require('../core/demo-trial-sql-test-store')
const { createTrialSqlFixture } = require('./support/demo-trial-sql-fixture')
test('registrul SQL refuză runtime-ul normal și bazele ERP înainte de orice executor', () => {
  const previous = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'test'
    for (const database of ['INFRAFLOW_DEMO','master','INFRAFLOW_TEST_TRIALS_invalid']) {
      assert.throws(() => createSqlTestTrialStore({ database, execute: () => assert.fail('must not execute') }), { code: 'synthetic_sql_database_required' })
    }
    process.env.NODE_ENV = 'production'
    assert.throws(() => createSqlTestTrialStore({ database: 'INFRAFLOW_TEST_TRIALS_0123456789AB', execute: () => {} }), { code: 'synthetic_sql_database_required' })
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous }
})
test('SQL real separat: CAS, unicitate, rollback și outbox atomic', {
  skip: process.env.INFRAFLOW_TEST_TRIAL_SQL !== '1', timeout: 180000,
}, async t => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  t.after(() => { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous })
  const fixture = await createTrialSqlFixture(), make = () => createSqlTestTrialStore(fixture)
  const a = make(), b = make()
  await a.initialize(); await b.initialize()
  // The dedicated control-plane proof DB is retained, never a tenant/app DB.
  console.log(`Bază registru SQL de test păstrată: ${fixture.database}`)
  const ids = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444']
  const queue = (id, approvalId) => ({ id, approvalId, now: 1000 })
  const command = (trialId, commandId, action = 'provision', expectedRevision = 0) => ({ trialId, commandId, action,
    expectedRevision, now: 1001, actor: { id: 'synthetic-worker', kind: 'worker' } })
  async function counts() {
    return JSON.parse(await fixture.execute(fixture.database, `SELECT
      (SELECT COUNT(*) FROM dbo.demo_trials) AS trials,(SELECT COUNT(*) FROM dbo.demo_commands) AS commands,
      (SELECT COUNT(*) FROM dbo.demo_events) AS events,(SELECT COUNT(*) FROM dbo.demo_outbox) AS jobs,
      (SELECT COUNT(*) FROM dbo.demo_outbox WHERE state<>'pending') AS executedJobs
      FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`))
  }
  await t.test('două conexiuni adaugă trialuri distincte fără lost update; retry queue nu dublează jobul', async () => {
    await Promise.all([a.queue(queue(ids[0], 'approval-a')), b.queue(queue(ids[1], 'approval-b'))])
    const before = await counts(); assert.equal(before.trials, 2); assert.equal(before.jobs, 2)
    await make().queue(queue(ids[0], 'approval-a'))
    assert.deepEqual(await counts(), before)
  })
  await t.test('aceeași revizie: un singur câștigător și conflict explicit', async () => {
    const result = await Promise.allSettled([a.command(command(ids[0], 'compete-a')), b.command(command(ids[0], 'compete-b'))])
    assert.equal(result.filter(r => r.status === 'fulfilled').length, 1)
    assert.equal(result.find(r => r.status === 'rejected').reason.code, 'revision_conflict')
    assert.equal((await a.read()).trials.find(r => r.id === ids[0]).revision, 1)
  })
  await t.test('retry concurent identic nu dublează comandă, audit sau job', async () => {
    const input = command(ids[1], 'same-command')
    await Promise.all([a.command(input), b.command(input)])
    const snapshot = await make().read(), trial = snapshot.trials.find(r => r.id === ids[1])
    assert.equal(trial.revision, 1); assert.equal(trial.events.length, 1)
    assert.deepEqual(await counts(), { trials: 2, commands: 2, events: 2, jobs: 4, executedJobs: 0 })
  })
  await t.test('aceeași aprobare concurentă nu poate crea două companii', async () => {
    const result = await Promise.allSettled([a.queue(queue(ids[2], 'shared-approval')), b.queue(queue(ids[3], 'shared-approval'))])
    assert.equal(result.filter(r => r.status === 'fulfilled').length, 1)
    assert.equal(result.find(r => r.status === 'rejected').reason.code, 'approval_already_bound')
    assert.equal((await counts()).trials, 3)
  })
  await t.test('eroare înainte de COMMIT: registry, proiecții și outbox sunt restaurate împreună', async () => {
    const before = await a.read(), beforeCounts = await counts()
    await assert.rejects(a.command(command(ids[0], 'rollback-ready', 'ready', 1), { fault: 'before_commit' }),
      { code: 'synthetic_sql_execution_failed', sqlNumber: 51102 })
    assert.deepEqual(await make().read(), before); assert.deepEqual(await counts(), beforeCounts)
  })
  await t.test('confirmare simulată pierdută după COMMIT: client nou și retry fără dubluri', async () => {
    const input = command(ids[0], 'committed-ready', 'ready', 1), before = await counts()
    await assert.rejects(a.command(input, { fault: 'after_commit_ack' }), { code: 'synthetic_commit_ack_lost' })
    const fresh = make(), committed = await fresh.read()
    assert.equal(committed.trials.find(r => r.id === ids[0]).state, 'awaiting_activation')
    assert.deepEqual(await fresh.command(input), committed)
    assert.deepEqual(await counts(), { ...before, commands: before.commands + 1, events: before.events + 1, jobs: before.jobs + 1 })
  })
  await t.test('constrângerea SQL refuză aprobarea duplicată chiar în afara reducerului', async () => {
    const before = await counts()
    await assert.rejects(fixture.execute(fixture.database,
      `UPDATE dbo.demo_trials SET approval_id='approval-a' WHERE trial_id=CONVERT(uniqueidentifier,JSON_VALUE(@json,'$.id')); SELECT 1;`, { id: ids[1] }),
    error => error.code === 'synthetic_sql_execution_failed' && [2601,2627].includes(error.sqlNumber))
    assert.deepEqual(await counts(), before)
  })
})
