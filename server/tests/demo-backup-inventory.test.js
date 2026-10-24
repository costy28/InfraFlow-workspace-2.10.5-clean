'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto')
const { inventorySyntheticBackups } = require('./support/demo-backup-inventory')
const { inventorySyntheticResources } = require('./support/demo-resource-inventory')
const { renderRetentionPreview } = require('../../scripts/lib/demo-retention-preview')
const model = require('../../scripts/lib/demo-trial-registry')
const trialId = '11111111-1111-4111-8111-111111111111', secret = 'SYNTHETIC-BACKUP-SECRET-NOT-FOR-REPORT'
async function fixture(t) {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'infraflow-trial-store-')), backups = path.join(dir, 'backups')
  t.after(async () => {
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('infraflow-trial-store-'))
    await fs.rm(dir, { recursive: true, force: true })
    if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old
  })
  await fs.mkdir(backups)
  const payload = { format: 'infraflow-synthetic-json-backup-v1', trialId,
    database: { settings: { demoTrialId: trialId }, users: [{ id: 'owner', passwordHash: secret }] } }
  const manifest = { format: 'infraflow-synthetic-backup-manifest-v1', trialId, files: [] }
  async function save(value = payload) {
    const bytes = Buffer.from(JSON.stringify(value))
    await fs.writeFile(path.join(backups, 'sample.json'), bytes)
    manifest.files = [{ name: 'sample.json', bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }]
    await fs.writeFile(path.join(backups, 'manifest.json'), JSON.stringify(manifest))
  }
  await save()
  return { dir, backups, payload, manifest, save, writeManifest: () => fs.writeFile(path.join(backups, 'manifest.json'), JSON.stringify(manifest)) }
}
test('manifest local: hash și legare verificate, fără conținut sensibil și fără scriere', async t => {
  const f = await fixture(t), names = await fs.readdir(f.backups)
  const before = await Promise.all(names.map(n => fs.readFile(path.join(f.backups, n))))
  const result = await inventorySyntheticBackups(f.dir, trialId)
  assert.equal(result.status, 'local_manifest_verified'); assert.equal(result.verifiedCount, 1)
  assert.equal(result.externalCoverage, 'unverified'); assert.equal(JSON.stringify(result).includes(secret), false)
  assert.equal(JSON.stringify(result).includes('sample.json'), false)
  assert.deepEqual(await Promise.all(names.map(n => fs.readFile(path.join(f.backups, n)))), before)
})
test('copie lipsă sau conținut modificat este refuzat', async t => {
  const f = await fixture(t), file = path.join(f.backups, 'sample.json')
  const bytes = await fs.readFile(file); bytes[bytes.length - 2] ^= 1
  await fs.writeFile(file, bytes)
  await assert.rejects(inventorySyntheticBackups(f.dir, trialId), { code: 'backup_integrity_mismatch' })
  await fs.unlink(file)
  await assert.rejects(inventorySyntheticBackups(f.dir, trialId), { code: 'backup_missing' })
})
test('manifestul și payload-ul altei companii sunt refuzate chiar cu hash corect', async t => {
  const f = await fixture(t)
  f.manifest.trialId = '22222222-2222-4222-8222-222222222222'; await f.writeManifest()
  await assert.rejects(inventorySyntheticBackups(f.dir, trialId), { code: 'invalid_backup_manifest' })
  f.manifest.trialId = trialId
  await f.save({ ...f.payload, trialId: 'other' })
  await assert.rejects(inventorySyntheticBackups(f.dir, trialId), { code: 'backup_binding_mismatch' })
  await f.save({ ...f.payload, database: { settings: { demoTrialId: 'other' } } })
  await assert.rejects(inventorySyntheticBackups(f.dir, trialId), { code: 'backup_binding_mismatch' })
})
test('căi injectate, nume Windows rezervate, duplicate și limite invalide sunt refuzate', async t => {
  const f = await fixture(t), entry = { ...f.manifest.files[0] }
  for (const name of ['../instance.key', 'C:/outside.json', 'CON.json', 'manifest.json']) {
    f.manifest.files = [{ ...entry, name }]; await f.writeManifest()
    await assert.rejects(inventorySyntheticBackups(f.dir, trialId), { code: 'invalid_backup_entry' })
  }
  f.manifest.files = [entry, { ...entry, name: 'SAMPLE.json' }]; await f.writeManifest()
  await assert.rejects(inventorySyntheticBackups(f.dir, trialId), { code: 'invalid_backup_entry' })
  f.manifest.files = [{ ...entry, bytes: 65 * 1024 * 1024 }]; await f.writeManifest()
  await assert.rejects(inventorySyntheticBackups(f.dir, trialId), { code: 'invalid_backup_entry' })
})
test('hardlink și director în locul copiei sunt refuzate', async t => {
  const f = await fixture(t), payload = path.join(f.backups, 'sample.json'), original = path.join(f.dir, 'original.json')
  await fs.rename(payload, original); await fs.link(original, payload)
  await assert.rejects(inventorySyntheticBackups(f.dir, trialId), { code: 'unsafe_backup_file' })
  await fs.unlink(payload); await fs.mkdir(payload)
  await assert.rejects(inventorySyntheticBackups(f.dir, trialId), { code: 'unsafe_backup_file' })
})
test('raportul arată copiile locale, dar păstrează blocajul pentru backupuri externe', async t => {
  const f = await fixture(t), now = Date.now()
  const registry = model.queueTrial(model.createRegistry(), { id: trialId, approvalId: 'backup-inventory', now })
  registry.trials[0].setup = { ownerId: 'owner' }
  await fs.writeFile(path.join(f.dir, 'registry.json'), JSON.stringify(registry))
  await fs.writeFile(path.join(f.dir, 'instance.json'), JSON.stringify(f.payload.database))
  await fs.writeFile(path.join(f.dir, 'instance.key'), 'synthetic-key')
  let report = await inventorySyntheticResources(f.dir, { trialId, now })
  assert.equal(report.resources.find(r => r.kind === 'backups').status, 'local_manifest_verified')
  assert.ok(report.blockers.includes('external_backups_unverified')); assert.equal(report.executionAllowed, false)
  assert.equal(renderRetentionPreview(report).includes(secret), false)
  const qa = path.resolve(__dirname, '../../installer/output/qa'); await fs.mkdir(qa, { recursive: true })
  await fs.writeFile(path.join(qa, 'demo-backup-preview.html'), renderRetentionPreview(report))
  await fs.writeFile(path.join(f.backups, 'unknown.dat'), 'synthetic')
  report = await inventorySyntheticResources(f.dir, { trialId, now })
  assert.equal(report.resources.find(r => r.kind === 'backups').unknownEntries, 1)
  assert.ok(report.blockers.includes('backups_inventory_incomplete'))
  await fs.writeFile(path.join(f.backups, 'sample.json'), 'broken')
  report = await inventorySyntheticResources(f.dir, { trialId, now })
  assert.equal(report.resources.find(r => r.kind === 'backups').status, 'local_backup_verification_failed')
})
test('inventarul backupurilor refuză modul producție și căile nesintetice', async () => {
  const old = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    await assert.rejects(inventorySyntheticBackups(process.cwd(), trialId), { code: 'synthetic_test_only' })
    process.env.NODE_ENV = 'test'
    await assert.rejects(inventorySyntheticBackups(process.cwd(), trialId), { code: 'invalid_synthetic_directory' })
  } finally { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old }
})
