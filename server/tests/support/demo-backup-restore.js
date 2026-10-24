'use strict'
// Test-only preparation in a NEW directory. No runtime, SQL, uploads or key recovery.
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto')
const { readVerifiedSyntheticBackup } = require('./demo-backup-inventory')
const { validateRegistry, canAccessTrial } = require('../../../scripts/lib/demo-trial-registry')
const { ROLE } = require('../../../scripts/lib/demo-company-setup')
function fail(code) { const e = new Error(code); e.code = code; throw e }
async function prepareSyntheticRestore(sourceDirectory, options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(k => !['trialId','backupName'].includes(k))) fail('invalid_restore_request')
  const { trialId, backupName } = options
  // Also validates NODE_ENV, source directory, manifest, paths, bytes, hash and trial binding.
  const database = await readVerifiedSyntheticBackup(sourceDirectory, trialId, backupName)
  const source = path.resolve(sourceDirectory), registryFile = path.join(source, 'registry.json')
  const stat = await fs.lstat(registryFile)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 8 * 1024 * 1024) fail('invalid_restore_registry')
  const bytes = await fs.readFile(registryFile), registry = validateRegistry(JSON.parse(bytes.toString('utf8')))
  const trial = registry.trials.find(t => t.id === trialId)
  const user = Array.isArray(database.users) ? database.users.find(u => u.id === trial?.setup?.ownerId) : null
  if (!trial?.setup || !Array.isArray(trial.setupAllowedModules) || !trial.setupAllowedModules.length
    || !canAccessTrial(registry, trialId, Date.now()) || database.users?.length !== 1
    || user?.role !== ROLE || user.active !== true || !user.passwordHash
    || !Array.isArray(user.roles || []) || (user.roles || []).some(r => r !== ROLE && r !== 'angajat')
    || database.demoTrialActivation?.userId !== user.id || database.demoTrialActivation?.activatedAt !== trial.activatedAt
    || Date.parse(user.demoAccessExpiresAt) !== trial.expiresAt) fail('restore_state_mismatch')
  const savedApplication = database.demoCompanySetupApplication, currentApplication = trial.setupApplication
  if (Boolean(savedApplication) !== Boolean(currentApplication) || (currentApplication
    && ['trialId','setupRevision','digest','appliedAt'].some(k => savedApplication[k] !== currentApplication[k]))) fail('restore_state_mismatch')
  if (!bytes.equals(await fs.readFile(registryFile))) fail('restore_source_changed')
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'infraflow-trial-store-restore-'))
  try {
    if (directory === source || path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir())) fail('invalid_restore_target')
    const isolated = { ...registry, trials: [structuredClone(trial)] }
    await fs.writeFile(path.join(directory, 'registry.json'), JSON.stringify(isolated), { flag: 'wx', mode: 0o600 })
    await fs.writeFile(path.join(directory, 'instance.json'), JSON.stringify(database), { flag: 'wx', mode: 0o600 })
    // A fresh TEST key, not the source APP_KEY: encrypted settings/storage are NOT restored by this probe.
    await fs.writeFile(path.join(directory, 'instance.key'), crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 })
    const receipt = { format: 'infraflow-synthetic-restore-probe-v1', trialId, prepared: true,
      scope: 'json-auth-setup-only', originalKeyCopied: false, productionRestoreApproved: false }
    await fs.writeFile(path.join(directory, 'restoration.json'), JSON.stringify(receipt), { flag: 'wx', mode: 0o600 })
    return { directory, context: { trialId, ownerId: user.id, resources: structuredClone(trial.resources), allowedModules: [...trial.setupAllowedModules] }, receipt }
  } catch (e) {
    // No process was started by this preparer. Remove only its freshly generated target.
    if (path.dirname(path.resolve(directory)) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('infraflow-trial-store-restore-')) await fs.rm(directory, { recursive: true, force: true })
    throw e
  }
}
module.exports = { prepareSyntheticRestore }
