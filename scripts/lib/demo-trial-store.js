'use strict'
// Local synthetic harness only; NOT a production database or application service.
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const model = require('./demo-trial-registry')
const setup = require('./demo-company-setup')

function error(code) { const e = new Error(code); e.code = code; return e }
function createSyntheticTrialStore(directory, { lockTimeoutMs = 5000 } = {}) {
  const root = path.resolve(directory)
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('infraflow-trial-store-')) throw error('synthetic_directory_required')
  if (!Number.isInteger(lockTimeoutMs) || lockTimeoutMs < 0 || lockTimeoutMs > 30000) throw error('invalid_lock_timeout')
  const file = path.join(root, 'registry.json'), lock = path.join(root, 'registry.lock')
  async function withLock(work) {
    const stat = await fs.lstat(root)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw error('invalid_store_directory')
    const deadline = Date.now() + lockTimeoutMs
    let handle
    while (!handle) {
      try { handle = await fs.open(lock, 'wx', 0o600) }
      catch (e) {
        if (e.code !== 'EEXIST') throw e
        if (Date.now() >= deadline) throw error('store_locked')
        await new Promise(resolve => setTimeout(resolve, 15))
      }
    }
    try { return await work() }
    finally { await handle.close(); await fs.unlink(lock) }
  }
  async function read() {
    const stat = await fs.lstat(file)
    if (!stat.isFile() || stat.isSymbolicLink()) throw error('invalid_registry_file')
    const data = JSON.parse(await fs.readFile(file, 'utf8'))
    return model.validateRegistry(data)
  }
  async function save(data) {
    model.validateRegistry(data)
    const temp = path.join(root, `registry-${crypto.randomUUID()}.tmp`)
    let handle
    try {
      handle = await fs.open(temp, 'wx', 0o600)
      await handle.writeFile(JSON.stringify(data)); await handle.sync(); await handle.close(); handle = null
      await fs.rename(temp, file)
    } finally {
      if (handle) await handle.close()
      await fs.unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e })
    }
  }
  return {
    initialize: () => withLock(async () => {
      try { return await read() }
      catch (e) { if (e.code !== 'ENOENT') throw e }
      const data = model.createRegistry(); await save(data); return data
    }),
    read: () => withLock(read),
    queue: input => withLock(async () => { const next = model.queueTrial(await read(), input); await save(next); return next }),
    command: input => withLock(async () => { const next = model.applyCommand(await read(), input); await save(next); return next }),
    bindSetup: ({ trialId, ownerId, allowedModules }) => withLock(async () => {
      const registry = await read(), trial = registry.trials.find(t => t.id === trialId)
      if (!trial || !Array.isArray(allowedModules)) throw error('invalid_setup_binding')
      if (trial.setup) {
        if (trial.setup.ownerId !== ownerId || JSON.stringify(trial.setupAllowedModules) !== JSON.stringify(allowedModules)) throw error('setup_already_bound')
        return structuredClone(trial.setup)
      }
      trial.setup = setup.createSetup(trialId, ownerId); trial.setupAllowedModules = [...allowedModules]; trial.setupEvents = []
      await save(registry); return structuredClone(trial.setup)
    }),
    readSetup: ({ trialId, user, now }) => withLock(async () => {
      const registry = await read(), trial = registry.trials.find(t => t.id === trialId)
      if (!trial?.setup) throw error('setup_not_found')
      setup.assertSetupAccess(registry, trial.setup, { trialId, user }, now)
      return structuredClone(trial.setup)
    }),
    readSetupView: ({ trialId, user, now }) => withLock(async () => {
      const registry = await read(), trial = registry.trials.find(t => t.id === trialId)
      if (!trial?.setup) throw error('setup_not_found')
      setup.assertSetupAccess(registry, trial.setup, { trialId, user }, now)
      return { setup: structuredClone(trial.setup), availableModules: [...trial.setupAllowedModules], expiresAt: trial.expiresAt }
    }),
    configureSetup: ({ trialId, user, command, now }) => withLock(async () => {
      const registry = await read(), trial = registry.trials.find(t => t.id === trialId)
      if (!trial?.setup) throw error('setup_not_found')
      trial.setup = setup.applySetupStep(registry, trial.setup, { trialId, user }, { ...command, now }, trial.setupAllowedModules)
      trial.setupEvents.push({ revision: trial.setup.revision, step: command.step, actorId: user.id, at: now })
      await save(registry); return structuredClone(trial.setup)
    }),
  }
}
module.exports = { createSyntheticTrialStore }
