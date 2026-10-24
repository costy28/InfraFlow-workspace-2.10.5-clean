'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { createSyntheticTrialStore } = require('../../scripts/lib/demo-trial-store')
const { ROLE, companyRole } = require('../../scripts/lib/demo-company-setup')
const trialId = '11111111-1111-4111-8111-111111111111'
test('setup HTTP: login real, proprietar din sesiune, progres persistent și expirare', { timeout: 60000 }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'infraflow-trial-store-')), store = createSyntheticTrialStore(dir)
  const dbFile = path.join(dir, 'synthetic-db.json'), now = Date.now() - 1000
  const password = `Synthetic-${crypto.randomBytes(16).toString('hex')}!aA1`, salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`
  const db = { settings: { demoTrialId: trialId, setupCompleted: true, initialSetupCompleted: true, networkAccessMode: 'open',
    license: { plan: 'internal', modules: ['all'], maxDevices: 20 }, modules_enabled: ['documents'], customRoles: [companyRole()] },
    users: ['owner','other'].map(id => ({ id, username: id, name: id, role: ROLE, active: true, passwordHash })),
    devices: [], departments: [], audit: [], notifications: [] }
  let child, origin, checks = 0
  async function stop() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    const done = new Promise(resolve => child.once('exit', resolve)); child.send('stop'); await done
  }
  async function start() {
    child = spawn(process.execPath, [path.join(__dirname, 'support/demo-setup-http-server.js')], {
      windowsHide: true, stdio: ['ignore','pipe','pipe','ipc'], env: { ...process.env,
        NODE_ENV: 'test', APP_KEY: crypto.randomBytes(32).toString('hex'), INFRAFLOW_DB_PROVIDER: 'json', DB_MODE: 'json',
        INFRAFLOW_DB_FILE: dbFile, INFRAFLOW_SEED_FILE: dbFile, SYNTHETIC_STORE_DIR: dir, SYNTHETIC_TRIAL_ID: trialId } })
    child.stdout.on('data', () => {}); child.stderr.on('data', () => {})
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Synthetic server startup timeout')), 15000)
      child.once('message', msg => { clearTimeout(timer); resolve(msg.port) })
      child.once('error', e => { clearTimeout(timer); reject(e) })
      child.once('exit', () => { clearTimeout(timer); reject(Error('Synthetic server exited')) })
    })
    origin = `http://127.0.0.1:${port}/api`
  }
  async function request(url, token, status = 200, method = 'GET', body) {
    const res = await fetch(origin + url, { method, headers: { 'Content-Type': 'application/json', Connection: 'close', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000) })
    assert.equal(res.status, status, `${method} ${url}`); checks++; return res.json()
  }
  const login = async username => (await request('/login', null, 200, 'POST', { username, password })).token
  const profile = { companyName: 'Synthetic company', country: 'RO', locale: 'ro-RO', currency: 'RON', timezone: 'Europe/Bucharest' }
  try {
    await fs.writeFile(dbFile, JSON.stringify(db)); await store.initialize(); await store.queue({ id: trialId, approvalId: 'approval-http', now })
    for (const action of ['provision','ready','activate']) {
      const row = (await store.read()).trials[0]
      await store.command({ trialId, commandId: action, expectedRevision: row.revision, action, now,
        actor: { id: 'service', kind: action === 'activate' ? 'activation_agent' : 'worker' } })
    }
    await store.bindSetup({ trialId, ownerId: 'owner', allowedModules: ['documents'] })
    const expiry = (await store.read()).trials[0].expiresAt
    await start()
    await request('/demo-company/setup', null, 401)
    await request('/login', null, 401, 'POST', { username: 'owner', password: 'wrong' })
    let token = await login('owner'), other = await login('other')
    await request('/demo-company/setup', other, 403)
    await request('/demo-company/setup', token)
    await request('/demo-company/setup/apply', token, 400, 'POST', { expectedRevision: 0 })
    const patch = { step: 'profile', input: profile, expectedRevision: 0 }
    await request('/demo-company/setup', token, 400, 'PATCH', { ...patch, trialId: 'foreign', user: { role: 'superadmin' } })
    await request('/demo-company/setup', token, 400, 'PATCH', { ...patch, input: { ...profile, expiresAt: 9999999999999 } })
    await request('/demo-company/setup', token, 200, 'PATCH', patch)
    await request('/demo-company/setup', token, 409, 'PATCH', patch)
    await request('/demo-company/setup', token, 400, 'PATCH', { step: 'modules', input: { modules: ['hr'] }, expectedRevision: 1 })
    await request('/demo-company/setup', token, 200, 'PATCH', { step: 'modules', input: { modules: ['documents'] }, expectedRevision: 1 })
    await stop(); await start()
    await request('/demo-company/setup', token, 401)
    token = await login('owner')
    const resumed = await request('/demo-company/setup', token)
    assert.equal(resumed.setup.profile.companyName, profile.companyName); assert.deepEqual(resumed.setup.modules, ['documents'])
    assert.equal(resumed.setup.revision, 2)
    await request('/demo-company/setup', token, 200, 'PATCH', { step: 'complete', input: {}, expectedRevision: 2 })
    const beforeApply = JSON.parse(await fs.readFile(dbFile, 'utf8'))
    await request('/demo-company/setup/apply', token, 400, 'POST', { expectedRevision: 3, license: 'injected' })
    const applied = await request('/demo-company/setup/apply', token, 200, 'POST', { expectedRevision: 3 })
    const replay = await request('/demo-company/setup/apply', token, 200, 'POST', { expectedRevision: 3 })
    assert.deepEqual(applied, replay)
    const erp = JSON.parse(await fs.readFile(dbFile, 'utf8'))
    assert.equal(erp.settings.companyName, profile.companyName); assert.deepEqual(erp.settings.modules_enabled, ['documents'])
    assert.deepEqual(erp.users, beforeApply.users); assert.deepEqual(erp.settings.license, beforeApply.settings.license)
    assert.equal(erp.audit.filter(a => a.action === 'demo_company_setup_applied').length, 1)
    await stop(); await start()
    await request('/demo-company/setup', token, 401)
    token = await login('owner')
    const afterApplyRestart = await request('/demo-company/setup', token)
    assert.deepEqual(afterApplyRestart.application, applied.application)
    await request('/demo-company/setup', token, 409, 'PATCH', { step: 'profile', input: profile, expectedRevision: 3 })
    const saved = (await store.read()).trials[0]
    assert.equal(saved.expiresAt, expiry); assert.equal(saved.setupEvents.length, 3)
    await store.command({ trialId, commandId: 'expire', expectedRevision: saved.revision, action: 'expire', now: expiry, actor: { kind: 'worker', id: 'worker' } })
    await request('/demo-company/setup', token, 403)
    await request('/demo-company/setup/apply', token, 403, 'POST', { expectedRevision: 3 })
    console.log(`Setup sintetic HTTP: ${checks} cereri, trei procese succesive, login/sesiuni originale și progres/aplicare pe disc.`)
  } finally {
    await stop()
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('infraflow-trial-store-'))
    await fs.rm(dir, { recursive: true, force: true })
  }
})
