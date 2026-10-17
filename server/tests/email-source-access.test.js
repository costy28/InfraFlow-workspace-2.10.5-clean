const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const source = fs.readFileSync(path.join(__dirname, '../modules/messaging/routes.js'), 'utf8')
const start = source.indexOf('function publicEmailSource(')
const snippet = source.slice(start, source.indexOf('function emailsLinkedToTarget(', start))
function fixture(fail = false) {
  let reads = 0
  const resolve = vm.runInNewContext(`${snippet}; publicEmailSource`, {
    EMAIL_LINK_TYPES: ['contract', 'document', 'task'], MSSQL_RELATIONAL_MODE: true, DB_MODE: 'mssql',
    resolveEmailLinkTarget: () => null,
    authHasPermission: (auth, permission) => auth.user.permissions.includes(permission),
    ensureMessagingDb: db => db.messaging,
    compactLabel: text => String(text).slice(0, 180),
    require: () => ({ getQuote: () => { reads++; if (fail) throw Error('SQL indisponibil'); return { id: 7, quote_number: 'OF-7' } } }),
  })
  return { resolve, reads: () => reads }
}
const actor = permissions => ({ user: { permissions }, db: { messaging: { emailMessages: [{ id: 1, subject: 'Sursă reală' }, { id: 2, cancelled_at: '2026-01-01' }] } } })
test('sursele necunoscute nu publică etichete sau URL-uri salvate arbitrar', () => {
  const value = fixture().resolve(actor([]), { source_type: 'unknown', source_id: '7', source_label: 'Secret', source_url: '//invalid.example' })
  assert.equal(value.source_label, null)
  assert.equal(value.source_url, null)
})
test('sursa CRM relațională cere drept înainte de interogare și folosește URL canonic', () => {
  const f = fixture()
  const input = { source_type: 'crm_quote', source_id: '7', source_url: '/setari' }
  assert.equal(f.resolve(actor([]), input).source_url, null)
  assert.equal(f.reads(), 0)
  assert.equal(f.resolve(actor(['crm:view']), input).source_url, '/crm/oferte/7')
  assert.equal(f.reads(), 1)
  assert.equal(fixture(true).resolve(actor(['crm:view']), input).source_url, null)
})
test('sursa Email este deschisă doar dacă mesajul există și poate fi consultat', () => {
  const f = fixture()
  assert.equal(f.resolve(actor([]), { source_type: 'email', source_id: 1 }).source_url, null)
  assert.equal(f.resolve(actor(['messaging:view']), { source_type: 'email', source_id: 1, source_url: '/setari' }).source_url, '/mesaje?email=1')
  assert.equal(f.resolve(actor(['messaging:view']), { source_type: 'email', source_id: 2 }).source_url, null)
})
