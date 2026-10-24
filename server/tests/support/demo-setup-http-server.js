'use strict'
if (process.env.NODE_ENV !== 'test' || process.env.INFRAFLOW_DB_PROVIDER !== 'json') throw Error('synthetic_test_only')
const path = require('node:path'), os = require('node:os')
const dir = path.resolve(process.env.SYNTHETIC_STORE_DIR || '')
if (path.dirname(dir) !== path.resolve(os.tmpdir()) || !path.basename(dir).startsWith('infraflow-trial-store-')
  || path.dirname(path.resolve(process.env.INFRAFLOW_DB_FILE || '')) !== dir) throw Error('invalid_synthetic_paths')
const express = require('../../node_modules/express')
const { createSyntheticTrialStore } = require('../../../scripts/lib/demo-trial-store')
const { createSyntheticSetupRouter } = require('../../../scripts/lib/demo-company-setup-router')
const { createSyntheticCompanyApplier } = require('../../../scripts/lib/demo-company-apply')
const { createSyntheticInvitationRouter } = require('../../../scripts/lib/demo-invitation-router')
const { canAccessTrial } = require('../../../scripts/lib/demo-trial-registry')
const store = createSyntheticTrialStore(dir), trialId = process.env.SYNTHETIC_TRIAL_ID
const app = express()
const fs = require('node:fs'), crypto = require('node:crypto')
const managed = process.env.SYNTHETIC_MANAGED_RUNTIME === '1'
const claimFile = path.join(dir, 'runtime.claim'), runtimeFile = path.join(dir, 'runtime.json')
const runtimeIdentity = { format: 'synthetic-runtime-v1', pid: process.pid, nonce: process.env.SYNTHETIC_HEALTH_NONCE,
  trialId, ownerId: process.env.SYNTHETIC_OWNER_ID }
if (managed) {
  if (!/^[a-f0-9]{64}$/.test(runtimeIdentity.nonce || '')) throw Error('invalid_runtime_nonce')
  // Lifetime claim, acquired by the instance, not by its coordinator.
  const claim = fs.openSync(claimFile, 'wx', 0o600)
  try { fs.writeFileSync(claim, JSON.stringify(runtimeIdentity)); fs.fsyncSync(claim) } finally { fs.closeSync(claim) }
}
function shutdown() {
  server.close(() => {
    if (managed) for (const file of [runtimeFile, claimFile]) {
      try {
        const stat = fs.lstatSync(file)
        if (stat.isFile() && !stat.isSymbolicLink() && JSON.parse(fs.readFileSync(file, 'utf8')).nonce === runtimeIdentity.nonce) fs.unlinkSync(file)
      } catch { /* Fail closed: unresolved claims require explicit recovery. */ }
    }
    process.exit(0)
  })
}
app.use(express.json({ limit: '64kb' }))
// Optional provisioner probe, only in this test harness and protected by a per-start nonce.
if (process.env.SYNTHETIC_HEALTH_NONCE) app.get('/synthetic-health', async (req, res) => {
  if (req.get('x-synthetic-health') !== process.env.SYNTHETIC_HEALTH_NONCE) return res.sendStatus(404)
  try {
    const db = await require('../../core/db').readDb({ fresh: true })
    const owner = (db.users || []).find(u => u.id === process.env.SYNTHETIC_OWNER_ID)
    const { ROLE } = require('../../../scripts/lib/demo-company-setup')
    if (db.settings?.demoTrialId !== trialId || owner?.role !== ROLE) return res.sendStatus(503)
    res.json({ ok: true, pid: process.pid, trialId, ownerId: owner.id, provider: 'json' })
  } catch { res.sendStatus(503) }
})
if (managed) app.post('/synthetic-stop', (req, res) => {
  if (req.get('x-synthetic-health') !== runtimeIdentity.nonce) return res.sendStatus(404)
  res.json({ ok: true }); setImmediate(shutdown)
})
// Test coordinator only: update through this process's DB writer, not an external live JSON writer.
let policyBaseline
if (managed) app.post('/synthetic-test-policy', (req, res) => {
  if (req.get('x-synthetic-health') !== runtimeIdentity.nonce) return res.sendStatus(404)
  const action = req.body?.action
  if (!req.body || Object.keys(req.body).length !== 1 || !['disable_module','enable_module','revoke_permission','restore_permission','reset'].includes(action)) return res.sendStatus(400)
  try {
    const db = require('../../core/db'), state = db.readDb({ fresh: true })
    const { ROLE } = require('../../../scripts/lib/demo-company-setup')
    const role = state.settings?.customRoles?.find(r => r.id === ROLE)
    if (state.settings?.demoTrialId !== trialId || !Array.isArray(role?.permissions)
      || !Array.isArray(state.settings.modules_enabled)) return res.sendStatus(409)
    policyBaseline ||= { permissions: [...role.permissions], modules: [...state.settings.modules_enabled] }
    if (action === 'reset') {
      role.permissions = [...policyBaseline.permissions]
      state.settings.modules_enabled = [...policyBaseline.modules]
    } else if (action === 'disable_module') state.settings.modules_enabled = state.settings.modules_enabled.filter(m => m !== 'documents')
    else if (action === 'enable_module') state.settings.modules_enabled = [...new Set([...state.settings.modules_enabled, 'documents'])]
    else if (action === 'restore_permission') role.permissions = [...new Set(['documents:view_own', ...role.permissions])]
    else role.permissions = role.permissions.filter(p => p !== 'documents:view_own')
    db.writeDb(state)
    res.json({ ok: true })
  } catch { res.status(409).json({ code: 'synthetic_policy_refused' }) }
})
if (managed) app.post('/synthetic-extension', (req, res) => {
  if (req.get('x-synthetic-health') !== runtimeIdentity.nonce) return res.sendStatus(404)
  try {
    const model = require('../../../scripts/lib/demo-trial-registry')
    const registry = model.validateRegistry(JSON.parse(fs.readFileSync(path.join(dir, 'registry.json'), 'utf8')))
    const body = req.body, command = body?.command, trial = registry.trials.find(t => t.id === trialId)
    if (!body || Object.keys(body).some(k => !['command','ownerId','previousExpiresAt','activatedAt'].includes(k))
      || command?.trialId !== trialId || !['active','expired','purge_pending'].includes(trial?.state) || body.ownerId !== trial.setup?.ownerId
      || body.previousExpiresAt !== trial.expiresAt || body.activatedAt !== trial.activatedAt) throw Error('invalid_binding')
    model.applyCommand(registry, command)
    const db = require('../../core/db')
    const result = require('../../../scripts/lib/demo-access-extension').prepareAccessExtension(db.readDb({ fresh: true }), body)
    if (result.changed) db.writeDb(result.db)
    res.json(result.receipt)
  } catch { res.status(409).json({ code: 'extension_refused' }) }
})
app.use('/api', createSyntheticInvitationRouter({ store, trialId }))
app.use('/api', async (req, res, next) => {
  try {
    if (!canAccessTrial(await store.read(), trialId, Date.now())) return res.status(403).json({ error: 'Trialul nu mai este activ.', code: 'trial_not_active' })
    next()
  } catch { res.status(503).json({ error: 'Registrul trialului nu este disponibil.' }) }
})
app.use('/api', require('../../core/auth-routes')) // Actual password login and session Map.
app.use('/api', require('./demo-restored-file-router').createRestoredFileRouter(dir, trialId))
app.use('/api', require('../../modules/documents/routes'))
app.use('/api', createSyntheticSetupRouter({ store: createSyntheticTrialStore(dir), trialId: process.env.SYNTHETIC_TRIAL_ID, apply: createSyntheticCompanyApplier() }))
const server = app.listen(0, '127.0.0.1', () => {
  if (managed) {
    const temp = path.join(dir, `runtime-${crypto.randomUUID()}.tmp`)
    fs.writeFileSync(temp, JSON.stringify({ ...runtimeIdentity, port: server.address().port }), { flag: 'wx', mode: 0o600 })
    fs.renameSync(temp, runtimeFile)
  }
  if (process.connected) process.send({ port: server.address().port })
})
process.on('message', message => { if (message === 'stop') shutdown() })
