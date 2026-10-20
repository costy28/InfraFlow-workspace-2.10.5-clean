const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { splitSqlBatches } = require('../core/migrations')
const { createDocumentsSqlFixture } = require('./support/documents-sql-fixture')
const { analyzeCoreSync } = require('../../scripts/lib/core-sync-preflight')
test('preflight Core pe snapshot SQL real: nicio modificare a datelor analizate', { skip: process.env.INFRAFLOW_TEST_RELATIONAL_SQL !== '1', timeout: 180000 }, () => {
  const f = createDocumentsSqlFixture({ empty: true })
  for (const file of ['001_core.sql','002_inventory_workflow.sql','003_seed_standard_modules.sql']) {
    const batches = splitSqlBatches(fs.readFileSync(path.resolve(__dirname, '../../db/sqlserver',file),'utf8'))
    f.sql(batches.map(batch => `EXEC sp_executesql N'${batch.replaceAll("'","''")}';`).join('\n')+'\nSELECT 1;')
  }
  const company = '11111111-1111-4111-8111-111111111111', department = '22222222-2222-4222-8222-222222222222', user = '33333333-3333-4333-8333-333333333333'
  const source = { users: [{ id: user, username: 'test_reader', name: 'Cititor test', role: 'viewer', departmentId: department, active: true, passwordHash: `scrypt:${'a'.repeat(32)}:${'b'.repeat(128)}` }], departments: [{ id: department, name: 'Departament test', moduleKey: 'production', active: true }] }
  f.sql(`INSERT core.companies(id,name) VALUES('${company}',N'Companie test'); INSERT core.departments(id,company_id,module_key,name) VALUES('${department}','${company}',N'production',N'Departament test'); INSERT core.users(id,company_id,department_id,role_key,username,display_name,password_hash) VALUES('${user}','${company}','${department}',N'viewer',N'test_reader',N'Cititor test',N'HASH_TARGET_NEEXPORTAT'); CREATE TABLE dbo.app_state(id int PRIMARY KEY,data nvarchar(max)); INSERT dbo.app_state VALUES(1,@json); SELECT 1;`, { jsonInput: JSON.stringify(source) })
  const query = `SELECT JSON_QUERY((SELECT CONVERT(nvarchar(36),id) id FROM core.companies FOR JSON PATH)) companies,
    JSON_QUERY((SELECT CONVERT(nvarchar(36),id) id,CONVERT(nvarchar(36),company_id) company_id,module_key,name,active FROM core.departments FOR JSON PATH)) departments,
    JSON_QUERY((SELECT CONVERT(nvarchar(36),id) id,CONVERT(nvarchar(36),company_id) company_id,CONVERT(nvarchar(36),department_id) department_id,role_key,username,display_name,active FROM core.users FOR JSON PATH)) users,
    JSON_QUERY((SELECT role_key FROM core.roles FOR JSON PATH)) roles,JSON_QUERY((SELECT module_key FROM core.modules FOR JSON PATH)) modules FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`
  const before = f.sql(query), stateBefore = f.sql('SELECT data FROM dbo.app_state WHERE id=1;')
  const result = analyzeCoreSync(JSON.parse(stateBefore), JSON.parse(before), { companyId: company })
  assert.equal(result.totals.blockers, 0); assert.equal(result.writeAuthorized, false)
  const changed = JSON.parse(stateBefore); changed.users[0].roles = ['viewer','manager']
  assert.ok(analyzeCoreSync(changed,JSON.parse(before),{companyId:company}).issues.some(row => row.code==='single_role_mapping_required'))
  assert.equal(f.sql(query), before); assert.equal(f.sql('SELECT data FROM dbo.app_state WHERE id=1;'),stateBefore)
  assert.ok(!JSON.stringify(result).includes('HASH_TARGET_NEEXPORTAT'))
  console.log(`Preflight Core SQL OK: ${f.database}; snapshot și app_state neschimbate; import neautorizat.`)
})
