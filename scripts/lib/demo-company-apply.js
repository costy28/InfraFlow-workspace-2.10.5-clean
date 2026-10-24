'use strict'
const crypto = require('node:crypto')
const { assertSetupAccess, applySetupStep } = require('./demo-company-setup')
const { addAudit } = require('../../server/core/audit')
function fail(code) { const e = new Error(code); e.code = code; throw e }
// Pure preparation; persistence is performed by the original core/db adapter.
function prepareCompanyApplication(db, { registry, trialId, setup, allowedModules, userId, now }) {
  if (setup?.trialId !== trialId || db.settings?.demoTrialId !== trialId) fail('wrong_erp_binding')
  const user = (db.users || []).find(u => u.id === userId)
  assertSetupAccess(registry, setup, { trialId, user }, now)
  if (!Number.isSafeInteger(setup.completedAt) || setup.completedAt > now || !setup.profile || !setup.modules.length) fail('setup_incomplete')
  if (!Array.isArray(allowedModules) || !setup.modules.every(m => allowedModules.includes(m))) fail('module_not_allowed')
  let validation = { ...setup, revision: 0, profile: null, modules: [], completedAt: null }
  validation = applySetupStep(registry, validation, { trialId, user }, { step: 'profile', input: setup.profile, expectedRevision: 0, now }, allowedModules)
  applySetupStep(registry, validation, { trialId, user }, { step: 'modules', input: { modules: setup.modules }, expectedRevision: 1, now }, allowedModules)
  const fields = ['companyName','country','locale','currency','timezone']
  const profile = Object.fromEntries(fields.map(k => [k, setup.profile[k]]))
  const digest = crypto.createHash('sha256').update(JSON.stringify({ trialId, revision: setup.revision, profile, modules: setup.modules })).digest('hex')
  const previous = db.demoCompanySetupApplication
  if (previous) {
    if (previous.trialId !== trialId || previous.setupRevision !== setup.revision || previous.digest !== digest) fail('application_conflict')
    if (fields.some(k => db.settings[k] !== profile[k]) || JSON.stringify(db.settings.modules_enabled) !== JSON.stringify(setup.modules)) fail('applied_configuration_drift')
    return { db, receipt: previous, changed: false }
  }
  if (!Array.isArray(db.audit)) fail('invalid_erp_audit')
  const next = structuredClone(db)
  next.settings = { ...next.settings, ...profile, modules_enabled: [...setup.modules] }
  const receipt = { trialId, setupRevision: setup.revision, digest, appliedAt: now }
  next.demoCompanySetupApplication = receipt
  addAudit(next, user, 'demo_company_setup_applied', `trial=${trialId}; setup_revision=${setup.revision}`)
  return { db: next, receipt, changed: true }
}
function createSyntheticCompanyApplier() {
  const path = require('node:path'), os = require('node:os')
  const db = require('../../server/core/db')
  const dir = path.dirname(path.resolve(db.DB_FILE))
  if (process.env.NODE_ENV !== 'test' || db.DB_MODE !== 'json' || path.dirname(dir) !== path.resolve(os.tmpdir())
    || !path.basename(dir).startsWith('infraflow-trial-store-')) fail('synthetic_test_only')
  return input => {
    const result = prepareCompanyApplication(db.readDb({ fresh: true }), input)
    if (result.changed) db.writeDb(result.db)
    return result.receipt
  }
}
module.exports = { prepareCompanyApplication, createSyntheticCompanyApplier }
