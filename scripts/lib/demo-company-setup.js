'use strict'
// Offline policy/reducer. Caller context is trusted test input, NOT authentication.
const { canAccessTrial } = require('./demo-trial-registry')
const { CONFIGURABLE_MODULE_KEYS } = require('../../server/core/module-catalog')
const { DEMO_COMPANY_ADMIN_ROLE: ROLE } = require('../../server/core/bootstrap-admin-policy')
const operationalPermissions = ['documents:view_own', 'documents:create', 'messaging:view']
function check(ok, code) { if (!ok) { const e = new Error(code); e.code = code; throw e } }
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype }
function exactKeys(value, keys) { check(plain(value) && Object.keys(value).every(k => keys.includes(k)), 'invalid_fields') }
function companyRole() { return { id: ROLE, name: 'Administrator companie Demo', permissions: [...operationalPermissions] } }
function createSetup(trialId, ownerId) {
  check(typeof trialId === 'string' && typeof ownerId === 'string' && ownerId.length > 0, 'invalid_identity')
  return { trialId, ownerId, revision: 0, profile: null, modules: [], completedAt: null }
}
function authorize(registry, state, context, now) {
  check(canAccessTrial(registry, state.trialId, now), 'trial_not_active')
  check(context?.trialId === state.trialId && context.user?.id === state.ownerId, 'wrong_company_or_owner')
  check(context.user.active === true && context.user.role === ROLE
    && (!context.user.roles || (Array.isArray(context.user.roles) && context.user.roles.every(r => r === ROLE || r === 'angajat'))), 'forbidden_role')
}
function applySetupStep(registry, state, context, { step, input, expectedRevision, now }, allowedModules) {
  authorize(registry, state, context, now)
  check(Number.isSafeInteger(state.revision) && state.revision >= 0 && expectedRevision === state.revision, 'revision_conflict')
  check(state.completedAt === null, 'setup_completed')
  const next = structuredClone(state)
  if (step === 'profile') {
    exactKeys(input, ['companyName','country','locale','currency','timezone'])
    check(typeof input.companyName === 'string' && input.companyName.trim().length >= 2 && input.companyName.length <= 200, 'invalid_company_name')
    check(typeof input.country === 'string' && /^[A-Z]{2}$/.test(input.country), 'invalid_country')
    check(typeof input.currency === 'string' && /^[A-Z]{3}$/.test(input.currency), 'invalid_currency')
    check(typeof input.locale === 'string' && input.locale.length <= 50 && typeof input.timezone === 'string' && input.timezone.length <= 100, 'invalid_region')
    try { new Intl.DateTimeFormat(input.locale, { timeZone: input.timezone }).format(0) } catch { check(false, 'invalid_region') }
    next.profile = { ...input, companyName: input.companyName.trim() }
  } else if (step === 'modules') {
    check(state.profile !== null, 'profile_required')
    exactKeys(input, ['modules'])
    check(Array.isArray(allowedModules) && allowedModules.every(k => CONFIGURABLE_MODULE_KEYS.has(k)), 'invalid_entitlements')
    check(Array.isArray(input.modules) && input.modules.length > 0 && input.modules.length <= 50
      && input.modules.every(k => typeof k === 'string' && CONFIGURABLE_MODULE_KEYS.has(k) && allowedModules.includes(k))
      && new Set(input.modules).size === input.modules.length, 'module_not_allowed')
    next.modules = [...input.modules]
  } else if (step === 'complete') {
    exactKeys(input, []); check(state.profile !== null && state.modules.length > 0, 'setup_incomplete')
    check(Array.isArray(allowedModules) && state.modules.every(k => allowedModules.includes(k)), 'module_not_allowed')
    next.completedAt = now
  } else check(false, 'unknown_step')
  next.revision++
  return next
}
module.exports = { ROLE, companyRole, createSetup, applySetupStep, assertSetupAccess: authorize }
