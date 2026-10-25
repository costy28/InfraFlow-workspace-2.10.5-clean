'use strict'
const test = require('node:test'), assert = require('node:assert/strict'), http = require('node:http')
const { createOperatorIdentity } = require('./support/demo-operator-identity')
const { createOperatorReportHarness } = require('./support/demo-operator-report-harness')
const { prepareJobReportPage } = require('../../scripts/lib/demo-sql-job-report-page')
const trialId = '11111111-1111-4111-8111-111111111111'
function setup(t) {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  t.after(() => { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old })
  let now = 100
  const clock = () => now
  const identity = createOperatorIdentity({ clock, verifyIdentity: async proof => proof === 'verified-test-proof' ? 'operator-1' : null })
  const account = { subject: 'operator-1', enabled: true, trialIds: [trialId] }
  identity.configure(account)
  return { identity, clock, account, time: value => { now = value } }
}
test('identitate: proof verificat, token aleator, TTL, revocare și modificare drepturi', async t => {
  const f = setup(t)
  await assert.rejects(f.identity.issue({ subject: 'operator-1', role: 'superadmin' }), /operator_identity_denied/)
  const a = await f.identity.issue('verified-test-proof', 10), b = await f.identity.issue('verified-test-proof', 10)
  assert.match(a.token, /^[a-f0-9]{64}$/); assert.notEqual(a.token, b.token)
  const s = f.identity.resolveSession(a.token); s.trialIds.length = 0
  assert.deepEqual(f.identity.resolveSession(a.token).trialIds, [trialId])
  f.identity.revoke(a.token); assert.equal(f.identity.resolveSession(a.token), null)
  f.identity.configure({ ...f.account, enabled: false }); assert.equal(f.identity.resolveSession(b.token), null)
  f.identity.configure(f.account); const c = await f.identity.issue('verified-test-proof', 10)
  f.time(110); assert.equal(f.identity.resolveSession(c.token), null)
  await assert.rejects(f.identity.issue('verified-test-proof', 900001), /invalid_session_ttl/)
})
test('identitate: reconfigurarea invalidează sesiunea, iar runtime normal este refuzat', async t => {
  const f = setup(t), a = await f.identity.issue('verified-test-proof')
  f.identity.configure({ ...f.account, trialIds: [] }); assert.equal(f.identity.resolveSession(a.token), null)
  process.env.NODE_ENV = 'production'
  assert.throws(() => f.identity.resolveSession(a.token), /synthetic_test_only/)
})
async function httpFixture(t, audit) {
  const f = setup(t), credential = await f.identity.issue('verified-test-proof')
  let calls = 0
  const handler = createOperatorReportHarness({ resolveSession: f.identity.resolveSession, clock: f.clock,
    audit: event => audit(event, f, credential), readPage: async request => {
      calls++
      return prepareJobReportPage({ trialId, currentRevision: 0, fingerprint: 'b'.repeat(64), totalJobs: 1, totalMatched: 1,
        jobs: [{ revision: 0, generation: 0, state: 'pending', claimedAt: null, leaseUntil: null,
          completedAt: null, receiptPresent: false, firstEffectGeneration: null }] }, request)
    } })
  const server = http.createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const get = async (token = credential.token) => {
    const url = `http://127.0.0.1:${server.address().port}/operator/jobs?request=${encodeURIComponent(JSON.stringify({ trialId, now: 3000 }))}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    return { status: res.status, body: await res.json() }
  }
  return { ...f, get, credential, calls: () => calls }
}
test('HTTP identitate: consultarea și refuzul sunt auditate fără token sau filtre brute', async t => {
  const events = [], f = await httpFixture(t, event => { events.push(event) })
  assert.equal((await f.get()).status, 200)
  assert.deepEqual(events[0], { subject: 'operator-1', trialId, operation: 'page', status: 200, at: 100 })
  f.identity.revoke(f.credential.token); assert.equal((await f.get()).status, 401)
  assert.equal(events[1].subject, null); assert.equal(f.calls(), 1)
  assert.ok(!JSON.stringify(events).includes(f.credential.token))
})
test('HTTP identitate: audit indisponibil nu permite divulgarea raportului', async t => {
  const f = await httpFixture(t, () => { throw Error('SECRET_SINK_PATH') })
  const result = await f.get(); assert.equal(result.status, 503)
  assert.deepEqual(result.body, { code: 'operator_audit_unavailable' })
})
test('HTTP identitate: revocarea în timpul salvării auditului blochează răspunsul', async t => {
  const events = [], f = await httpFixture(t, (event, f, credential) => {
    events.push(event); if (event.status === 200) f.identity.revoke(credential.token)
  })
  const result = await f.get(); assert.equal(result.status, 401)
  assert.ok(!result.body.jobs); assert.deepEqual(events.map(e => e.status), [200, 401])
})
