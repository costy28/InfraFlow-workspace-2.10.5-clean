'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os')
const { createSyntheticTrialStore } = require('../../scripts/lib/demo-trial-store')
const { createSyntheticApprovalOrchestrator } = require('../../scripts/lib/demo-approval-orchestrator')
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'infraflow-trial-store-'))
  t.after(async () => {
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('infraflow-trial-store-'))
    await fs.rm(dir, { recursive: true, force: true })
  })
  const store = createSyntheticTrialStore(dir); await store.initialize()
  const input = { trialId: '11111111-1111-4111-8111-111111111111', approvalId: 'approval-1', ownerId: 'owner',
    allowedModules: ['documents'], invitationId: 'invitation-1', now: Date.now() }
  return { store, input, dir }
}
const receipt = context => ({ ...context, healthy: true })
test('aprobare → confirmare instanță → invitație; retry fără token și fără activare', async t => {
  const { store, input, dir } = await fixture(t); let checks = 0
  const prepare = createSyntheticApprovalOrchestrator({ store, ensureInstance: async c => { checks++; return receipt(c) } })
  const result = await prepare(input)
  assert.equal(result.state, 'awaiting_activation'); assert.match(result.invitation.token, /^[a-f0-9]{64}$/)
  assert.equal((await prepare(input)).invitation.token, null); assert.equal(checks, 2)
  const row = (await store.read()).trials[0]
  assert.equal(row.expiresAt, null); assert.equal(row.revision, 2)
  assert.equal((await fs.readFile(path.join(dir, 'registry.json'), 'utf8')).includes(result.invitation.token), false)
  await assert.rejects(prepare({ ...input, ownerId: 'other' }), { code: 'setup_already_bound' })
  await assert.rejects(prepare({ ...input, allowedModules: ['system'] }), { code: 'invalid_approval' })
})
test('eșec/confirmare greșită nu emite invitație; reluare din provisioning', async t => {
  const { store, input } = await fixture(t); let mode = 'throw'
  const prepare = createSyntheticApprovalOrchestrator({ store, ensureInstance: async c => {
    if (mode === 'throw') throw Error('synthetic interruption')
    return mode === 'wrong' ? { ...receipt(c), ownerId: 'wrong' } : receipt(c)
  } })
  await assert.rejects(prepare(input))
  mode = 'wrong'; await assert.rejects(prepare(input), { code: 'invalid_instance_receipt' })
  let row = (await store.read()).trials[0]; assert.equal(row.state, 'provisioning'); assert.equal(row.invitation, undefined)
  mode = 'ok'; await prepare(input); row = (await store.read()).trials[0]
  assert.equal(row.state, 'awaiting_activation'); assert.equal(row.revision, 2)
})
test('apel paralel refuzat în același coordinator; adaptorul nu rulează de două ori', async t => {
  const { store, input } = await fixture(t); let release, started
  const ready = new Promise(r => { started = r })
  const prepare = createSyntheticApprovalOrchestrator({ store, ensureInstance: async c => {
    started(); await new Promise(r => { release = r }); return receipt(c)
  } })
  const first = prepare(input); await ready
  try { await assert.rejects(prepare(input), { code: 'orchestration_busy' }) } finally { release() }
  await first
})
