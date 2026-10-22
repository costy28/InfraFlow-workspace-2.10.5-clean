'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const source = fs.readFileSync(path.resolve(__dirname, '../core/auth.js'), 'utf8')
const start = source.indexOf('function sessionExpiryStatus('), end = source.indexOf('function tokenFrom(', start)
assert.ok(start >= 0 && end > start)
const now = Date.UTC(2026, 9, 22, 12)
class TestDate extends Date { static now() { return now } }
const expiry = vm.runInNewContext(`${source.slice(start, end)}; sessionExpiryStatus`, { Date: TestDate })
test('idle expiry: before/equal boundary allowed, immediately after refused', () => {
  const settings = { session_idle_timeout_min: 15, session_absolute_timeout_hours: 1 }
  for (const [elapsed, expected] of [[899999, false], [900000, false], [900001, true]]) {
    const r = expiry({ loginAt: now - elapsed, lastSeenAt: now - elapsed }, settings)
    assert.equal(r.expired, expected); if (expected) assert.equal(r.reason, 'idle')
  }
})
test('absolute expiry overrides recent activity and takes precedence over idle expiry', () => {
  const settings = { session_idle_timeout_min: 15, session_absolute_timeout_hours: 1 }
  assert.equal(expiry({ loginAt: now - 3600000, lastSeenAt: now }, settings).expired, false)
  assert.equal(expiry({ loginAt: now - 3600001, lastSeenAt: now }, settings).reason, 'absolute')
  assert.equal(expiry({ loginAt: now - 3600001, lastSeenAt: now - 900001 }, settings).reason, 'absolute')
})
test('configured aliases and minimum limits cannot disable session expiry with zero', () => {
  const old = { loginAt: now - 3600001, lastSeenAt: now }
  assert.equal(expiry(old, { sessionAbsoluteTimeoutHours: 1 }).reason, 'absolute')
  assert.equal(expiry(old, { session_absolute_timeout_hours: 0 }).reason, 'absolute')
  assert.equal(expiry({ loginAt: now - 900001 }, { session_idle_timeout_min: 0 }).reason, 'idle')
})
test('default idle/absolute policies and ISO timestamps retain existing behavior', () => {
  assert.equal(expiry({ loginAt: now - 8 * 3600000 - 1 }).reason, 'idle')
  assert.equal(expiry({ createdAt: new Date(now - 25 * 3600000).toISOString(), lastSeenAt: new Date(now).toISOString() }).reason, 'absolute')
  assert.equal(expiry({ loginAt: now - 3600000, lastSeenAt: now }).expired, false)
})
