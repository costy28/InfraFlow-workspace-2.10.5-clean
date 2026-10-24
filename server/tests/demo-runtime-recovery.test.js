'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os')
const { fork } = require('node:child_process')
const { createSyntheticTrialStore } = require('../../scripts/lib/demo-trial-store')
const { createSyntheticApprovalOrchestrator } = require('../../scripts/lib/demo-approval-orchestrator')
const { createLocalSyntheticInstance } = require('./support/demo-local-instance')
const { readRecord } = require('./support/demo-runtime-record')
async function fixture(t) {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'infraflow-trial-store-'))
  const store = createSyntheticTrialStore(dir); await store.initialize()
  const adapters = []
  function adapter() { const a = createLocalSyntheticInstance(dir); adapters.push(a); return a }
  t.after(async () => {
    for (const a of adapters) await a.stop()
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('infraflow-trial-store-'))
    await fs.rm(dir, { recursive: true, force: true })
    if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old
  })
  const input = { trialId: '11111111-1111-4111-8111-111111111111', approvalId: 'recover', ownerId: 'owner',
    allowedModules: ['documents'], invitationId: 'first', now: Date.now() }
  return { dir, store, input, adapter }
}
test('coordonator căzut: noul adaptor adoptă același proces, fără invitație sau termen nou', { timeout: 45000 }, async t => {
  const f = await fixture(t), adopter = f.adapter()
  const worker = fork(path.join(__dirname, 'support/demo-coordinator-crash.js'), [], {
    env: { ...process.env, NODE_ENV: 'test' }, silent: true, windowsHide: true })
  t.after(() => { if (worker.exitCode === null) worker.kill() })
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('coordinator_timeout')), 20000)
    worker.once('message', m => { clearTimeout(timer); resolve(m) })
    worker.once('error', e => { clearTimeout(timer); reject(e) })
  })
  worker.send({ directory: f.dir, input: f.input })
  const started = await ready; assert.equal(started.ready, true)
  const exited = new Promise(resolve => worker.once('exit', resolve)); worker.send('crash'); await exited
  const prepare = createSyntheticApprovalOrchestrator({ store: f.store, ensureInstance: adopter.ensureInstance })
  const result = await prepare(f.input)
  assert.equal(adopter.pid, started.pid); assert.equal(adopter.origin, started.origin)
  assert.equal(result.invitation.token, null); assert.equal((await f.store.read()).trials[0].expiresAt, null)
  const record = await readRecord(f.dir, 'runtime.json')
  await assert.rejects(adopter.recoverStoppedInstance(record.nonce), { code: 'runtime_recovery_refused' })
  // A forged descriptor is not accepted based only on PID/port.
  const file = path.join(f.dir, 'runtime.json')
  await fs.writeFile(file, JSON.stringify({ ...record, nonce: '0'.repeat(64) }))
  try { await assert.rejects(prepare(f.input)) }
  finally { await fs.writeFile(file, JSON.stringify(record)) }
  await prepare(f.input); assert.equal(adopter.pid, started.pid)
})
test('două adaptoare: o singură instanță; rezervarea moartă cere recuperare explicită', { timeout: 45000 }, async t => {
  const f = await fixture(t), a = f.adapter(), b = f.adapter()
  await f.store.queue({ id: f.input.trialId, approvalId: f.input.approvalId, now: f.input.now })
  await f.store.bindSetup({ trialId: f.input.trialId, ownerId: 'owner', allowedModules: ['documents'] })
  await f.store.command({ trialId: f.input.trialId, commandId: 'provision', expectedRevision: 0, action: 'provision', now: f.input.now, actor: { id: 'test', kind: 'worker' } })
  const row = (await f.store.read()).trials[0]
  const context = { trialId: row.id, ownerId: 'owner', allowedModules: ['documents'], resources: row.resources }
  const results = await Promise.allSettled([a.ensureInstance(context), b.ensureInstance(context)])
  assert.ok(results.some(r => r.status === 'fulfilled'))
  await a.ensureInstance(context); await b.ensureInstance(context); assert.equal(a.pid, b.pid)
  const record = await readRecord(f.dir, 'runtime.json')
  const death = new Promise(resolve => {
    const deadline = Date.now() + 5000
    const timer = setInterval(() => {
      try { process.kill(record.pid, 0) } catch (e) { if (e.code === 'ESRCH') { clearInterval(timer); resolve() } }
      if (Date.now() >= deadline) { clearInterval(timer); resolve() }
    }, 20)
  })
  // Known test child, identified by authenticated health immediately above.
  process.kill(record.pid); await death
  await assert.rejects(b.ensureInstance(context))
  await assert.rejects(b.recoverStoppedInstance('0'.repeat(64)), { code: 'runtime_recovery_refused' })
  await b.recoverStoppedInstance(record.nonce)
  await b.ensureInstance(context)
  assert.notEqual(b.pid, record.pid)
  await b.stop()
})
