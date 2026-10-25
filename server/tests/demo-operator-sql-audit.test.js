'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http')
const { createTrialSqlFixture } = require('./support/demo-trial-sql-fixture')
const { createSqlTestTrialStore } = require('../core/demo-trial-sql-test-store')
const { createOperatorIdentity } = require('./support/demo-operator-identity')
const { createOperatorReportHarness } = require('./support/demo-operator-report-harness')
const { openOperatorAuditJournal } = require('./support/demo-operator-audit-journal')
const trialId = '11111111-1111-4111-8111-111111111111'

test('SQL + identitate + HTTP + audit persistent: export complet și refuz fără divulgare', {
  skip: process.env.INFRAFLOW_TEST_TRIAL_SQL !== '1', timeout: 180000,
}, async t => {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  t.after(() => { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old })
  const fixture = await createTrialSqlFixture(), store = createSqlTestTrialStore(fixture)
  await store.initialize(); await store.queue({ id: trialId, approvalId: 'integrated-audit', now: 1000 })
  for (const [commandId, action, expectedRevision] of [['start', 'provision', 0], ['ready', 'ready', 1]])
    await store.command({ trialId, commandId, action, expectedRevision, now: 1001, actor: { id: 'test-controller', kind: 'worker' } })
  const before = await store.read(), dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'infraflow-operator-audit-'))
  let journal = openOperatorAuditJournal(dir), reads = 0, revokeDuringRead = false
  t.after(() => journal.close())
  const clock = () => 100
  const identity = createOperatorIdentity({ clock, verifyIdentity: async proof => proof === 'test-proof' ? 'operator-1' : null })
  identity.configure({ subject: 'operator-1', enabled: true, trialIds: [trialId] })
  let credential = await identity.issue('test-proof')
  const server = http.createServer(createOperatorReportHarness({ clock, resolveSession: identity.resolveSession,
    audit: event => journal.append(event), readPage: async input => {
      reads++; const page = await store.readJobReportPage(input)
      if (revokeDuringRead) identity.revoke(credential.token)
      return page
    } }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const get = async (token = credential.token, request = { trialId, now: 3000, pageSize: 1 }) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/operator/jobs/export?request=${encodeURIComponent(JSON.stringify(request))}`,
      { headers: { Authorization: `Bearer ${token}` } })
    return { status: response.status, body: await response.json() }
  }
  await t.test('identitate necunoscută și trial nepermis: fără citire SQL', async () => {
    assert.equal((await get('c'.repeat(64))).status, 401)
    assert.equal((await get(undefined, { trialId: '22222222-2222-4222-8222-222222222222', now: 3000 })).status, 403)
    assert.equal(reads, 0); assert.deepEqual(journal.read().map(r => r.event.status), [401,403])
  })
  await t.test('trei pagini SQL cu identitate și audit real pe disc', async () => {
    const response = await get()
    assert.equal(response.status, 200); assert.equal(response.body.complete, true)
    assert.deepEqual(response.body.pages.flatMap(p => p.jobs.map(j => j.revision)), [0,1,2])
    assert.equal(reads, 3); assert.equal(response.body.executionAllowed, false)
    assert.equal(journal.read().at(-1).event.subject, 'operator-1')
    assert.ok(!JSON.stringify(response).includes(credential.token))
  })
  await t.test('jurnal indisponibil: SQL citit dar niciun raport nu este divulgat', async () => {
    journal.close()
    const response = await get(); assert.equal(response.status, 503)
    assert.deepEqual(response.body, { code: 'operator_audit_unavailable' })
    journal = openOperatorAuditJournal(dir); assert.equal(journal.read().length, 3)
  })
  await t.test('revocare după citire SQL: export parțial refuzat și refuz jurnalizat', async () => {
    revokeDuringRead = true
    const start = reads, response = await get()
    assert.equal(response.status, 401); assert.deepEqual(response.body, { code: 'operator_access_denied' })
    assert.equal(reads, start + 1); assert.equal(journal.read().at(-1).event.status, 401)
    revokeDuringRead = false; credential = await identity.issue('test-proof')
  })
  await t.test('recitire persistentă și registru SQL neschimbat', async () => {
    const rows = journal.read(); journal.close(); journal = openOperatorAuditJournal(dir)
    assert.deepEqual(journal.read(), rows); assert.equal(rows.length, 4)
    assert.ok(!fs.readFileSync(path.join(dir, 'consultations.jsonl'), 'utf8').includes(credential.token))
    assert.deepEqual(await store.read(), before)
  })
  console.log('Integrated operator SQL database:', fixture.database)
  console.log('Integrated operator audit directory:', dir)
})
