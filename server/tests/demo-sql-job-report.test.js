'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { prepareJobReport, renderJobReport } = require('../../scripts/lib/demo-sql-job-report')
const { createSqlTestTrialStore } = require('../core/demo-trial-sql-test-store')
const { createTrialSqlFixture } = require('./support/demo-trial-sql-fixture')
const trialId = '11111111-1111-4111-8111-111111111111'
const pending = revision => ({ revision, generation: 0, state: 'pending', claimedAt: null, leaseUntil: null,
  completedAt: null, receiptPresent: false, firstEffectGeneration: null })
const leased = revision => ({ ...pending(revision), state: 'leased', generation: 1, claimedAt: 2000, leaseUntil: 2100 })
test('raport pur: termen exact și revizie depășită sunt diagnostice, nu mutații', () => {
  const data = { trialId, currentRevision: 1, jobs: [pending(0), leased(1)] }, before = JSON.stringify(data)
  const report = prepareJobReport(data, { trialId, now: 2100 })
  assert.deepEqual(report.jobs.map(j => j.state), ['superseded','lease_expired'])
  assert.equal(report.jobs[0].persistedState, 'pending'); assert.equal(report.jobs[1].persistedState, 'leased')
  assert.equal(report.summary.lease_expired, 1); assert.equal(report.executionAllowed, false)
  assert.equal(JSON.stringify(data), before)
})
test('raportul și HTML-ul nu reflectă worker, aprobare, DB, path, nonce sau payload arbitrar', () => {
  const data = { trialId, currentRevision: 0, jobs: [{ ...leased(0), workerId: 'SECRET_WORKER', nonce: 'SECRET_NONCE', snapshot: '<script>SECRET_PAYLOAD</script>' }], database: 'SECRET_DATABASE', approval: 'SECRET_APPROVAL' }
  const report = prepareJobReport(data, { trialId, now: 2050 }), html = renderJobReport(report)
  assert.doesNotMatch(JSON.stringify(report) + html, /SECRET_|<script|<form|<button|<input|https?:\/\//i)
  assert.match(html, /numai citire/); assert.match(html, /default-src/)
})
test('raportul refuză date corupte, dubluri, ceas întors și mai mult de 100 joburi', () => {
  const base = { trialId, currentRevision: 1, jobs: [leased(1)] }
  for (const data of [{ ...base, jobs: [leased(1),leased(1)] },{ ...base, jobs: [{ ...leased(1), state: 'unknown' }] },
    { ...base, jobs: [{ ...pending(1), generation: 2 }] },{ ...base, currentRevision: 0 },
    { ...base, currentRevision: 100, jobs: Array.from({ length: 101 }, (_, i) => pending(i)) }]) {
    assert.throws(() => prepareJobReport(data, { trialId, now: 2050 }), { code: 'invalid_synthetic_job_report' })
  }
  assert.throws(() => prepareJobReport(base, { trialId, now: 1999 }), { code: 'invalid_synthetic_job_report' })
})
test('HTML refuză un raport care pretinde autoritate de execuție', () => {
  const report = prepareJobReport({ trialId, currentRevision: 0, jobs: [pending(0)] }, { trialId, now: 2000 })
  assert.throws(() => renderJobReport({ ...report, executionAllowed: true }), { code: 'invalid_synthetic_job_report' })
})
test('raport SQL: intrări invalide refuzate înainte de executor', async t => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  t.after(() => { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous })
  const store = createSqlTestTrialStore({ database: 'INFRAFLOW_TEST_TRIALS_0123456789AB', execute: () => assert.fail('must not execute') })
  for (const input of [{ trialId, now: -1 },{ trialId: '../other', now: 2000 },{ trialId, now: 2000, path: '../other' }]) {
    await assert.rejects(store.readJobReport(input), { code: 'invalid_synthetic_job_request' })
  }
})
test('SQL real: raport fără scrieri și fără secrete, pentru stări și receipt', {
  skip: process.env.INFRAFLOW_TEST_TRIAL_SQL !== '1', timeout: 180000,
}, async t => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  t.after(() => { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous })
  const fixture = await createTrialSqlFixture(), store = createSqlTestTrialStore(fixture)
  await store.initialize(); await store.queue({ id: trialId, approvalId: 'SECRET_APPROVAL', now: 1000 })
  const command = (commandId, action, expectedRevision, now) => ({ trialId, commandId, action, expectedRevision, now, actor: { id: 'test-controller', kind: 'worker' } })
  await store.command(command('start', 'provision', 0, 1001))
  async function snapshot() {
    return fixture.execute(fixture.database, `SELECT
      JSON_QUERY((SELECT * FROM dbo.demo_registry ORDER BY singleton FOR JSON PATH)) AS registry,
      JSON_QUERY((SELECT * FROM dbo.demo_trials ORDER BY trial_id FOR JSON PATH)) AS trials,
      JSON_QUERY((SELECT * FROM dbo.demo_commands ORDER BY trial_id,command_id FOR JSON PATH)) AS commands,
      JSON_QUERY((SELECT * FROM dbo.demo_events ORDER BY trial_id,revision FOR JSON PATH)) AS events,
      JSON_QUERY((SELECT * FROM dbo.demo_outbox ORDER BY trial_id,revision FOR JSON PATH)) AS jobs,
      JSON_QUERY((SELECT * FROM dbo.demo_synthetic_effects ORDER BY trial_id,revision FOR JSON PATH)) AS effects
      FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`)
  }
  async function readOnly(now) {
    const before = await snapshot(), report = await store.readJobReport({ trialId, now })
    assert.equal(await snapshot(), before)
    assert.doesNotMatch(JSON.stringify(report) + renderJobReport(report), /SECRET_|INFRAFLOW_TEST|worker_id|snapshot|nonce/i)
    return report
  }
  let job
  const identity = (j, now) => ({ trialId, revision: j.revision, generation: j.generation, workerId: j.workerId, now })
  await t.test('pending și job depășit sunt vizibile fără a marca jobul superseded în DB', async () => {
    const report = await readOnly(2000)
    assert.deepEqual(report.jobs.map(j => j.state), ['superseded','pending'])
    assert.equal(report.jobs[0].persistedState, 'pending')
  })
  await t.test('leased și expirat la termen sunt distincte; receipt-ul nu autorizează confirmarea', async () => {
    job = (await store.claimJob({ trialId, workerId: 'SECRET_WORKER', now: 2000, leaseMs: 100 })).job
    await store.applySyntheticEffect(identity(job, 2050))
    assert.equal((await readOnly(2050)).jobs[1].state, 'leased')
    const expired = await readOnly(2100)
    assert.equal(expired.jobs[1].state, 'lease_expired'); assert.equal(expired.jobs[1].receiptPresent, true)
    await assert.rejects(store.completeJob(identity(job, 2100)), { code: 'job_lease_refused' })
  })
  await t.test('generație nouă/completed și următorul pending; trial necunoscut refuzat', async () => {
    job = (await store.claimJob({ trialId, workerId: 'replacement', now: 2100, leaseMs: 100 })).job
    await store.completeJob(identity(job, 2101))
    await store.command(command('ready', 'ready', 1, 2200))
    const report = await readOnly(2300)
    assert.deepEqual(report.jobs.map(j => j.state), ['superseded','completed','pending'])
    assert.equal(report.jobs[1].generation, 2); assert.equal(report.jobs[1].firstEffectGeneration, 1)
    await assert.rejects(store.readJobReport({ trialId: '22222222-2222-4222-8222-222222222222', now: 2300 }), { code: 'job_report_trial_not_found' })
  })
})
