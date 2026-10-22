'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createSyntheticStageStore } = require('../../scripts/lib/synthetic-stage-store')
test('staging store requires explicit opt-in and isolated database name before any executor call', () => {
  let calls = 0; const sql = () => { calls++; return '' }
  for (const options of [{}, { database: 'INFRAFLOW_DEMO', allowSyntheticStaging: true }, { database: 'INFRAFLOW_TEST_DOCS_AABBCCDDEEFF' }]) {
    assert.throws(() => createSyntheticStageStore({ ...options, sql }))
  }
  assert.equal(calls, 0)
})
test('every executed query verifies actual DB_NAME; invalid run IDs never execute', () => {
  const queries = []
  const store = createSyntheticStageStore({ database: 'INFRAFLOW_TEST_DOCS_AABBCCDDEEFF', allowSyntheticStaging: true,
    sql: query => { queries.push(query); return 'initialized' } })
  store.initialize()
  assert.ok(queries[0].startsWith("IF DB_NAME()<>N'INFRAFLOW_TEST_DOCS_AABBCCDDEEFF'"))
  assert.throws(() => store.revert('not-a-uuid')); assert.equal(queries.length, 1)
  assert.throws(() => store.materialize('not-a-uuid')); assert.throws(() => store.reconcileMaterialized('not-a-uuid'))
  assert.equal(queries.length, 1)
})
test('materialization refuses a corrupted artifact hash before issuing write queries', () => {
  const queries = []
  const store = createSyntheticStageStore({ database: 'INFRAFLOW_TEST_DOCS_AABBCCDDEEFF', allowSyntheticStaging: true,
    sql: query => { queries.push(query); return JSON.stringify({ hash: '0'.repeat(64), payload: '{}' }) } })
  assert.throws(() => store.materialize('aaaaaaaa-0000-0000-0000-000000000001'))
  assert.equal(queries.length, 1); assert.ok(!queries[0].includes('INSERT'))
})
