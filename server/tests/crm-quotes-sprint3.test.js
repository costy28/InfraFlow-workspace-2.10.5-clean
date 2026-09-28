const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { calculateQuote, normalizeQuote } = require('../modules/crm/quote-service')
const { buildQuoteDocumentHtml, documentFileName } = require('../modules/crm/quote-document')
const root = path.resolve(__dirname, '../..')
const routes = fs.readFileSync(path.join(root, 'server/modules/crm/routes.js'), 'utf8')
const repository = fs.readFileSync(path.join(root, 'server/modules/crm/quote-repository.js'), 'utf8')
const dbCore = fs.readFileSync(path.join(root, 'server/core/db.js'), 'utf8')
const quotePage = fs.readFileSync(path.join(root, 'client/src/pages/modules/CrmQuotesPage.jsx'), 'utf8')

test('calculele ofertelor sunt server-side: discount înainte de TVA', () => {
  const result = calculateQuote([{ description: 'Serviciu', quantity: 2, unit_price: 100, discount_percent: 10, tax_percent: 21 }])
  assert.deepEqual({ subtotal: result.subtotal, discount: result.discount_total, tax: result.tax_total, total: result.total }, { subtotal: 200, discount: 20, tax: 37.8, total: 217.8 })
})
test('validările refuză ofertă fără client, poziții invalide sau valabilitate inversă', () => {
  assert.throws(() => normalizeQuote({ title: 'X', lines: [] }), /Prospectul\/clientul este obligatoriu/)
  assert.throws(() => normalizeQuote({ title: 'X', account_id: 1, issue_date: '2026-10-02', valid_until: '2026-10-01', lines: [] }), /Valabilitatea nu poate fi/)
  assert.throws(() => calculateQuote([{ description: '', quantity: 1, unit_price: 1 }]), /Descrierea poziției/)
})
test('oferta păstrează revizia, tranzacția și imutabilitatea în repository', () => {
  assert.match(repository, /BEGIN TRANSACTION/)
  assert.match(repository, /MAX\(revision\)\+1/)
  assert.match(repository, /status=N'draft'/)
  assert.match(repository, /Oferta nu poate fi editată/)
})
test('lista ofertelor păstrează rezultatele când filtrul expirate nu este setat', () => {
  assert.match(repository, /COALESCE\(JSON_VALUE\(@p,'\$\.expired'\), N'false'\)<>N'true'/)
})
test('spațiul de lucru al ofertelor evită citirile CRM fragmentate și păstrează JSON-ul MSSQL mare', () => {
  assert.match(repository, /function quoteWorkspace/)
  assert.match(routes, /\/crm\/quotes\/workspace/)
  assert.match(dbCore, /ExecuteReader\(\)/)
  assert.match(dbCore, /\[string\]::Concat/)
})
test('API protejează tranzițiile, auditul și emailul ofertelor', () => {
  ;['/submit-approval','/approve','/reject','/revision','/generate-document','/document','/send','crm:quote_created','crm:quote_lines_changed','crm:quote_approved','crm:quote_sent','crm:quote_cancelled','quoteAudit'].forEach(token => assert.match(routes, new RegExp(token.replace(/[/:]/g, '\\$&'))))
  assert.match(routes, /quote\.status !== 'approved'/)
  assert.match(routes, /sendEmail/)
  assert.match(routes, /recordOutboundEmail/)
  assert.match(routes, /document_path/)
})
test('trimiterea ofertei folosește emailul contactului sau, în lipsă, al prospectului', () => {
  assert.match(repository, /a\.email account_email/)
  assert.match(routes, /quote\.contact_email \|\| quote\.account_email/)
  assert.match(quotePage, /loaded\.contact_email \|\| loaded\.account_email/)
})
test('trimiterea ofertei păstrează activitatea CRM cu moment obligatoriu', () => {
  assert.match(routes, /activity_type: 'email', occurred_at: new Date\(\)\.toISOString\(\)/)
  assert.match(routes, /repository\.createActivity\(normalizeActivityPayload/)
})
test('documentul print-ready identifică exact oferta și revizia', () => {
  const quote = { quote_number: 'OF-2026-0001', revision_number: 2, account_name: 'Client test', currency: 'RON', lines: [{ position: 1, description: '<serviciu>', quantity: 1, unit_price: 100, discount_percent: 0, tax_percent: 21, line_total: 121 }] }
  const html = buildQuoteDocumentHtml(quote, { name: 'Organizație test' })
  assert.match(html, /OF-2026-0001 \/ Rev\. 2/)
  assert.match(html, /&lt;serviciu&gt;/)
  assert.equal(documentFileName(quote), 'OF-2026-0001-rev-2.html')
})
