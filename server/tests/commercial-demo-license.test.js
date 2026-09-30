const test = require('node:test')
const assert = require('node:assert/strict')
const { isIsolatedCommercialDemo, commercialDemoLicense } = require('../shared/commercialDemo')

test('licența demo completă este disponibilă numai pe baza demo izolată', () => {
  const db = { settings: { demo_profile: 'commercial-mssql', companyName: 'Construct Demo SRL', license: { source: 'demo-seed' } } }
  const previousDatabase = process.env.DB_DATABASE
  try {
    process.env.DB_DATABASE = 'INFRAFLOW_DEMO'
    assert.equal(isIsolatedCommercialDemo(db), true)
    assert.deepEqual(commercialDemoLicense(db, { module: ['inventory'] }).module, ['all'])
    process.env.DB_DATABASE = 'INFRAFLOW_PRODUCTIE'
    assert.equal(isIsolatedCommercialDemo(db), false)
    assert.deepEqual(commercialDemoLicense(db, { module: ['inventory'] }).module, ['inventory'])
  } finally {
    if (previousDatabase === undefined) delete process.env.DB_DATABASE
    else process.env.DB_DATABASE = previousDatabase
  }
})
