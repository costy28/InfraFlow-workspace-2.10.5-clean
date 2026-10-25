'use strict'
const test = require('node:test'), assert = require('node:assert/strict'), http = require('node:http')
const { createOperatorReportHarness } = require('./support/demo-operator-report-harness')
const { prepareJobReportPage } = require('../../scripts/lib/demo-sql-job-report-page')
const trialId = '11111111-1111-4111-8111-111111111111', token = 'a'.repeat(64)
const request = { trialId, now: 3000, pageSize: 1 }
async function fixture(t, override = {}) {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  t.after(() => { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old })
  let now = 100, calls = 0
  const session = { subject: 'test-operator', realm: 'demo_platform_operator', permission: 'trial_jobs_read', trialIds: [trialId], expiresAt: 200 }
  const sessions = new Map([[token, session]])
  const readPage = async input => {
    calls++
    if (override.readPage) return override.readPage(input)
    if (override.read) await override.read({ session, calls })
    const start = input.cursor ? input.cursor.afterRevision + 1 : 0
    const page = prepareJobReportPage({ trialId, currentRevision: 1, fingerprint: 'b'.repeat(64), totalJobs: 2, totalMatched: 2,
      jobs: [0, 1].filter(r => r >= start).map(revision => ({ revision, generation: 0, state: 'pending', claimedAt: null,
        leaseUntil: null, completedAt: null, receiptPresent: false, firstEffectGeneration: null })) }, input)
    page.secret = 'SECRET_METADATA'; page.jobs[0].workerId = 'SECRET_WORKER'
    return page
  }
  const server = http.createServer(createOperatorReportHarness({ sessions, readPage, clock: () => now }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  async function get(path = '/operator/jobs', value = request, auth = token, method = 'GET') {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}?request=${encodeURIComponent(JSON.stringify(value))}`,
      { method, headers: auth ? { Authorization: `Bearer ${auth}` } : {} })
    return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') }
  }
  return { get, session, sessions, calls: () => calls, time: n => { now = n } }
}
test('HTTP operator: sesiune opacă obligatorie; rolurile ERP nu acordă autoritate', async t => {
  const f = await fixture(t)
  for (const auth of [null, 'unknown', 'c'.repeat(64)]) assert.equal((await f.get(undefined, undefined, auth)).status, 401)
  for (const realm of ['demo_company_admin', 'superadmin', 'erp']) {
    f.session.realm = realm; assert.equal((await f.get()).status, 403)
  }
  assert.equal(f.calls(), 0)
})
test('HTTP operator: scope trial, permisiune, revocare și expirare exactă', async t => {
  const f = await fixture(t)
  assert.equal((await f.get(undefined, { ...request, trialId: '22222222-2222-4222-8222-222222222222' })).status, 403)
  f.session.permission = 'admin'; assert.equal((await f.get()).status, 403)
  f.session.permission = 'trial_jobs_read'; f.session.revoked = true; assert.equal((await f.get()).status, 401)
  f.session.revoked = false; f.time(200); assert.equal((await f.get()).status, 401)
  assert.equal(f.calls(), 0)
})
test('HTTP operator: pagină și export coerent; numai GET, fără secrete în răspuns', async t => {
  const f = await fixture(t)
  const page = await f.get(); assert.equal(page.status, 200); assert.equal(page.cache, 'no-store')
  assert.equal(page.body.jobs.length, 1)
  assert.doesNotMatch(JSON.stringify(page.body), /SECRET_/)
  const report = await f.get('/operator/jobs/export'); assert.equal(report.status, 200)
  assert.equal(report.body.complete, true); assert.equal(report.body.pages.length, 2)
  assert.ok(!JSON.stringify(report).includes(token)); assert.ok(!JSON.stringify(report).includes('test-operator'))
  const before = f.calls()
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await f.get(undefined, undefined, token, method)).status, 405)
  assert.equal((await f.get('/operator/claim')).status, 404); assert.equal(f.calls(), before)
})
test('HTTP operator: revocare în citire nu divulgă pagina sau exportul parțial', async t => {
  const f = await fixture(t, { read: ({ session, calls }) => { if (calls === 2) session.revoked = true } })
  const result = await f.get('/operator/jobs/export')
  assert.equal(result.status, 401); assert.deepEqual(result.body, { code: 'operator_access_denied' })
  assert.equal(f.calls(), 2)
})
test('HTTP operator: parametri de autoritate injectați și erori interne sunt închise', async t => {
  const f = await fixture(t, { read: () => { throw Error('SECRET_INTERNAL_PATH') } })
  assert.equal((await f.get(undefined, { ...request, role: 'superadmin' })).status, 400)
  const result = await f.get(); assert.equal(result.status, 500)
  assert.deepEqual(result.body, { code: 'operator_report_failed' })
})
test('harness operator refuzat în afara testelor', () => {
  assert.throws(() => createOperatorReportHarness({}), /synthetic_test_only/)
})
test('HTTP operator: expirare în timpul citirii și scope retras înainte de răspuns', async t => {
  const f = await fixture(t, { read: ({ session }) => { session.expiresAt = 100 } })
  assert.equal((await f.get()).status, 401)
  f.session.expiresAt = 200; f.session.trialIds = []
  assert.equal((await f.get()).status, 403)
  assert.equal(f.calls(), 1)
})
test('HTTP operator: conflict de snapshot are 409 fără detalii interne', async t => {
  const f = await fixture(t, { read: () => { throw Object.assign(Error('SQL_SECRET'), { code: 'job_report_changed' }) } })
  const result = await f.get(); assert.equal(result.status, 409)
  assert.deepEqual(result.body, { code: 'report_changed' })
})
test('SQL real prin HTTP autentificat: raport read-only și acces refuzat înainte de citire', {
  skip: process.env.INFRAFLOW_TEST_TRIAL_SQL !== '1', timeout: 120000,
}, async t => {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  t.after(() => { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old })
  const { createTrialSqlFixture } = require('./support/demo-trial-sql-fixture')
  const { createSqlTestTrialStore } = require('../core/demo-trial-sql-test-store')
  const sql = await createTrialSqlFixture(), store = createSqlTestTrialStore(sql)
  await store.initialize(); await store.queue({ id: trialId, approvalId: 'operator-report-test', now: 1000 })
  const before = await store.read()
  const f = await fixture(t, { readPage: input => store.readJobReportPage(input) })
  assert.equal((await f.get(undefined, undefined, null)).status, 401); assert.equal(f.calls(), 0)
  const result = await f.get('/operator/jobs/export')
  assert.equal(result.status, 200); assert.equal(result.body.complete, true)
  assert.equal(result.body.totalJobs, 1); assert.equal(result.body.executionAllowed, false)
  assert.deepEqual(await store.read(), before)
  console.log('Operator report SQL test database:', sql.database)
})
