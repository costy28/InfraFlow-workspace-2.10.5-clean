'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const model = require('../../scripts/lib/demo-trial-registry')
const { planRetention, assertCurrentRetentionPlan } = require('../../scripts/lib/demo-retention-plan')
const trialId = '11111111-1111-4111-8111-111111111111', DAY = 86400000, start = Date.parse('2026-10-24T09:00:00Z')
// Test values only, NOT an installed/default retention policy.
const policy = { enabled: true, dataRetentionDays: 2, backupRetentionDays: 7 }
function fixture() {
  let r = model.queueTrial(model.createRegistry(), { id: trialId, approvalId: 'retention', now: start })
  for (const action of ['provision','ready','activate']) r = model.applyCommand(r, { trialId, commandId: action,
    expectedRevision: r.trials[0].revision, action, now: start,
    actor: { id: 'test-worker', kind: action === 'activate' ? 'activation_agent' : 'worker' } })
  const expiry = r.trials[0].expiresAt
  r = model.applyCommand(r, { trialId, commandId: 'expire', action: 'expire', expectedRevision: 3, now: expiry, actor: { id: 'worker', kind: 'worker' } })
  return { r, expiry }
}
test('fără politică explicită: blocat; planul nu acordă niciodată drept de execuție', () => {
  const { r, expiry } = fixture(), before = structuredClone(r)
  const plan = planRetention(r, { trialId, now: expiry + 30 * DAY })
  assert.equal(plan.eligibility, 'blocked'); assert.equal(plan.executionAllowed, false)
  assert.ok(plan.reasons.includes('retention_not_enabled')); assert.equal(plan.earliestCompleteCleanupAt, null)
  assert.deepEqual(r, before)
})
test('retenție distinctă date/backup; cheia se păstrează până la cel mai lung termen', () => {
  const { r, expiry } = fixture()
  const early = planRetention(r, { trialId, now: expiry + 2 * DAY, policy })
  assert.equal(early.eligibility, 'retained')
  assert.equal(early.targets.find(t => t.kind === 'database').eligibleAfter, expiry + 2 * DAY)
  assert.equal(early.targets.find(t => t.kind === 'appKey').eligibleAfter, expiry + 7 * DAY)
  assert.equal(planRetention(r, { trialId, now: expiry + 7 * DAY - 1, policy }).eligibility, 'retained')
  const due = planRetention(r, { trialId, now: expiry + 7 * DAY, policy })
  assert.equal(due.eligibility, 'candidate'); assert.equal(due.executionAllowed, false)
  assert.equal(due.targets.length, 6); assert.ok(due.requiredBeforeExecution.includes('complete_backup_inventory'))
  assert.deepEqual(assertCurrentRetentionPlan(r, due, { now: due.asOf + 1, policy }).binding, due.binding)
})
test('prelungire sau politică schimbată invalidează planul vechi', () => {
  const { r, expiry } = fixture(), now = expiry + 7 * DAY
  const plan = planRetention(r, { trialId, now, policy })
  const changed = model.applyCommand(r, { trialId, commandId: 'admin-extend', expectedRevision: 4, action: 'extend',
    now, expiresAt: now + DAY, actor: { id: 'admin', kind: 'platform_admin' } })
  assert.throws(() => assertCurrentRetentionPlan(changed, plan, { now, policy }), { code: 'retention_plan_stale' })
  assert.throws(() => assertCurrentRetentionPlan(r, plan, { now, policy: { ...policy, backupRetentionDays: 8 } }), { code: 'retention_plan_stale' })
})
test('ținte modificate, câmpuri injectate și resurse din alt trial sunt refuzate', () => {
  const { r, expiry } = fixture(), now = expiry + 7 * DAY
  const plan = planRetention(r, { trialId, now, policy })
  for (const change of [p => { p.targets[0].reference = 'INFRAFLOW_PRODUCTION' }, p => { p.path = 'C:/' }, p => { p.executionAllowed = true }]) {
    const altered = structuredClone(plan); change(altered)
    assert.throws(() => assertCurrentRetentionPlan(r, altered, { now, policy }), { code: 'retention_plan_stale' })
  }
  const corrupted = structuredClone(r); corrupted.trials[0].resources.database = 'OTHER'
  assert.throws(() => planRetention(corrupted, { trialId, now, policy }), { code: 'invalid_resource_binding' })
})
test('politici/timp invalide și overflow sunt refuzate', () => {
  const { r, expiry } = fixture()
  for (const invalid of [null, {}, { ...policy, enabled: 'yes' }, { ...policy, dataRetentionDays: -1 },
    { ...policy, backupRetentionDays: 0.5 }, { ...policy, dataRetentionDays: null }, { ...policy, backups: false }]) {
    assert.throws(() => planRetention(r, { trialId, now: expiry, policy: invalid }), { code: 'invalid_retention_policy' })
  }
  assert.throws(() => planRetention(r, { trialId, now: -1, policy }), { code: 'invalid_retention_time' })
  assert.throws(() => planRetention(r, { trialId: 'unknown', now: expiry, policy }), { code: 'trial_not_found' })
  const far = structuredClone(r), row = far.trials[0]
  row.activatedAt = 8640000000000000 - 17 * DAY; row.expiresAt = 8640000000000000 - 16 * DAY
  assert.throws(() => planRetention(far, { trialId, now: row.expiresAt, policy: { ...policy, backupRetentionDays: 3650 } }), { code: 'retention_deadline_overflow' })
})
test('doar expired/purge_pending sunt candidate; activ și purge început rămân blocate', () => {
  const { r, expiry } = fixture(), now = expiry + 7 * DAY
  const queued = model.applyCommand(r, { trialId, commandId: 'queue', expectedRevision: 4, action: 'queue_purge', now,
    actor: { id: 'worker', kind: 'worker' } })
  assert.equal(planRetention(queued, { trialId, now, policy }).eligibility, 'candidate')
  const purging = model.applyCommand(queued, { trialId, commandId: 'begin', expectedRevision: 5, action: 'begin_purge', now,
    actor: { id: 'worker', kind: 'worker' } })
  assert.equal(planRetention(purging, { trialId, now, policy }).eligibility, 'blocked')
  const active = model.applyCommand(r, { trialId, commandId: 'extend', expectedRevision: 4, action: 'extend', now,
    expiresAt: now + DAY, actor: { id: 'admin', kind: 'platform_admin' } })
  assert.equal(planRetention(active, { trialId, now: now + 20 * DAY, policy }).eligibility, 'blocked')
})
test('dry-run peste registrul TEMP: baza, cheia, backupul și registrul rămân identice', async t => {
  const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os')
  const { createSyntheticTrialStore } = require('../../scripts/lib/demo-trial-store')
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'infraflow-trial-store-'))
  t.after(async () => {
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('infraflow-trial-store-'))
    await fs.rm(dir, { recursive: true, force: true })
  })
  const { r, expiry } = fixture()
  await fs.writeFile(path.join(dir, 'registry.json'), JSON.stringify(r))
  for (const file of ['instance.json','instance.key','backup-test.json']) await fs.writeFile(path.join(dir, file), 'synthetic retained fixture', { flag: 'wx', mode: 0o600 })
  const files = await fs.readdir(dir), before = await Promise.all(files.map(f => fs.readFile(path.join(dir, f))))
  const store = createSyntheticTrialStore(dir)
  const plan = planRetention(await store.read(), { trialId, now: expiry + 7 * DAY, policy })
  assert.equal(plan.eligibility, 'candidate'); assert.equal(plan.executionAllowed, false)
  assertCurrentRetentionPlan(await store.read(), plan, { now: plan.asOf, policy })
  assert.deepEqual(await fs.readdir(dir), files)
  assert.deepEqual(await Promise.all(files.map(f => fs.readFile(path.join(dir, f)))), before)
})
