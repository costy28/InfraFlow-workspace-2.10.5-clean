'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { analyzeCorePreservation } = require('../../scripts/lib/core-sync-preservation')
test('projection fields alone still do not authorize import', () => {
  const r = analyzeCorePreservation({ users: [{ id: 'test', roles: ['viewer'], active: true }], departments: [] })
  assert.equal(r.totals.blockers, 0); assert.equal(r.status, 'review_required'); assert.equal(r.writeAuthorized, false)
})
test('security, HR and access metadata are explicit blockers', () => {
  const source = { users: [{ twoFactorSecretEncrypted: 'SECRET', twoFactorRecoveryCodeHashes: [], employee_id: 'PRIVATE-ID', permissionOverrides: {} }], departments: [] }
  const before = JSON.stringify(source), r = analyzeCorePreservation(source)
  assert.equal(r.totals.uncoveredFields, 4); assert.equal(r.totals.blockers, 3)
  assert.deepEqual(r.counts.users.categories, { security: 2, hr_links: 1, authorization: 1 })
  assert.equal(JSON.stringify(source), before)
  for (const privateValue of ['SECRET', 'PRIVATE-ID', 'twoFactorSecretEncrypted']) assert.ok(!JSON.stringify(r).includes(privateValue))
})
test('unknown field names and nested values never leak', () => {
  const source = { users: [{ 'PRIVATE-NAME@example.invalid': { secret: 'PRIVATE-SECRET' } }], departments: [{ privateCustom: 4 }] }
  const r = analyzeCorePreservation(source)
  assert.equal(r.totals.uncoveredFields, 2)
  assert.ok(!JSON.stringify(r).includes('PRIVATE')); assert.ok(!JSON.stringify(r).includes('privateCustom'))
})
test('null, false, empty arrays and history are not silently dropped', () => {
  const r = analyzeCorePreservation({ users: [{ email: null, demoInvitePending: false, permissions: [], updatedAt: '' }], departments: [] })
  assert.equal(r.totals.uncoveredFields, 4); assert.equal(r.totals.blockers, 4)
})
test('malformed and truncated inventories fail closed', () => {
  assert.equal(analyzeCorePreservation(null).totals.blockers, 2)
  assert.equal(analyzeCorePreservation({ users: [null], departments: [] }).totals.blockers, 1)
  const r = analyzeCorePreservation({ users: Array.from({ length: 150 }, () => ({ custom: true })), departments: [] })
  assert.equal(r.issues.length, 100); assert.equal(r.issuesTruncated, true); assert.equal(r.totals.blockers, 150)
})
