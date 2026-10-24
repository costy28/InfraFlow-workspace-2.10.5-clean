'use strict'
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os')
const { readVerifiedSyntheticBackup } = require('./demo-backup-inventory')
const { readVerifiedSyntheticStorage } = require('./demo-storage-inventory')
const { prepareSyntheticRestore } = require('./demo-backup-restore')
const { verifySyntheticSnapshotReferences } = require('../../../scripts/lib/demo-snapshot-references')
async function prepareSyntheticJointRestore(source, options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(k => !['trialId','backupName'].includes(k))) throw Error('invalid_joint_restore_request')
  const { trialId, backupName } = options
  const database = await readVerifiedSyntheticBackup(source, trialId, backupName)
  const storage = await readVerifiedSyntheticStorage(source, trialId)
  const ownerId = database.demoTrialActivation?.userId
  verifySyntheticSnapshotReferences(database, storage, { trialId, ownerId })
  const restored = await prepareSyntheticRestore(source, options) // Fresh target, current registry and activation checks.
  try {
    const copiedDatabase = JSON.parse(await fs.readFile(path.join(restored.directory, 'instance.json'), 'utf8'))
    verifySyntheticSnapshotReferences(copiedDatabase, storage, { trialId, ownerId: restored.context.ownerId })
    await fs.mkdir(path.join(restored.directory, 'storage'))
    for (const file of storage.files) await fs.writeFile(path.join(restored.directory, 'storage', file.name), file.bytes, { flag: 'wx', mode: 0o600 })
    await fs.writeFile(path.join(restored.directory, 'storage', 'manifest.json'), storage.manifestBytes, { flag: 'wx', mode: 0o600 })
    const checked = await readVerifiedSyntheticStorage(restored.directory, trialId)
    const summary = verifySyntheticSnapshotReferences(copiedDatabase, checked, { trialId, ownerId: restored.context.ownerId })
    const receipt = { format: 'infraflow-synthetic-joint-restore-v1', ...summary,
      decryptionVerified: false, productionRestoreApproved: false }
    await fs.writeFile(path.join(restored.directory, 'joint-restoration.json'), JSON.stringify(receipt), { flag: 'wx', mode: 0o600 })
    return { ...restored, jointReceipt: receipt }
  } catch (e) {
    // The preparers never start a process. Only this newly created target may be removed.
    const target = path.resolve(restored.directory)
    if (path.dirname(target) === path.resolve(os.tmpdir()) && path.basename(target).startsWith('infraflow-trial-store-restore-')) await fs.rm(target, { recursive: true, force: true })
    throw e
  }
}
module.exports = { prepareSyntheticJointRestore }
