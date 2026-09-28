const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { encryptSettingSecret } = require('../core/settings-crypto')
const { configFromSettings, testConnection, buildInvoicePayload } = require('../modules/crm/ports/oblio')

test('providerul Oblio decriptează secretul doar pe server și testează fără emitere', async () => {
  const config = configFromSettings({ oblio_enabled: true, oblio_client_id: 'cont@example.ro', oblio_client_secret_encrypted: encryptSettingSecret('secret-test'), oblio_company_cif: 'RO123', oblio_invoice_series: 'FCT' })
  assert.equal(config.clientSecret, 'secret-test')
  let request
  const result = await testConnection({ oblio_enabled: true, oblio_client_id: 'cont@example.ro', oblio_client_secret_encrypted: encryptSettingSecret('secret-test'), oblio_company_cif: 'RO123' }, async (url, options) => {
    request = { url, options }
    return { ok: true, json: async () => ({ access_token: 'temporary-token' }) }
  })
  assert.equal(result.ok, true)
  assert.match(request.url, /authorize\/token/)
  assert.doesNotMatch(request.url, /docs\/invoice/)
  assert.match(request.options.body, /client_id=cont%40example.ro/)
})

test('emiterea Oblio este manuală, idempotentă și nu pornește stocul sau SPV', () => {
  const root = path.resolve(__dirname, '..', '..')
  const route = fs.readFileSync(path.join(root, 'server/modules/crm/routes.js'), 'utf8')
  const provider = fs.readFileSync(path.join(root, 'server/modules/crm/ports/oblio.js'), 'utf8')
  const settings = fs.readFileSync(path.join(root, 'server/modules/system/routes.js'), 'utf8')
  const quotePage = fs.readFileSync(path.join(root, 'client/src/pages/modules/CrmQuotesPage.jsx'), 'utf8')
  assert.match(route, /\/crm\/customer-orders\/:id\/oblio\/invoice/)
  assert.match(route, /confirmed !== true/)
  assert.match(route, /crm:oblio_invoice_issued/)
  assert.match(provider, /idempotencyKey/)
  assert.match(provider, /useStock: 0/)
  assert.match(provider, /spvExtern: 0/)
  assert.match(provider, /invoice_draft/)
  assert.match(settings, /oblio_client_secret_set/)
  assert.match(settings, /delete result\.oblio_client_secret_encrypted/)
  assert.match(quotePage, /ConfirmDialog/)
  assert.doesNotMatch(quotePage, /window\.confirm/)
})

test('pozițiile Oblio păstrează baza netă și TVA-ul comenzii CRM', () => {
  const payload = buildInvoicePayload({
    config: { cif: 'RO123', invoiceSeries: 'FCT', language: 'RO' },
    client: { name: 'Client test', save: 0 },
    document: { idempotency_key: 'crm-oblio:order:1:invoice' },
    order: {
      order_number: 'CO-2026-0001', currency: 'RON', lines: [{ description: 'Serviciu', quantity: 2, unit: 'buc', tax_rate: 21, line_total: 242, line_snapshot: JSON.stringify({ subtotal: 200, discount_amount: 0 }) }]
    }
  })
  assert.equal(payload.products[0].price, 100)
  assert.equal(payload.products[0].vatPercentage, 21)
  assert.equal(payload.useStock, 0)
  assert.equal(payload.spvExtern, 0)
})
