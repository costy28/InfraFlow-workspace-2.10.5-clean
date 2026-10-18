const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const express = require('express')
const { createDocumentsSqlFixture } = require('./support/documents-sql-fixture')
const { effectivePermissionsForUser } = require('../core/permissions')

test('Documente/Mesaje: HTTP și SQL Server reale în bază sintetică izolată', { skip: process.env.INFRAFLOW_TEST_DOCUMENTS_SQL !== '1', timeout: 240000 }, async () => {
  const f = createDocumentsSqlFixture()
  const db = { settings: { license: { plan: 'internal', modules: ['all'] }, customRoles: [
    { id: 'reader', permissions: ['documents:view_own', 'messaging:view', 'messaging:send'] },
    { id: 'approver', permissions: ['documents:view_own', 'documents:approve'] },
  ] }, users: Object.entries(f.users).map(([role, id]) => ({ id, role, active: true })), departments: [], notifications: [], documents: {}, messaging: { emailMessages: [{ id: 1, subject: 'SQL verificare', source_type: 'document', source_id: f.uuids[3] }] } }
  let writes = 0
  const cache = new Map()
  function load(relative) {
    const filename = path.resolve(__dirname, '..', relative)
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }; cache.set(filename, module)
    const localRequire = createRequire(filename)
    const customRequire = name => {
      if (name === '../../core/db') return { DB_MODE: 'mssql', MSSQL_RELATIONAL_MODE: true, runMssqlScalar: f.sql, readDb: () => db, writeDb: () => { writes++ } }
      if (name === '../../core/auth') return { requireAuth: (req, res) => {
        const user = db.users.find(row => row.role === req.get('x-test-role'))
        if (!user) { res.status(401).json({ error: 'Autentificare de test necesară' }); return null }
        return { db, user, permissions: effectivePermissionsForUser(user, db) }
      } }
      if (name === '../../core/audit') return { addAudit() {} }
      const resolved = localRequire.resolve(name)
      if (['modules/documents/routes.js', 'modules/documents/engine.js', 'modules/messaging/routes.js'].some(suffix => resolved.endsWith(suffix.replaceAll('/', path.sep)))) return load(path.relative(path.resolve(__dirname, '..'), resolved))
      return localRequire(name)
    }
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { require: customRequire, module, exports: module.exports, __dirname: path.dirname(filename), __filename: filename,
      console, process, Buffer, URL, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval, global,
    }, { filename })
    return module.exports
  }
  const app = express(); app.use(express.json())
  app.use('/api', load('modules/documents/routes.js'))
  app.use('/api', load('modules/messaging/routes.js').router)
  app.use((error, req, res, next) => res.status(error.status >= 400 && error.status <= 599 ? error.status : 500).json({ error: error.message }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const origin = `http://127.0.0.1:${server.address().port}/api`
  let checks = 0
  async function request(role, url, method = 'GET', body, expected = 200) {
    const response = await fetch(origin + url, { method, headers: { 'x-test-role': role, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) })
    const text = await response.text()
    assert.equal(response.status, expected, `${method} ${url}: ${text.slice(0, 180)}`)
    checks++
    if (checks % 5 === 0) console.log(`SQL/HTTP: ${checks} cereri verificate`)
    return response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text
  }
  try {
    await request('reader', `/documents/${f.uuids[1]}`)
    for (const suffix of ['', '/pdf', '/audit']) await request('reader', `/documents/${f.uuids[2]}${suffix}`, 'GET', undefined, 403)
    const shared = await request('reader', '/documents/shared')
    assert.deepEqual(shared.documents.map(row => row.id), [3])
    await request('reader', `/documents/${f.uuids[2]}/watch`, 'POST', { watched: true }, 403)
    await request('reader', `/documents/${f.uuids[3]}/watch`, 'POST', { watched: true })
    assert.deepEqual((await request('reader', '/documents/watched')).documents.map(row => row.id), [3])
    await request('reader', `/documents/${f.uuids[3]}/pdf`)
    await request('reader', `/documents/${f.uuids[5]}/approve`, 'POST', {}, 403)
    await request('approver', `/documents/${f.uuids[6]}/approve`, 'POST', {})
    assert.equal((await request('approver', `/documents/${f.uuids[6]}`)).document.status, 'aprobat')
    assert.equal(f.sql('SELECT COUNT(*) FROM documents.circuit_audit WHERE document_id=6 AND actiune=N\'aprobat\';').trim(), '1')
    const targets = await request('reader', '/messaging/email/link-targets?type=document')
    assert.ok(targets.targets.some(row => row.target_id === f.uuids[3]))
    assert.ok(!targets.targets.some(row => [f.uuids[2], f.uuids[4]].includes(row.target_id)))
    await request('reader', '/messaging/email/inbox/1/links', 'POST', { target_type: 'document', target_id: f.uuids[2] }, 403)
    await request('reader', '/messaging/email/inbox/1/links', 'POST', { target_type: 'document', target_id: f.uuids[3] }, 201)
    assert.equal((await request('reader', '/messaging/email/inbox')).emails[0].source_url, `/documente?document=${f.uuids[3]}`)
    f.sql('UPDATE documents.document_shares SET expires_at=DATEADD(day,-1,sysdatetime()) WHERE document_id=3; SELECT 1;')
    await request('reader', `/documents/${f.uuids[3]}`, 'GET', undefined, 403)
    assert.equal((await request('reader', '/documents/watched')).documents.length, 0)
    const revoked = await request('reader', '/messaging/email/inbox')
    assert.equal(revoked.emails[0].links.length, 0)
    assert.equal(revoked.emails[0].source_url, null)
    assert.ok(writes > 0)
    console.log(`SQL/HTTP: ${checks} cereri verificate, ${f.calls()} interogări; bază ${f.database}. Auth și app-state simulate; SQL Documente real.`)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
