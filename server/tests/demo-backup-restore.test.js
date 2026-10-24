'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto')
const { createSyntheticTrialStore } = require('../../scripts/lib/demo-trial-store')
const { createSyntheticApprovalOrchestrator } = require('../../scripts/lib/demo-approval-orchestrator')
const { createLocalSyntheticInstance } = require('./support/demo-local-instance')
const { prepareSyntheticRestore } = require('./support/demo-backup-restore')
const { ROLE } = require('../../scripts/lib/demo-company-setup')
async function fixture(t) {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'infraflow-trial-store-')), directories = [dir], instances = []
  t.after(async () => {
    for (const instance of instances) await instance.stop()
    for (const directory of directories) {
      assert.equal(path.dirname(directory), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith('infraflow-trial-store-'))
      await fs.rm(directory, { recursive: true, force: true })
    }
    if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old
  })
  const store = createSyntheticTrialStore(dir); await store.initialize()
  const original = createLocalSyntheticInstance(dir); instances.push(original)
  const trialId = '11111111-1111-4111-8111-111111111111'
  const { invitation } = await createSyntheticApprovalOrchestrator({ store, ensureInstance: original.ensureInstance })({ trialId,
    approvalId: 'restore', ownerId: 'owner', allowedModules: ['documents'], invitationId: 'restore-invite', now: Date.now() })
  const password = `Synthetic-${crypto.randomBytes(16).toString('hex')}!aA1`
  async function request(instance, route, body, expected, token) {
    const response = await fetch(instance.origin + '/api' + route, { method: body ? 'POST' : 'GET',
      headers: { Connection: 'close', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000) })
    assert.equal(response.status, expected, route); return response.json()
  }
  await request(original, '/demo-company/activate', { token: invitation.token, password, confirmPassword: password }, 200)
  const login = await request(original, '/login', { username: 'owner', password }, 200)
  const user = { id: 'owner', role: ROLE, active: true }
  const profile = { companyName: 'Companie restaurare sintetică', country: 'RO', locale: 'ro-RO', currency: 'RON', timezone: 'Europe/Bucharest' }
  for (const [index, [step, input]] of [['profile', profile], ['modules', { modules: ['documents'] }], ['complete', {}]].entries()) {
    await store.configureSetup({ trialId, user, now: Date.now(), command: { step, input, expectedRevision: index } })
  }
  await request(original, '/demo-company/setup/apply', { expectedRevision: 3 }, 200, login.token)
  await fs.mkdir(path.join(dir, 'backups'))
  const database = JSON.parse(await fs.readFile(original.dbFile, 'utf8'))
  async function backup(db = database) {
    const bytes = Buffer.from(JSON.stringify({ format: 'infraflow-synthetic-json-backup-v1', trialId, database: db }))
    await fs.writeFile(path.join(dir, 'backups', 'snapshot.json'), bytes)
    await fs.writeFile(path.join(dir, 'backups', 'manifest.json'), JSON.stringify({ format: 'infraflow-synthetic-backup-manifest-v1', trialId,
      files: [{ name: 'snapshot.json', bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }] }))
  }
  await backup()
  return { dir, store, original, trialId, password, token: login.token, request, database, backup, directories, instances }
}
test('restaurare JSON izolată: pornire/login/setup reale, sursa intactă și sesiuni separate', { timeout: 60000 }, async t => {
  const f = await fixture(t)
  const files = ['registry.json','instance.json','instance.key','backups/manifest.json','backups/snapshot.json']
  const before = await Promise.all(files.map(n => fs.readFile(path.join(f.dir, n))))
  const restored = await prepareSyntheticRestore(f.dir, { trialId: f.trialId, backupName: 'snapshot.json' })
  f.directories.push(restored.directory)
  assert.notEqual(restored.directory, f.dir); assert.equal(restored.receipt.productionRestoreApproved, false)
  assert.notDeepEqual(await fs.readFile(path.join(restored.directory, 'instance.key')), before[2])
  const instance = createLocalSyntheticInstance(restored.directory); f.instances.push(instance)
  await instance.ensureInstance(restored.context)
  assert.notEqual(instance.pid, f.original.pid); assert.notEqual(instance.origin, f.original.origin)
  await f.request(instance, '/demo-company/setup', undefined, 401, f.token)
  const login = await f.request(instance, '/login', { username: 'owner', password: f.password }, 200)
  await f.request(f.original, '/demo-company/setup', undefined, 401, login.token)
  const view = await f.request(instance, '/demo-company/setup', undefined, 200, login.token)
  assert.equal(view.setup.profile.companyName, f.database.settings.companyName)
  assert.deepEqual(view.setup.modules, ['documents'])
  assert.equal(view.expiresAt, Date.parse(f.database.users[0].demoAccessExpiresAt))
  const db = JSON.parse(await fs.readFile(instance.dbFile, 'utf8'))
  assert.equal(db.users[0].passwordHash, f.database.users[0].passwordHash)
  assert.equal(db.demoTrialActivation.activatedAt, f.database.demoTrialActivation.activatedAt)
  assert.deepEqual(db.settings, f.database.settings)
  await instance.stop()
  await f.request(f.original, '/demo-company/setup', undefined, 200, f.token)
  assert.deepEqual(await Promise.all(files.map(n => fs.readFile(path.join(f.dir, n)))), before)
  const qa = path.resolve(__dirname, '../../installer/output/qa'); await fs.mkdir(qa, { recursive: true })
  await fs.writeFile(path.join(qa, 'demo-restore-probe.json'), JSON.stringify({ format: 'infraflow-synthetic-restore-result-v1',
    passed: true, scope: 'json-auth-setup-only', sourceFilesUnchanged: true, separateProcessesAndSessions: true,
    passwordAndExpiryPreserved: true, encryptedSettingsRestored: false, storageFilesRestored: false,
    sqlRestoreTested: false, productionRestoreApproved: false }, null, 2))
  console.log('Restaurare sintetică: director/proces/cheie noi, login și setup reale; originalul și backupul neschimbate.')
})
test('selecție nesigură, copie modificată sau inventar incomplet: restaurare refuzată', { timeout: 45000 }, async t => {
  const f = await fixture(t)
  await assert.rejects(prepareSyntheticRestore(f.dir, { trialId: f.trialId, backupName: 'snapshot.json', targetDirectory: f.dir }), { code: 'invalid_restore_request' })
  await assert.rejects(prepareSyntheticRestore(f.dir, { trialId: f.trialId, backupName: '../instance.key' }), { code: 'invalid_backup_selection' })
  await assert.rejects(prepareSyntheticRestore(f.dir, { trialId: f.trialId, backupName: 'absent.json' }), { code: 'backup_selection_missing' })
  await fs.writeFile(path.join(f.dir, 'backups', 'unknown.dat'), 'synthetic')
  await assert.rejects(prepareSyntheticRestore(f.dir, { trialId: f.trialId, backupName: 'snapshot.json' }), { code: 'backup_inventory_incomplete' })
  await fs.unlink(path.join(f.dir, 'backups', 'unknown.dat'))
  const file = path.join(f.dir, 'backups', 'snapshot.json'), bytes = await fs.readFile(file); bytes[bytes.length - 2] ^= 1
  await fs.writeFile(file, bytes)
  await assert.rejects(prepareSyntheticRestore(f.dir, { trialId: f.trialId, backupName: 'snapshot.json' }), { code: 'backup_integrity_mismatch' })
})
test('snapshot cu proprietar dezactivat sau trial expirat nu pornește un trial nou', { timeout: 45000 }, async t => {
  const f = await fixture(t), disabled = structuredClone(f.database); disabled.users[0].active = false
  await f.backup(disabled)
  await assert.rejects(prepareSyntheticRestore(f.dir, { trialId: f.trialId, backupName: 'snapshot.json' }), { code: 'restore_state_mismatch' })
  const stale = structuredClone(f.database); stale.demoCompanySetupApplication.digest = '0'.repeat(64)
  await f.backup(stale)
  await assert.rejects(prepareSyntheticRestore(f.dir, { trialId: f.trialId, backupName: 'snapshot.json' }), { code: 'restore_state_mismatch' })
  await f.backup()
  const row = (await f.store.read()).trials[0]
  await f.store.command({ trialId: row.id, commandId: 'expire-restore', action: 'expire', expectedRevision: row.revision,
    actor: { id: 'worker', kind: 'worker' }, now: row.expiresAt })
  await assert.rejects(prepareSyntheticRestore(f.dir, { trialId: f.trialId, backupName: 'snapshot.json' }), { code: 'restore_state_mismatch' })
})
