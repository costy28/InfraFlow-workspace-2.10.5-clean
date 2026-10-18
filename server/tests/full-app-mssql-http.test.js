const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const net = require('node:net')
const { spawn } = require('node:child_process')
const { createDocumentsSqlFixture } = require('./support/documents-sql-fixture')

test('app.js complet: MSSQL standard, login, roluri și persistență după restart', { skip: process.env.INFRAFLOW_TEST_FULL_APP_SQL !== '1', timeout: 600000 }, async () => {
  const root = path.resolve(__dirname, '../..')
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'infraflow-full-sql-'))
  const seed = path.join(directory, 'seed.json')
  const f = createDocumentsSqlFixture()
  assert.match(f.database, /^INFRAFLOW_TEST_DOCS_[A-F0-9]{12}$/)
  const password = `Full-${crypto.randomBytes(20).toString('hex')}!aA1`
  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`
  const state = { settings: { setupCompleted: true, initialSetupCompleted: true, networkAccessMode: 'open',
    license: { status: 'internal', plan: 'internal', modules: ['all'], maxDevices: 20 },
    customRoles: [{ id: 'smoke-reader', name: 'Cititor SQL test', permissions: ['documents:view_own', 'messaging:view'] }] },
    users: [{ id: f.users.reader, username: 'full_reader', name: 'Cititor SQL', role: 'smoke-reader', active: true, passwordHash },
      { id: f.users.approver, username: 'full_admin', name: 'Admin test', role: 'superadmin', active: true, passwordHash }],
    audit: [], departments: [], devices: [], notifications: [], documents: { documents: [
      { id: 1, uuid: f.uuids[1], titlu: 'Document propriu test', nr_document: 'FULL-1', creat_de: f.users.reader, status: 'draft' },
      { id: 2, uuid: f.uuids[2], titlu: 'Document străin test', nr_document: 'FULL-2', creat_de: f.users.other, status: 'draft' },
    ], documentTypes: [], circuitSteps: [], circuitAudit: [], documentShares: [] },
    messaging: { emailMessages: [{ id: 1, subject: 'Sursă proprie SQL', source_type: 'document', source_id: f.uuids[1] }] } }
  fs.writeFileSync(seed, JSON.stringify(state))
  const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve))
  const origin = `http://127.0.0.1:${port}/api`
  // Valorile explicite au prioritate față de runtime/mssql.env. Recuperarea
  // app-state este oprită pentru a nu importa date din instalarea de dezvoltare.
  const env = { ...process.env, NODE_ENV: 'test', APP_KEY: crypto.randomBytes(32).toString('hex'),
    INFRAFLOW_DB_PROVIDER: 'mssql', DB_MODE: 'mssql', DB_SERVER: '.\\SQLEXPRESS', DB_DATABASE: f.database,
    DB_TRUSTED_CONNECTION: 'true', DB_ENCRYPT: 'false', INFRAFLOW_DB_FILE: seed, INFRAFLOW_SEED_FILE: seed,
    INFRAFLOW_SQL_RELATIONAL: '0', MSSQL_RELATIONAL: '0', INFRAFLOW_DISABLE_APP_STATE_RECOVERY: '1',
    INFRAFLOW_SCHEDULER_DISABLED: '1', INFRAFLOW_AUDIT_SMOKE: 'true',
    HOST: '127.0.0.1', INFRAFLOW_HOST: '127.0.0.1', PORT: String(port), INFRAFLOW_PORT: String(port) }
  let child, output = '', checks = 0
  async function stop() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    const stopped = new Promise(resolve => child.once('exit', resolve)); child.kill(); await stopped
  }
  async function start() {
    child = spawn(process.execPath, [path.join(root, 'server/app.js')], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', value => { output += value }); child.stderr.on('data', value => { output += value })
    let healthy = false
    const deadline = Date.now() + 240000
    while (Date.now() < deadline && child.exitCode === null) {
      try { const response = await fetch(`${origin}/health`, { headers: { Connection: 'close' }, signal: AbortSignal.timeout(1000) }); if (response.ok) { healthy = true; break } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    assert.ok(healthy, `Serverul de test nu a pornit. Jurnal: ${path.join(directory, 'server.log')}`)
    console.log(`app.js MSSQL pornit: ${f.database}, port ${port}`)
  }
  async function request(url, token, method = 'GET', body, expected = 200) {
    const response = await fetch(origin + url, { method, headers: { 'Content-Type': 'application/json', Connection: 'close', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120000) })
    const text = await response.text(); assert.equal(response.status, expected, `${method} ${url}: ${text.slice(0, 240)}`)
    checks++; console.log(`app.js SQL: ${checks} cereri verificate`); return JSON.parse(text)
  }
  const login = name => request('/login', null, 'POST', { username: name, password })
  try {
    await start()
    const health = await request('/system/health')
    assert.equal(health.mode, 'mssql'); assert.equal(health.database, f.database)
    await request('/session', null, 'GET', undefined, 401)
    await request('/login', null, 'POST', { username: 'full_reader', password: 'greșit' }, 401)
    const reader = (await login('full_reader')).token
    const admin = (await login('full_admin')).token
    assert.ok(reader); assert.ok(admin)
    const session = await request('/session', reader)
    assert.equal(session.user.passwordHash, undefined)
    assert.ok(session.permissions.includes('documents:view_own'))
    await request(`/documents/${f.uuids[1]}`, reader)
    await request(`/documents/${f.uuids[2]}`, reader, 'GET', undefined, 403)
    await request(`/documents/${f.uuids[1]}/watch`, reader, 'POST', { watched: true })
    const inbox = await request('/messaging/email/inbox', reader)
    assert.equal(inbox.emails[0].source_url, `/documente?document=${f.uuids[1]}`)
    await request('/roles/smoke-reader/permissions', admin, 'PATCH', { permissions: ['messaging:view'] })
    await request(`/documents/${f.uuids[1]}`, reader, 'GET', undefined, 403)
    assert.equal((await request('/messaging/email/inbox', reader)).emails[0].source_id, null)
    await request(`/users/${f.users.reader}`, admin, 'PATCH', { active: false })
    await request('/session', reader, 'GET', undefined, 401)
    await stop()
    const stored = JSON.parse(f.sql('SELECT data FROM dbo.app_state WHERE id=1;'))
    assert.equal(stored.users.find(row => row.id === f.users.reader).active, false)
    assert.ok(stored.audit.some(row => row.action === 'rol_permisiuni_salvate'))
    assert.ok(stored.audit.some(row => row.action === 'utilizator_modificat'))
    assert.ok(stored.audit.some(row => row.action === 'auth_login_reusit'))
    assert.ok(stored.documents.documents.find(row => row.uuid === f.uuids[1]).date_json.includes(f.users.reader))
    await start()
    await request('/login', null, 'POST', { username: 'full_reader', password }, 401)
    const restartedAdmin = (await login('full_admin')).token
    const users = await request('/users', restartedAdmin)
    assert.equal(users.users.find(row => row.id === f.users.reader).active, false)
    console.log(`app.js complet SQL OK: ${checks} cereri, două porniri, ${f.database}. Fără VM sau adaptor DB. Configurație app_state standard; modul relațional extins oprit.`)
  } finally {
    await stop(); fs.writeFileSync(path.join(directory, 'server.log'), output)
    console.log(`Jurnal izolat: ${path.join(directory, 'server.log')}`)
  }
})
