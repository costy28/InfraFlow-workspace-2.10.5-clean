const { execFileSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { splitSqlBatches } = require('../../core/migrations')

function createDocumentsSqlFixture(options = {}) {
  const database = `INFRAFLOW_TEST_DOCS_${crypto.randomBytes(6).toString('hex').toUpperCase()}`
  if (!/^INFRAFLOW_TEST_DOCS_[A-F0-9]{12}$/.test(database)) throw Error('Nume bază de test invalid')
  let calls = 0
  function run(databaseName, query, options = {}) {
    calls++
    const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Data;
      $c=New-Object System.Data.SqlClient.SqlConnection('Server=.\\SQLEXPRESS;Database=${databaseName};Integrated Security=True;TrustServerCertificate=True;Connect Timeout=5');
      try { $c.Open(); $q=$c.CreateCommand(); $q.CommandTimeout=30;
        $q.CommandText=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:TEST_SQL));
        $p=$q.Parameters.Add('@json',[Data.SqlDbType]::NVarChar,-1); $p.Value=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:TEST_JSON));
        $r=$q.ExecuteReader(); $b=New-Object Text.StringBuilder;
        while($r.Read()){[void]$b.Append([string]$r.GetValue(0))}; $r.Close(); [Console]::Write($b.ToString())
      } finally {$c.Dispose()}`
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8', timeout: 40000, windowsHide: true, maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, TEST_SQL: Buffer.from(query).toString('base64'), TEST_JSON: Buffer.from(options.jsonInput || '{}').toString('base64') },
    })
  }
  run('master', `CREATE DATABASE [${database}]`)
  console.log(`Bază SQL de test păstrată: ${database}`)
  if (options.empty === true) return { database, calls: () => calls, sql: (query, queryOptions) => run(database, query, queryOptions) }
  run(database, `EXEC(N'CREATE SCHEMA core'); EXEC(N'CREATE SCHEMA workflow'); EXEC(N'CREATE SCHEMA documents');
    CREATE TABLE core.users(id uniqueidentifier PRIMARY KEY);
    CREATE TABLE core.roles(role_key nvarchar(80) PRIMARY KEY);
    CREATE TABLE core.departments(id uniqueidentifier PRIMARY KEY);
    CREATE TABLE workflow.templates(id uniqueidentifier PRIMARY KEY);`)
  const migration = fs.readFileSync(path.join(__dirname, '../../../db/migrations/002_messaging_tickets_documents.sql'), 'utf8')
  const schema = migration.slice(migration.indexOf('-- DOCUMENTS'), migration.indexOf('-- FIELD'))
  if (!schema.includes('CREATE TABLE documents.document_shares')) throw Error('Schema Documente nu a fost găsită')
  run(database, `${schema}\nSELECT 1;`)
  const templatesMigration = fs.readFileSync(path.join(__dirname, '../../../db/migrations/030_document_template_files.sql'), 'utf8')
  for (const batch of splitSqlBatches(templatesMigration)) run(database, `${batch}\nSELECT 1;`)
  const users = {
    reader: '11111111-1111-4111-8111-111111111111',
    other: '22222222-2222-4222-8222-222222222222',
    approver: '33333333-3333-4333-8333-333333333333',
  }
  const uuids = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [i + 1, `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`]))
  run(database, `INSERT core.users(id) VALUES('${users.reader}'),('${users.other}'),('${users.approver}');
    INSERT documents.document_types(id,denumire,template_html) VALUES(N'TEST',N'Tip test',N'<h1>Document test</h1>');
    ${Object.entries(uuids).map(([id, uuid]) => `INSERT documents.documents(uuid,tip_id,nr_document,titlu,status,creat_de,date_json) VALUES('${uuid}',N'TEST',N'TEST-${id}',N'Document ${id}',N'in_circuit','${id === '1' ? users.reader : users.other}',N'${id === '2' ? JSON.stringify({ watchers: [users.reader] }) : '{}'}');`).join('\n')}
    INSERT documents.document_shares(document_id,shared_with_user,shared_by,expires_at) VALUES
      (3,'${users.reader}','${users.other}',NULL),(3,'${users.reader}','${users.other}',NULL),
      (4,'${users.reader}','${users.other}','2000-01-01');
    INSERT documents.circuit_steps(document_id,nr_pas,tip,user_responsabil) VALUES
      (5,1,N'aprobare','${users.reader}'),(6,1,N'aprobare','${users.approver}');
    SELECT 1;`)
  return { database, users, uuids, calls: () => calls, sql: (query, options) => run(database, query, options) }
}
module.exports = { createDocumentsSqlFixture }
