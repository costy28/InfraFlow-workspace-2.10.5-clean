'use strict'
// Synthetic local coordinator only. No public route, SQL or process provisioning.
const { CONFIGURABLE_MODULE_KEYS } = require('../../server/core/module-catalog')
function fail(code) { const e = new Error(code); e.code = code; throw e }
function createSyntheticApprovalOrchestrator({ store, ensureInstance }) {
  if (!store || typeof ensureInstance !== 'function') fail('invalid_adapter')
  let running = false
  return async function prepare(input) {
    if (running) fail('orchestration_busy')
    if (!input || Object.keys(input).some(k => !['trialId','approvalId','ownerId','allowedModules','invitationId','now'].includes(k))) fail('invalid_approval')
    const { trialId, approvalId, ownerId, allowedModules, invitationId, now } = input
    if (typeof ownerId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(ownerId)
      || !Array.isArray(allowedModules) || !allowedModules.length || new Set(allowedModules).size !== allowedModules.length
      || !allowedModules.every(k => CONFIGURABLE_MODULE_KEYS.has(k))
      || typeof invitationId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(invitationId)) fail('invalid_approval')
    running = true
    try {
      await store.queue({ id: trialId, approvalId, now })
      let trial = (await store.read()).trials.find(t => t.id === trialId)
      if (!['queued','provisioning','awaiting_activation'].includes(trial.state)) fail('approval_not_pending')
      // Binding is persisted before the external effect; changing owner/modules on retry fails.
      await store.bindSetup({ trialId, ownerId, allowedModules })
      async function transition(action) {
        await store.command({ trialId, commandId: `orchestrator:${action}:${trial.revision}`, expectedRevision: trial.revision,
          action, actor: { id: 'synthetic-coordinator', kind: 'worker' }, now })
        trial = (await store.read()).trials.find(t => t.id === trialId)
      }
      if (trial.state === 'queued') await transition('provision')
      // Called again after interruption: adapter MUST ensure idempotence and recheck health.
      const receipt = await ensureInstance({ trialId, resources: structuredClone(trial.resources), ownerId, allowedModules: [...allowedModules] })
      if (!receipt || receipt.trialId !== trialId || receipt.ownerId !== ownerId || receipt.healthy !== true
        || Object.keys(trial.resources).some(k => receipt.resources?.[k] !== trial.resources[k])) fail('invalid_instance_receipt')
      if (trial.state === 'provisioning') await transition('ready')
      const invitation = await store.issueInvitation({ trialId, invitationId, now })
      return { trialId, state: trial.state, invitation }
    } finally { running = false }
  }
}
module.exports = { createSyntheticApprovalOrchestrator }
