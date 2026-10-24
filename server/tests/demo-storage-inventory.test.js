'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto')
const { inventorySyntheticStorage, restoreSyntheticStorage } = require('./support/demo-storage-inventory')
const { inventorySyntheticResources } = require('./support/demo-resource-inventory')
const { renderRetentionPreview } = require('../../scripts/lib/demo-retention-preview')
const trialId = '11111111-1111-4111-8111-111111111111', secret = 'SYNTHETIC-STORAGE-CONTENT-NOT-FOR-REPORT'
async function fixture(t) {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'infraflow-trial-store-')), directories = [dir]
  t.after(async () => {
    for (const d of directories) {
      assert.equal(path.dirname(d), path.resolve(os.tmpdir())); assert.ok(path.basename(d).startsWith('infraflow-trial-store-'))
      await fs.rm(d, { recursive: true, force: true })
    }
    if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old
  })
  const storage = path.join(dir, 'storage'); await fs.mkdir(storage)
  const contents = { 'document.txt': Buffer.from(secret), 'binary.bin': Buffer.from([0, 1, 2, 128, 255]), 'empty.txt': Buffer.alloc(0) }
  const manifest = { format: 'infraflow-synthetic-storage-v1', trialId, files: [] }
  for (const [name, bytes] of Object.entries(contents)) {
    await fs.writeFile(path.join(storage, name), bytes)
    manifest.files.push({ name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
  }
  const writeManifest = () => fs.writeFile(path.join(storage, 'manifest.json'), JSON.stringify(manifest))
  await writeManifest()
  return { dir, storage, contents, manifest, writeManifest, directories }
}
test('inventar și două copii izolate: fișiere binar identice, sursă intactă, fără conținut în raport', async t => {
  const f = await fixture(t), names = await fs.readdir(f.storage)
  const before = await Promise.all(names.map(n => fs.readFile(path.join(f.storage, n))))
  const inventory = await inventorySyntheticStorage(f.dir, trialId)
  assert.equal(inventory.status, 'local_storage_manifest_verified'); assert.equal(inventory.verifiedCount, 3)
  assert.equal(JSON.stringify(inventory).includes(secret), false); assert.equal(JSON.stringify(inventory).includes('document.txt'), false)
  const first = await restoreSyntheticStorage(f.dir, { trialId }); f.directories.push(first.directory)
  const second = await restoreSyntheticStorage(first.directory, { trialId }); f.directories.push(second.directory)
  for (const result of [first, second]) {
    assert.notEqual(result.directory, f.dir); assert.equal(result.receipt.productionRestoreApproved, false)
    assert.equal(result.receipt.entityAccessVerified, false); assert.equal(result.receipt.decryptionVerified, false)
    assert.deepEqual(await fs.readdir(result.directory), ['storage'])
    assert.deepEqual(await Promise.all(names.map(n => fs.readFile(path.join(result.directory, 'storage', n)))), before)
  }
  assert.deepEqual(await Promise.all(names.map(n => fs.readFile(path.join(f.storage, n)))), before)
  const qa = path.resolve(__dirname, '../../installer/output/qa'); await fs.mkdir(qa, { recursive: true })
  await fs.writeFile(path.join(qa, 'demo-storage-restore-probe.json'), JSON.stringify({ passed: true, scope: 'synthetic-flat-storage-bytes-only',
    copiedFiles: 3, roundTripVerified: true, sourceUnchanged: true, productionRestoreApproved: false, entityAccessVerified: false }, null, 2))
})
test('fișier modificat, lipsă sau manifest al altui trial: refuz', async t => {
  const f = await fixture(t)
  f.manifest.trialId = 'other'; await f.writeManifest()
  await assert.rejects(inventorySyntheticStorage(f.dir, trialId), { code: 'invalid_storage_manifest' })
  f.manifest.trialId = trialId; await f.writeManifest()
  const bytes = Buffer.from(f.contents['document.txt']); bytes[0] ^= 1
  await fs.writeFile(path.join(f.storage, 'document.txt'), bytes)
  await assert.rejects(restoreSyntheticStorage(f.dir, { trialId }), { code: 'storage_integrity_mismatch' })
  await fs.unlink(path.join(f.storage, 'document.txt'))
  await assert.rejects(inventorySyntheticStorage(f.dir, trialId), { code: 'storage_file_missing' })
})
test('căi injectate, nume rezervate, duplicate și limite invalide refuzate', async t => {
  const f = await fixture(t), entry = { ...f.manifest.files[0] }
  for (const changed of [{ name: '../instance.key' }, { name: 'C:/outside.txt' }, { name: 'CON.txt' }, { name: 'script.html' }, { bytes: 17 * 1024 * 1024 }]) {
    f.manifest.files = [{ ...entry, ...changed }]; await f.writeManifest()
    await assert.rejects(inventorySyntheticStorage(f.dir, trialId), { code: 'invalid_storage_entry' })
  }
  f.manifest.files = [entry, { ...entry, name: 'DOCUMENT.txt' }]; await f.writeManifest()
  await assert.rejects(inventorySyntheticStorage(f.dir, trialId), { code: 'invalid_storage_entry' })
  await assert.rejects(restoreSyntheticStorage(f.dir, { trialId, targetDirectory: f.dir }), { code: 'invalid_storage_restore_request' })
})
test('hardlinkuri/directoare în loc de fișiere nu sunt copiate', async t => {
  const f = await fixture(t), file = path.join(f.storage, 'document.txt'), outside = path.join(f.dir, 'outside.txt')
  await fs.rename(file, outside); await fs.link(outside, file)
  await assert.rejects(restoreSyntheticStorage(f.dir, { trialId }), { code: 'unsafe_storage_file' })
  await fs.unlink(file); await fs.mkdir(file)
  await assert.rejects(inventorySyntheticStorage(f.dir, trialId), { code: 'unsafe_storage_file' })
})
test('intrările neclasificate blochează copia; lipsa manifestului nu dovedește storage gol', async t => {
  const f = await fixture(t)
  await fs.mkdir(path.join(f.storage, 'nested'))
  const result = await inventorySyntheticStorage(f.dir, trialId)
  assert.equal(result.status, 'local_storage_entries_unclassified'); assert.equal(result.unknownEntries, 1)
  await assert.rejects(restoreSyntheticStorage(f.dir, { trialId }), { code: 'storage_inventory_incomplete' })
  await fs.unlink(path.join(f.storage, 'manifest.json'))
  assert.equal((await inventorySyntheticStorage(f.dir, trialId)).status, 'present_not_inventoried')
})
test('raportul integrează integritatea storage, fără a certifica permisiuni pe document', async t => {
  const f = await fixture(t), now = Date.now()
  const model = require('../../scripts/lib/demo-trial-registry')
  const registry = model.queueTrial(model.createRegistry(), { id: trialId, approvalId: 'storage', now }); registry.trials[0].setup = { ownerId: 'owner' }
  await fs.writeFile(path.join(f.dir, 'registry.json'), JSON.stringify(registry))
  await fs.writeFile(path.join(f.dir, 'instance.json'), JSON.stringify({ settings: { demoTrialId: trialId }, users: [{ id: 'owner' }] }))
  const preview = await inventorySyntheticResources(f.dir, { trialId, now })
  assert.equal(preview.resources.find(r => r.kind === 'storage').status, 'local_storage_manifest_verified')
  assert.ok(preview.blockers.includes('storage_entity_access_unverified')); assert.equal(preview.executionAllowed, false)
  const html = renderRetentionPreview(preview); assert.equal(html.includes(secret), false)
  const qa = path.resolve(__dirname, '../../installer/output/qa'); await fs.mkdir(qa, { recursive: true })
  await fs.writeFile(path.join(qa, 'demo-storage-preview.html'), html)
})
test('modul producție și directoarele nesintetice sunt refuzate', async () => {
  const old = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    await assert.rejects(inventorySyntheticStorage(process.cwd(), trialId), { code: 'synthetic_test_only' })
    process.env.NODE_ENV = 'test'
    await assert.rejects(inventorySyntheticStorage(process.cwd(), trialId), { code: 'invalid_synthetic_directory' })
  } finally { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old }
})
