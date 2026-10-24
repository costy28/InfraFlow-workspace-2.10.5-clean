const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { createSyntheticTrialStore } = require('../../scripts/lib/demo-trial-store')
const { ROLE, companyRole } = require('../../scripts/lib/demo-company-setup')
const trialId = '11111111-1111-4111-8111-111111111111'
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'infraflow-trial-store-')), store = createSyntheticTrialStore(dir), now = Date.now() - 1000
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('infraflow-trial-store-'))
    await fs.rm(dir, { recursive: true, force: true })
  })
  await store.initialize(); await store.queue({ id: trialId, approvalId: 'approval-invitation', now })
  for (const action of ['provision','ready']) {
    const row = (await store.read()).trials[0]
    await store.command({ trialId, commandId: action, expectedRevision: row.revision, action, now, actor: { kind: 'worker', id: 'worker' } })
  }
  await store.bindSetup({ trialId, ownerId: 'owner', allowedModules: ['documents'] })
  return { dir, store, now }
}
test('token hash-only, retry emitere și înlocuire controlată; acces respins pentru alt trial', async t => {
  const { store, now, dir } = await fixture(t)
  const first = await store.issueInvitation({ trialId, invitationId: 'invite-1', now })
  assert.equal(typeof first.token, 'string')
  assert.equal((await fs.readFile(path.join(dir, 'registry.json'), 'utf8')).includes(first.token), false)
  assert.equal((await store.issueInvitation({ trialId, invitationId: 'invite-1', now })).token, null)
  const second = await store.issueInvitation({ trialId, invitationId: 'invite-2', now })
  const activate = context => ({ activatedAt: context.now })
  await assert.rejects(store.consumeInvitation({ trialId, token: first.token, now, activate }), e => e.code === 'invitation_invalid')
  await assert.rejects(store.consumeInvitation({ trialId: 'other', token: second.token, now, activate }), e => e.code === 'invitation_invalid')
  const result = await store.consumeInvitation({ trialId, token: second.token, now, activate })
  assert.equal(result.expiresAt, now + 15 * 86400000)
  await assert.rejects(store.consumeInvitation({ trialId, token: second.token, now: now + 1000, activate }), e => e.code === 'invitation_invalid')
  assert.equal((await store.read()).trials[0].expiresAt, result.expiresAt)
})
test('link expirat exact la 24h și activare eșuată nu consumă invitația', async t => {
  const { store, now } = await fixture(t), invitation = await store.issueInvitation({ trialId, invitationId: 'expiry', now })
  await assert.rejects(store.consumeInvitation({ trialId, token: invitation.token, now: invitation.expiresAt, activate: () => ({ activatedAt: now }) }), e => e.code === 'invitation_invalid')
  await assert.rejects(store.consumeInvitation({ trialId, token: invitation.token, now, activate: () => { throw Error('synthetic failure') } }))
  assert.equal((await store.read()).trials[0].state, 'awaiting_activation')
  const results = await Promise.allSettled([1,2].map(() => store.consumeInvitation({ trialId, token: invitation.token, now,
    activate: context => ({ activatedAt: context.now }) })))
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
})
test('retry după întrerupere folosește prima activare, fără a reporni cele 15 zile', async t => {
  const { store, now } = await fixture(t), invitation = await store.issueInvitation({ trialId, invitationId: 'interruption', now })
  let receipt
  await assert.rejects(store.consumeInvitation({ trialId, token: invitation.token, now, activate: context => {
    receipt = { activatedAt: context.now }; throw Error('synthetic interruption after ERP commit')
  } }))
  assert.equal((await store.read()).trials[0].state, 'awaiting_activation')
  const result = await store.consumeInvitation({ trialId, token: invitation.token, now: now + 60000, activate: () => receipt })
  assert.equal(result.activatedAt, now); assert.equal(result.expiresAt, now + 15 * 86400000)
})
test('activare HTTP: parolă aleasă, acces real, unică și persistentă după restart', { timeout: 60000 }, async t => {
  const { store, now, dir } = await fixture(t), dbFile = path.join(dir, 'synthetic-db.json')
  await fs.writeFile(dbFile, JSON.stringify({ settings: { demoTrialId: trialId, setupCompleted: true, networkAccessMode: 'open',
    customRoles: [companyRole()], license: { plan: 'internal', modules: ['all'], maxDevices: 20 } },
    users: [{ id: 'owner', username: 'owner', name: 'Synthetic owner', role: ROLE, active: false, passwordHash: '' }],
    devices: [], departments: [], audit: [] }))
  const invitation = await store.issueInvitation({ trialId, invitationId: 'http-invite', now })
  const password = `Chosen-${crypto.randomBytes(16).toString('hex')}!aA1`
  let child, origin, checks = 0
  async function stop() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    const done = new Promise(resolve => child.once('exit', resolve)); child.send('stop'); await done
  }
  async function start() {
    child = spawn(process.execPath, [path.join(__dirname, 'support/demo-setup-http-server.js')], { windowsHide: true,
      env: { ...process.env, NODE_ENV: 'test', APP_KEY: 'synthetic-invitation-key-not-for-production', INFRAFLOW_DB_PROVIDER: 'json', DB_MODE: 'json',
        INFRAFLOW_DB_FILE: dbFile, INFRAFLOW_SEED_FILE: dbFile, SYNTHETIC_STORE_DIR: dir, SYNTHETIC_TRIAL_ID: trialId }, stdio: ['ignore','pipe','pipe','ipc'] })
    child.stdout.on('data', () => {}); child.stderr.on('data', () => {})
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Synthetic start timeout')), 15000)
      child.once('message', msg => { clearTimeout(timer); resolve(msg.port) })
      child.once('exit', () => { clearTimeout(timer); reject(Error('Synthetic server exited')) })
      child.once('error', e => { clearTimeout(timer); reject(e) })
    }); origin = `http://127.0.0.1:${port}/api`
  }
  async function request(url, status, body, token) {
    const res = await fetch(origin + url, { method: body === undefined ? 'GET' : 'POST', headers: { Connection: 'close', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000) })
    assert.equal(res.status, status, url); checks++; return res.json()
  }
  try {
    await start()
    await request('/login', 403, { username: 'owner', password })
    const body = { token: invitation.token, password, confirmPassword: password }
    await request('/demo-company/activate', 400, { ...body, trialId: 'other', trialDays: 99 })
    await request('/demo-company/activate', 401, { ...body, token: '0'.repeat(64) })
    await request('/demo-company/activate', 400, { ...body, password: 'short', confirmPassword: 'short' })
    await request('/demo-company/activate', 400, { ...body, confirmPassword: 'different' })
    const result = await request('/demo-company/activate', 200, body)
    assert.equal(result.expiresAt - result.activatedAt, 15 * 86400000)
    await request('/demo-company/activate', 401, body)
    const logged = await request('/login', 200, { username: 'owner', password })
    await request('/demo-company/setup', 200, undefined, logged.token)
    await stop(); await start()
    await request('/demo-company/setup', 401, undefined, logged.token)
    await request('/demo-company/activate', 401, body)
    await request('/login', 200, { username: 'owner', password })
    const registry = (await store.read()).trials[0], erp = JSON.parse(await fs.readFile(dbFile, 'utf8'))
    assert.equal(registry.expiresAt, result.expiresAt); assert.equal(erp.users[0].role, ROLE)
    assert.equal(Date.parse(erp.users[0].demoAccessExpiresAt), result.expiresAt)
    assert.equal(erp.audit.filter(a => a.action === 'demo_trial_activated').length, 1)
    assert.equal((await fs.readFile(dbFile, 'utf8')).includes(password), false)
    console.log(`Invitație sintetică: ${checks} cereri HTTP, două porniri, activare unică și termen păstrat.`)
  } finally { await stop() }
})
