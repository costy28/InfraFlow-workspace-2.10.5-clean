'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { splitSqlBatches } = require('../core/migrations')
const { createDocumentsSqlFixture } = require('./support/documents-sql-fixture')
const { simulateCoreSync } = require('../../scripts/lib/core-sync-simulation')
const { projectVerifiedSnapshot } = require('../../scripts/lib/core-sync-projection')
const { fingerprint } = require('../../scripts/lib/core-sync-manifest')

test('proiecție Core pe schema SQL reală: inserare sintetică, verificare și rollback', {
  skip: process.env.INFRAFLOW_TEST_RELATIONAL_SQL !== '1', timeout: 180000
}, () => {
  const f = createDocumentsSqlFixture({ empty: true })
  assert.match(f.database, /^INFRAFLOW_TEST_DOCS_[A-F0-9]{12}$/)
  for (const file of ['001_core.sql', '002_inventory_workflow.sql', '003_seed_standard_modules.sql']) {
    const batches = splitSqlBatches(fs.readFileSync(path.resolve(__dirname, '../../db/sqlserver', file), 'utf8'))
    f.sql(batches.map(batch => `EXEC sp_executesql N'${batch.replaceAll("'", "''")}';`).join('\n') + '\nSELECT 1;')
  }
  const company = '11111111-1111-4111-8111-111111111111'
  const department = '22222222-2222-4222-8222-222222222222'
  const user = '33333333-3333-4333-8333-333333333333'
  const source = { users: [{ id: 'legacy-user', username: 'test_projection', name: 'Cititor sintetic', role: 'viewer',
    departmentId: 'legacy-department', active: false, mustChangePassword: true,
    passwordHash: `scrypt:${'a'.repeat(32)}:${'b'.repeat(128)}`, email: 'synthetic@example.invalid', custom: { preserved: true } }],
    departments: [{ id: 'legacy-department', name: 'Departament sintetic', moduleKey: 'legacy-production', active: true }] }
  f.sql(`INSERT core.companies(id,name) VALUES('${company}',N'Companie sintetică'); CREATE TABLE dbo.app_state(id int PRIMARY KEY,data nvarchar(max)); INSERT dbo.app_state VALUES(1,@json); SELECT 1;`, { jsonInput: JSON.stringify(source) })
  const snapshotQuery = `SELECT JSON_QUERY((SELECT CONVERT(nvarchar(36),id) id FROM core.companies FOR JSON PATH)) companies,
    JSON_QUERY(COALESCE((SELECT CONVERT(nvarchar(36),id) id,CONVERT(nvarchar(36),company_id) company_id,module_key,name,active FROM core.departments FOR JSON PATH),N'[]')) departments,
    JSON_QUERY(COALESCE((SELECT CONVERT(nvarchar(36),id) id,CONVERT(nvarchar(36),company_id) company_id,role_key,username,display_name,active FROM core.users FOR JSON PATH),N'[]')) users,
    JSON_QUERY((SELECT role_key FROM core.roles FOR JSON PATH)) roles,JSON_QUERY((SELECT module_key FROM core.modules FOR JSON PATH)) modules FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`
  const before = f.sql(snapshotQuery), stateBefore = f.sql('SELECT data FROM dbo.app_state WHERE id=1;')
  const target = JSON.parse(before)
  const hashes = { source: fingerprint(stateBefore), target: fingerprint(before) }
  const manifest = { format: 'infraflow-core-sync-manifest-v1', revision: 1, companyId: company,
    snapshots: { sourceSha256: hashes.source, targetSha256: hashes.target }, mappings: {
      users: [{ source: 'legacy-user', target: user }], departments: [{ source: 'legacy-department', target: department }],
      modules: [{ source: 'legacy-production', target: 'production' }], roles: [{ source: 'viewer', target: 'viewer' }] } }
  const report = simulateCoreSync(source, target, manifest, hashes)
  assert.equal(report.simulationPerformed, true, JSON.stringify(report)); assert.equal(report.status, 'blocked')
  assert.equal(report.reconciliation.totals.blockers, 0)
  assert.equal(report.preservationReview.totals.uncoveredFields, 3)
  assert.equal(report.writeAuthorized, false)
  const projected = projectVerifiedSnapshot(source, manifest)
  assert.equal(projected.users[0].email, source.users[0].email)
  assert.deepEqual(projected.users[0].custom, source.users[0].custom)
  assert.equal(projected.users[0].mustChangePassword, true)
  assert.equal(source.users[0].id, 'legacy-user')
  // SQL exclusiv de test: aceleași valori proiectate, fără un importator în aplicație.
  // WITH nvarchar(max) evită trunchierea la citirea JSON, înaintea constrângerilor SQL.
  const inserts = `INSERT core.departments(id,company_id,module_key,name,active)
    SELECT id,companyId,moduleKey,name,active FROM OPENJSON(@json,'$.departments') WITH
    (id nvarchar(max),companyId nvarchar(max),moduleKey nvarchar(max),name nvarchar(max),active bit);
    INSERT core.users(id,company_id,department_id,role_key,username,display_name,password_hash,must_change_password,active)
    SELECT id,companyId,departmentId,role,username,name,passwordHash,mustChangePassword,active FROM OPENJSON(@json,'$.users') WITH
    (id nvarchar(max),companyId nvarchar(max),departmentId nvarchar(max),role nvarchar(max),username nvarchar(max),name nvarchar(max),passwordHash nvarchar(max),mustChangePassword bit,active bit);`
  const query = `SET XACT_ABORT ON; BEGIN TRY BEGIN TRAN;
    ${inserts}
    DECLARE @result nvarchar(max)=(SELECT CONVERT(nvarchar(36),u.id) id,CONVERT(nvarchar(36),u.department_id) department_id,
    u.username,u.display_name,u.role_key,u.password_hash,u.must_change_password,u.active,d.module_key
    FROM core.users u JOIN core.departments d ON u.department_id=d.id FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
    ROLLBACK; SELECT @result;
    END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH;`
  for (let i = 0; i < 2; i++) {
    const actual = JSON.parse(f.sql(query, { jsonInput: JSON.stringify(projected) }))
    assert.equal(actual.id.toLowerCase(), user); assert.equal(actual.department_id.toLowerCase(), department)
    assert.equal(actual.username, projected.users[0].username); assert.equal(actual.display_name, projected.users[0].name)
    assert.equal(actual.role_key, 'viewer'); assert.equal(actual.module_key, 'production')
    assert.equal(actual.active, false); assert.equal(actual.must_change_password, true)
    assert.equal(fingerprint(actual.password_hash), fingerprint(source.users[0].passwordHash))
  }
  const invalid = structuredClone(projected); invalid.users[0].role = 'ROLE_ABSENT'
  const error = f.sql(`SET XACT_ABORT ON; BEGIN TRY BEGIN TRAN; ${inserts} ROLLBACK; SELECT 0;
    END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; SELECT ERROR_NUMBER(); END CATCH;`, { jsonInput: JSON.stringify(invalid) })
  assert.equal(Number(error), 547)
  assert.equal(f.sql(snapshotQuery), before); assert.equal(f.sql('SELECT data FROM dbo.app_state WHERE id=1;'), stateBefore)
  assert.ok(!JSON.stringify(report).includes(source.users[0].passwordHash))
  console.log(`Proiecție SQL OK: ${f.database}; două tranzacții reușite și un FK refuzat, toate anulate; app_state neschimbat.`)
})
