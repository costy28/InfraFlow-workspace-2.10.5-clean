'use strict'
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { spawnSync } = require('node:child_process')
const { openOperatorAuditJournal, inspectRecovery, recoverOperatorAuditJournal } = require('./support/demo-operator-audit-journal')
const event = { subject: 'operator-1', trialId: null, operation: 'page', status: 200, at: 100 }
function setup(t) {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  t.after(() => { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old })
  return fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'infraflow-operator-audit-'))
}
function abandon(dir) {
  const modulePath = require.resolve('./support/demo-operator-audit-journal')
  const result = spawnSync(process.execPath, ['-e', `const j=require(process.argv[1]).openOperatorAuditJournal(process.argv[2]); j.append(${JSON.stringify(event)}); process.exit(17)`, modulePath, dir],
    { encoding: 'utf8', timeout: 10000 })
  assert.equal(result.status, 17, result.stderr)
}
test('recuperare: oprire fără close, confirmare explicită și continuare fără pierderi', t => {
  const dir = setup(t); abandon(dir)
  assert.throws(() => openOperatorAuditJournal(dir), { code: 'EEXIST' })
  const expected = inspectRecovery(dir); assert.equal(expected.entries, 1)
  const result = recoverOperatorAuditJournal(dir, expected)
  assert.equal(result.recovered, true); assert.ok(fs.existsSync(path.join(dir, result.evidence)))
  const j = openOperatorAuditJournal(dir); j.append({ ...event, at: 200 })
  assert.deepEqual(j.read().map(r => r.sequence), [1,2]); j.close()
})
test('recuperare: procesul activ nu este deposedat de lock', t => {
  const dir = setup(t), j = openOperatorAuditJournal(dir)
  try {
    assert.throws(() => inspectRecovery(dir), /operator_audit_owner_alive/)
    assert.throws(() => recoverOperatorAuditJournal(dir, { pid: process.pid, nonce: 'fake', fingerprint: 'fake', entries: 0 }), /operator_audit_owner_alive/)
    j.append(event); assert.equal(j.read().length, 1)
  } finally { j.close() }
})
test('recuperare: confirmarea veche este refuzată după schimbarea datelor', t => {
  const dir = setup(t); abandon(dir); const expected = inspectRecovery(dir)
  const file = path.join(dir, 'consultations.jsonl')
  fs.appendFileSync(file, JSON.stringify({ sequence: 2, event }) + '\n')
  assert.throws(() => recoverOperatorAuditJournal(dir, expected), /operator_audit_recovery_changed/)
  assert.ok(fs.existsSync(path.join(dir, 'writer.lock')))
})
test('recuperare: jurnal incomplet și lock fără metadate rămân pentru diagnostic', t => {
  const dir = setup(t); abandon(dir)
  const file = path.join(dir, 'consultations.jsonl'); fs.appendFileSync(file, '{')
  assert.throws(() => inspectRecovery(dir), /operator_audit_truncated/)
  assert.ok(fs.readFileSync(file, 'utf8').endsWith('{'))
  fs.writeFileSync(path.join(dir, 'writer.lock'), '')
  assert.throws(() => inspectRecovery(dir)); assert.ok(fs.existsSync(path.join(dir, 'writer.lock')))
})
test('recuperare: gate ocupat și runtime normal sunt refuzate', t => {
  const dir = setup(t); abandon(dir)
  fs.writeFileSync(path.join(dir, 'recovery.gate'), 'reserved')
  assert.throws(() => inspectRecovery(dir), { code: 'EEXIST' })
  assert.throws(() => openOperatorAuditJournal(dir), { code: 'EEXIST' })
  process.env.NODE_ENV = 'production'
  assert.throws(() => inspectRecovery(dir), /synthetic_test_only/)
})
