'use strict'
// Concrete TEMP/JSON/loopback adapter for tests, NOT a SQL/OS production provisioner.
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { ROLE, companyRole } = require('../../../scripts/lib/demo-company-setup')
const { validateRegistry, canAccessTrial } = require('../../../scripts/lib/demo-trial-registry')
const { readRecord, readManagedRecord, health, alive } = require('./demo-runtime-record')
function fail(code) { const e = new Error(code); e.code = code; throw e }
function createLocalSyntheticInstance(directory) {
  if (process.env.NODE_ENV !== 'test') fail('synthetic_test_only')
  const root = path.resolve(directory)
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('infraflow-trial-store-')) fail('invalid_synthetic_directory')
  const dbFile = path.join(root, 'instance.json'), keyFile = path.join(root, 'instance.key')
  let child, origin, busy = false, binding, runtime
  async function regular(file) {
    const stat = await fs.lstat(file)
    if (!stat.isFile() || stat.isSymbolicLink()) fail('invalid_synthetic_file')
  }
  async function assertRoot() {
    const stat = await fs.lstat(root)
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('invalid_synthetic_directory')
  }
  async function createOnce(file, value) {
    try { await fs.writeFile(file, value, { flag: 'wx', mode: 0o600 }) }
    catch (e) { if (e.code !== 'EEXIST') throw e }
    await regular(file)
  }
  async function stopOwned() {
    const old = child; child = null; origin = null
    if (!old || old.exitCode !== null || old.signalCode !== null) return
    await new Promise(resolve => {
      const timer = setTimeout(() => old.kill(), 3000)
      old.once('exit', () => { clearTimeout(timer); resolve() })
      if (old.connected) old.send('stop', () => {})
      else old.kill()
    })
  }
  async function stop() {
    if (busy) fail('instance_busy')
    busy = true
    try {
      await assertRoot()
      const record = await readManagedRecord(root)
      if (!record) { await stopOwned(); runtime = null; return }
      const db = JSON.parse(await fs.readFile(dbFile, 'utf8'))
      if (db.settings?.demoTrialId !== record.trialId || !db.users?.some(u => u.id === record.ownerId && u.role === ROLE)) fail('invalid_instance_binding')
      const target = await health(record)
      const response = await fetch(target + '/synthetic-stop', { method: 'POST', headers: { 'x-synthetic-health': record.nonce, Connection: 'close' }, signal: AbortSignal.timeout(3000) })
      if (!response.ok) fail('instance_stop_failed')
      const deadline = Date.now() + 4000
      while (await readRecord(root, 'runtime.claim')) {
        if (Date.now() >= deadline) fail('instance_stop_timeout')
        await new Promise(r => setTimeout(r, 20))
      }
      await stopOwned(); runtime = null; origin = null
    } finally { busy = false }
  }
  async function recoverStoppedInstance(expectedNonce) {
    // Explicit operator recovery only. A living/reused PID is never stolen or killed.
    if (busy) fail('instance_busy')
    busy = true
    let lock
    try {
      await assertRoot()
      if (typeof expectedNonce !== 'string' || !/^[a-f0-9]{64}$/.test(expectedNonce)) fail('runtime_recovery_refused')
      lock = await fs.open(path.join(root, 'runtime.recovery'), 'wx', 0o600)
      const claim = await readRecord(root, 'runtime.claim')
      if (!claim || claim.nonce !== expectedNonce || alive(claim.pid)) fail('runtime_recovery_refused')
      const current = await readRecord(root, 'runtime.json')
      if (current && (current.nonce !== expectedNonce || current.pid !== claim.pid)) fail('runtime_recovery_refused')
      if (current) await fs.unlink(path.join(root, 'runtime.json'))
      await fs.unlink(path.join(root, 'runtime.claim'))
      runtime = null; origin = null
    } finally {
      if (lock) { await lock.close(); await fs.unlink(path.join(root, 'runtime.recovery')) }
      busy = false
    }
  }
  async function stopInactiveInstance(context) {
    await assertRoot()
    await regular(path.join(root, 'registry.json'))
    const registry = validateRegistry(JSON.parse(await fs.readFile(path.join(root, 'registry.json'), 'utf8')))
    const trial = registry.trials.find(t => t.id === context.trialId)
    if (!trial?.setup || !['expired','purge_pending'].includes(trial.state) || trial.setup.ownerId !== context.ownerId
      || JSON.stringify(trial.resources) !== JSON.stringify(context.resources)) fail('invalid_inactive_binding')
    const record = await readManagedRecord(root)
    if (record && (record.trialId !== context.trialId || record.ownerId !== context.ownerId)) fail('invalid_instance_binding')
    if (!record && await readRecord(root, 'runtime.claim')) fail('runtime_recovery_required')
    await stop()
    if (await readRecord(root, 'runtime.claim') || await readRecord(root, 'runtime.json')) fail('instance_stop_incomplete')
    return { trialId: context.trialId, stopped: true }
  }
  async function ensureInstance(context) {
    if (busy) fail('instance_busy')
    busy = true
    try {
      await assertRoot()
      // Verify the server-owned reservation, not just values supplied by a caller.
      await regular(path.join(root, 'registry.json'))
      const registry = validateRegistry(JSON.parse(await fs.readFile(path.join(root, 'registry.json'), 'utf8')))
      const trial = registry.trials.find(t => t.id === context.trialId)
      if (!trial?.setup || !['provisioning','awaiting_activation','active'].includes(trial.state)
        || trial.setup.ownerId !== context.ownerId
        || JSON.stringify(trial.resources) !== JSON.stringify(context.resources)
        || JSON.stringify(trial.setupAllowedModules) !== JSON.stringify(context.allowedModules)) fail('invalid_instance_binding')
      if (trial.state === 'active' && !canAccessTrial(registry, trial.id, Date.now())) fail('trial_not_active')
      const identity = JSON.stringify({ trialId: context.trialId, ownerId: context.ownerId })
      if (binding && binding !== identity) fail('instance_already_bound')
      binding = identity
      // Never recreate an active company's missing data or key from a blank seed.
      if (trial.state === 'active') { await regular(dbFile); await regular(keyFile) }
      await createOnce(dbFile, JSON.stringify({ settings: { demoTrialId: context.trialId, setupCompleted: true,
        networkAccessMode: 'open', customRoles: [companyRole()], modules_enabled: [],
        license: { plan: 'internal', modules: ['all'], maxDevices: 20 } },
        users: [{ id: context.ownerId, username: 'owner', name: 'Synthetic owner', role: ROLE, active: false, passwordHash: '' }],
        devices: [], departments: [], audit: [] }))
      const db = JSON.parse(await fs.readFile(dbFile, 'utf8'))
      if (db.settings?.demoTrialId !== context.trialId || db.users?.length !== 1
        || db.users[0].id !== context.ownerId || db.users[0].role !== ROLE) fail('invalid_instance_database')
      if (trial.state === 'active' && (db.users[0].active !== true || !db.users[0].passwordHash
        || db.demoTrialActivation?.userId !== context.ownerId || db.demoTrialActivation?.activatedAt !== trial.activatedAt
        || Date.parse(db.users[0].demoAccessExpiresAt) !== trial.expiresAt)) fail('active_instance_data_mismatch')
      await createOnce(keyFile, crypto.randomBytes(32).toString('hex'))
      const key = await fs.readFile(keyFile, 'utf8')
      if (!/^[a-f0-9]{64}$/.test(key)) fail('invalid_instance_key')
      const existing = await readManagedRecord(root)
      if (existing) {
        if (existing.trialId !== context.trialId || existing.ownerId !== context.ownerId) fail('invalid_instance_binding')
        origin = await health(existing); runtime = existing
      } else if (!child || child.exitCode !== null || child.signalCode !== null) {
        const env = {}
        for (const k of ['SystemRoot','WINDIR','PATH','TEMP','TMP','HOME','USERPROFILE']) if (process.env[k]) env[k] = process.env[k]
        const nonce = crypto.randomBytes(32).toString('hex')
        child = spawn(process.execPath, [path.join(__dirname, 'demo-setup-http-server.js')], { windowsHide: true, detached: true,
          env: { ...env, NODE_ENV: 'test', APP_KEY: key, INFRAFLOW_DB_PROVIDER: 'json', DB_MODE: 'json',
            INFRAFLOW_DB_FILE: dbFile, INFRAFLOW_SEED_FILE: dbFile, SYNTHETIC_STORE_DIR: root,
            SYNTHETIC_TRIAL_ID: context.trialId, SYNTHETIC_OWNER_ID: context.ownerId, SYNTHETIC_HEALTH_NONCE: nonce,
            SYNTHETIC_MANAGED_RUNTIME: '1' },
          stdio: ['ignore','ignore','ignore','ipc'] })
        const launched = child
        const port = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => { launched.kill(); reject(Error('synthetic_start_timeout')) }, 15000)
          launched.once('message', msg => { clearTimeout(timer); resolve(msg.port) })
          launched.once('error', e => { clearTimeout(timer); reject(e) })
          launched.once('exit', () => { clearTimeout(timer); reject(Error('synthetic_start_failed')) })
        })
        if (!Number.isInteger(port) || port < 1 || port > 65535) fail('invalid_synthetic_port')
        origin = `http://127.0.0.1:${port}`
        runtime = await readManagedRecord(root)
        if (!runtime || runtime.pid !== launched.pid || runtime.nonce !== nonce) fail('invalid_runtime_record')
      }
      origin = await health(runtime)
      return { trialId: context.trialId, ownerId: context.ownerId, resources: structuredClone(trial.resources), healthy: true }
    } catch (e) { await stopOwned(); throw e }
    finally { busy = false }
  }
  return { ensureInstance, stop, stopInactiveInstance, recoverStoppedInstance, get origin() { return origin }, get pid() { return runtime?.pid ?? child?.pid ?? null }, dbFile }
}
module.exports = { createLocalSyntheticInstance }
