'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os')
const model = require('../../scripts/lib/demo-trial-registry')
const { inventorySyntheticResources } = require('./support/demo-resource-inventory')
const { renderRetentionPreview } = require('../../scripts/lib/demo-retention-preview')
const { ROLE, companyRole, createSetup } = require('../../scripts/lib/demo-company-setup')
const trialId = '11111111-1111-4111-8111-111111111111'
async function fixture(t) {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'infraflow-trial-store-'))
  t.after(async () => {
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('infraflow-trial-store-'))
    await fs.rm(dir, { recursive: true, force: true })
    if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old
  })
  const now = Date.now(), secrets = ['SYNTHETIC-PASSWORD-NOT-FOR-REPORT', require('node:crypto').randomBytes(32).toString('hex')]
  let r = model.queueTrial(model.createRegistry(), { id: trialId, approvalId: 'inventory', now })
  r.trials[0].setup = createSetup(trialId, 'owner'); r.trials[0].setupAllowedModules = ['documents']; r.trials[0].setupEvents = []
  await fs.writeFile(path.join(dir, 'registry.json'), JSON.stringify(r))
  await fs.writeFile(path.join(dir, 'instance.json'), JSON.stringify({ settings: { demoTrialId: trialId, setupCompleted: true,
    customRoles: [companyRole()] }, users: [{ id: 'owner', username: 'owner', role: ROLE, active: false, passwordHash: secrets[0] }] }))
  await fs.writeFile(path.join(dir, 'instance.key'), secrets[1])
  return { dir, now, secrets }
}
test('inventar/HTML fără secrete; fișiere neschimbate și lipsa descriptorului NU dovedește oprirea', async t => {
  const { dir, now, secrets } = await fixture(t), files = await fs.readdir(dir)
  const before = await Promise.all(files.map(f => fs.readFile(path.join(dir, f))))
  const report = await inventorySyntheticResources(dir, { trialId, now })
  assert.equal(report.executionAllowed, false); assert.equal(report.plan.eligibility, 'blocked')
  assert.equal(report.resources.find(r => r.kind === 'database').status, 'bound_json')
  assert.equal(report.resources.find(r => r.kind === 'runtime').status, 'no_local_records_not_stop_proof')
  const html = renderRetentionPreview(report)
  for (const secret of secrets) { assert.equal(JSON.stringify(report).includes(secret), false); assert.equal(html.includes(secret), false) }
  assert.equal(html.includes(dir), false); assert.equal(html.includes('<script'), false)
  assert.match(html, /Ștergerea nu este disponibilă/)
  assert.deepEqual(await fs.readdir(dir), files)
  assert.deepEqual(await Promise.all(files.map(f => fs.readFile(path.join(dir, f)))), before)
  const qa = path.resolve(__dirname, '../../installer/output/qa'); await fs.mkdir(qa, { recursive: true })
  await fs.writeFile(path.join(qa, 'demo-retention-preview.html'), html)
})
test('resursă a altei companii, intrări necunoscute și backupuri neinventariate blochează', async t => {
  const { dir, now } = await fixture(t)
  await fs.writeFile(path.join(dir, 'instance.json'), JSON.stringify({ settings: { demoTrialId: 'other' }, users: [] }))
  await fs.mkdir(path.join(dir, 'backups')); await fs.writeFile(path.join(dir, 'unclassified.bin'), 'synthetic')
  const report = await inventorySyntheticResources(dir, { trialId, now })
  assert.ok(report.blockers.includes('database_binding_mismatch')); assert.equal(report.unknownEntries, 1)
  assert.equal(report.resources.find(r => r.kind === 'backups').status, 'present_not_inventoried')
  assert.equal(report.executionAllowed, false)
})
test('lipsuri și operație în curs sunt vizibile; fișier nesigur este refuzat', async t => {
  const { dir, now } = await fixture(t)
  await fs.unlink(path.join(dir, 'instance.key')); await fs.writeFile(path.join(dir, 'registry.lock'), 'synthetic lock')
  let report = await inventorySyntheticResources(dir, { trialId, now })
  assert.ok(report.blockers.includes('key_missing')); assert.ok(report.blockers.includes('operation_in_progress'))
  await fs.mkdir(path.join(dir, 'instance.key'))
  await assert.rejects(inventorySyntheticResources(dir, { trialId, now }), { code: 'unsafe_inventory_file' })
})
test('HTML escapează conținutul și refuză un raport care pretinde execuție', async t => {
  const { dir, now } = await fixture(t), report = await inventorySyntheticResources(dir, { trialId, now })
  report.warning = '<img src=x onerror=alert(1)>'
  const html = renderRetentionPreview(report)
  assert.equal(html.includes('<img src=x'), false); assert.match(html, /&lt;img/)
  report.executionAllowed = true
  assert.throws(() => renderRetentionPreview(report), /invalid_inventory_preview/)
})
test('inventarul refuză producția și directoare care nu sunt TEMP sintetice', async () => {
  const old = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    await assert.rejects(inventorySyntheticResources(process.cwd(), {}), { code: 'synthetic_test_only' })
    process.env.NODE_ENV = 'test'
    await assert.rejects(inventorySyntheticResources(process.cwd(), {}), { code: 'invalid_synthetic_directory' })
  } finally { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old }
})
test('proces real: inventarul autentifică health fără să expună nonce sau să oprească instanța', { timeout: 30000 }, async t => {
  const f = await fixture(t)
  const { createSyntheticTrialStore } = require('../../scripts/lib/demo-trial-store')
  const { createSyntheticApprovalOrchestrator } = require('../../scripts/lib/demo-approval-orchestrator')
  const { createLocalSyntheticInstance } = require('./support/demo-local-instance')
  const store = createSyntheticTrialStore(f.dir), instance = createLocalSyntheticInstance(f.dir)
  try {
    await createSyntheticApprovalOrchestrator({ store, ensureInstance: instance.ensureInstance })({ trialId, approvalId: 'inventory',
      ownerId: 'owner', allowedModules: ['documents'], invitationId: 'inventory-invite', now: f.now })
    const before = await fs.readFile(path.join(f.dir, 'registry.json')), pid = instance.pid
    const record = JSON.parse(await fs.readFile(path.join(f.dir, 'runtime.json'), 'utf8'))
    const report = await inventorySyntheticResources(f.dir, { trialId, now: Date.now() })
    assert.equal(report.resources.find(r => r.kind === 'runtime').status, 'authenticated_running')
    assert.ok(report.blockers.includes('runtime_running')); assert.equal(instance.pid, pid)
    assert.equal(JSON.stringify(report).includes(record.nonce), false)
    assert.equal(renderRetentionPreview(report).includes(record.nonce), false)
    assert.deepEqual(await fs.readFile(path.join(f.dir, 'registry.json')), before)
  } finally { await instance.stop() }
})
