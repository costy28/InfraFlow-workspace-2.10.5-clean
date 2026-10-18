'use strict'
// Diagnostic intern opt-in. Creează/păstrează exclusiv o bază sintetică locală.
// Nu montează aplicația și nu validează sincronizarea app_state → relațional.
const fs = require('node:fs')
const path = require('node:path')
const { splitSqlBatches } = require('../server/core/migrations')
const { createDocumentsSqlFixture } = require('../server/tests/support/documents-sql-fixture')
if (process.env.INFRAFLOW_TEST_RELATIONAL_SQL !== '1') {
  console.error('Diagnostic dezactivat. Activează explicit INFRAFLOW_TEST_RELATIONAL_SQL=1. Creează o bază SQL sintetică nouă.')
  process.exitCode = 2
} else {
  const fixture = createDocumentsSqlFixture({ empty: true })
  const root = path.resolve(__dirname, '..')
  const applied = []
  let failure = null
  const directories = ['db/sqlserver', 'db/migrations']
  for (const directory of directories) {
    for (const name of fs.readdirSync(path.join(root, directory)).filter(name => name.endsWith('.sql')).sort()) {
      const relative = `${directory}/${name}`
      const batches = splitSqlBatches(fs.readFileSync(path.join(root, relative), 'utf8'))
      try {
        const sql = `SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF;\n` +
          batches.map(batch => `EXEC sp_executesql N'${batch.replaceAll("'", "''")}';`).join('\n') + '\nSELECT 1;'
        fixture.sql(sql)
        applied.push(relative)
        console.log(`OK schema: ${relative}`)
      } catch (error) {
        failure = { file: relative, error: String(error.stderr || error.message).slice(0, 3000) }
        break
      }
    }
    if (failure) break
  }
  const result = { database: fixture.database, appliedCount: applied.length, applied, failure,
    syncFileExists: fs.existsSync(path.join(root, 'db/mssql-import-app-state.sql')),
    scope: 'Schema SQL reală, batch-uri GO păstrate prin sp_executesql; fără bootstrap complet core/db sau sincronizare app-state.' }
  console.log(JSON.stringify(result, null, 2))
  if (failure) process.exitCode = 1
}
