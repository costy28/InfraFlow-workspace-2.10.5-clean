'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto')
const { verifySyntheticSnapshotReferences } = require('../../scripts/lib/demo-snapshot-references')
const { prepareSyntheticJointRestore } = require('./support/demo-joint-restore')
const { createSyntheticTrialStore } = require('../../scripts/lib/demo-trial-store')
const { createSyntheticApprovalOrchestrator } = require('../../scripts/lib/demo-approval-orchestrator')
const { createLocalSyntheticInstance } = require('./support/demo-local-instance')
const trialId = '11111111-1111-4111-8111-111111111111'
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
function snapshot() {
  const bytes = Buffer.from('SYNTHETIC-CONTENT'), manifestBytes = Buffer.from(JSON.stringify({ format: 'infraflow-synthetic-storage-v1', trialId,
    files: [{ name: 'sample.txt', bytes: bytes.length, sha256: hash(bytes) }] }))
  return { database: { settings: { demoTrialId: trialId }, syntheticSnapshot: { format: 'infraflow-synthetic-joint-snapshot-v1', trialId, storageManifestSha256: hash(manifestBytes) },
    documents: { documents: [{ id: 'doc-1', uuid: 'restored-doc', status: 'draft', creat_de: 'owner', fisier_draft_path: 'storage/sample.txt', fisier_final_path: null },
      { id: 'foreign-doc', uuid: 'foreign-doc', status: 'draft', creat_de: 'another-owner' }] } },
  storage: { status: 'local_storage_manifest_verified', manifestBytes, files: [{ name: 'sample.txt', bytes }] } }
}
const context = { trialId, ownerId: 'owner' }
test('referințe comune: un document și un fișier, fără modificarea intrărilor', () => {
  const { database, storage } = snapshot(), before = JSON.stringify(database)
  const result = verifySyntheticSnapshotReferences(database, storage, context)
  assert.equal(result.referencesConsistent, true); assert.equal(result.fileCount, 1); assert.equal(result.entityAccessVerified, false)
  assert.equal(JSON.stringify(database), before)
})
test('manifestul sau conținutul modificat nu poate fi amestecat cu JSON-ul vechi', () => {
  let s = snapshot(); s.database.syntheticSnapshot.storageManifestSha256 = '0'.repeat(64)
  assert.throws(() => verifySyntheticSnapshotReferences(s.database, s.storage, context), { code: 'snapshot_manifest_mismatch' })
  s = snapshot(); s.storage.files[0].bytes[0] ^= 1
  assert.throws(() => verifySyntheticSnapshotReferences(s.database, s.storage, context), { code: 'snapshot_file_integrity_mismatch' })
})
test('referință lipsă/externă, proprietar greșit și dubluri sunt refuzate', () => {
  for (const [change, code] of [
    [d => { d.documents.documents[0].fisier_draft_path = '../instance.key' }, 'snapshot_file_reference_missing'],
    [d => { d.documents.documents[0].creat_de = 'other' }, 'snapshot_document_owner_mismatch'],
    [d => { d.documents.documents[0].fisier_final_path = 'storage/sample.txt' }, 'snapshot_duplicate_reference'],
    [d => { d.documents.documents.push({ ...d.documents.documents[0] }) }, 'snapshot_document_identity_invalid'],
    [d => { d.documents.documents = [] }, 'snapshot_orphan_files'],
  ]) {
    const s = snapshot(); change(s.database)
    assert.throws(() => verifySyntheticSnapshotReferences(s.database, s.storage, context), { code })
  }
})
test('restaurare comună: proces/login reale, fișier și document concordante, sursă intactă', { timeout: 60000 }, async t => {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'infraflow-trial-store-')), directories = [root], instances = []
  t.after(async () => {
    for (const instance of instances) await instance.stop()
    for (const dir of directories) {
      assert.equal(path.dirname(dir), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('infraflow-trial-store-'))
      await fs.rm(dir, { recursive: true, force: true })
    }
    if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old
  })
  const store = createSyntheticTrialStore(root); await store.initialize()
  const original = createLocalSyntheticInstance(root); instances.push(original)
  const { invitation } = await createSyntheticApprovalOrchestrator({ store, ensureInstance: original.ensureInstance })({ trialId,
    approvalId: 'joint', ownerId: 'owner', allowedModules: ['documents'], invitationId: 'joint-invite', now: Date.now() })
  const password = `Synthetic-${crypto.randomBytes(16).toString('hex')}!aA1`
  async function request(a, route, body, status, token) {
    const response = await fetch(a.origin + '/api' + route, { method: body ? 'POST' : 'GET',
      headers: { Connection: 'close', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000) })
    assert.equal(response.status, status); return response.json()
  }
  await request(original, '/demo-company/activate', { token: invitation.token, password, confirmPassword: password }, 200)
  const initialLogin = await request(original, '/login', { username: 'owner', password }, 200)
  const disabledModule = await fetch(original.origin + '/api/synthetic-documents/doc-1/file/draft', {
    headers: { Connection: 'close', Authorization: `Bearer ${initialLogin.token}` }, signal: AbortSignal.timeout(5000) })
  assert.equal(disabledModule.status, 403) // Login alone must not activate the Documents entitlement.
  const { ROLE } = require('../../scripts/lib/demo-company-setup')
  const profile = { companyName: 'Restaurare fișiere sintetică', country: 'RO', locale: 'ro-RO', currency: 'RON', timezone: 'Europe/Bucharest' }
  for (const [index, [step, input]] of [['profile', profile], ['modules', { modules: ['documents'] }], ['complete', {}]].entries()) {
    await store.configureSetup({ trialId, user: { id: 'owner', role: ROLE, active: true }, now: Date.now(), command: { step, input, expectedRevision: index } })
  }
  await request(original, '/demo-company/setup/apply', { expectedRevision: 3 }, 200, initialLogin.token)
  await original.stop()
  // Fixture preparation only while the source process is stopped, never an external live DB writer.
  const s = snapshot(), database = JSON.parse(await fs.readFile(original.dbFile, 'utf8'))
  database.syntheticSnapshot = s.database.syntheticSnapshot; database.documents = s.database.documents
  await fs.writeFile(original.dbFile, JSON.stringify(database))
  const row = (await store.read()).trials[0]
  await original.ensureInstance({ trialId, ownerId: 'owner', resources: row.resources, allowedModules: ['documents'] })
  const login = await request(original, '/login', { username: 'owner', password }, 200)
  await fs.mkdir(path.join(root, 'storage')); await fs.mkdir(path.join(root, 'backups'))
  await fs.writeFile(path.join(root, 'storage', 'manifest.json'), s.storage.manifestBytes)
  await fs.writeFile(path.join(root, 'storage', 'sample.txt'), s.storage.files[0].bytes)
  const currentDb = JSON.parse(await fs.readFile(original.dbFile, 'utf8'))
  const backup = Buffer.from(JSON.stringify({ format: 'infraflow-synthetic-json-backup-v1', trialId, database: currentDb }))
  await fs.writeFile(path.join(root, 'backups', 'joint.json'), backup)
  await fs.writeFile(path.join(root, 'backups', 'manifest.json'), JSON.stringify({ format: 'infraflow-synthetic-backup-manifest-v1', trialId,
    files: [{ name: 'joint.json', bytes: backup.length, sha256: hash(backup) }] }))
  const files = ['registry.json','instance.json','instance.key','storage/manifest.json','storage/sample.txt','backups/manifest.json','backups/joint.json']
  const before = await Promise.all(files.map(f => fs.readFile(path.join(root, f))))
  const restored = await prepareSyntheticJointRestore(root, { trialId, backupName: 'joint.json' }); directories.push(restored.directory)
  assert.equal(restored.jointReceipt.referencesConsistent, true); assert.equal(restored.jointReceipt.entityAccessVerified, false)
  const replica = createLocalSyntheticInstance(restored.directory); instances.push(replica)
  await replica.ensureInstance(restored.context)
  assert.notEqual(replica.pid, original.pid)
  await request(replica, '/demo-company/setup', undefined, 401, login.token)
  const replicaLogin = await request(replica, '/login', { username: 'owner', password }, 200)
  async function download(route, status, token = replicaLogin.token) {
    const response = await fetch(replica.origin + route, { headers: { Connection: 'close', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(5000) })
    assert.equal(response.status, status, route)
    return response
  }
  const fileRoute = '/api/synthetic-documents/doc-1/file/draft'
  const ownFile = await download(fileRoute, 200)
  assert.equal(ownFile.headers.get('cache-control'), 'no-store')
  assert.deepEqual(Buffer.from(await ownFile.arrayBuffer()), s.storage.files[0].bytes)
  await download(fileRoute, 401, null)
  await download(fileRoute, 401, login.token)
  await download('/api/synthetic-documents/foreign-doc/file/draft', 404)
  await download('/api/synthetic-documents/missing/file/draft', 404)
  await download('/api/synthetic-documents/doc-1/file/final', 404)
  await download(fileRoute + '?path=../../instance.key', 404)
  await download('/storage/sample.txt', 404)
  await download('/api/documents/foreign-doc', 403)
  await download('/api/documents/restored-doc', 200)
  const restoredFile = path.join(restored.directory, 'storage', 'sample.txt')
  await fs.writeFile(restoredFile, 'TAMPERED')
  await download(fileRoute, 409)
  await fs.writeFile(restoredFile, s.storage.files[0].bytes)
  await fs.rename(restoredFile, restoredFile + '.missing')
  await download(fileRoute, 409)
  await fs.rename(restoredFile + '.missing', restoredFile)
  await download(fileRoute, 200)
  const replicaStore = createSyntheticTrialStore(restored.directory), replicaRow = (await replicaStore.read()).trials[0]
  await replicaStore.command({ trialId, commandId: 'expire-http-file-probe', expectedRevision: replicaRow.revision,
    action: 'expire', actor: { id: 'synthetic-worker', kind: 'worker' }, now: replicaRow.expiresAt })
  await download(fileRoute, 403)
  const restoredDb = JSON.parse(await fs.readFile(replica.dbFile, 'utf8'))
  assert.equal(restoredDb.documents.documents[0].fisier_draft_path, 'storage/sample.txt')
  assert.deepEqual(await fs.readFile(path.join(restored.directory, 'storage', 'sample.txt')), s.storage.files[0].bytes)
  assert.deepEqual(await Promise.all(files.map(f => fs.readFile(path.join(root, f)))), before)
  await replica.stop(); await request(original, '/demo-company/setup', undefined, 200, login.token)
  const qa = path.resolve(__dirname, '../../installer/output/qa'); await fs.mkdir(qa, { recursive: true })
  await fs.writeFile(path.join(qa, 'demo-joint-restore-probe.json'), JSON.stringify({ passed: true, scope: 'synthetic-flat-json-storage',
    sourceUnchanged: true, ...restored.jointReceipt, syntheticOwnerFileHttpVerified: true,
    nativeDocumentVisibilityHttpVerified: true, productionFileEndpointVerified: false }, null, 2))
})
