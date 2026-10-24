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
    // Trusted synthetic worker only: callbacks execute under the registry lock.
    reconcileRuntime: ({ trialId, now, ensureActive, stopInactive }) => withLock(async () => {
      let registry = await read(), trial = registry.trials.find(t => t.id === trialId)
      if (!trial?.setup || !['active','expired','purge_pending'].includes(trial.state)) throw error('reconciliation_unavailable')
      if (!Number.isSafeInteger(now) || now < (trial.events.at(-1)?.at ?? trial.createdAt)
        || now > 8640000000000000 - 15 * 86400000) throw error('invalid_reconciliation_time')
      if (typeof ensureActive !== 'function' || typeof stopInactive !== 'function') throw error('invalid_runtime_adapter')
      if (trial.state === 'active' && now >= trial.expiresAt) {
        registry = model.applyCommand(registry, { trialId, commandId: `reconcile:expire:${trial.revision}`,
          expectedRevision: trial.revision, action: 'expire', actor: { id: 'synthetic-reconciler', kind: 'worker' }, now })
        await save(registry) // Access is refused even if stopping the process subsequently fails.
        trial = registry.trials.find(t => t.id === trialId)
      }
      const context = { trialId, ownerId: trial.setup.ownerId, resources: structuredClone(trial.resources), allowedModules: [...trial.setupAllowedModules] }
      if (trial.state === 'active') {
        if (!model.canAccessTrial(registry, trialId, now)) throw error('trial_not_active')
        const receipt = await ensureActive(context)
        if (!receipt || receipt.trialId !== trialId || receipt.ownerId !== context.ownerId || receipt.healthy !== true
          || Object.keys(context.resources).some(k => receipt.resources?.[k] !== context.resources[k])) throw error('invalid_instance_receipt')
        return { trialId, state: trial.state, runtime: 'running', expiresAt: trial.expiresAt }
      }
      const receipt = await stopInactive(context)
      if (!receipt || receipt.trialId !== trialId || receipt.stopped !== true) throw error('invalid_stop_receipt')
      return { trialId, state: trial.state, runtime: 'stopped', expiresAt: trial.expiresAt }
    }),
    issueInvitation: ({ trialId, invitationId, now }) => withLock(async () => {
      const registry = await read(), trial = registry.trials.find(t => t.id === trialId)
      if (!trial?.setup || trial.state !== 'awaiting_activation' || typeof invitationId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(invitationId)
        || !Number.isSafeInteger(now) || now > 8640000000000000 - 86400000 || now < (trial.events.at(-1)?.at ?? trial.createdAt)) throw error('invitation_unavailable')
      if (trial.invitation?.id === invitationId) return { token: null, status: 'already_issued' }
      if ((trial.invitationIds || []).includes(invitationId)) throw error('invitation_id_reused')
      const token = crypto.randomBytes(32).toString('hex')
      trial.invitation = { id: invitationId, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), issuedAt: now,
        expiresAt: now + 86400000, consumedAt: null }
      trial.invitationIds = [...(trial.invitationIds || []), invitationId]
      await save(registry)
      return { token, status: 'issued', expiresAt: trial.invitation.expiresAt }
    }),
    consumeInvitation: ({ trialId, token, now, activate }) => withLock(async () => {
      let registry = await read(), trial = registry.trials.find(t => t.id === trialId)
      const invitation = trial?.invitation
      if (!trial?.setup || trial.state !== 'awaiting_activation' || !invitation || invitation.consumedAt !== null
        || !/^[a-f0-9]{64}$/.test(invitation.tokenHash) || !Number.isSafeInteger(invitation.expiresAt)
        || !Number.isSafeInteger(now) || now < invitation.issuedAt || now >= invitation.expiresAt
        || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw error('invitation_invalid')
      const hash = crypto.createHash('sha256').update(token).digest('hex')
      if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(invitation.tokenHash))) throw error('invitation_invalid')
      if (typeof activate !== 'function') throw error('activation_unavailable')
      const receipt = activate({ trialId, ownerId: trial.setup.ownerId, invitationId: invitation.id, tokenHash: hash, now })
      if (!receipt || !Number.isSafeInteger(receipt.activatedAt) || receipt.activatedAt < invitation.issuedAt || receipt.activatedAt > now) throw error('invalid_activation_receipt')
      registry = model.applyCommand(registry, { trialId, commandId: `invite:${invitation.id}`, expectedRevision: trial.revision,
        action: 'activate', actor: { id: 'invitation-service', kind: 'activation_agent' }, now: receipt.activatedAt })
      trial = registry.trials.find(t => t.id === trialId); trial.invitation.consumedAt = receipt.activatedAt
      await save(registry)
      return { activatedAt: trial.activatedAt, expiresAt: trial.expiresAt }
    }),
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
      return { setup: structuredClone(trial.setup), availableModules: [...trial.setupAllowedModules], expiresAt: trial.expiresAt,
        application: trial.setupApplication ? structuredClone(trial.setupApplication) : null }
    }),
    configureSetup: ({ trialId, user, command, now }) => withLock(async () => {
      const registry = await read(), trial = registry.trials.find(t => t.id === trialId)
      if (!trial?.setup) throw error('setup_not_found')
      trial.setup = setup.applySetupStep(registry, trial.setup, { trialId, user }, { ...command, now }, trial.setupAllowedModules)
      trial.setupEvents.push({ revision: trial.setup.revision, step: command.step, actorId: user.id, at: now })
      await save(registry); return structuredClone(trial.setup)
    }),
    applySetup: ({ trialId, user, expectedRevision, now, apply }) => withLock(async () => {
      const registry = await read(), trial = registry.trials.find(t => t.id === trialId)
      if (!trial?.setup) throw error('setup_not_found')
      setup.assertSetupAccess(registry, trial.setup, { trialId, user }, now)
      if (trial.setup.revision !== expectedRevision) throw error('revision_conflict')
      if (typeof apply !== 'function') throw error('application_unavailable')
      const receipt = apply({ registry, trialId, setup: structuredClone(trial.setup), allowedModules: [...trial.setupAllowedModules], userId: user.id, now })
      if (!receipt || receipt.trialId !== trialId || receipt.setupRevision !== expectedRevision
        || !/^[a-f0-9]{64}$/.test(receipt.digest) || !Number.isSafeInteger(receipt.appliedAt)) throw error('invalid_application_receipt')
      trial.setupApplication = receipt
      await save(registry); return structuredClone(receipt)
    }),
  }
}
module.exports = { createSyntheticTrialStore }
