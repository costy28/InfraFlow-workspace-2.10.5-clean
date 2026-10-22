'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { encodeRoleLinks, decodeRoleLinks } = require('../../scripts/lib/core-role-links-prototype')
const { allPermissions, normalizedUserRoles, authHasPermission } = require('../core/permissions')
const { effectiveEntitlements } = require('../core/module-catalog')
const id = 'aaaaaaaa-0000-0000-0000-000000000001'
const catalog = new Set(['reader', 'operator', 'superadmin'])
function restored(user) { const encoded = encodeRoleLinks(user, catalog); return { ...user, ...decodeRoleLinks(encoded.primaryRole, encoded.links.slice().reverse(), catalog) } }
function compare(user, settings, departments = []) {
  const other = restored(user), db = { settings, departments }, entitlements = effectiveEntitlements({ license: settings.license, settings })
  for (const p of [...allPermissions, 'future:permission']) assert.equal(authHasPermission({ user: other, db, entitlements }, p), authHasPermission({ user, db, entitlements }, p))
  assert.deepEqual(normalizedUserRoles(other), normalizedUserRoles(user))
}
const settings = () => ({ license: { status: 'internal' }, modules_enabled: ['hr', 'logistics'], rolePermissionOverrides: {}, customRoles: [
  { id: 'reader', permissions: ['logistics:view'] }, { id: 'operator', permissions: ['logistics:manage'] }
] })
test('primary role remains separate and additional role order survives reconstruction', () => {
  const user = { id, role: 'reader', roles: ['operator', 'reader', 'operator'], active: true }, before = JSON.stringify(user)
  const encoded = encodeRoleLinks(user, catalog)
  assert.equal(encoded.primaryRole, 'reader'); assert.deepEqual(encoded.links, [{ roleKey: 'operator', position: 0 }, { roleKey: 'reader', position: 1 }])
  compare(user, settings()); assert.equal(JSON.stringify(user), before)
})
test('missing supplementary roles is not replaced with a different primary role', () => {
  compare({ id, role: 'reader', active: true }, settings())
  assert.equal(encodeRoleLinks({ id, role: 'reader' }, catalog).links.length, 0)
})
test('license and department filters remain runtime decisions after role reconstruction', () => {
  const user = { id, role: 'reader', roles: ['operator'], active: true, departmentId: 'dept' }
  compare(user, settings(), [{ id: 'dept', permissions: ['logistics:view'] }])
  const s = settings(); s.modules_enabled = ['hr']; compare(user, s, [{ id: 'dept', permissions: [] }])
})
test('superadmin semantics retained explicitly, including future permissions', () => {
  const user = { id, role: 'reader', roles: ['superadmin'], active: true }
  compare(user, settings())
  assert.equal(authHasPermission({ user: restored(user), db: { settings: settings(), departments: [] } }, 'future:permission'), true)
})
test('unknown roles, missing primary, malformed links and duplicate positions are rejected', () => {
  for (const user of [{ id, roles: ['operator'] }, { id, role: 'unknown' }, { id, role: 'reader', roles: 'operator' }, { id: 'legacy', role: 'reader' }]) assert.throws(() => encodeRoleLinks(user, catalog))
  for (const links of [[{ roleKey: 'unknown', position: 0 }], [{ roleKey: 'reader', position: -1 }], [{ roleKey: 'reader', position: 0 }, { roleKey: 'operator', position: 0 }]]) assert.throws(() => decodeRoleLinks('reader', links, catalog))
})
