'use strict'
const { randomBytes } = require('node:crypto')
const { fingerprint } = require('../../../scripts/lib/core-sync-manifest')
function integratedFixture() {
  const id = 'aaaaaaaa-0000-0000-0000-000000000001', company = 'bbbbbbbb-0000-0000-0000-000000000001'
  const db = { users: [{ id, name: 'Synthetic User', username: 'synthetic', role: 'reader', roles: ['operator'], active: true,
    departmentId: 'cccccccc-0000-0000-0000-000000000001', twoFactorSecretEncrypted: 'SYNTHETIC-SECRET-NOT-REAL' }],
    departments: [{ id: 'cccccccc-0000-0000-0000-000000000001', name: 'Synthetic', permissions: ['logistics:view'], moduleKey: 'logistics', active: true }],
    settings: { license: { plan: 'full', modules: ['hr', 'logistics'] }, modules_enabled: ['hr', 'logistics'], customRoles: [
      { id: 'reader', permissions: ['logistics:view'] }, { id: 'operator', permissions: ['logistics:manage'] }
    ], rolePermissionOverrides: {} } }
  const source = Buffer.from(JSON.stringify(db)), target = Buffer.from(JSON.stringify({ companies: [{ id: company }], users: [], departments: [],
    roles: [{ role_key: 'reader' }, { role_key: 'operator' }], modules: [{ module_key: 'logistics' }] }))
  const manifest = { format: 'infraflow-core-sync-manifest-v1', revision: 1, companyId: company,
    snapshots: { sourceSha256: fingerprint(source), targetSha256: fingerprint(target) }, mappings: {
      users: [{ source: id, target: id }], departments: [{ source: db.departments[0].id, target: db.departments[0].id }],
      modules: [{ source: 'logistics', target: 'logistics' }], roles: [{ source: 'reader', target: 'reader' }, { source: 'operator', target: 'operator' }] } }
  return { source, target, manifest, key: randomBytes(32) }
}
module.exports = { integratedFixture }
