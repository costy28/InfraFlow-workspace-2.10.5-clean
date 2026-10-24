const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { createSyntheticTrialStore } = require('../../scripts/lib/demo-trial-store')
const model = require('../../scripts/lib/demo-trial-registry')
const setupModel = require('../../scripts/lib/demo-company-setup')
const { prepareCompanyApplication } = require('../../scripts/lib/demo-company-apply')
const trialId = '11111111-1111-4111-8111-111111111111', now = Date.parse('2026-10-22T10:00:00Z')
function fixture() {
  let registry = model.queueTrial(model.createRegistry(), { id: trialId, approvalId: 'approval', now })
  for (const action of ['provision','ready','activate']) registry = model.applyCommand(registry, {
    trialId, commandId: action, action, expectedRevision: registry.trials[0].revision, now,
    actor: { id: 'service', kind: action === 'activate' ? 'activation_agent' : 'worker' } })
  const user = { id: 'owner', name: 'Owner', role: setupModel.ROLE, active: true, passwordHash: 'synthetic' }
  const context = { trialId, user }, allowedModules = ['documents']
  let setup = setupModel.createSetup(trialId, user.id)
  for (const [step,input] of [['profile',{ companyName: 'Configured', country: 'RO', currency: 'RON', locale: 'ro-RO', timezone: 'Europe/Bucharest' }], ['modules',{ modules: ['documents'] }], ['complete',{}]]) {
    setup = setupModel.applySetupStep(registry, setup, context, { step,input,expectedRevision: setup.revision,now }, allowedModules)
  }
  const db = { settings: { demoTrialId: trialId, license: { plan: 'internal', maxUsers: 20 }, smtp_password_encrypted: 'synthetic-cipher', customSetting: false },
    users: [user], departments: [{ id: 'd1' }], documents: { documents: [{ id: 1 }] }, audit: [], unknownExtension: { value: 42 } }
  return { registry, setup, db, user, input: { registry, trialId, setup, allowedModules, userId: user.id, now } }
}
test('aplicare limitată la profil/module; licența, conturile, secretele și extensiile se păstrează', () => {
  const f = fixture(), before = structuredClone(f.db), r = prepareCompanyApplication(f.db, f.input)
  assert.equal(r.changed, true); assert.deepEqual(f.db, before)
  assert.deepEqual(r.db.users, before.users); assert.deepEqual(r.db.settings.license, before.settings.license)
  assert.equal(r.db.settings.smtp_password_encrypted, before.settings.smtp_password_encrypted)
  assert.equal(r.db.settings.customSetting, false); assert.deepEqual(r.db.unknownExtension, before.unknownExtension)
  assert.deepEqual(r.db.documents, before.documents); assert.deepEqual(r.db.settings.modules_enabled, ['documents'])
  assert.equal(r.db.audit.length, 1)
  const retry = prepareCompanyApplication(r.db, f.input)
  assert.equal(retry.changed, false); assert.equal(retry.db.audit.length, 1); assert.deepEqual(retry.receipt, r.receipt)
})
test('instanță greșită, profil incomplet, proprietar revocat și trial expirat sunt refuzate', () => {
  const f = fixture()
  assert.throws(() => prepareCompanyApplication({ ...f.db, settings: { demoTrialId: 'other' } }, f.input), e => e.code === 'wrong_erp_binding')
  assert.throws(() => prepareCompanyApplication(f.db, { ...f.input, setup: { ...f.setup, completedAt: null } }), e => e.code === 'setup_incomplete')
  assert.throws(() => prepareCompanyApplication({ ...f.db, users: [{ ...f.user, role: 'viewer' }] }, f.input), e => e.code === 'forbidden_role')
  assert.throws(() => prepareCompanyApplication(f.db, { ...f.input, now: now + 15 * 86400000 }), e => e.code === 'trial_not_active')
})
test('retry nu suprascrie o configurație schimbată după aplicare', () => {
  const f = fixture(), applied = prepareCompanyApplication(f.db, f.input)
  applied.db.settings.companyName = 'Changed separately'
  assert.throws(() => prepareCompanyApplication(applied.db, f.input), e => e.code === 'applied_configuration_drift')
  assert.equal(applied.db.settings.companyName, 'Changed separately')
})
test('întrerupere după salvarea ERP: retry confirmă registrul fără audit duplicat', async () => {
  const f = fixture(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'infraflow-trial-store-'))
  const file = path.join(dir, 'synthetic-erp.json')
  try {
    fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify(f.registry))
    fs.writeFileSync(file, JSON.stringify(f.db))
    const store = createSyntheticTrialStore(dir)
    await store.bindSetup({ trialId, ownerId: f.user.id, allowedModules: ['documents'] })
    for (const [step,input] of [['profile',f.setup.profile],['modules',{ modules: ['documents'] }],['complete',{}]]) {
      const state = await store.readSetup({ trialId, user: f.user, now })
      await store.configureSetup({ trialId, user: f.user, now, command: { step,input,expectedRevision: state.revision } })
    }
    const apply = context => {
      const r = prepareCompanyApplication(JSON.parse(fs.readFileSync(file, 'utf8')), context)
      if (r.changed) fs.writeFileSync(file, JSON.stringify(r.db))
      return r.receipt
    }
    const command = { trialId, user: f.user, expectedRevision: 3, now }
    await assert.rejects(store.applySetup({ ...command, apply: context => { apply(context); throw Error('synthetic interruption') } }))
    assert.equal((await store.read()).trials[0].setupApplication, undefined)
    const receipt = await store.applySetup({ ...command, apply })
    assert.equal(receipt.setupRevision, 3)
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).audit.length, 1)
    assert.deepEqual((await store.read()).trials[0].setupApplication, receipt)
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('infraflow-trial-store-'))
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
