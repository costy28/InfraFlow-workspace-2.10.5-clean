'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createRegistry, validateRegistry, queueTrial, applyCommand, canAccessTrial } = require('../../scripts/lib/demo-trial-registry')
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222'
const NOW = Date.parse('2026-10-22T10:00:00Z'), DAY = 86400000
function queued() { return queueTrial(createRegistry(), { id: A, approvalId: 'approval-1', now: NOW }) }
function cmd(r, action, extra = {}) {
  const row = r.trials.find(t => t.id === (extra.trialId || A))
  return { trialId: row.id, commandId: `${action}:${row.revision}`, expectedRevision: row.revision,
    action, actor: { kind: 'worker', id: 'worker-1' }, now: NOW, ...extra }
}
function active() {
  let r = queued()
  for (const a of ['provision', 'ready']) r = applyCommand(r, cmd(r, a))
  return applyCommand(r, cmd(r, 'activate', { actor: { kind: 'activation_agent', id: 'activation-1' } }))
}
function code(f, value) { assert.throws(f, e => e.code === value) }
test('aprobare idempotentă, resurse distincte și refuzul reatribuirii', () => {
  const r = queued()
  assert.deepEqual(queueTrial(r, { id: A, approvalId: 'approval-1', now: NOW }), r)
  code(() => queueTrial(r, { id: B, approvalId: 'approval-1', now: NOW }), 'approval_already_bound')
  const two = queueTrial(r, { id: B, approvalId: 'approval-2', now: NOW })
  assert.notDeepEqual(two.trials[0].resources, two.trials[1].resources)
  const changed = structuredClone(r); changed.trials[0].resources.database = 'INFRAFLOW_DEMO'
  code(() => validateRegistry(changed), 'invalid_resource_binding')
  assert.equal(r.trials.length, 1)
})
test('activare unică, exact 15 zile, acces refuzat la termen fără worker', () => {
  const r = active(), row = r.trials[0]
  assert.equal(row.expiresAt, NOW + 15 * DAY)
  assert.equal(canAccessTrial(r, A, row.expiresAt - 1), true)
  assert.equal(canAccessTrial(r, A, row.expiresAt), false)
  code(() => applyCommand(r, cmd(r, 'activate', { actor: { kind: 'activation_agent', id: 'agent' } })), 'invalid_transition')
  assert.equal(canAccessTrial(r, B, NOW), false)
})
test('retry identic nu dublează auditul și CAS refuză o operație învechită', () => {
  const r = queued(), command = cmd(r, 'provision'), next = applyCommand(r, command)
  assert.deepEqual(applyCommand(JSON.parse(JSON.stringify(next)), command), next)
  code(() => applyCommand(next, { ...command, now: NOW + 1 }), 'command_id_reused')
  code(() => applyCommand(next, { ...cmd(next, 'ready'), expectedRevision: 0 }), 'revision_conflict')
  assert.equal(r.trials[0].state, 'queued')
})
test('trialul nu poate controla termenul, ștergerea sau resursele', () => {
  const r = active(), actor = { kind: 'tenant_admin', id: 'tenant-user' }
  code(() => applyCommand(r, cmd(r, 'extend', { actor, expiresAt: NOW + 20 * DAY })), 'forbidden')
  code(() => applyCommand(r, cmd(r, 'expire', { actor, now: NOW + 15 * DAY })), 'forbidden')
  code(() => applyCommand(r, { ...cmd(r, 'expire'), database: 'other' }), 'unknown_command_field')
  code(() => applyCommand(r, cmd(r, 'activate', { expiresAt: NOW + DAY })), 'unexpected_expiry')
})
test('prelungirea anulează logic jobul vechi; ștergerea începută nu permite prelungire', () => {
  let r = active(), now = NOW + 15 * DAY
  for (const a of ['expire', 'queue_purge']) r = applyCommand(r, cmd(r, a, { now }))
  const stale = cmd(r, 'begin_purge', { now })
  r = applyCommand(r, cmd(r, 'extend', { now, expiresAt: NOW + 20 * DAY, actor: { kind: 'platform_admin', id: 'operator' } }))
  code(() => applyCommand(r, stale), 'revision_conflict')
  code(() => applyCommand(r, cmd(r, 'expire', { now })), 'not_expired')
  now = NOW + 20 * DAY
  for (const a of ['expire', 'queue_purge', 'begin_purge']) r = applyCommand(r, cmd(r, a, { now }))
  code(() => applyCommand(r, cmd(r, 'extend', { now, expiresAt: NOW + 25 * DAY, actor: { kind: 'platform_admin', id: 'operator' } })), 'invalid_transition')
})
test('eșecul păstrează purging; deleted cere confirmarea tuturor resurselor; B rămâne identic', () => {
  let r = queueTrial(active(), { id: B, approvalId: 'approval-2', now: NOW })
  const beforeB = structuredClone(r.trials[1]), now = NOW + 15 * DAY
  for (const a of ['expire', 'queue_purge', 'begin_purge', 'purge_failed']) r = applyCommand(r, cmd(r, a, { now }))
  code(() => applyCommand(r, cmd(r, 'complete_purge', { now, released: { database: true } })), 'resources_not_released')
  r = applyCommand(r, cmd(r, 'complete_purge', { now, released: { database: true, storage: true, appKey: true, runtime: true, routing: true, backups: true } }))
  assert.equal(r.trials[0].state, 'deleted'); assert.deepEqual(r.trials[1], beforeB)
  assert.equal(canAccessTrial(r, A, now), false)
  code(() => applyCommand(r, cmd(r, 'provision', { now })), 'invalid_transition')
})
test('date corupte, întoarcerea ceasului și stări necunoscute nu acordă acces', () => {
  const r = active()
  for (const expiresAt of [null, NaN, '2026-10-22']) {
    const copy = structuredClone(r); copy.trials[0].expiresAt = expiresAt
    assert.equal(canAccessTrial(copy, A, NOW), false)
  }
  const copy = structuredClone(r); copy.trials[0].state = 'unknown'
  assert.equal(canAccessTrial(copy, A, NOW), false)
  code(() => applyCommand(r, cmd(r, 'extend', { now: NOW - 1, expiresAt: NOW + 20 * DAY, actor: { kind: 'platform_admin', id: 'operator' } })), 'time_reversal')
})
