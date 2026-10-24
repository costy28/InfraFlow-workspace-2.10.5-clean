'use strict'
// Read-only verifier for a TEST-ONLY JSON backup envelope, not SQL/ZIP production backups.
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto')
function fail(code) { const e = new Error(code); e.code = code; throw e }
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k))
async function inspectSyntheticBackups(directory, trialId, selectedName) {
  if (process.env.NODE_ENV !== 'test') fail('synthetic_test_only')
  const root = path.resolve(directory), backupDir = path.join(root, 'backups')
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('infraflow-trial-store-')) fail('invalid_synthetic_directory')
  const rootStat = await fs.lstat(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('invalid_synthetic_directory')
  if (typeof trialId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(trialId)) fail('invalid_backup_binding')
  let dirStat
  try { dirStat = await fs.lstat(backupDir) } catch (e) { if (e.code !== 'ENOENT') throw e }
  if (!dirStat) return { status: 'not_provisioned_or_unlocated', verifiedCount: 0, unknownEntries: 0, externalCoverage: 'unverified' }
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) fail('unsafe_backup_directory')
  const entries = (await fs.readdir(backupDir)).sort()
  if (entries.length > 1001) fail('backup_inventory_limit')
  if (!entries.includes('manifest.json')) return { status: 'present_not_inventoried', verifiedCount: 0, unknownEntries: entries.length, externalCoverage: 'unverified' }
  async function readSafe(name, limit) {
    const file = path.join(backupDir, name), before = await fs.lstat(file)
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > limit) fail('unsafe_backup_file')
    const bytes = await fs.readFile(file), after = await fs.lstat(file)
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
      || before.ino !== after.ino || after.isSymbolicLink() || after.nlink !== 1) fail('backup_inventory_changed')
    return bytes
  }
  const manifestBytes = await readSafe('manifest.json', 256 * 1024)
  let manifest
  try { manifest = JSON.parse(manifestBytes.toString('utf8')) } catch { fail('invalid_backup_manifest') }
  if (!exact(manifest, ['format','trialId','files']) || manifest.format !== 'infraflow-synthetic-backup-manifest-v1'
    || manifest.trialId !== trialId || !Array.isArray(manifest.files) || manifest.files.length > 100) fail('invalid_backup_manifest')
  const names = new Set(['manifest.json']); let totalBytes = 0
  // Validate every entry before reading any listed payload. Never follow manifest paths.
  for (const entry of manifest.files) {
    if (!exact(entry, ['name','bytes','sha256']) || typeof entry.name !== 'string' || entry.name.length > 100
      || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/.test(entry.name)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(entry.name)
      || names.has(entry.name.toLowerCase()) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > 64 * 1024 * 1024
      || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) fail('invalid_backup_entry')
    names.add(entry.name.toLowerCase()); totalBytes += entry.bytes
    if (totalBytes > 128 * 1024 * 1024) fail('backup_inventory_limit')
  }
  let verifiedCount = 0, selectedDatabase
  for (const entry of manifest.files) {
    let bytes
    try { bytes = await readSafe(entry.name, Math.min(entry.bytes, 64 * 1024 * 1024)) }
    catch (e) { if (e.code === 'ENOENT') fail('backup_missing'); throw e }
    if (bytes.length !== entry.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== entry.sha256) fail('backup_integrity_mismatch')
    let envelope
    try { envelope = JSON.parse(bytes.toString('utf8')) } catch { fail('invalid_backup_payload') }
    if (!exact(envelope, ['format','trialId','database']) || envelope.format !== 'infraflow-synthetic-json-backup-v1'
      || envelope.trialId !== trialId || envelope.database?.settings?.demoTrialId !== trialId) fail('backup_binding_mismatch')
    if (entry.name === selectedName) selectedDatabase = envelope.database
    verifiedCount++
  }
  if (!manifestBytes.equals(await readSafe('manifest.json', 256 * 1024))
    || JSON.stringify(entries) !== JSON.stringify((await fs.readdir(backupDir)).sort())) fail('backup_inventory_changed')
  const exactNames = new Set(['manifest.json', ...manifest.files.map(entry => entry.name)])
  const unknownEntries = entries.filter(n => !exactNames.has(n)).length
  return { status: unknownEntries ? 'local_backup_entries_unclassified' : 'local_manifest_verified', verifiedCount,
    totalBytes, unknownEntries, externalCoverage: 'unverified', ...(selectedName === undefined ? {} : { selectedDatabase }) }
}
async function inventorySyntheticBackups(directory, trialId) { return inspectSyntheticBackups(directory, trialId) }
async function readVerifiedSyntheticBackup(directory, trialId, name) {
  if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/.test(name) || name.length > 100) fail('invalid_backup_selection')
  const result = await inspectSyntheticBackups(directory, trialId, name)
  if (result.status !== 'local_manifest_verified') fail('backup_inventory_incomplete')
  if (!result.selectedDatabase) fail('backup_selection_missing')
  // Internal restore input only. This content must never be put in the inventory/HTML report.
  return result.selectedDatabase
}
module.exports = { inventorySyntheticBackups, readVerifiedSyntheticBackup }
