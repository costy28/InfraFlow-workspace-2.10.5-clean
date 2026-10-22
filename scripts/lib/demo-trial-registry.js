'use strict'
// Offline control-plane model only. Not imported by the application or a worker.
// No SQL, filesystem, process, network or deletion operations.
const crypto = require('node:crypto')
const FORMAT = 'infraflow-demo-trials-v1'
const DAY = 86400000
const states = new Set(['queued', 'provisioning', 'awaiting_activation', 'active', 'expired', 'purge_pending', 'purging', 'deleted'])
const releasedKeys = ['database', 'storage', 'appKey', 'runtime', 'routing', 'backups']
function check(ok, code) { if (!ok) { const e = new Error(code); e.code = code; throw e } }
function identifier(value) { return typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(value) }
function uuid(value) { return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value) }
function time(value) { check(Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000 - 15 * DAY, 'invalid_time'); return value }
function resources(id) { return { database: `INFRAFLOW_DEMO_T_${id.replaceAll('-', '').toUpperCase()}`, storageKey: id, runtimeKey: id, keyRef: `trial:${id}` } }
function createRegistry() { return { format: FORMAT, trials: [] } }
function validateRegistry(registry) {
  check(registry?.format === FORMAT && Array.isArray(registry.trials), 'invalid_registry')
  const ids = new Set(), approvals = new Set()
  for (const r of registry.trials) {
    check(uuid(r.id) && !ids.has(r.id), 'invalid_trial_id'); ids.add(r.id)
    check(identifier(r.approvalId) && !approvals.has(r.approvalId), 'invalid_approval_id'); approvals.add(r.approvalId)
    check(states.has(r.state) && Number.isSafeInteger(r.revision) && r.revision >= 0, 'invalid_trial_state')
    time(r.createdAt)
    check(JSON.stringify(r.resources) === JSON.stringify(resources(r.id)), 'invalid_resource_binding')
    check(Array.isArray(r.events) && Array.isArray(r.commands), 'invalid_history')
    check(r.events.length === r.revision && r.commands.length === r.revision, 'incomplete_history')
    const commands = new Set()
    for (const entry of r.commands) {
      check(identifier(entry.id) && !commands.has(entry.id) && /^[a-f0-9]{64}$/.test(entry.digest), 'invalid_command_history')
      commands.add(entry.id)
    }
    if (r.activatedAt !== null) { time(r.activatedAt); time(r.expiresAt); check(r.expiresAt > r.activatedAt && r.activatedAt >= r.createdAt, 'invalid_expiry') }
    else check(r.expiresAt === null && !['active', 'expired', 'purge_pending', 'purging', 'deleted'].includes(r.state), 'missing_activation')
    check(r.events.every((e, i) => identifier(e.actorId) && identifier(e.action) && e.revision === i + 1
      && Number.isSafeInteger(e.at) && e.at >= (i ? r.events[i - 1].at : r.createdAt)), 'invalid_audit')
  }
  return registry
}
function queueTrial(registry, { id, approvalId, now }) {
  validateRegistry(registry); check(uuid(id) && identifier(approvalId), 'invalid_identity'); time(now)
  const existing = registry.trials.find(t => t.approvalId === approvalId)
  if (existing) { check(existing.id === id, 'approval_already_bound'); return structuredClone(registry) }
  check(!registry.trials.some(t => t.id === id), 'trial_id_in_use')
  const next = structuredClone(registry)
  next.trials.push({ id, approvalId, state: 'queued', revision: 0, createdAt: now,
    activatedAt: null, expiresAt: null, resources: resources(id), events: [], commands: [] })
  return validateRegistry(next)
}
function digest(value) {
  const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}
function applyCommand(registry, command) {
  validateRegistry(registry)
  check(command && typeof command === 'object' && !Array.isArray(command), 'invalid_command')
  const { trialId, commandId, expectedRevision, action, actor, now, expiresAt, released } = command
  check(Object.keys(command).every(k => ['trialId','commandId','expectedRevision','action','actor','now','expiresAt','released'].includes(k)), 'unknown_command_field')
  check(!Object.hasOwn(command, 'expiresAt') || action === 'extend', 'unexpected_expiry')
  check(!Object.hasOwn(command, 'released') || action === 'complete_purge', 'unexpected_release')
  check(identifier(commandId) && uuid(trialId) && identifier(actor?.id), 'invalid_command_identity'); time(now)
  const next = structuredClone(registry), r = next.trials.find(t => t.id === trialId)
  check(r, 'trial_not_found')
  const hash = digest(command), previous = r.commands.find(c => c.id === commandId)
  if (previous) { check(previous.digest === hash, 'command_id_reused'); return next }
  check(r.revision === expectedRevision, 'revision_conflict')
  check(now >= (r.events.at(-1)?.at ?? r.createdAt), 'time_reversal')
  const admin = actor.kind === 'platform_admin', worker = actor.kind === 'worker'
  const transition = (from, to) => { check(from.includes(r.state), 'invalid_transition'); r.state = to }
  switch (action) {
    case 'provision': check(worker, 'forbidden'); transition(['queued'], 'provisioning'); break
    case 'provision_failed': check(worker, 'forbidden'); transition(['provisioning'], 'queued'); break
    case 'ready': check(worker, 'forbidden'); transition(['provisioning'], 'awaiting_activation'); break
    case 'activate':
      check(actor.kind === 'activation_agent', 'forbidden'); transition(['awaiting_activation'], 'active')
      check(r.activatedAt === null, 'already_activated'); r.activatedAt = now; r.expiresAt = now + 15 * DAY; break
    case 'extend':
      check(admin, 'forbidden'); check(['active','expired','purge_pending'].includes(r.state), 'invalid_transition')
      time(expiresAt); check(expiresAt > now && expiresAt > r.expiresAt, 'invalid_extension')
      r.expiresAt = expiresAt; r.state = 'active'; break
    case 'expire': check(worker, 'forbidden'); check(now >= r.expiresAt, 'not_expired'); transition(['active'], 'expired'); break
    case 'queue_purge': check(worker, 'forbidden'); check(now >= r.expiresAt, 'not_expired'); transition(['expired'], 'purge_pending'); break
    case 'begin_purge': check(worker, 'forbidden'); check(now >= r.expiresAt, 'not_expired'); transition(['purge_pending'], 'purging'); break
    case 'purge_failed': check(worker, 'forbidden'); transition(['purging'], 'purging'); break
    case 'complete_purge':
      check(worker, 'forbidden')
      check(released && Object.keys(released).length === releasedKeys.length && releasedKeys.every(k => released[k] === true), 'resources_not_released')
      transition(['purging'], 'deleted'); break
    default: check(false, 'unknown_action')
  }
  r.revision++
  r.events.push({ action, actorId: actor.id, at: now, revision: r.revision })
  r.commands.push({ id: commandId, digest: hash })
  return validateRegistry(next)
}
function canAccessTrial(registry, trialId, now) {
  try { validateRegistry(registry); time(now); const r = registry.trials.find(t => t.id === trialId)
    return Boolean(r && r.state === 'active' && now >= r.activatedAt && now < r.expiresAt)
  } catch { return false }
}
module.exports = { createRegistry, validateRegistry, queueTrial, applyCommand, canAccessTrial }
