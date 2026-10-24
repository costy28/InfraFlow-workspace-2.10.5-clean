'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto')
const { createSyntheticTrialStore } = require('../../scripts/lib/demo-trial-store')
const { createSyntheticApprovalOrchestrator } = require('../../scripts/lib/demo-approval-orchestrator')
const { createLocalSyntheticInstance } = require('./support/demo-local-instance')

test('provisionare locală reală: două procese JSON, întrerupere, retry, restart și activare izolată', { timeout: 90000 }, async t => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  const fixtures = []
  t.after(async () => {
    for (const f of fixtures) {
      await f.adapter.stop()
      assert.equal(path.dirname(f.dir), path.resolve(os.tmpdir())); assert.ok(path.basename(f.dir).startsWith('infraflow-trial-store-'))
      await fs.rm(f.dir, { recursive: true, force: true })
    }
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous
  })
  async function fixture(id) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'infraflow-trial-store-'))
    const store = createSyntheticTrialStore(dir), adapter = createLocalSyntheticInstance(dir)
    const f = { dir, store, adapter }; fixtures.push(f); await store.initialize()
    f.input = { trialId: id, approvalId: 'approval-local', ownerId: 'owner', allowedModules: ['documents'], invitationId: 'invite-local', now: Date.now() }
    return f
  }
  const a = await fixture('11111111-1111-4111-8111-111111111111')
  const b = await fixture('22222222-2222-4222-8222-222222222222')
  let interrupt = true
  const prepareA = createSyntheticApprovalOrchestrator({ store: a.store, ensureInstance: async c => {
    const result = await a.adapter.ensureInstance(c)
    if (interrupt) { interrupt = false; throw Error('interruption after actual process health') }
    return result
  } })
  await assert.rejects(prepareA(a.input), /interruption/)
  const firstPid = a.adapter.pid
  let row = (await a.store.read()).trials[0]
  assert.equal(row.state, 'provisioning'); assert.equal(row.invitation, undefined)
  const readyA = await prepareA(a.input); assert.equal(a.adapter.pid, firstPid)
  const prepareB = createSyntheticApprovalOrchestrator({ store: b.store, ensureInstance: b.adapter.ensureInstance })
  const readyB = await prepareB(b.input)
  assert.notEqual(a.adapter.pid, b.adapter.pid); assert.notEqual(a.adapter.origin, b.adapter.origin)
  const keyA = await fs.readFile(path.join(a.dir, 'instance.key'), 'utf8')
  assert.notEqual(keyA, await fs.readFile(path.join(b.dir, 'instance.key'), 'utf8'))
  assert.equal((await fetch(a.adapter.origin + '/synthetic-health')).status, 404)
  async function request(f, route, body, status, token) {
    const res = await fetch(f.adapter.origin + '/api' + route, { method: body ? 'POST' : 'GET',
      headers: { Connection: 'close', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000) })
    assert.equal(res.status, status, route); return res.json()
  }
  const password = `Synthetic-${crypto.randomBytes(16).toString('hex')}!aA1`
  const activation = token => ({ token, password, confirmPassword: password })
  await request(a, '/login', { username: 'owner', password }, 403)
  await request(b, '/demo-company/activate', activation(readyA.invitation.token), 401)
  // Restart the pending instance: data/key and hash-only invitation remain usable.
  await a.adapter.stop(); assert.equal(a.adapter.pid, null)
  assert.equal((await prepareA(a.input)).invitation.token, null)
  assert.equal(await fs.readFile(path.join(a.dir, 'instance.key'), 'utf8'), keyA)
  const activated = await request(a, '/demo-company/activate', activation(readyA.invitation.token), 200)
  assert.equal(activated.expiresAt - activated.activatedAt, 15 * 86400000)
  const login = await request(a, '/login', { username: 'owner', password }, 200)
  await request(a, '/demo-company/setup', undefined, 200, login.token)
  await request(b, '/demo-company/activate', activation(readyB.invitation.token), 200)
  await request(b, '/demo-company/setup', undefined, 401, login.token)
  const dbA = JSON.parse(await fs.readFile(a.adapter.dbFile, 'utf8'))
  const dbB = JSON.parse(await fs.readFile(b.adapter.dbFile, 'utf8'))
  assert.notEqual(dbA.settings.demoTrialId, dbB.settings.demoTrialId)
  assert.equal(dbA.audit.filter(x => x.action === 'demo_trial_activated').length, 1)
  await assert.rejects(prepareA(a.input), { code: 'approval_not_pending' })
  row = (await a.store.read()).trials[0]; assert.equal(row.expiresAt, activated.expiresAt)
  await a.adapter.stop()
  await request(b, '/login', { username: 'owner', password }, 200)
  console.log('Două procese JSON/loopback pornite real; retry după health, restart pending, invitații și sesiuni izolate; fără SQL/producție.')
})

test('adaptorul refuză utilizarea în afara testelor și căile instalate', () => {
  const old = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    assert.throws(() => createLocalSyntheticInstance(os.tmpdir()), { code: 'synthetic_test_only' })
    process.env.NODE_ENV = 'test'
    assert.throws(() => createLocalSyntheticInstance(process.cwd()), { code: 'invalid_synthetic_directory' })
  } finally { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old }
})
