'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { createDocumentsSqlFixture } = require('./support/documents-sql-fixture')
const { integratedFixture } = require('./support/core-integrated-fixture')
const { createIntegratedStage } = require('../../scripts/lib/core-integrated-stage-prototype')
const { createSyntheticStageStore } = require('../../scripts/lib/synthetic-stage-store')
test('materializare sintetică: rânduri, retry, corupere refuzată, eșec atomic și retragere', {
  skip: process.env.INFRAFLOW_TEST_RELATIONAL_SQL !== '1', timeout: 180000
}, () => {
  const f = createDocumentsSqlFixture({ empty: true }), data = integratedFixture()
  const store = createSyntheticStageStore({ database: f.database, sql: f.sql, allowSyntheticStaging: true })
  const id = randomUUID(), retry = randomUUID(), stage = createIntegratedStage(data.source, data.target, data.manifest, data.key)
  try {
    store.initialize(); store.apply(id, stage, data.target, data.manifest, data.key)
    assert.equal(store.materialize(id, data.target, data.manifest, data.key).outcome, 'applied')
    assert.equal(store.materialize(id, data.target, data.manifest, data.key).outcome, 'reused')
    const report = store.reconcileMaterialized(id, data.target, data.manifest, data.key)
    assert.equal(report.usersCompared, 1); assert.equal(report.writeAuthorized, false)
    const counts = JSON.parse(f.sql(`SELECT (SELECT COUNT(*) FROM dbo.synthetic_stage_users WHERE run_id='${id}') users,
      (SELECT COUNT(*) FROM dbo.synthetic_stage_roles WHERE run_id='${id}') roles,
      (SELECT COUNT(*) FROM dbo.synthetic_stage_policies WHERE run_id='${id}') policies FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`))
    assert.deepEqual(counts, { users: 1, roles: 1, policies: 5 })
    f.sql(`UPDATE dbo.synthetic_stage_users SET primary_role=N'operator' WHERE run_id='${id}'; SELECT 1;`)
    assert.throws(() => store.reconcileMaterialized(id, data.target, data.manifest, data.key))
    assert.throws(() => store.materialize(id, data.target, data.manifest, data.key))
    f.sql(`UPDATE dbo.synthetic_stage_users SET primary_role=N'reader' WHERE run_id='${id}'; SELECT 1;`)
    assert.equal(store.reconcileMaterialized(id, data.target, data.manifest, data.key).decisionsCompared, report.decisionsCompared)
    store.apply(retry, stage, data.target, data.manifest, data.key)
    assert.throws(() => store.materialize(retry, data.target, data.manifest, data.key, { injectFailure: true }))
    assert.equal(f.sql(`SELECT (SELECT COUNT(*) FROM dbo.synthetic_stage_users WHERE run_id='${retry}')+
      (SELECT COUNT(*) FROM dbo.synthetic_stage_roles WHERE run_id='${retry}')+
      (SELECT COUNT(*) FROM dbo.synthetic_stage_policies WHERE run_id='${retry}')+
      (SELECT COUNT(*) FROM dbo.synthetic_materialization_runs WHERE run_id='${retry}');`).trim(), '0')
    assert.equal(store.materialize(retry, data.target, data.manifest, data.key).outcome, 'applied')
    assert.equal(store.reconcileMaterialized(retry, data.target, data.manifest, data.key).usersCompared, 1)
    store.revert(id)
    assert.throws(() => store.materialize(id, data.target, data.manifest, data.key))
    assert.throws(() => store.reconcileMaterialized(id, data.target, data.manifest, data.key))
    assert.equal(f.sql(`SELECT COUNT(*) FROM dbo.synthetic_stage_users WHERE run_id='${id}';`).trim(), '1')
    const journal = JSON.parse(f.sql('SELECT event,error_number FROM dbo.synthetic_materialization_journal ORDER BY id FOR JSON PATH;'))
    assert.deepEqual(journal.map(e => e.event), ['applied', 'reused', 'failed', 'failed', 'applied'])
    assert.ok(journal.some(e => e.error_number === 51008)); assert.ok(journal.some(e => e.error_number === 51007))
    assert.ok(!JSON.stringify(journal).includes('SYNTHETIC-SECRET'))
    console.log(`Materializare SQL OK: ${f.database}; 1 utilizator/1 rol/5 politici per lot, retry fără dubluri, corupere refuzată și rollback atomic.`)
  } finally { data.key.fill(0) }
})
