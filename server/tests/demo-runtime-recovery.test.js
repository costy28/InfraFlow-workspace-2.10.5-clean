'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os')
const { fork } = require('node:child_process')
const { createSyntheticTrialStore } = require('../../scripts/lib/demo-trial-store')
const { createSyntheticApprovalOrchestrator } = require('../../scripts/lib/demo-approval-orchestrator')
const { createLocalSyntheticInstance } = require('./support/demo-local-instance')
const { readRecord, alive } = require('./support/demo-runtime-record')
const { observeCoordinator } = require('./support/demo-coordinator-client')
async function fixture(t) {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'infraflow-trial-store-'))
  const store = createSyntheticTrialStore(dir); await store.initialize()
  const adapters = [], workers = []
  function adapter() { const a = createLocalSyntheticInstance(dir); adapters.push(a); return a }
  async function cleanup() {
    // Stop coordinators before discovery: no child may publish a runtime after cleanup starts.
    const workerResults = await Promise.allSettled(workers.map(w => w.stop()))
    let record
    const adapterResults = []
    try { record = await readRecord(dir, 'runtime.json') }
    catch (reason) { adapterResults.push({ status: 'rejected', reason }) }
    for (const a of adapters) {
      try { await a.stop(); adapterResults.push({ status: 'fulfilled' }) }
      catch (reason) { adapterResults.push({ status: 'rejected', reason }) }
    }
    const failures = [...workerResults, ...adapterResults].filter(r => r.status === 'rejected')
    if (failures.length) throw new AggregateError(failures.map(r => r.reason), 'synthetic_cleanup_failed')
    if (record) {
      const deadline = Date.now() + 3000
      while (alive(record.pid)) {
        assert.ok(Date.now() < deadline, 'synthetic_runtime_exit_timeout')
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    }
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('infraflow-trial-store-'))
    await fs.rm(dir, { recursive: true, force: true })
  }
  let cleaned = false
  async function cleanupOnce() { if (!cleaned) { await cleanup(); cleaned = true } }
  t.after(async () => {
    try { await cleanupOnce() }
    finally {
      if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old
    }
  })
  const input = { trialId: '11111111-1111-4111-8111-111111111111', approvalId: 'recover', ownerId: 'owner',
    allowedModules: ['documents'], invitationId: 'first', now: Date.now() }
  function coordinator() {
    const worker = fork(path.join(__dirname, 'support/demo-coordinator-crash.js'), [], {
      env: { ...process.env, NODE_ENV: 'test' }, silent: true, windowsHide: true })
    const observer = observeCoordinator(worker, { directory: dir, input }); workers.push(observer)
    return observer
  }
  return { dir, store, input, adapter, coordinator, cleanup: cleanupOnce }
}
test('coordonator căzut: noul adaptor adoptă același proces, fără invitație sau termen nou', { timeout: 45000 }, async t => {
  const f = await fixture(t), adopter = f.adapter()
  const worker = f.coordinator(), started = await worker.ready
  assert.deepEqual(await worker.crash(), { code: 0, signal: null })
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
test('cleanup înainte de adoptare oprește instanța orfană prin health înainte de ștergerea fixture-ului', { timeout: 45000 }, async t => {
  const f = await fixture(t)
  f.adapter() // Unbound observer must still discover and stop this fixture's managed runtime.
  const worker = f.coordinator(), started = await worker.ready
  await worker.crash()
  assert.equal(alive(started.pid), true)
  await f.cleanup()
  assert.equal(alive(started.pid), false)
  await assert.rejects(fs.stat(f.dir), { code: 'ENOENT' })
})
test('cleanup cerut în timpul provisionării așteaptă oprirea copilului detașat', { timeout: 45000 }, async t => {
  const f = await fixture(t)
  f.adapter()
  const worker = f.coordinator()
  const readiness = worker.ready.catch(error => error.code)
  await f.cleanup()
  assert.equal(await readiness, 'coordinator_exit_before_ready')
  assert.deepEqual(await worker.exited, { code: 0, signal: null })
  await assert.rejects(fs.stat(f.dir), { code: 'ENOENT' })
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
