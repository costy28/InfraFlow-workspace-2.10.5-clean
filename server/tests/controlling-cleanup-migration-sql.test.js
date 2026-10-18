const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { splitSqlBatches } = require('../core/migrations')
const { createDocumentsSqlFixture } = require('./support/documents-sql-fixture')
const root = path.resolve(__dirname, '../..')
const preflight = '065b_controlling_legacy_cleanup_preflight.sql'
const original = '066_controlling_generic_cost_centers.sql'
test('preflight Controlling precede migrarea istorică 066', () => {
  const files = fs.readdirSync(path.join(root, 'db/migrations')).sort((a,b) => a.localeCompare(b))
  assert.ok(files.indexOf(preflight) > files.indexOf('065_country_profile_settings.sql'))
  assert.ok(files.indexOf(preflight) < files.indexOf(original))
})
test('SQL Controlling: compilare, gardă personalizări/referințe și reluare sigură', { skip: process.env.INFRAFLOW_TEST_RELATIONAL_SQL !== '1', timeout: 240000 }, () => {
  const f = createDocumentsSqlFixture({ empty: true })
  const apply = file => {
    const batches = splitSqlBatches(fs.readFileSync(path.join(root, file), 'utf8'))
    f.sql(`SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF;\n` + batches.map(batch => `EXEC sp_executesql N'${batch.replaceAll("'", "''")}';`).join('\n')+'\nSELECT 1;')
  }
  for (const file of ['db/sqlserver/001_core.sql','db/sqlserver/002_inventory_workflow.sql','db/sqlserver/003_seed_standard_modules.sql',
    'db/migrations/004_controlling.sql','db/migrations/006_sanitation.sql','db/migrations/015_cost_centers_crud.sql','db/migrations/017_controlling_automat_mecanizare.sql','db/migrations/021_cost_centers_publiserv.sql']) apply(file)
  assert.throws(() => apply(`db/migrations/${original}`), error => String(error.stderr||error.message).includes("Invalid column name 'cancelled_at'"))
  // Coliziune de cod: un centru legitim nu este acceptat drept seed.
  f.sql("UPDATE controlling.cost_centers SET denumire=N'Administrativ client' WHERE cod=N'ADMINISTRATIV'; SELECT 1;")
  assert.throws(() => apply(`db/migrations/${preflight}`), error => String(error.stderr||error.message).includes('centru personalizat'))
  assert.equal(f.sql("SELECT activ FROM controlling.cost_centers WHERE cod=N'ADMINISTRATIV';").trim(), 'True')
  assert.equal(f.sql("SELECT COALESCE(COL_LENGTH(N'controlling.cost_centers',N'cancelled_at'),-1);").trim(), '-1')
  // Numai fixture-ul este schimbat pentru următorul scenariu; fără ștergeri.
  f.sql("UPDATE controlling.cost_centers SET cod=N'CC-ADMIN' WHERE cod=N'ADMINISTRATIV'; INSERT controlling.cost_centers(company_id,cod,denumire,tip) VALUES(1,N'CC-CLIENT',N'Centru client',N'general'); INSERT controlling.cost_center_objects(cost_center_id,object_id,object_type) SELECT id,N'test-object',N'vehicle' FROM controlling.cost_centers WHERE cod=N'2018611'; SELECT 1;")
  assert.throws(() => apply(`db/migrations/${preflight}`), error => String(error.stderr||error.message).includes('referinte operationale'))
  assert.equal(f.sql("SELECT COUNT(*) FROM controlling.cost_center_objects o JOIN controlling.cost_centers c ON c.id=o.cost_center_id WHERE c.cod=N'2018611';").trim(), '1')
  f.sql("UPDATE controlling.cost_center_objects SET cost_center_id=(SELECT id FROM controlling.cost_centers WHERE cod=N'CC-CLIENT'); INSERT controlling.budgets(cost_center_id,an,valoare) SELECT id,2026,123.45 FROM controlling.cost_centers WHERE cod=N'2018612'; SELECT 1;")
  assert.throws(() => apply(`db/migrations/${preflight}`), error => String(error.stderr||error.message).includes('referinte operationale'))
  assert.equal(f.sql('SELECT valoare FROM controlling.budgets;').trim(), '123.45')
  f.sql("UPDATE controlling.budgets SET cost_center_id=(SELECT id FROM controlling.cost_centers WHERE cod=N'CC-CLIENT'); INSERT fleet.assets(denumire,cost_center_id) SELECT N'Vehicul test',id FROM controlling.cost_centers WHERE cod=N'2018612'; SELECT 1;")
  assert.throws(() => apply(`db/migrations/${preflight}`), error => String(error.stderr||error.message).includes('referinte operationale'))
  f.sql("UPDATE fleet.assets SET cost_center_id=(SELECT id FROM controlling.cost_centers WHERE cod=N'CC-CLIENT'); SELECT 1;")
  apply(`db/migrations/${preflight}`); apply(`db/migrations/${original}`)
  const snapshot = f.sql("SELECT cod,denumire,activ,cancelled_at,cancelled_reason FROM controlling.cost_centers ORDER BY cod FOR JSON PATH;")
  apply(`db/migrations/${preflight}`); apply(`db/migrations/${original}`)
  assert.equal(f.sql("SELECT cod,denumire,activ,cancelled_at,cancelled_reason FROM controlling.cost_centers ORDER BY cod FOR JSON PATH;"), snapshot)
  assert.equal(f.sql("SELECT COUNT(*) FROM controlling.cost_centers;").trim(), '18')
  assert.equal(f.sql("SELECT COUNT(*) FROM controlling.cost_centers WHERE cod IN(N'CC-ADMIN',N'CC-CLIENT') AND activ=1 AND cancelled_at IS NULL;").trim(), '2')
  assert.equal(f.sql("SELECT COUNT(*) FROM controlling.cost_center_objects o JOIN controlling.cost_centers c ON c.id=o.cost_center_id WHERE c.cod=N'CC-CLIENT' AND o.activ=1 AND o.cancelled_at IS NULL;").trim(), '1')
  assert.equal(f.sql("SELECT COUNT(*) FROM fleet.assets a JOIN controlling.cost_centers c ON c.id=a.cost_center_id WHERE c.cod=N'CC-CLIENT';").trim(), '1')
  assert.equal(f.sql("SELECT COUNT(*) FROM controlling.budgets b JOIN controlling.cost_centers c ON c.id=b.cost_center_id WHERE c.cod=N'CC-CLIENT' AND b.valoare=123.45;").trim(), '1')
  // Istoricul aplicat nu blochează upgrade-uri doar fiindcă rămân date istorice.
  f.sql("CREATE TABLE dbo.schema_migrations(filename nvarchar(255)); INSERT dbo.schema_migrations VALUES(N'066_controlling_generic_cost_centers.sql'); INSERT controlling.cost_center_objects(cost_center_id,object_id,object_type) SELECT id,N'historical',N'vehicle' FROM controlling.cost_centers WHERE cod=N'2018611'; SELECT 1;")
  apply(`db/migrations/${preflight}`)
  console.log(`Controlling SQL OK: ${f.database}; 18 centre păstrate, coliziuni și referințe refuzate, asocieri client păstrate.`)
})
