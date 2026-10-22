const test = require('node:test')
const assert = require('node:assert/strict')
const { createRegistry, queueTrial, applyCommand } = require('../../scripts/lib/demo-trial-registry')
const { ROLE, companyRole, createSetup, applySetupStep } = require('../../scripts/lib/demo-company-setup')
const { authHasPermission, allPermissions } = require('../core/permissions')
const A = '11111111-1111-4111-8111-111111111111', now = Date.parse('2026-10-22T10:00:00Z')
const profile = { companyName: 'Synthetic', country: 'RO', locale: 'ro-RO', currency: 'RON', timezone: 'Europe/Bucharest' }
function fixture() {
  let registry = queueTrial(createRegistry(), { id: A, approvalId: 'approval', now })
  for (const action of ['provision','ready','activate']) registry = applyCommand(registry, { trialId: A, commandId: action,
    expectedRevision: registry.trials[0].revision, action, now, actor: { id: 'service', kind: action === 'activate' ? 'activation_agent' : 'worker' } })
  const state = createSetup(A, 'owner'), context = { trialId: A, user: { id: 'owner', role: ROLE, active: true } }
  return { registry, state, context }
}
function run(f, step, input, extra = {}, allowed = ['documents','messaging']) {
  return applySetupStep(f.registry, f.state, f.context, { step, input, now, expectedRevision: f.state.revision, ...extra }, allowed)
}
test('rolul explicit trece prin motorul real de permisiuni fără administrare platformă', () => {
  const role = companyRole(); assert.ok(role.permissions.every(p => allPermissions.includes(p)))
  const auth = { user: { id: 'owner', role: ROLE, active: true }, db: { settings: { customRoles: [role],
    modules_enabled: ['documents','messaging'], license: { plan: 'internal', modules: ['all'] } }, departments: [] } }
  assert.equal(authHasPermission(auth, 'documents:view_own'), true)
  for (const p of ['settings:manage','users:manage','system:view','audit:manage','documents:view_all']) assert.equal(authHasPermission(auth, p), false)
})
test('profil și module reluabile, fără a modifica termenul sau registrul', () => {
  const f = fixture(), before = structuredClone(f.registry)
  f.state = run(f, 'profile', profile)
  f.state = run(f, 'modules', { modules: ['documents'] })
  f.state = JSON.parse(JSON.stringify(f.state))
  f.state = run(f, 'profile', { ...profile, companyName: 'Updated' })
  assert.deepEqual(f.state.modules, ['documents'])
  f.state = run(f, 'complete', {})
  assert.equal(f.state.completedAt, now); assert.deepEqual(f.registry, before)
  assert.throws(() => run(f, 'profile', profile), e => e.code === 'setup_completed')
})
test('licența, termenul, rolurile și cheile nu intră prin formularul profilului', () => {
  for (const k of ['trialDays','expiresAt','license','APP_KEY','users','role','modules_enabled','__proto__']) {
    const f = fixture(), input = JSON.parse(JSON.stringify(profile)); Object.defineProperty(input, k, { value: 'injected', enumerable: true })
    assert.throws(() => run(f, 'profile', input), e => e.code === 'invalid_fields')
    assert.equal(f.state.revision, 0)
  }
})
test('companie greșită, alt proprietar, rol suplimentar și trial expirat sunt refuzate', () => {
  for (const change of [f => { f.context.trialId = 'other' }, f => { f.context.user.id = 'other' },
    f => { f.context.user.role = 'superadmin' }, f => { f.context.user.roles = ['admin'] }, f => { f.context.user.active = false }]) {
    const f = fixture(); change(f); assert.throws(() => run(f, 'profile', profile))
  }
  const f = fixture()
  assert.throws(() => run(f, 'profile', profile, { now: now + 15 * 86400000 }), e => e.code === 'trial_not_active')
})
test('module nepermise, pași incompleți și revizii vechi nu modifică starea', () => {
  const f = fixture()
  assert.throws(() => run(f, 'modules', { modules: ['documents'] }), e => e.code === 'profile_required')
  assert.throws(() => run(f, 'complete', {}), e => e.code === 'setup_incomplete')
  f.state = run(f, 'profile', profile)
  for (const modules of [['all'], ['hr'], ['documents','documents'], []]) assert.throws(() => run(f, 'modules', { modules }), e => e.code === 'module_not_allowed')
  assert.throws(() => run(f, 'profile', profile, { expectedRevision: 0 }), e => e.code === 'revision_conflict')
  assert.equal(f.state.revision, 1)
})
test('țara și moneda sunt validate sintactic; locale/timezone invalide sunt refuzate', () => {
  for (const input of [{ ...profile, country: 'romanian' }, { ...profile, currency: 'ron' }, { ...profile, timezone: 'not/a/timezone' }]) assert.throws(() => run(fixture(), 'profile', input))
})
