const test = require('node:test')
const assert = require('node:assert/strict')

const { buildHostedReadinessDiagnostic } = require('../modules/system/service')

function pilotDb(settings = {}) {
  return {
    settings: {
      networkAccessMode: 'internal-only',
      publicUrl: 'https://demo.infraflow.ro',
      smtp_host: 'smtp.example.test',
      smtp_user: 'pilot@example.test',
      smtp_password_encrypted: '0123456789abcdef:encrypted',
      ...settings,
    },
  }
}

function readyContext() {
  return {
    databaseMode: 'mssql',
    appKeyConfigured: true,
    backupInfo: { latest: { name: 'infraflow-backup-test.json', modifiedAt: new Date().toISOString() } },
    integrity: { manifestExists: true, valid: true, checkedFiles: 42 },
  }
}

test('Hosted Readiness confirmă pilotul doar pentru HTTPS, MSSQL, APP_KEY și backup', () => {
  const diagnostic = buildHostedReadinessDiagnostic(pilotDb(), readyContext())
  assert.equal(diagnostic.verdict.status, 'ok')
  assert.equal(diagnostic.publicUrl, 'https://demo.infraflow.ro')
  assert.equal(diagnostic.items.find((item) => item.title === 'Adresă publică HTTPS').status, 'ok')
  assert.equal(diagnostic.items.find((item) => item.title === 'Bază de date server').status, 'ok')
  assert.equal(diagnostic.items.find((item) => item.title === 'Cheie de protecție').status, 'ok')
})

test('Hosted Readiness blochează expunerea când lipsesc URL-ul HTTPS sau APP_KEY', () => {
  const diagnostic = buildHostedReadinessDiagnostic(pilotDb({ publicUrl: '', smtp_password_encrypted: '' }), {
    ...readyContext(),
    databaseMode: 'json',
    appKeyConfigured: false,
    backupInfo: { latest: null },
  })
  assert.equal(diagnostic.verdict.status, 'bad')
  assert.equal(diagnostic.items.find((item) => item.title === 'Adresă publică HTTPS').status, 'bad')
  assert.equal(diagnostic.items.find((item) => item.title === 'Bază de date server').status, 'bad')
  assert.equal(diagnostic.items.find((item) => item.title === 'Cheie de protecție').status, 'bad')
  assert.equal(diagnostic.items.find((item) => item.title === 'Backup recuperabil').status, 'bad')
})
