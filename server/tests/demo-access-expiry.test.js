const test = require('node:test')
const assert = require('node:assert/strict')
const { demoAccessExpiryStatus } = require('../core/auth')

test('contul fără termen Demo nu expiră', () => {
  assert.deepEqual(demoAccessExpiryStatus({}, Date.UTC(2026, 9, 3)), { expired: false, expiresAt: '' })
})

test('contul Demo expirat este blocat, iar cel cu termen viitor rămâne activ', () => {
  const now = Date.UTC(2026, 9, 3, 12, 0, 0)
  assert.equal(demoAccessExpiryStatus({ demoAccessExpiresAt: '2026-10-03T11:59:59.999Z' }, now).expired, true)
  assert.equal(demoAccessExpiryStatus({ demoAccessExpiresAt: '2026-10-03T12:00:00.001Z' }, now).expired, false)
})
