'use strict'
// Read-only local test inventory, never a production resource ownership certificate.
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto')
const { validateRegistry } = require('../../../scripts/lib/demo-trial-registry')
const { planRetention } = require('../../../scripts/lib/demo-retention-plan')
const { readRecord, readManagedRecord, health } = require('./demo-runtime-record')
const { inventorySyntheticBackups } = require('./demo-backup-inventory')
const { inventorySyntheticStorage } = require('./demo-storage-inventory')
function fail(code) { const e = new Error(code); e.code = code; throw e }
async function inventorySyntheticResources(directory, { trialId, now, policy }) {
  if (process.env.NODE_ENV !== 'test') fail('synthetic_test_only')
  const root = path.resolve(directory)
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('infraflow-trial-store-')) fail('invalid_synthetic_directory')
  const rootStat = await fs.lstat(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('invalid_synthetic_directory')
  const blockers = [], resources = []
  async function stat(name) {
    try { return await fs.lstat(path.join(root, name)) }
    catch (e) { if (e.code === 'ENOENT') return null; throw e }
  }
  async function readJson(name, limit) {
    const s = await stat(name)
    if (!s?.isFile() || s.isSymbolicLink() || s.size > limit) fail('unsafe_inventory_file')
    const bytes = await fs.readFile(path.join(root, name))
    const after = await stat(name)
    if (!after || s.size !== after.size || s.mtimeMs !== after.mtimeMs || after.isSymbolicLink()) fail('inventory_changed')
    return { value: JSON.parse(bytes.toString('utf8')), bytes }
  }
  const initial = await readJson('registry.json', 8 * 1024 * 1024)
  const registry = validateRegistry(initial.value), trial = registry.trials.find(t => t.id === trialId)
  const plan = planRetention(registry, { trialId, now, policy })
  const db = await stat('instance.json')
  if (!db) { resources.push({ kind: 'database', status: 'missing' }); blockers.push('database_missing') }
  else {
    const state = (await readJson('instance.json', 64 * 1024 * 1024)).value
    const bound = state.settings?.demoTrialId === trialId && trial.setup?.ownerId
      && state.users?.some(u => u.id === trial.setup.ownerId)
    resources.push({ kind: 'database', status: bound ? 'bound_json' : 'mismatch', bytes: db.size })
    if (!bound) blockers.push('database_binding_mismatch')
  }
  // Do not read key contents, expose their digest, or claim ACL/cryptographic validity.
  const key = await stat('instance.key')
  if (key && (!key.isFile() || key.isSymbolicLink())) fail('unsafe_inventory_file')
  resources.push({ kind: 'appKey', status: key ? 'present_not_content_verified' : 'missing' })
  if (!key) blockers.push('key_missing')
  blockers.push('key_ownership_requires_confirmation')
  try {
    const storage = await inventorySyntheticStorage(root, trialId)
    resources.push({ kind: 'storage', ...storage })
    if (storage.status !== 'local_storage_manifest_verified') blockers.push('storage_inventory_incomplete')
  } catch {
    resources.push({ kind: 'storage', status: 'local_storage_verification_failed' }); blockers.push('storage_inventory_incomplete')
  }
  blockers.push('storage_entity_access_unverified')
  try {
    const backups = await inventorySyntheticBackups(root, trialId)
    resources.push({ kind: 'backups', ...backups })
    if (backups.status !== 'local_manifest_verified') blockers.push('backups_inventory_incomplete')
  } catch (e) {
    const knownErrors = new Set(['unsafe_backup_directory','unsafe_backup_file','backup_inventory_changed','invalid_backup_manifest',
      'invalid_backup_entry','backup_inventory_limit','backup_missing','backup_integrity_mismatch','invalid_backup_payload','backup_binding_mismatch'])
    resources.push({ kind: 'backups', status: 'local_backup_verification_failed', issue: knownErrors.has(e.code) ? e.code : 'backup_read_failed' })
    blockers.push('backups_inventory_incomplete')
  }
  blockers.push('external_backups_unverified')
  for (const name of ['runtime.json','runtime.claim']) {
    const s = await stat(name)
    if (s && (!s.isFile() || s.isSymbolicLink() || s.size > 16384)) fail('unsafe_inventory_file')
  }
  const record = await readManagedRecord(root), claim = await readRecord(root, 'runtime.claim')
  if (record) {
    if (record.trialId !== trialId || record.ownerId !== trial.setup?.ownerId) fail('runtime_binding_mismatch')
    try {
      await health(record)
      resources.push({ kind: 'runtime', status: 'authenticated_running' }); blockers.push('runtime_running')
    } catch {
      resources.push({ kind: 'runtime', status: 'unreachable_not_proven_stopped' }); blockers.push('runtime_state_unverified')
    }
  } else {
    resources.push({ kind: 'runtime', status: claim ? 'claim_without_descriptor' : 'no_local_records_not_stop_proof' })
    blockers.push('runtime_state_unverified')
  }
  resources.push({ kind: 'routing', status: 'not_implemented_in_local_harness' }); blockers.push('routing_inventory_incomplete')
  const known = new Set(['registry.json','instance.json','instance.key','runtime.json','runtime.claim','registry.lock','runtime.recovery','storage','backups'])
  const entries = await fs.readdir(root), unknownEntries = entries.filter(n => !known.has(n)).length
  if (unknownEntries) blockers.push('unclassified_local_entries')
  if (entries.includes('registry.lock') || entries.includes('runtime.recovery')) blockers.push('operation_in_progress')
  const final = await readJson('registry.json', 8 * 1024 * 1024)
  if (!initial.bytes.equals(final.bytes)) fail('inventory_changed')
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ binding: plan.binding, resources, unknownEntries })).digest('hex')
  return { format: 'infraflow-synthetic-resource-preview-v1', trialId, revision: trial.revision, observedAt: now,
    executionAllowed: false, plan, resources, blockers, unknownEntries, fingerprint,
    warning: 'Inventar sintetic parțial. Fără autorizare de ștergere; backupurile externe și izolarea OS nu sunt verificate.' }
}
module.exports = { inventorySyntheticResources }
