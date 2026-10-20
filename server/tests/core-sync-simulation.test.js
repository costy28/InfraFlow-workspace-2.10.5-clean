'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { simulateCoreSync } = require('../../scripts/lib/core-sync-simulation')
const { fingerprint } = require('../../scripts/lib/core-sync-manifest')
const company = 'aaaaaaaa-0000-0000-0000-000000000001'
const user = 'bbbbbbbb-0000-0000-0000-000000000001'
const department = 'cccccccc-0000-0000-0000-000000000001'
function fixture() {
  return { source: { users: [{ id: 'legacy-user', name: 'Private Person', username: 'private-login', role: 'employee', departmentId: 'legacy-dept', active: true,
    passwordHash: `scrypt:${'a'.repeat(32)}:${'b'.repeat(128)}`, email: 'private@example.invalid', mustChangePassword: true, custom: { secret: 'PRIVATE-METADATA' } }],
    departments: [{ id: 'legacy-dept', name: 'Private Department', moduleKey: 'legacy-hr', active: true }] },
  target: { users: [], departments: [], companies: [{ id: company }], roles: [{ role_key: 'employee' }], modules: [{ module_key: 'hr' }] },
  manifest: { format: 'infraflow-core-sync-manifest-v1', revision: 1, companyId: company,
    mappings: { users: [{ source: 'legacy-user', target: user }], departments: [{ source: 'legacy-dept', target: department }],
      modules: [{ source: 'legacy-hr', target: 'hr' }], roles: [{ source: 'employee', target: 'employee' }] } } }
}
function prepare(f) {
  const hashes = { source: fingerprint(JSON.stringify(f.source)), target: fingerprint(JSON.stringify(f.target)) }
  f.manifest.snapshots = { sourceSha256: hashes.source, targetSha256: hashes.target }
  return hashes
}
function run(f) { return simulateCoreSync(f.source, f.target, f.manifest, prepare(f)) }
test('legacy IDs, department links and module aliases reconcile without exporting data', () => {
  const f = fixture(), hashes = prepare(f), before = JSON.stringify(f)
  const r = simulateCoreSync(f.source, f.target, f.manifest, hashes)
  assert.equal(r.simulationPerformed, true); assert.equal(r.status, 'blocked')
  assert.equal(r.preservationReview.totals.uncoveredFields, 3)
  assert.equal(r.reconciliation.totals.blockers, 0)
  assert.ok(r.validation.baseline.totals.blockers > 0)
  assert.equal(r.reconciliation.counts.users.sourceOnlyIdentities, 1)
  assert.equal(r.reconciliation.counts.departments.sourceOnlyIdentities, 1)
  assert.equal(r.writeAuthorized, false); assert.equal(r.globalRelationalReadiness, false)
  assert.equal(JSON.stringify(f), before)
  for (const secret of ['Private Person', 'PRIVATE-METADATA', 'private@example.invalid', user, company, f.source.users[0].passwordHash]) assert.ok(!JSON.stringify(r).includes(secret))
})
test('invalid snapshot prevents simulation', () => {
  const f = fixture(), hashes = prepare(f); hashes.source = '0'.repeat(64)
  assert.equal(simulateCoreSync(f.source, f.target, f.manifest, hashes).simulationPerformed, false)
})
test('multi-role is never reduced', () => {
  const f = fixture(); f.source.users[0].roles = ['employee', 'admin']; f.target.roles.push({ role_key: 'admin' })
  f.manifest.mappings.roles.push({ source: 'admin', target: 'admin' })
  assert.equal(run(f).simulationPerformed, false)
})
test('name-only department, alias conflict and legacy password remain blockers', () => {
  for (const change of [
    f => { delete f.source.users[0].departmentId; f.source.users[0].department = 'Private Department' },
    f => { f.source.users[0].department_id = 'other-dept' },
    f => { f.source.users[0].password = 'PRIVATE-LEGACY' }
  ]) { const f = fixture(); change(f); assert.equal(run(f).simulationPerformed, false) }
})
test('unresolved department reference still blocks projected reconciliation', () => {
  const f = fixture(); f.source.users[0].departmentId = 'missing-department'
  const r = run(f); assert.equal(r.simulationPerformed, true); assert.equal(r.status, 'blocked')
  assert.ok(r.reconciliation.issues.some(i => i.code === 'department_reference_missing'))
})
test('target username collision is not bypassed by mapping', () => {
  const f = fixture(); f.target.users.push({ id: user, company_id: company, username: 'private-login', active: true })
  assert.equal(run(f).simulationPerformed, false)
})
test('truncated baseline never authorizes partial simulation', () => {
  const f = fixture()
  for (let i = 0; i < 110; i++) {
    f.source.users.push({ ...f.source.users[0], id: `legacy-${i}`, username: `person-${i}` })
    f.manifest.mappings.users.push({ source: `legacy-${i}`, target: `bbbbbbbb-0000-0000-0000-${String(i + 2).padStart(12, '0')}` })
  }
  const r = run(f); assert.equal(r.validation.baseline.issuesTruncated, true); assert.equal(r.simulationPerformed, false)
})
test('frozen snapshots and manifest are accepted without mutation', () => {
  const f = fixture(), hashes = prepare(f)
  function freeze(v) { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v) } }
  freeze(f); freeze(hashes)
  assert.equal(simulateCoreSync(f.source, f.target, f.manifest, hashes).status, 'blocked')
})
