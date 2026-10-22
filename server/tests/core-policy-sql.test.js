'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createDocumentsSqlFixture } = require('./support/documents-sql-fixture')
const { encodePolicyContext, decodePolicyContext } = require('../../scripts/lib/core-policy-prototype')
const { encodeRoleLinks, decodeRoleLinks } = require('../../scripts/lib/core-role-links-prototype')
const { allPermissions, authHasPermission } = require('../core/permissions')
const { effectiveEntitlements } = require('../core/module-catalog')
test('politici multi-rol: salvare și reconstrucție SQL a configurației fără schimbarea deciziilor', {
  skip: process.env.INFRAFLOW_TEST_RELATIONAL_SQL !== '1', timeout: 120000
}, () => {
  const f = createDocumentsSqlFixture({ empty: true })
  const db = { settings: { license: { plan: 'full', modules: ['hr', 'logistics'] }, modules_enabled: ['hr', 'logistics'],
    customRoles: [{ id: 'custom-reader', name: 'Rol sintetic', permissions: ['logistics:view'] }],
    rolePermissionOverrides: { viewer: ['logistics:manage'] } },
  departments: [{ id: 'open' }, { id: 'closed', permissions: [] }, { id: 'limited', permissions: ['logistics:view'] }, { id: 'null', permissions: null }] }
  const policy = encodePolicyContext(db)
  // Tabelă exclusiv de probă: nu folosește/actualizează core.app_settings.
  f.sql(`CREATE TABLE dbo.policy_probe(format nvarchar(80) NOT NULL,section nvarchar(32) NOT NULL,entry_key nvarchar(200) NOT NULL,
    payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1),PRIMARY KEY(section,entry_key));
    INSERT dbo.policy_probe SELECT JSON_VALUE(@json,'$.format'),section,entry_key,payload FROM OPENJSON(@json,'$.rows')
      WITH(section nvarchar(32),entry_key nvarchar(200) '$.key',payload nvarchar(max)); SELECT 1;`, { jsonInput: JSON.stringify(policy) })
  // ISJSON în versiunea SQL folosită verifică obiect/array; toate payload-urile de față sunt obiect/array.
  const snapshot = `SELECT (SELECT TOP(1) format FROM dbo.policy_probe) format,
    JSON_QUERY((SELECT section,entry_key [key],payload FROM dbo.policy_probe ORDER BY section DESC,entry_key DESC FOR JSON PATH)) rows
    FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`
  const before = f.sql(snapshot), restored = decodePolicyContext(JSON.parse(before))
  // Ordinea rândurilor nu are semnificație pentru setul departamentelor.
  assert.deepEqual(restored.settings, db.settings)
  for (const dept of db.departments) assert.deepEqual(restored.departments.find(d => d.id === dept.id), dept)
  const catalog = new Set(['custom-reader', 'viewer', 'superadmin'])
  let decisions = 0
  for (const departmentId of ['open', 'closed', 'limited', 'null']) {
    for (const roles of [[], ['viewer'], ['superadmin']]) {
      const user = { id: 'aaaaaaaa-0000-0000-0000-000000000001', role: 'custom-reader', roles, active: true, departmentId }
      const encoded = encodeRoleLinks(user, catalog), u = { ...user, ...decodeRoleLinks(encoded.primaryRole, encoded.links, catalog) }
      const beforeEntitlements = effectiveEntitlements({ license: db.settings.license, settings: db.settings })
      const afterEntitlements = effectiveEntitlements({ license: restored.settings.license, settings: restored.settings })
      for (const permission of [...allPermissions, 'future:permission']) {
        assert.equal(authHasPermission({ user: u, db: restored, entitlements: afterEntitlements }, permission), authHasPermission({ user, db, entitlements: beforeEntitlements }, permission)); decisions++
      }
    }
  }
  // Suprimarea unui rând obligatoriu nu trebuie să activeze default-uri.
  const incomplete = JSON.parse(before); incomplete.rows = incomplete.rows.filter(r => r.key !== 'rolePermissionOverrides')
  assert.throws(() => decodePolicyContext(incomplete))
  assert.equal(f.sql(snapshot), before)
  console.log(`Politici SQL OK: ${f.database}; ${decisions} decizii comparate, setări și restricții recitite, configurație incompletă refuzată.`)
})
