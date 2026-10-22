'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')

test('restaurarea JSON persistă prin core/db și rămâne citibilă într-un proces nou', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'infraflow-restore-persistence-'))
  const database = path.join(dir, 'synthetic.json')
  const key = crypto.randomBytes(32).toString('hex')
  const env = { ...process.env, NODE_ENV: 'test', APP_KEY: key, INFRAFLOW_DB_PROVIDER: 'json', DB_MODE: 'json',
    INFRAFLOW_DB_FILE: database, INFRAFLOW_SEED_FILE: path.join(dir, 'unused-seed.json') }
  const root = path.resolve(__dirname, '../..')
  const base = `
    const assert = require('node:assert/strict');
    const db = require('./server/core/db');
    const crypt = require('./server/core/settings-crypto');
    assert.equal(db.DB_MODE, 'json');
    assert.equal(db.DB_FILE, process.env.INFRAFLOW_DB_FILE);
  `
  const execute = code => execFileSync(process.execPath, ['-e', base + code], {
    cwd: root, env, windowsHide: true, timeout: 30000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })
  try {
    execute(`
      const { validateRestoreData } = require('./server/modules/system/restore-data');
      const state = { settings: { country: 'RO', companyName: 'Synthetic Restore',
        smtp_password_encrypted: crypt.encryptSettingSecret('synthetic-secret') },
        crm: { offers: [{ id: 'restore-probe' }] }, documents: { documents: [{ id: 'restore-doc' }] },
        messaging: { channels: [{ id: 'restore-channel' }] },
        futureDomain: { enabled: false, value: 0 }, departments: [{ id: 'restore-dept', name: 'Synthetic' }] };
      for (const k of ['users','materials','recipes','consumptions','deliveries','stockMovements','productionPlans','audit','departmentRequests','departmentStocks','departmentConsumptions']) state[k] = [];
      db.writeDb(validateRestoreData(state));
    `)
    execute(`
      const state = db.readDb({ fresh: true });
      assert.equal(state.crm.offers[0].id, 'restore-probe');
      assert.equal(state.documents.documents[0].id, 'restore-doc');
      assert.equal(state.messaging.channels.some(c => c.id === 'restore-channel'), true);
      assert.equal(state.departments.some(d => d.id === 'restore-dept'), true);
      assert.deepEqual(state.futureDomain, { enabled: false, value: 0 });
      assert.equal(crypt.decryptSettingSecret(state.settings.smtp_password_encrypted) === 'synthetic-secret', true);
      console.log('persisted-restore-ok');
    `)
    assert.equal(fs.existsSync(database), true)
  } finally {
    const resolved = path.resolve(dir)
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()))
    assert.ok(path.basename(resolved).startsWith('infraflow-restore-persistence-'))
    fs.rmSync(resolved, { recursive: true, force: true })
  }
})
