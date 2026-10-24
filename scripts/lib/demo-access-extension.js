'use strict'
// Pure synthetic ERP change preparation; no public route or administrator authentication.
const crypto = require('node:crypto')
const { ROLE } = require('./demo-company-setup')
const { addAudit } = require('../../server/core/audit')
function fail(code) { const e = new Error(code); e.code = code; throw e }
function prepareAccessExtension(db, context) {
  const { command, ownerId, previousExpiresAt, activatedAt } = context
  if (!command || command.action !== 'extend' || command.actor?.kind !== 'platform_admin'
    || !Number.isSafeInteger(command.expiresAt) || command.expiresAt <= previousExpiresAt) fail('invalid_extension')
  const user = db.users?.find(u => u.id === ownerId)
  if (db.settings?.demoTrialId !== command.trialId || user?.role !== ROLE || user.active !== true
    || !user.passwordHash || db.demoTrialActivation?.userId !== ownerId
    || db.demoTrialActivation?.activatedAt !== activatedAt) fail('extension_binding_invalid')
  const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v
  const digest = crypto.createHash('sha256').update(JSON.stringify(canonical(context))).digest('hex')
  const history = db.demoTrialExtensions || []
  if (!Array.isArray(history)) fail('extension_history_invalid')
  const old = history.find(r => r.commandId === command.commandId)
  if (old) {
    if (old.digest !== digest || Date.parse(user.demoAccessExpiresAt) !== command.expiresAt) fail('extension_conflict')
    return { db, receipt: old, changed: false }
  }
  if (Date.parse(user.demoAccessExpiresAt) !== previousExpiresAt || !Array.isArray(db.audit)) fail('extension_conflict')
  const next = structuredClone(db)
  next.users.find(u => u.id === ownerId).demoAccessExpiresAt = new Date(command.expiresAt).toISOString()
  const receipt = { trialId: command.trialId, commandId: command.commandId, expiresAt: command.expiresAt, digest }
  next.demoTrialExtensions = [...history, receipt]
  addAudit(next, { id: command.actor.id, name: 'Synthetic platform administrator', role: 'platform_admin' },
    'demo_trial_access_extended', `trial=${command.trialId}; command=${command.commandId}; expiresAt=${command.expiresAt}`)
  return { db: next, receipt, changed: true }
}
module.exports = { prepareAccessExtension }
