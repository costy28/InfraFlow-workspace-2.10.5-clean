'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto')
const { createSyntheticTrialStore } = require('../../scripts/lib/demo-trial-store')
const { createSyntheticApprovalOrchestrator } = require('../../scripts/lib/demo-approval-orchestrator')
const { createLocalSyntheticInstance } = require('./support/demo-local-instance')
async function fixture(t) {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'infraflow-trial-store-'))
  const store = createSyntheticTrialStore(dir), adapters = []
  const adapter = () => { const a = createLocalSyntheticInstance(dir); adapters.push(a); return a }
  t.after(async () => {
    for (const a of adapters) await a.stop()
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('infraflow-trial-store-'))
    await fs.rm(dir, { recursive: true, force: true })
    if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old
  })
  await store.initialize()
  const instance = adapter(), trialId = '11111111-1111-4111-8111-111111111111'
  const prepare = createSyntheticApprovalOrchestrator({ store, ensureInstance: instance.ensureInstance })
  const { invitation } = await prepare({ trialId, approvalId: 'reconcile', ownerId: 'owner', allowedModules: ['documents'], invitationId: 'first', now: Date.now() })
  const password = `Synthetic-${crypto.randomBytes(16).toString('hex')}!aA1`
  async function request(a, route, body, expected, token) {
    const response = await fetch(a.origin + '/api' + route, { method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Connection: 'close', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(4000) })
    assert.equal(response.status, expected); return response.json()
  }
  await request(instance, '/demo-company/activate', { token: invitation.token, password, confirmPassword: password }, 200)
  const login = await request(instance, '/login', { username: 'owner', password }, 200)
  return { dir, store, instance, adapter, trialId, password, token: login.token, request }
}
function callbacks(a) { return { ensureActive: a.ensureInstance, stopInactive: a.stopInactiveInstance } }
test('trial activ: adoptare/restart fără date pierdute; expirare exactă oprește fără ștergere', { timeout: 60000 }, async t => {
  const f = await fixture(t), a = f.adapter()
  const activated = (await f.store.read()).trials[0], firstPid = f.instance.pid
  const result = await f.store.reconcileRuntime({ trialId: f.trialId, now: Date.now(), ...callbacks(a) })
  assert.equal(result.runtime, 'running'); assert.equal(a.pid, firstPid)
  const before = await fs.readFile(a.dbFile), key = await fs.readFile(path.join(f.dir, 'instance.key'))
  await f.instance.stop()
  await f.store.reconcileRuntime({ trialId: f.trialId, now: Date.now(), ...callbacks(a) })
  assert.notEqual(a.pid, firstPid)
  assert.deepEqual(await fs.readFile(a.dbFile), before)
  await f.request(a, '/demo-company/setup', undefined, 401, f.token)
  await f.request(a, '/login', { username: 'owner', password: f.password }, 200)
  assert.equal((await f.store.read()).trials[0].expiresAt, activated.expiresAt)
  const snapshot = await fs.readFile(a.dbFile)
  const expired = await f.store.reconcileRuntime({ trialId: f.trialId, now: activated.expiresAt, ...callbacks(a) })
  assert.equal(expired.state, 'expired'); assert.equal(expired.runtime, 'stopped'); assert.equal(a.pid, null)
  assert.deepEqual(await fs.readFile(a.dbFile), snapshot)
  assert.deepEqual(await fs.readFile(path.join(f.dir, 'instance.key')), key)
  await f.store.reconcileRuntime({ trialId: f.trialId, now: activated.expiresAt + 1, ...callbacks(a) })
  const row = (await f.store.read()).trials[0]
  assert.equal(row.events.filter(e => e.action === 'expire').length, 1)
  await assert.rejects(a.ensureInstance({ trialId: row.id, ownerId: 'owner', resources: row.resources, allowedModules: ['documents'] }), { code: 'invalid_instance_binding' })
})
test('trial activ cu date lipsă: refuz, fără reinițializare sau cheie nouă', { timeout: 45000 }, async t => {
  const f = await fixture(t)
  await f.instance.stop()
  const backup = f.instance.dbFile + '.saved'
  const key = await fs.readFile(path.join(f.dir, 'instance.key'))
  await fs.rename(f.instance.dbFile, backup)
  try {
    await assert.rejects(f.store.reconcileRuntime({ trialId: f.trialId, now: Date.now(), ...callbacks(f.instance) }), { code: 'ENOENT' })
    await assert.rejects(fs.access(f.instance.dbFile), { code: 'ENOENT' })
    assert.deepEqual(await fs.readFile(path.join(f.dir, 'instance.key')), key)
    assert.equal(f.instance.pid, null)
    assert.equal((await f.store.read()).trials[0].state, 'active')
  } finally { await fs.rename(backup, f.instance.dbFile) }
})
test('oprire eșuată: expirarea rămâne salvată, accesul este refuzat și retry-ul oprește', { timeout: 45000 }, async t => {
  const f = await fixture(t), row = (await f.store.read()).trials[0]
  await assert.rejects(f.store.reconcileRuntime({ trialId: f.trialId, now: row.expiresAt,
    ensureActive: f.instance.ensureInstance, stopInactive: async () => { throw Error('synthetic stop failure') } }), /stop failure/)
  assert.equal((await f.store.read()).trials[0].state, 'expired')
  await f.request(f.instance, '/demo-company/setup', undefined, 403, f.token)
  await assert.rejects(f.store.command({ trialId: row.id, commandId: 'stale-extension', expectedRevision: row.revision,
    action: 'extend', actor: { id: 'admin', kind: 'platform_admin' }, now: row.expiresAt, expiresAt: row.expiresAt + 86400000 }), { code: 'revision_conflict' })
  await f.store.reconcileRuntime({ trialId: row.id, now: row.expiresAt + 1, ...callbacks(f.instance) })
  assert.equal(f.instance.pid, null)
})
test('reconcilierea ține lockul pe durata efectului; timpul invalid nu schimbă registrul', { timeout: 45000 }, async t => {
  const f = await fixture(t), row = (await f.store.read()).trials[0]
  await assert.rejects(f.store.reconcileRuntime({ trialId: row.id, now: -1, ...callbacks(f.instance) }), { code: 'invalid_reconciliation_time' })
  let release, started
  const ready = new Promise(r => { started = r })
  const pending = f.store.reconcileRuntime({ trialId: row.id, now: row.expiresAt, ensureActive: f.instance.ensureInstance,
    stopInactive: async c => { started(); await new Promise(r => { release = r }); return f.instance.stopInactiveInstance(c) } })
  await ready
  try {
    const contender = createSyntheticTrialStore(f.dir, { lockTimeoutMs: 0 })
    await assert.rejects(contender.command({ trialId: row.id }), { code: 'store_locked' })
  } finally { release() }
  await pending
  assert.equal((await f.store.read()).trials[0].revision, row.revision + 1)
})
