const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const permissions = require('../core/permissions')
const normalize = permissions.normalizeRolePermissionOverrides

test('normalizarea centrală păstrează întregul catalog actual pentru admin', () => {
  const selected = [...new Set(permissions.allPermissions)]
  assert.deepEqual(normalize({ admin: selected }).admin, selected)
  assert.deepEqual(normalize(normalize({ admin: selected })), { admin: selected })
})
test('drepturile retrase rămân retrase; valorile necunoscute nu sunt acceptate', () => {
  assert.deepEqual(normalize({ admin: [] }), { admin: [] })
  assert.deepEqual(normalize({ admin: ['documents:view_own', 'documents:view_own', 'unknown:manage'] }), { admin: ['documents:view_own'] })
  assert.deepEqual(normalize({ admin: null }), { admin: [] })
  assert.deepEqual(normalize(JSON.parse('{"constructor":[],"__proto__":[],"superadmin":[],"unknown-role":[]}')), {})
  for (const value of [null, [], 'admin']) assert.deepEqual(normalize(value), {})
})

const adapters = [
  'core/db.js', 'core/setup.js', 'modules/system/service.js', 'modules/system/routes.js',
  'modules/workflow/routes.js', 'modules/fleet/routes.js', 'modules/technical/routes.js',
  'modules/inventory/routes.js', 'modules/production/routes.js', 'modules/procurement/routes.js',
]
for (const adapter of adapters) {
  test(`${adapter}: normalizarea delegată păstrează drepturile actuale și restricțiile`, () => {
    const source = fs.readFileSync(path.join(__dirname, '..', adapter), 'utf8')
    const match = source.match(/^function normalizeRolePermissionOverrides\(input\) \{[\s\S]*?^\}/m)
    assert.ok(match, 'Adaptorul de normalizare lipsește')
    const delegate = vm.runInNewContext(`${match[0]}; normalizeRolePermissionOverrides`, { require: name => {
      assert.equal(name, adapter.startsWith('core/') ? './permissions' : '../../core/permissions')
      return permissions
    } })
    for (const input of [{ admin: permissions.allPermissions }, { admin: [] }, { admin: ['messaging:view', 'documents:approve', 'crm:view', 'unknown:manage'] }]) {
      assert.equal(JSON.stringify(delegate(input)), JSON.stringify(normalize(input)))
    }
  })
}
