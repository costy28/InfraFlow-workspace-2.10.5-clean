const test = require('node:test'), assert = require('node:assert/strict')
const { DEMO_COMPANY_ADMIN_ROLE: role, ensureActiveSuperadmin } = require('../core/bootstrap-admin-policy')
test('rolul Demo nu este promovat nici prin username admin sau rol suplimentar', () => {
  for (const user of [{ role, username: 'admin' }, { role: 'admin', roles: [role] }, { role: 'viewer', roles: [role] }]) {
    const db = { users: [{ ...user, active: true }] }, before = structuredClone(db)
    ensureActiveSuperadmin(db); assert.deepEqual(db, before)
  }
})
test('recuperarea legacy păstrează prioritatea username, rol admin și primul activ', () => {
  for (const users of [
    [{ role, active: true }, { username: 'admin', role: 'viewer', active: true }],
    [{ role, active: true }, { role: 'admin', active: true }],
    [{ role, active: true }, { role: 'viewer', active: true }],
  ]) {
    const db = { users }; ensureActiveSuperadmin(db)
    assert.equal(db.users[0].role, role); assert.equal(db.users[1].role, 'superadmin')
  }
})
test('superadmin explicit, conturi dezactivate și bază fără utilizatori păstrează comportamentul', () => {
  for (const db of [{ users: [] }, {}, { users: [{ role: 'admin', active: false }] },
    { users: [{ role: 'superadmin', active: true }, { username: 'admin', role: 'viewer', active: true }] }]) {
    const before = structuredClone(db); ensureActiveSuperadmin(db); assert.deepEqual(db, before)
  }
})
test('normalizeDb real și helperul setup aplică aceeași excludere fără cont tehnic', () => {
  const { normalizeDb } = require('../core/db'), setup = require('../core/setup')
  const db = { settings: {}, users: [{ id: 'owner', username: 'admin', role, active: true }] }
  const normalized = normalizeDb(structuredClone(db))
  assert.equal(normalized.users[0].role, role)
  setup.ensureActiveSuperadmin(normalized); assert.equal(normalized.users[0].role, role)
})
