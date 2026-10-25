'use strict'
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { spawnSync } = require('node:child_process')
const { openOperatorAuditJournal } = require('./support/demo-operator-audit-journal')
const event = { subject: 'operator-1', trialId: null, operation: 'page', status: 200, at: 100 }
function setup(t) {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  t.after(() => { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old })
  return fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'infraflow-operator-audit-'))
}
test('audit persistent: confirmare fsync și recitire într-un proces nou, fără pierdere de ordine', t => {
  const dir = setup(t), journal = openOperatorAuditJournal(dir)
  journal.append(event); journal.close()
  const modulePath = require.resolve('./support/demo-operator-audit-journal')
  const child = spawnSync(process.execPath, ['-e', `const {openOperatorAuditJournal}=require(process.argv[1]); const j=openOperatorAuditJournal(process.argv[2]); j.append(${JSON.stringify({ ...event, status: 401 })}); console.log(JSON.stringify(j.read())); j.close()` , modulePath, dir], { encoding: 'utf8', timeout: 10000 })
  assert.equal(child.status, 0, child.stderr)
  const rows = JSON.parse(child.stdout); assert.deepEqual(rows.map(r => r.sequence), [1,2]); assert.equal(rows[1].event.status, 401)
  const reopened = openOperatorAuditJournal(dir); assert.deepEqual(reopened.read(), rows); reopened.close()
})
test('audit: un singur writer și refuz după închidere', t => {
  const dir = setup(t), j = openOperatorAuditJournal(dir)
  assert.throws(() => openOperatorAuditJournal(dir), { code: 'EEXIST' })
  j.append(event); j.close(); assert.throws(() => j.append(event), /operator_audit_unavailable/)
})
test('audit: final trunchiat sau secvență coruptă nu sunt reparate ori ignorate', t => {
  for (const raw of ['{"sequence":1', JSON.stringify({ sequence: 2, event }) + '\n']) {
    const dir = setup(t), j = openOperatorAuditJournal(dir); j.close()
    fs.writeFileSync(path.join(dir, 'consultations.jsonl'), raw)
    assert.throws(() => openOperatorAuditJournal(dir))
    assert.equal(fs.readFileSync(path.join(dir, 'consultations.jsonl'), 'utf8'), raw)
  }
})
test('audit: secrete/câmpuri suplimentare și directoare arbitrare refuzate', t => {
  const dir = setup(t), j = openOperatorAuditJournal(dir)
  assert.throws(() => j.append({ ...event, token: 'SECRET' }), /invalid_operator_audit_event/)
  assert.equal(j.read().length, 0); j.close()
  assert.throws(() => openOperatorAuditJournal(os.tmpdir()), /invalid_operator_audit_directory/)
  process.env.NODE_ENV = 'production'; assert.throws(() => openOperatorAuditJournal(dir), /synthetic_test_only/)
})
test('audit: sink închis refuză scrierea și păstrează jurnalul', t => {
  const dir = setup(t), j = openOperatorAuditJournal(dir)
  j.append(event)
  j.close(); assert.throws(() => j.append(event), /operator_audit_unavailable/)
  const again = openOperatorAuditJournal(dir); assert.equal(again.read().length, 1); again.close()
})
test('audit: eroare fsync injectată lasă rezultat incert și writer blocat', t => {
  const dir = setup(t), j = openOperatorAuditJournal(dir), original = fs.fsyncSync
  try {
    fs.fsyncSync = () => { throw Error('injected_sync_failure') }
    assert.throws(() => j.append(event), /injected_sync_failure/)
  } finally { fs.fsyncSync = original }
  assert.throws(() => j.append(event), /operator_audit_unavailable/)
  j.close()
  // Bytes may already exist even though no durable acknowledgement was returned.
  const reopened = openOperatorAuditJournal(dir); assert.equal(reopened.read().length, 1); reopened.close()
})
test('HTTP: jurnalul persistent precede divulgarea; sink închis produce 503 fără raport', async t => {
  const http = require('node:http')
  const { createOperatorReportHarness } = require('./support/demo-operator-report-harness')
  const { createOperatorIdentity } = require('./support/demo-operator-identity')
  const { prepareJobReportPage } = require('../../scripts/lib/demo-sql-job-report-page')
  const dir = setup(t), journal = openOperatorAuditJournal(dir)
  t.after(() => journal.close())
  const trialId = '11111111-1111-4111-8111-111111111111'
  const clock = () => 100
  const identity = createOperatorIdentity({ clock, verifyIdentity: async proof => proof === 'trusted-test' ? 'operator-1' : null })
  identity.configure({ subject: 'operator-1', enabled: true, trialIds: [trialId] })
  const { token } = await identity.issue('trusted-test')
  const server = http.createServer(createOperatorReportHarness({ clock, resolveSession: identity.resolveSession, audit: journal.append,
    readPage: async input => prepareJobReportPage({ trialId, currentRevision: 0, fingerprint: 'a'.repeat(64), totalJobs: 0, totalMatched: 0, jobs: [] }, input) }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const get = () => fetch(`http://127.0.0.1:${server.address().port}/operator/jobs?request=${encodeURIComponent(JSON.stringify({ trialId, now: 100 }))}`,
    { headers: { Authorization: `Bearer ${token}` } })
  assert.equal((await get()).status, 200)
  assert.equal(journal.read()[0].event.subject, 'operator-1')
  journal.close()
  const failed = await get(); assert.equal(failed.status, 503)
  assert.deepEqual(await failed.json(), { code: 'operator_audit_unavailable' })
  const reopened = openOperatorAuditJournal(dir); assert.equal(reopened.read().length, 1); reopened.close()
})
