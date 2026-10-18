const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { splitSqlBatches } = require('../core/migrations')
const { createDocumentsSqlFixture } = require('./support/documents-sql-fixture')
const directory = path.resolve(__dirname, '../../db/migrations')
const repair = '062b_hr_employee_file_ack_columns.sql'
const original = '063_hr_employee_file_acknowledgements.sql'

test('migrarea pregătitoare HR este ordonată înainte de 063', () => {
  const files = fs.readdirSync(directory).filter(name => name.endsWith('.sql')).sort((a, b) => a.localeCompare(b))
  assert.ok(files.indexOf(repair) > files.indexOf('062_hr_document_templates.sql'))
  assert.ok(files.indexOf(repair) < files.indexOf(original))
})

test('migrare HR reală SQL: reproducere, pregătire, idempotentă și date păstrate', { skip: process.env.INFRAFLOW_TEST_RELATIONAL_SQL !== '1', timeout: 180000 }, () => {
  const f = createDocumentsSqlFixture({ empty: true })
  const apply = name => {
    for (const batch of splitSqlBatches(fs.readFileSync(path.join(directory, name), 'utf8'))) f.sql(`${batch}\nSELECT 1;`)
  }
  f.sql("EXEC(N'CREATE SCHEMA hr'); SELECT 1;")
  apply('056_hr_employee_files_timesheet_locks.sql')
  assert.throws(() => apply(original), error => String(error.stderr || error.message).includes("Invalid column name 'generated'"))
  apply(repair)
  f.sql(`INSERT hr.employee_files(uuid,employee_id,tip,file_name,stored_name,generated,cancelled_at) VALUES
    ('11111111-1111-4111-8111-111111111111',1,N'test',N'a',N'a',1,NULL),
    ('22222222-2222-4222-8222-222222222222',2,N'test',N'b',N'b',1,SYSDATETIME()),
    ('33333333-3333-4333-8333-333333333333',3,N'test',N'c',N'c',0,NULL); SELECT 1;`)
  apply(original); apply(repair); apply(original)
  const rows = JSON.parse(f.sql('SELECT employee_id,generated,requires_ack,kiosk_visible FROM hr.employee_files ORDER BY employee_id FOR JSON PATH;'))
  assert.equal(rows.length, 3)
  assert.equal(rows[0].requires_ack, true); assert.equal(rows[0].kiosk_visible, true)
  assert.equal(rows[1].requires_ack, false); assert.equal(rows[1].kiosk_visible, false)
  assert.equal(rows[2].requires_ack, false); assert.equal(rows[2].kiosk_visible, false)
  console.log(`Migrare HR SQL OK: ${f.database}; trei înregistrări păstrate, rulare repetată verificată.`)
})
