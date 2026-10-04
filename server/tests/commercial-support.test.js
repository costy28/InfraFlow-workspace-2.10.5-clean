const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const test = require('node:test')
const { supportPolicyForLicense, supportPolicyForPackage } = require('../shared/commercialSupport')

test('pachetele comerciale expun reguli de suport fără SLA implicit', () => {
  assert.equal(supportPolicyForLicense({ pachet: 'Start' }).channel, 'Email sau tichet')
  assert.equal(supportPolicyForLicense({ pachet: 'Business' }).priority, 'Prioritate peste Start')
  assert.equal(supportPolicyForLicense({ pachet: 'Operations' }).channel, 'Canal dedicat de suport')
  assert.match(supportPolicyForLicense({ pachet: 'Enterprise' }).summary, /contract/i)
  assert.equal(supportPolicyForPackage('business').key, 'business')
  assert.equal(supportPolicyForLicense({ pachet: 'necunoscut' }).key, 'start')
})

test('migrarea păstrează pachetul de suport în tichet', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../../db/migrations/076_ticket_support_package.sql'), 'utf8')
  assert.match(migration, /support_package/i)
  assert.match(migration, /ALTER TABLE tickets\.tickets/i)
})
