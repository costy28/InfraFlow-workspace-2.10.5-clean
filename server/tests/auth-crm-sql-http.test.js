const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const { createRequire } = require('node:module')
const express = require('express')
const { splitSqlBatches } = require('../core/migrations')
const { createDocumentsSqlFixture } = require('./support/documents-sql-fixture')

// Opt-in: creează și păstrează o bază sintetică, niciodată baza instalată.
test('Login Bearer real și surse CRM SQL, cu adaptor app-state de test', { skip: process.env.INFRAFLOW_TEST_DOCUMENTS_SQL !== '1', timeout: 420000 }, async () => {
  const f = createDocumentsSqlFixture()
  for (const name of ['070_crm_sales_automation_foundation.sql', '071_crm_sales_automation_sprint_2.sql', '072_crm_quotes_sprint_3.sql', '073_crm_quote_public_links_sprint_4.sql', '074_crm_customer_orders_sprint_5.sql']) {
    const source = fs.readFileSync(path.join(__dirname, '../../db/migrations', name), 'utf8')
    // Un apel per migrare; sp_executesql păstrează separarea batch-urilor GO.
    f.sql(splitSqlBatches(source).map(batch => `EXEC sp_executesql N'${batch.replaceAll("'", "''")}';`).join('\n') + '\nSELECT 1;')
  }
  f.sql(`INSERT crm.accounts(name) VALUES(N'Client test');
    INSERT crm.leads(title) VALUES(N'Lead SQL'),(N'Lead anulat');
    UPDATE crm.leads SET cancelled_at=SYSUTCDATETIME() WHERE id=2;
    INSERT crm.quotes(quote_number,title,account_id) VALUES(N'OF-SQL',N'Ofertă SQL',1);
    INSERT crm.customer_orders(order_number,account_id,source_quote_id) VALUES(N'CO-SQL',1,1);
    CREATE TABLE dbo.app_state(id int PRIMARY KEY, data nvarchar(max) NOT NULL); SELECT 1;`)
  const password = `Test-${crypto.randomBytes(20).toString('hex')}!aA1`
  const salt = crypto.randomBytes(16).toString('hex')
  const state = { settings: { setupCompleted: true, license: { status: 'internal', plan: 'internal', modules: ['all'] }, customRoles: [
    { id: 'reader', permissions: ['documents:view_own', 'messaging:view', 'crm:view', 'crm:order_manage'] },
  ] }, users: [{ id: f.users.reader, username: 'sql_reader', name: 'Cititor test', role: 'reader', active: true,
    passwordHash: `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}` }],
    audit: [], devices: [], departments: [], notifications: [], documents: {}, messaging: { emailMessages: [
      ...['crm_quote', 'crm_lead', 'crm_customer_order'].map((type, index) => ({ id: index + 1, subject: type, source_type: type, source_id: '1', source_label: 'FALS', source_url: '/setari' })),
      { id: 4, subject: 'Lipsă', source_type: 'crm_quote', source_id: '999' },
      { id: 5, subject: 'Anulat', source_type: 'crm_lead', source_id: '2' },
    ] } }
  f.sql('INSERT dbo.app_state(id,data) VALUES(1,@json); SELECT 1;', { jsonInput: JSON.stringify(state) })
  const readDb = () => JSON.parse(f.sql('SELECT data FROM dbo.app_state WHERE id=1;'))
  const writeDb = db => f.sql('UPDATE dbo.app_state SET data=@json WHERE id=1; SELECT 1;', { jsonInput: JSON.stringify(db) })
  const adapter = { DB_MODE: 'mssql', MSSQL_RELATIONAL_MODE: true, runMssqlScalar: f.sql, readDb, writeDb, cloneDb: db => JSON.parse(JSON.stringify(db)) }
  const cache = new Map()
  const root = path.resolve(__dirname, '..')
  const selected = ['core/auth.js', 'core/auth-routes.js', 'core/setup.js', 'modules/documents/routes.js', 'modules/documents/engine.js', 'modules/messaging/routes.js', 'modules/crm/repository.js', 'modules/crm/quote-repository.js', 'modules/crm/order-repository.js']
  function load(relative) {
    const filename = path.resolve(root, relative)
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }; cache.set(filename, module)
    const local = createRequire(filename)
    function requireTest(name) {
      const resolved = local.resolve(name)
      if (resolved === path.join(root, 'core/db.js')) return adapter
      const rel = path.relative(root, resolved).replaceAll(path.sep, '/')
      return selected.includes(rel) ? load(rel) : local(name)
    }
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { require: requireTest, module, exports: module.exports, __dirname: path.dirname(filename), __filename: filename,
      console, process, Buffer, URL, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval, global }, { filename })
    return module.exports
  }
  const app = express(); app.use(express.json())
  app.use('/api', load('core/auth-routes.js'))
  app.use('/api', load('modules/documents/routes.js'))
  app.use('/api', load('modules/messaging/routes.js').router)
  app.use((error, req, res, next) => res.status(error.status >= 400 && error.status <= 599 ? error.status : 500).json({ error: error.message }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const origin = `http://127.0.0.1:${server.address().port}/api`
  let checks = 0
  async function request(url, token, body, expected = 200) {
    // Helper-ul PowerShell sincron blochează bucla Node între cereri; nu refolosim
    // un socket keep-alive pe care serverul îl poate închide între timp.
    const response = await fetch(origin + url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Connection: 'close', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(90000) })
    const text = await response.text()
    assert.equal(response.status, expected, `${url}: ${text.slice(0, 200)}`)
    checks++; console.log(`Auth/CRM SQL: ${checks} cereri verificate`)
    return JSON.parse(text)
  }
  try {
    await request('/messaging/email/inbox', null, null, 401)
    await request('/login', null, { username: 'sql_reader', password: 'greșit' }, 401)
    const login = await request('/login', null, { username: 'sql_reader', password })
    assert.ok(login.token); assert.equal(login.user.passwordHash, undefined)
    const token = login.token
    await request(`/documents/${f.uuids[1]}`, token)
    await request(`/documents/${f.uuids[2]}`, token, null, 403)
    const inbox = await request('/messaging/email/inbox', token)
    const rows = Object.fromEntries(inbox.emails.map(row => [row.id, row]))
    assert.equal(rows[1].source_label, 'OF-SQL')
    assert.equal(rows[1].source_url, '/crm/oferte/1')
    assert.equal(rows[2].source_label, 'Lead SQL')
    assert.equal(rows[2].source_url, '/crm/leads/1')
    assert.equal(rows[3].source_label, 'CO-SQL'); assert.equal(rows[3].source_url, null)
    assert.equal(rows[4].source_id, null); assert.equal(rows[5].source_id, null)
    const changed = readDb()
    assert.ok(changed.audit.some(row => row.action === 'auth_login_reusit'))
    assert.ok(changed.audit.some(row => row.action === 'auth_login_esuat'))
    changed.settings.customRoles[0].permissions = ['documents:view_own', 'messaging:view']
    writeDb(changed)
    const revoked = await request('/messaging/email/inbox', token)
    assert.ok(revoked.emails.every(row => row.source_id === null))
    const disabled = readDb(); disabled.users[0].active = false; writeDb(disabled)
    await request('/messaging/email/inbox', token, null, 401)
    await request('/messaging/email/inbox', token, null, 401)
    console.log(`Auth/CRM SQL OK: ${checks} cereri, ${f.calls()} interogări, ${f.database}. Adaptor DB dedicat; fără app.js complet.`)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
