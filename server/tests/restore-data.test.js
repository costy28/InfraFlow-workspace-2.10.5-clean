const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { validateRestoreData } = require('../modules/system/restore-data')
function snapshot() {
  const db = { settings: { country: 'DE', currency: 'EUR', customSetting: false }, version: 1 }
  for (const k of ['users', 'materials', 'recipes', 'consumptions', 'deliveries', 'stockMovements',
    'productionPlans', 'audit', 'departmentRequests', 'departmentStocks', 'departmentConsumptions']) db[k] = []
  return db
}
test('restaurarea păstrează toate domeniile și setările fără normalizare sau aliasuri partajate', () => {
  const db = snapshot()
  for (const k of ['crm', 'documents', 'messaging', 'hr', 'accounting', 'logistics', 'help', 'futureDomain']) db[k] = { items: [{ id: 7, active: false }] }
  db.departments = [{ id: 'd1' }]
  db.users = [{ id: 'u1', passwordHash: 'synthetic-hash', twoFactorSecretEncrypted: 'synthetic-encrypted', twoFactorRecoveryCodeHashes: ['synthetic-hash'] }]
  db.settings.smtp_password_encrypted = 'synthetic-ciphertext'
  const copy = validateRestoreData(db)
  for (const k of Object.keys(db)) assert.deepEqual(copy[k], db[k])
  copy.crm.items[0].id = 8
  assert.equal(db.crm.items[0].id, 7)
  assert.deepEqual(copy.jobs, [])
})
test('backupurile invalide sunt respinse înainte de orice persistare', () => {
  for (const value of [null, [], {}, { ...snapshot(), settings: [] }, { ...snapshot(), users: {} },
    { ...snapshot(), fleetAssets: {} }, { ...snapshot(), version: 'invalid' }]) {
    assert.throws(() => validateRestoreData(value), e => e.status === 400)
  }
  const polluted = JSON.parse(JSON.stringify(snapshot()).replace('"settings":{', '"settings":{"__proto__":{},'))
  assert.throws(() => validateRestoreData(polluted), e => e.status === 400)
  const cycle = snapshot(); cycle.extra = cycle
  assert.throws(() => validateRestoreData(cycle), e => e.status === 400)
})
test('seed-ul livrat trece prin validatorul folosit de rutele de restaurare', () => {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/app-db.seed.json'), 'utf8'))
  const restored = validateRestoreData(seed)
  for (const k of Object.keys(seed)) assert.deepEqual(restored[k], seed[k])
})
