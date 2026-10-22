'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const net = require('node:net')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { createDocumentsSqlFixture } = require('./support/documents-sql-fixture')
const { ROLE, companyRole } = require('../../scripts/lib/demo-company-setup')

test('două app.js/MSSQL: tokenuri, documente și fișiere separate în ambele direcții', {
  skip: process.env.INFRAFLOW_TEST_TWO_DEMOS_SQL !== '1', timeout: 600000,
}, async () => {
  const root = path.resolve(__dirname, '../..'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'infraflow-two-demos-'))
  const instances = []
  const restricted = process.env.INFRAFLOW_TEST_TWO_DEMOS_RESTRICTED === '1'
  let checks = 0
  async function make(label) {
    const fixture = createDocumentsSqlFixture({ empty: true }), runtime = path.join(dir, label)
    fs.mkdirSync(runtime)
    fs.cpSync(path.join(root, 'server'), path.join(runtime, 'server'), { recursive: true,
      filter: source => !['node_modules','tests'].includes(path.basename(source)) })
    fs.cpSync(path.join(root, 'db'), path.join(runtime, 'db'), { recursive: true })
    for (const name of ['version.json','package.json']) fs.copyFileSync(path.join(root, name), path.join(runtime, name))
    fs.symlinkSync(path.join(root, 'server/node_modules'), path.join(runtime, 'server/node_modules'), 'junction')
    const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    const license = { licenseId: `SYNTHETIC-${label}`, client: { nume: label, cui: '' }, pachet: 'Synthetic',
      module: ['all'], limite: { max_utilizatori: 20, max_dispozitive: 20 }, valabilitate: { tip: 'test', expira_la: '2099-01-01' } }
    const semnatura = crypto.sign('sha256', Buffer.from(JSON.stringify(license)), pair.privateKey).toString('base64')
    fs.writeFileSync(path.join(runtime, 'licenta.iflic'), JSON.stringify({ ...license, semnatura }))
    fs.writeFileSync(path.join(runtime, 'server/core/infraflow-public.pem'), pair.publicKey.export({ type: 'spki', format: 'pem' }))
    const password = `Synthetic-${crypto.randomBytes(16).toString('hex')}!aA1`, salt = crypto.randomBytes(16).toString('hex')
    const userId = '11111111-1111-4111-8111-111111111111' // Deliberately equal across companies.
    const documentId = crypto.randomUUID(), templateId = `TEST_${label}`
    const bytes = Buffer.from(`Private synthetic attachment ${label} ${crypto.randomUUID()}`)
    const file = path.join(runtime, `storage/document-templates/${templateId}/file.txt`)
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes)
    const state = { settings: { setupCompleted: true, initialSetupCompleted: true, networkAccessMode: 'open',
      companyName: `Synthetic ${label}`, license: { plan: 'internal', modules: ['all'], maxDevices: 20 }, modules_enabled: ['documents','hr'],
      customRoles: restricted ? [{ ...companyRole(), permissions: [...companyRole().permissions, 'documents:templates'] }] : [] },
      users: [{ id: userId, username: 'same_admin', name: `Admin ${label}`, role: restricted ? ROLE : 'superadmin', active: true,
        passwordHash: `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}` }],
      departments: [], devices: [], audit: [], notifications: [],
      documents: { documents: [{ id: 1, uuid: documentId, titlu: `Private ${label}`, creat_de: userId, status: 'draft' }],
        documentTypes: [{ id: templateId, denumire: label, fisier_model_path: `storage/document-templates/${templateId}/file.txt`, fisier_model_name: 'file.txt' }],
        circuitSteps: [], circuitAudit: [], documentShares: [] } }
    const seed = path.join(runtime, 'seed.json'); fs.writeFileSync(seed, JSON.stringify(state))
    fs.mkdirSync(path.join(runtime, 'runtime')); fs.writeFileSync(path.join(runtime, 'runtime/app.key'), crypto.randomBytes(32).toString('hex'))
    const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
    const port = listener.address().port; await new Promise(resolve => listener.close(resolve))
    const env = { ...process.env, NODE_ENV: 'test', APP_KEY: '', INFRAFLOW_DB_PROVIDER: 'mssql', DB_MODE: 'mssql',
      DB_SERVER: '.\\SQLEXPRESS', DB_DATABASE: fixture.database, DB_TRUSTED_CONNECTION: 'true', DB_ENCRYPT: 'false',
      INFRAFLOW_DB_FILE: seed, INFRAFLOW_SEED_FILE: seed, INFRAFLOW_SQL_RELATIONAL: '0', MSSQL_RELATIONAL: '0',
      INFRAFLOW_DISABLE_APP_STATE_RECOVERY: '1', INFRAFLOW_SCHEDULER_DISABLED: '1', INFRAFLOW_AUDIT_SMOKE: 'true',
      HOST: '127.0.0.1', INFRAFLOW_HOST: '127.0.0.1', PORT: String(port), INFRAFLOW_PORT: String(port) }
    const instance = { label, fixture, runtime, env, password, documentId, templateId, bytes, origin: `http://127.0.0.1:${port}/api` }
    instances.push(instance); return instance
  }
  async function stop(i) {
    if (!i.child || i.child.exitCode !== null || i.child.signalCode !== null) return
    const done = new Promise(resolve => i.child.once('exit', resolve)); i.child.kill(); await done
  }
  async function start(i) {
    i.child = spawn(process.execPath, [path.join(i.runtime, 'server/app.js')], { cwd: i.runtime, env: i.env, windowsHide: true, stdio: ['ignore','pipe','pipe'] })
    i.child.stdout.on('data', () => {}); i.child.stderr.on('data', () => {})
    const deadline = Date.now() + 240000
    while (Date.now() < deadline && i.child.exitCode === null) {
      try { if ((await fetch(i.origin + '/health', { signal: AbortSignal.timeout(1000), headers: { Connection: 'close' } })).ok) return } catch {}
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    assert.fail(`Instanța sintetică ${i.label} nu a pornit`)
  }
  async function request(i, url, token, status = 200, method = 'GET', body) {
    const response = await fetch(i.origin + url, { method, headers: { Connection: 'close', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120000) })
    assert.equal(response.status, status, `${i.label} ${method} ${url}`); checks++
    return response
  }
  try {
    const a = await make('A'), b = await make('B')
    assert.notEqual(a.fixture.database, b.fixture.database); assert.notEqual(a.origin, b.origin)
    await Promise.all(instances.map(start))
    for (const i of instances) {
      const health = await (await request(i, '/system/health')).json(); assert.equal(health.database, i.fixture.database)
      i.token = (await (await request(i, '/login', null, 200, 'POST', { username: 'same_admin', password: i.password })).json()).token
      assert.ok(i.token)
      if (restricted) {
        const session = await (await request(i, '/session', i.token)).json()
        assert.equal(session.user.role, ROLE)
        for (const permission of ['settings:manage','users:manage','system:view','audit:manage']) assert.equal(session.permissions.includes(permission), false)
      }
    }
    assert.notEqual(a.token, b.token)
    for (const [own, other] of [[a,b],[b,a]]) {
      await request(other, '/session', own.token, 401)
      await request(other, `/documents/${other.documentId}`, own.token, 401)
      await request(other, `/documents/templates/${other.templateId}/download-model`, own.token, 401)
      await request(own, '/login', null, 401, 'POST', { username: 'same_admin', password: other.password })
      const doc = await (await request(own, `/documents/${own.documentId}`, own.token)).json()
      assert.equal(doc.document.titlu, `Private ${own.label}`)
      await request(own, `/documents/${other.documentId}`, own.token, 404)
      await request(own, `/documents/${other.documentId}`, own.token, 404, 'PUT', { titlu: 'cross-company-attempt' })
      await request(own, `/documents/templates/${other.templateId}/download-model`, own.token, 404)
      const file = await request(own, `/documents/templates/${own.templateId}/download-model`, own.token)
      assert.equal(Buffer.from(await file.arrayBuffer()).equals(own.bytes), true)
    }
    await stop(a)
    await request(b, '/session', b.token)
    const unchanged = await (await request(b, `/documents/${b.documentId}`, b.token)).json()
    assert.equal(unchanged.document.titlu, 'Private B')
    console.log(`Izolare app.js/MSSQL: ${checks} cereri trecute; A oprit, B funcțional. Fără test ACL OS/SQL sau gateway.`)
  } finally { await Promise.all(instances.map(stop)) }
})
