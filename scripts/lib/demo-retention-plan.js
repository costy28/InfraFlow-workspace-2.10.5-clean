'use strict'
// Pure dry-run only: no filesystem, SQL, processes, scheduler or deletion API.
const crypto = require('node:crypto')
const { validateRegistry } = require('./demo-trial-registry')
const DAY = 86400000
function fail(code) { const e = new Error(code); e.code = code; throw e }
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v
const digest = v => crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')
function normalizePolicy(policy) {
  if (policy === undefined) return { enabled: false, dataRetentionDays: null, backupRetentionDays: null }
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)
    || Object.keys(policy).some(k => !['enabled','dataRetentionDays','backupRetentionDays'].includes(k))
    || typeof policy.enabled !== 'boolean') fail('invalid_retention_policy')
  for (const field of ['dataRetentionDays','backupRetentionDays']) {
    const days = policy[field]
    if (days !== null && (!Number.isInteger(days) || days < 0 || days > 3650)) fail('invalid_retention_policy')
    if (policy.enabled && days === null) fail('invalid_retention_policy')
  }
  return { enabled: policy.enabled, dataRetentionDays: policy.dataRetentionDays, backupRetentionDays: policy.backupRetentionDays }
}
function planRetention(registry, { trialId, now, policy }) {
  validateRegistry(registry)
  if (!Number.isSafeInteger(now) || now < 0 || now > 8640000000000000) fail('invalid_retention_time')
  const trial = registry.trials.find(t => t.id === trialId)
  if (!trial) fail('trial_not_found')
  if (now < (trial.events.at(-1)?.at ?? trial.createdAt)) fail('invalid_retention_time')
  const selected = normalizePolicy(policy), reasons = []
  if (!selected.enabled) reasons.push('retention_not_enabled')
  if (!['expired','purge_pending'].includes(trial.state)) reasons.push('state_not_eligible')
  if (trial.expiresAt === null || now < trial.expiresAt) reasons.push('not_expired')
  function deadline(days) {
    if (trial.expiresAt === null || days === null) return null
    const value = trial.expiresAt + days * DAY
    if (!Number.isSafeInteger(value) || value > 8640000000000000) fail('retention_deadline_overflow')
    return value
  }
  const dataAfter = deadline(selected.dataRetentionDays), backupsAfter = deadline(selected.backupRetentionDays)
  const allAfter = dataAfter === null || backupsAfter === null ? null : Math.max(dataAfter, backupsAfter)
  const targets = [
    { kind: 'database', reference: trial.resources.database, eligibleAfter: dataAfter },
    { kind: 'storage', reference: trial.resources.storageKey, eligibleAfter: dataAfter },
    { kind: 'runtime', reference: trial.resources.runtimeKey, eligibleAfter: dataAfter },
    { kind: 'routing', reference: trial.id, eligibleAfter: dataAfter },
    { kind: 'backups', reference: trial.id, eligibleAfter: backupsAfter },
    // Keep the key at least as long as retained data/backups could need it.
    { kind: 'appKey', reference: trial.resources.keyRef, eligibleAfter: allAfter },
  ]
  const snapshot = { trialId, revision: trial.revision, state: trial.state, expiresAt: trial.expiresAt,
    resources: structuredClone(trial.resources), policy: selected }
  return { format: 'infraflow-demo-retention-dry-run-v1', asOf: now, executionAllowed: false,
    eligibility: reasons.length ? 'blocked' : allAfter !== null && now >= allAfter ? 'candidate' : 'retained',
    reasons, binding: { trialId, revision: trial.revision, fingerprint: digest(snapshot) }, policy: selected,
    earliestCompleteCleanupAt: allAfter, targets,
    requiredBeforeExecution: ['fresh_registry_revision','verified_resource_ownership','authenticated_runtime_stop',
      'complete_backup_inventory','explicit_execution_authorization'] }
}
function assertCurrentRetentionPlan(registry, plan, { now, policy }) {
  if (plan?.format !== 'infraflow-demo-retention-dry-run-v1' || !plan.binding?.trialId
    || !Number.isSafeInteger(plan.asOf) || plan.asOf < 0 || plan.asOf > now) fail('invalid_retention_plan')
  const current = planRetention(registry, { trialId: plan.binding.trialId, now, policy })
  // Verify all fields, not a caller-recomputed hash alone. This grants NO execution authority.
  const { asOf: ignoredOld, ...old } = plan
  const { asOf: ignoredCurrent, ...fresh } = current
  if (JSON.stringify(canonical(old)) !== JSON.stringify(canonical(fresh))) fail('retention_plan_stale')
  return current
}
module.exports = { planRetention, assertCurrentRetentionPlan }
