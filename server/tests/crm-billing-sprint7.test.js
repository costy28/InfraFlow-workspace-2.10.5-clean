const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..')
const { createDraftInvoice } = require('../modules/accounting/crm-billing-port')

function order() {
  return {
    id: 8, order_number: 'CO-2026-0008', account_id: 4, accounting_third_party_id: 11,
    source_quote_id: 3, source_quote_revision: 2, currency: 'RON',
    lines: [{ id: 1, description: 'Serviciu', quantity: 2, unit: 'buc', unit_price: 100, tax_rate: 21, line_total: 242, line_snapshot: JSON.stringify({ line_subtotal: 200, line_discount: 0 }) }]
  }
}

test('factura draft CRM reutilizează mecanismul contabil și păstrează sursa comenzii', () => {
  const db = { audit: [], accounting: { invoicesOut: [], thirdParties: [{ id: 11, tip: 'client', activ: true, denumire: 'Client', cont_analitic_client: '4111.00011' }], chart: [], journals: [], treasury: [] }, settings: {} }
  const billingDocument = { id: 91 }
  const first = createDraftInvoice({ db, user: { id: 'admin' }, order: order(), billingDocument })
  assert.equal(first.invoice.status, 'draft')
  assert.equal(first.invoice.valoare, 200)
  assert.equal(first.invoice.tva, 42)
  assert.equal(first.invoice.total, 242)
  assert.equal(first.invoice.crm_customer_order_id, 8)
  const repeated = createDraftInvoice({ db, user: { id: 'admin' }, order: order(), billingDocument })
  assert.equal(repeated.idempotent, true)
  assert.equal(db.accounting.invoicesOut.length, 1)
})

test('Sprintul 7 păstrează proforma și factura în porturi separate, cu audit și fără validare automată', () => {
  const routes = fs.readFileSync(path.join(root, 'server/modules/crm/routes.js'), 'utf8')
  const ports = fs.readFileSync(path.join(root, 'server/modules/crm/ports/index.js'), 'utf8')
  const billing = fs.readFileSync(path.join(root, 'server/modules/crm/ports/billing.js'), 'utf8')
  const page = fs.readFileSync(path.join(root, 'client/src/pages/modules/CrmQuotesPage.jsx'), 'utf8')
  assert.match(routes, /\/crm\/customer-orders\/:id\/proforma/)
  assert.match(routes, /\/crm\/customer-orders\/:id\/invoice-draft/)
  assert.match(routes, /\/crm\/billing\/clients/)
  assert.match(routes, /crm:customer_order_proforma_created/)
  assert.match(routes, /crm:customer_order_invoice_draft_created/)
  assert.match(ports, /billing: Object\.freeze\(\{[^}]*implemented: true/s)
  assert.match(billing, /createDraftInvoice/)
  assert.match(billing, /an: result\.invoice\.an/)
  assert.doesNotMatch(billing, /efactura/i)
  assert.match(page, /Creează proformă/)
  assert.match(page, /Creează factură draft/)
  assert.match(page, /Terț contabil pentru client/)
  assert.match(page, /invoiceAccountingLink/)
})
