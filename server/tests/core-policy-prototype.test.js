'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { encodePolicyContext, decodePolicyContext } = require('../../scripts/lib/core-policy-prototype')
const { allPermissions, authHasPermission } = require('../core/permissions')
const { effectiveEntitlements } = require('../core/module-catalog')
function fixture() { return { settings: { license: { status: 'internal' }, modules_enabled: ['hr', 'logistics'],
  customRoles: [{ id: 'reader-custom', name: 'Rol sintetic', permissions: ['logistics:view'] }],
  rolePermissionOverrides: { viewer: ['logistics:manage'] } }, departments: [{ id: 'unrestricted' }, { id: 'empty', permissions: [] }, { id: 'limited', permissions: ['logistics:view'] }, { id: 'null', permissions: null }] } }
function decisions(db, user) {
  const entitlements = effectiveEntitlements({ license: db.settings.license, settings: db.settings })
  return [...allPermissions, 'future:permission'].map(p => authHasPermission({ user, db, entitlements }, p))
}
test('custom roles, overrides and department restriction presence round-trip without mutation', () => {
  const db = fixture(), before = JSON.stringify(db), rows = encodePolicyContext(db)
  const restored = decodePolicyContext(JSON.parse(JSON.stringify(rows)))
  assert.deepEqual(restored, db); assert.equal(JSON.stringify(db), before)
  assert.equal(Object.hasOwn(restored.departments[0], 'permissions'), false)
  assert.deepEqual(restored.departments[1].permissions, [])
  assert.equal(restored.departments[3].permissions, null)
})
test('all catalog decisions match after reconstructing policies for multi-role and superadmin', () => {
  const db = fixture(), restored = decodePolicyContext(encodePolicyContext(db))
  for (const departmentId of ['unrestricted', 'empty', 'limited', 'null']) {
    for (const roles of [[], ['viewer'], ['superadmin']]) {
      const user = { role: 'reader-custom', roles, active: true, departmentId }
      assert.deepEqual(decisions(restored, user), decisions(db, user))
    }
  }
})
test('disabled modules and expired license are not replaced by permissive defaults', () => {
  for (const mode of ['disabled', 'expired']) {
    const db = fixture()
    if (mode === 'disabled') db.settings.modules_enabled = []
    else db.settings.license = { plan: 'full', expiresAt: '2000-01-01' }
    const user = { role: 'reader-custom', roles: ['viewer'], active: true }
    const restored = decodePolicyContext(encodePolicyContext(db))
    assert.deepEqual(decisions(restored, user), decisions(db, user))
    const entitlements = effectiveEntitlements({ license: restored.settings.license, settings: restored.settings })
    assert.equal(authHasPermission({ user, db: restored, entitlements }, 'logistics:view'), false)
  }
})
test('incomplete, duplicate, malformed or unknown policy rows fail closed', () => {
  const p = encodePolicyContext(fixture())
  assert.throws(() => decodePolicyContext({ ...p, rows: p.rows.slice(1) }))
  assert.throws(() => decodePolicyContext({ ...p, rows: [...p.rows, p.rows[0]] }))
  assert.throws(() => decodePolicyContext({ ...p, rows: [{ section: 'settings', key: '__proto__', payload: '{}' }] }))
  const db = fixture(); db.departments[0].permissions = undefined
  assert.throws(() => encodePolicyContext(db))
  const invalid = fixture(); invalid.settings.customRoles[0].permissions.push('unknown:grant')
  assert.throws(() => encodePolicyContext(invalid))
  const lossy = fixture(); lossy.settings.customRoles[0].unserializable = undefined
  assert.throws(() => encodePolicyContext(lossy))
})
