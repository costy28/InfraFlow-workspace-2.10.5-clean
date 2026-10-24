'use strict'
// TEST-ONLY flat storage manifest. No production paths, recursive traversal or file serving.
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto')
function fail(code) { const e = new Error(code); e.code = code; throw e }
const exact = (v, fields) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === fields.length && Object.keys(v).every(k => fields.includes(k))
async function inspect(directory, trialId, capture = false) {
  if (process.env.NODE_ENV !== 'test') fail('synthetic_test_only')
  const root = path.resolve(directory)
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('infraflow-trial-store-')) fail('invalid_synthetic_directory')
  const rootStat = await fs.lstat(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('invalid_synthetic_directory')
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(trialId || '')) fail('invalid_storage_binding')
  const storage = path.join(root, 'storage')
  let s
  try { s = await fs.lstat(storage) } catch (e) { if (e.code !== 'ENOENT') throw e }
  if (!s) return { status: 'not_provisioned_or_unlocated', verifiedCount: 0, unknownEntries: 0 }
  if (!s.isDirectory() || s.isSymbolicLink()) fail('unsafe_storage_directory')
  const names = (await fs.readdir(storage)).sort()
  if (names.length > 1001) fail('storage_inventory_limit')
  if (!names.includes('manifest.json')) return { status: 'present_not_inventoried', verifiedCount: 0, unknownEntries: names.length }
  async function readSafe(name, limit) {
    const file = path.join(storage, name), before = await fs.lstat(file)
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > limit) fail('unsafe_storage_file')
    const bytes = await fs.readFile(file), after = await fs.lstat(file)
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
      || before.ino !== after.ino || after.isSymbolicLink() || after.nlink !== 1) fail('storage_inventory_changed')
    return bytes
  }
  const manifestBytes = await readSafe('manifest.json', 256 * 1024)
  let manifest
  try { manifest = JSON.parse(manifestBytes.toString('utf8')) } catch { fail('invalid_storage_manifest') }
  if (!exact(manifest, ['format','trialId','files']) || manifest.format !== 'infraflow-synthetic-storage-v1'
    || manifest.trialId !== trialId || !Array.isArray(manifest.files) || manifest.files.length > 100) fail('invalid_storage_manifest')
  const expected = new Set(['manifest.json']), folded = new Set(['manifest.json']); let totalBytes = 0
  for (const entry of manifest.files) {
    if (!exact(entry, ['name','bytes','sha256']) || typeof entry.name !== 'string' || entry.name.length > 100
      || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(txt|pdf|png|jpg|bin)$/.test(entry.name)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(entry.name) || folded.has(entry.name.toLowerCase())
      || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > 16 * 1024 * 1024
      || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) fail('invalid_storage_entry')
    folded.add(entry.name.toLowerCase()); expected.add(entry.name); totalBytes += entry.bytes
    if (totalBytes > 64 * 1024 * 1024) fail('storage_inventory_limit')
  }
  const files = []
  for (const entry of manifest.files) {
    let bytes
    try { bytes = await readSafe(entry.name, entry.bytes) } catch (e) { if (e.code === 'ENOENT') fail('storage_file_missing'); throw e }
    if (bytes.length !== entry.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== entry.sha256) fail('storage_integrity_mismatch')
    if (capture) files.push({ name: entry.name, bytes })
  }
  if (!manifestBytes.equals(await readSafe('manifest.json', 256 * 1024))
    || JSON.stringify(names) !== JSON.stringify((await fs.readdir(storage)).sort())) fail('storage_inventory_changed')
  const unknownEntries = names.filter(n => !expected.has(n)).length
  return { status: unknownEntries ? 'local_storage_entries_unclassified' : 'local_storage_manifest_verified',
    verifiedCount: manifest.files.length, totalBytes, unknownEntries, entityAccessVerified: false,
    ...(capture ? { files, manifestBytes } : {}) }
}
async function inventorySyntheticStorage(directory, trialId) { return inspect(directory, trialId) }
async function readVerifiedSyntheticStorage(directory, trialId) {
  const verified = await inspect(directory, trialId, true)
  if (verified.status !== 'local_storage_manifest_verified') fail('storage_inventory_incomplete')
  return verified
}
async function restoreSyntheticStorage(directory, options) {
  if (!exact(options, ['trialId'])) fail('invalid_storage_restore_request')
  const verified = await inspect(directory, options.trialId, true)
  if (verified.status !== 'local_storage_manifest_verified') fail('storage_inventory_incomplete')
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'infraflow-trial-store-storage-restore-'))
  try {
    await fs.mkdir(path.join(target, 'storage'))
    for (const file of verified.files) await fs.writeFile(path.join(target, 'storage', file.name), file.bytes, { flag: 'wx', mode: 0o600 })
    await fs.writeFile(path.join(target, 'storage', 'manifest.json'), verified.manifestBytes, { flag: 'wx', mode: 0o600 })
    const checked = await inventorySyntheticStorage(target, options.trialId)
    if (checked.status !== 'local_storage_manifest_verified') fail('storage_restore_verification_failed')
    return { directory: target, receipt: { format: 'infraflow-synthetic-storage-restore-v1', copiedFiles: checked.verifiedCount,
      integrityVerified: true, entityAccessVerified: false, decryptionVerified: false, productionRestoreApproved: false } }
  } catch (e) {
    if (path.dirname(path.resolve(target)) === path.resolve(os.tmpdir()) && path.basename(target).startsWith('infraflow-trial-store-storage-restore-')) await fs.rm(target, { recursive: true, force: true })
    throw e
  }
}
module.exports = { inventorySyntheticStorage, readVerifiedSyntheticStorage, restoreSyntheticStorage }
