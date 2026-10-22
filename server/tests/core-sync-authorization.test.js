'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { analyzeCoreAuthorization } = require('../../scripts/lib/core-sync-authorization')
const { fingerprint } = require('../../scripts/lib/core-sync-manifest')
const { allPermissions, authHasPermission } = require('../core/permissions')
const { effectiveEntitlements } = require('../core/module-catalog')
const company = 'aaaaaaaa-0000-0000-0000-000000000001', id = 'bbbbbbbb-0000-0000-0000-000000000001'
function fixture() {
  const source = { users: [{ id, role: 'reader-custom', active: true, name: 'PRIVATE-PERSON', username: 'PRIVATE-LOGIN' }], departments: [],
    settings: { license: { status: 'internal' }, modules_enabled: ['hr', 'logistics'], rolePermissionOverrides: {},
      customRoles: [{ id: 'reader-custom', permissions: ['logistics:view'] }] } }
  const entitlements = effectiveEntitlements({ license: source.settings.license, settings: source.settings })
  const effective = allPermissions.filter(p => authHasPermission({ user: source.users[0], db: source, entitlements }, p))
  assert.ok(effective.includes('logistics:view')); assert.ok(!effective.includes('logistics:manage'))
  const target = { users: [{ id, company_id: company, role_key: 'reader-custom', active: true }], departments: [], companies: [{ id: company }],
    roles: [{ role_key: 'reader-custom' }], modules: [], permissions: allPermissions.map(permission_key => ({ permission_key })),
    role_permissions: effective.map(permission_key => ({ role_key: 'reader-custom', permission_key })) }
  const manifest = { format: 'infraflow-core-sync-manifest-v1', revision: 1, companyId: company, mappings: {
    users: [{ source: id, target: id }], departments: [], modules: [], roles: [{ source: 'reader-custom', target: 'reader-custom' }] } }
  return { source, target, manifest }
}
function run(f) {
  const hashes = { source: fingerprint(JSON.stringify(f.source)), target: fingerprint(JSON.stringify(f.target)) }
  f.manifest.snapshots = { sourceSha256: hashes.source, targetSha256: hashes.target }
  return analyzeCoreAuthorization(f.source, f.target, f.manifest, hashes)
}
test('identical stored grant set remains review-required, not runtime equivalence', () => {
  const f = fixture(), before = JSON.stringify({ source: f.source, target: f.target }), r = run(f)
  assert.equal(r.status, 'review_required'); assert.equal(r.runtimeEquivalenceVerified, false); assert.equal(r.writeAuthorized, false)
  assert.equal(r.totals.comparedUsers, 1); assert.equal(r.totals.gainedGrants, 0); assert.equal(r.totals.lostGrants, 0)
  assert.equal(JSON.stringify({ source: f.source, target: f.target }), before)
  for (const privateValue of [company, id, 'PRIVATE-PERSON', 'PRIVATE-LOGIN']) assert.ok(!JSON.stringify(r).includes(privateValue))
})
test('extra and missing grants are reported separately', () => {
  const f = fixture(); f.target.role_permissions = f.target.role_permissions.filter(r => r.permission_key !== 'logistics:view')
  f.target.role_permissions.push({ role_key: 'reader-custom', permission_key: 'logistics:manage' })
  const r = run(f); assert.equal(r.status, 'blocked'); assert.equal(r.totals.gainedGrants, 1); assert.equal(r.totals.lostGrants, 1)
})
test('multi-role and superadmin bypass are blocked rather than collapsed', () => {
  for (const role of ['another-custom', 'superadmin']) {
    const f = fixture(); f.source.users[0].roles = [role]
    f.source.settings.customRoles.push({ id: role, permissions: [] }); f.target.roles.push({ role_key: role })
    f.manifest.mappings.roles.push({ source: role, target: role })
    const r = run(f); assert.equal(r.status, 'blocked'); assert.equal(r.totals.comparedUsers, 0)
    assert.ok(r.issues.some(i => i.code === (role === 'superadmin' ? 'superadmin_runtime_bypass_requires_model' : 'multi_role_relational_model_required')))
  }
})
test('department restrictions and disabled modules expose excess stored grants', () => {
  const f = fixture(); f.source.settings.modules_enabled = ['hr']
  assert.ok(run(f).totals.gainedGrants > 0)
  const d = fixture(); d.source.users[0].departmentId = 'cccccccc-0000-0000-0000-000000000001'
  d.source.departments.push({ id: d.source.users[0].departmentId, permissions: [] })
  d.manifest.mappings.departments.push({ source: d.source.users[0].departmentId, target: d.source.users[0].departmentId })
  assert.ok(run(d).totals.gainedGrants > 0)
})
test('missing settings or incomplete SQL catalog never imply no rights', () => {
  const f = fixture(); delete f.source.settings
  assert.equal(run(f).status, 'blocked')
  const g = fixture(); g.target.permissions.pop()
  assert.ok(run(g).issues.some(i => i.code === 'target_permission_catalog_incomplete'))
})
test('inactive users and unknown source role definitions are not compared', () => {
  const f = fixture(); f.source.users[0].active = false
  assert.equal(run(f).totals.comparedUsers, 0)
  const g = fixture(); g.source.settings.customRoles = []
  assert.ok(run(g).issues.some(i => i.code === 'source_role_definition_missing'))
})
test('target role identity is checked even when stored grants might coincide', () => {
  const f = fixture(); f.target.roles.push({ role_key: 'other' }); f.target.users[0].role_key = 'other'
  assert.ok(run(f).issues.some(i => i.code === 'target_role_differs_from_manifest'))
})
test('unknown source grants and duplicate target grants fail closed', () => {
  const f = fixture(); f.source.settings.customRoles[0].permissions.push('unknown:grant')
  assert.ok(run(f).issues.some(i => i.code === 'source_custom_role_configuration_invalid'))
  const g = fixture(); g.target.role_permissions.push({ ...g.target.role_permissions[0] })
  assert.ok(run(g).issues.some(i => i.code === 'duplicate_target_role_grant'))
})
