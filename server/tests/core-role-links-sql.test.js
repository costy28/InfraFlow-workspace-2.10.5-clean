'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createDocumentsSqlFixture } = require('./support/documents-sql-fixture')
const { splitSqlBatches } = require('../core/migrations')
const { encodeRoleLinks, decodeRoleLinks } = require('../../scripts/lib/core-role-links-prototype')
const { allPermissions, authHasPermission, normalizedUserRoles } = require('../core/permissions')
const { effectiveEntitlements } = require('../core/module-catalog')
test('asocieri multi-rol: prototip SQL sintetic păstrează rolul principal și deciziile runtime', {
  skip: process.env.INFRAFLOW_TEST_RELATIONAL_SQL !== '1', timeout: 180000
}, () => {
  const f = createDocumentsSqlFixture({ empty: true })
  assert.match(f.database, /^INFRAFLOW_TEST_DOCS_[A-F0-9]{12}$/)
  for (const file of ['001_core.sql', '002_inventory_workflow.sql', '003_seed_standard_modules.sql']) {
    const batches = splitSqlBatches(fs.readFileSync(path.resolve(__dirname, '../../db/sqlserver', file), 'utf8'))
    f.sql(batches.map(batch => `EXEC sp_executesql N'${batch.replaceAll("'", "''")}';`).join('\n') + '\nSELECT 1;')
  }
  const id = 'aaaaaaaa-0000-0000-0000-000000000001', company = 'bbbbbbbb-0000-0000-0000-000000000001'
  const user = { id, role: 'viewer', roles: ['manager', 'viewer', 'manager'], active: true }
  const catalog = new Set(JSON.parse(f.sql('SELECT role_key FROM core.roles FOR JSON PATH;')).map(r => r.role_key))
  const encoded = encodeRoleLinks(user, catalog)
  // DDL exclusiv de test, NU migrare în db/migrations și NU tabel folosit de ERP.
  f.sql(`CREATE TABLE core.user_role_probe(
    user_id uniqueidentifier NOT NULL REFERENCES core.users(id),
    role_key nvarchar(80) NOT NULL REFERENCES core.roles(role_key),
    source_position int NOT NULL CHECK(source_position>=0),
    PRIMARY KEY(user_id,role_key), UNIQUE(user_id,source_position));
    INSERT core.companies(id,name) VALUES('${company}',N'Companie sintetică');
    INSERT core.users(id,company_id,role_key,username,display_name,password_hash)
      VALUES('${id}','${company}',N'viewer',N'role_probe',N'Probă roluri',N'SYNTHETIC-NOT-FOR-LOGIN');
    CREATE TABLE dbo.app_state(id int PRIMARY KEY,data nvarchar(max));
    INSERT dbo.app_state VALUES(1,@json); SELECT 1;`, { jsonInput: JSON.stringify(user) })
  const stateBefore = f.sql('SELECT data FROM dbo.app_state WHERE id=1;')
  f.sql(`INSERT core.user_role_probe(user_id,role_key,source_position)
    SELECT '${id}',roleKey,position FROM OPENJSON(@json) WITH(roleKey nvarchar(80),position int); SELECT 1;`, { jsonInput: JSON.stringify(encoded.links) })
  const query = `SELECT JSON_QUERY((SELECT role_key FROM core.users WHERE id='${id}' FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)) main,
    JSON_QUERY((SELECT role_key roleKey,source_position position FROM core.user_role_probe WHERE user_id='${id}' ORDER BY source_position DESC FOR JSON PATH)) links
    FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`
  const before = f.sql(query), stored = JSON.parse(before)
  assert.equal(stored.main.role_key, 'viewer')
  const restored = { ...user, ...decodeRoleLinks(stored.main.role_key, stored.links, catalog) }
  assert.deepEqual(normalizedUserRoles(restored), normalizedUserRoles(user))
  const settings = { license: { status: 'internal' }, modules_enabled: ['hr', 'logistics'],
    rolePermissionOverrides: { viewer: ['logistics:view'], manager: ['logistics:manage'] }, customRoles: [] }
  for (const restricted of [false, true]) {
    const configured = structuredClone(settings)
    if (restricted) configured.modules_enabled = ['hr']
    const db = { settings: configured, departments: [] }, entitlements = effectiveEntitlements({ license: configured.license, settings: configured })
    for (const permission of [...allPermissions, 'future:permission']) assert.equal(
      authHasPermission({ user: restored, db, entitlements }, permission), authHasPermission({ user, db, entitlements }, permission))
  }
  for (const [role, position, expected] of [['viewer', 3, 2627], ['role_absent', 4, 547], ['admin', -1, 547], ['admin', 0, 2627]]) {
    const result = f.sql(`SET XACT_ABORT ON; BEGIN TRY BEGIN TRAN;
      INSERT core.user_role_probe VALUES('${id}',N'${role}',${position}); ROLLBACK; SELECT 0;
      END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; SELECT ERROR_NUMBER(); END CATCH;`)
    assert.equal(Number(result), expected)
  }
  assert.equal(f.sql(query), before); assert.equal(f.sql('SELECT data FROM dbo.app_state WHERE id=1;'), stateBefore)
  console.log(`Multi-rol SQL OK: ${f.database}; rol principal păstrat, asocieri reconstruite, PK/FK/ordine verificate; app_state neschimbat.`)
})
