'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createIntegratedStage, verifyIntegratedStage } = require('../../scripts/lib/core-integrated-stage-prototype')
const { integratedFixture } = require('./support/core-integrated-fixture')
test('integrated snapshot, role links and policy rows reconcile without exporting secrets', () => {
  const f = integratedFixture(), stage = createIntegratedStage(f.source, f.target, f.manifest, f.key)
  const r = verifyIntegratedStage(JSON.parse(JSON.stringify(stage)), f.target, f.manifest, f.key)
  assert.equal(r.status, 'review_required'); assert.equal(r.writeAuthorized, false); assert.equal(r.usersCompared, 1)
  assert.ok(r.decisionsCompared > 200)
  assert.ok(!JSON.stringify(stage).includes('SYNTHETIC-SECRET'))
  assert.ok(!JSON.stringify(r).includes('Synthetic User'))
  stage.users[0].id = stage.users[0].id.toUpperCase()
  assert.equal(verifyIntegratedStage(stage, f.target, f.manifest, f.key).usersCompared, 1)
})
test('missing links, missing policy, extra grant and changed primary role cannot pass', () => {
  for (const change of [s => { s.users[0].links = [] }, s => { s.policy.rows.pop() }, s => { s.users[0].primaryRole = 'operator' },
    s => { s.policy.rows.find(r => r.key === 'customRoles').payload = '[]' }]) {
    const f = integratedFixture(), stage = createIntegratedStage(f.source, f.target, f.manifest, f.key); change(stage)
    assert.throws(() => verifyIntegratedStage(stage, f.target, f.manifest, f.key), /nu a putut fi reconciliată/)
  }
})
test('changed target or manifest invalidates reconciliation; original stage remains valid', () => {
  const f = integratedFixture(), stage = createIntegratedStage(f.source, f.target, f.manifest, f.key)
  assert.throws(() => verifyIntegratedStage(stage, Buffer.concat([f.target, Buffer.from(' ')]), f.manifest, f.key))
  const m = structuredClone(f.manifest); m.revision++
  assert.throws(() => verifyIntegratedStage(stage, f.target, m, f.key))
  assert.equal(verifyIntegratedStage(stage, f.target, f.manifest, f.key).sourceByteIdentityVerified, true)
})
