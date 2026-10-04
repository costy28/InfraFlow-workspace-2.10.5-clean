const { decryptSettingSecret } = require('../../../core/settings-crypto')
const billingDocuments = require('../billing-document-repository')
const { ensureAccounting } = require('../../accounting/accounting-engine')

const TOKEN_URL = 'https://www.oblio.eu/api/authorize/token'

function configFromSettings(settings = {}) {
  return {
    enabled: settings.oblio_enabled === true,
    clientId: String(settings.oblio_client_id || '').trim(),
    clientSecret: decryptSettingSecret(settings.oblio_client_secret_encrypted || ''),
    cif: String(settings.oblio_company_cif || '').trim(),
    invoiceSeries: String(settings.oblio_invoice_series || '').trim(),
    proformaSeries: String(settings.oblio_proforma_series || settings.oblio_invoice_series || '').trim(),
    language: String(settings.oblio_language || 'RO').trim().toUpperCase(),
    useStock: false
  }
}

function assertConfigured(config) {
  if (!config.enabled) throw Object.assign(new Error('Integrarea Oblio nu este activată.'), { status: 409 })
  if (!config.clientId || !config.clientSecret || !config.cif) throw Object.assign(new Error('Completează emailul Oblio, cheia API și CIF-ul firmei înainte de test.'), { status: 422 })
}

async function authorize(config, fetchImpl = global.fetch) {
  assertConfigured(config)
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret }).toString(),
    signal: AbortSignal.timeout(15000)
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.access_token) throw Object.assign(new Error(payload.statusMessage || payload.message || 'Oblio a respins autentificarea.'), { status: 422 })
  return payload.access_token
}

async function testConnection(settings, fetchImpl) {
  await authorize(configFromSettings(settings), fetchImpl)
  return { ok: true, provider: 'oblio', message: 'Conexiunea Oblio este validă. Nu a fost emis niciun document.' }
}

function today() { return new Date().toISOString().slice(0, 10) }

function snapshotForLine(line) {
  if (!line?.line_snapshot) return {}
  if (typeof line.line_snapshot === 'object') return line.line_snapshot
  try { return JSON.parse(line.line_snapshot) || {} } catch { return {} }
}

function netLineValue(line) {
  const snapshot = snapshotForLine(line)
  const subtotal = Number(snapshot.subtotal)
  const discount = Number(snapshot.discount_amount || 0)
  if (Number.isFinite(subtotal) && subtotal >= 0) return Math.max(0, subtotal - discount)
  const total = Number(line.line_total || 0)
  const taxRate = Number(line.tax_rate || 0)
  return taxRate > 0 ? total / (1 + taxRate / 100) : total
}

function buildInvoicePayload({ config, order, client, document }) {
  return {
    cif: config.cif,
    client,
    issueDate: today(),
    dueDate: today(),
    deliveryDate: today(),
    seriesName: config.invoiceSeries,
    language: config.language,
    precision: 2,
    currency: order.currency || 'RON',
    useStock: 0,
    spvExtern: 0,
    orderNumber: order.order_number,
    internalNote: `InfraFlow CRM ${order.order_number}`,
    idempotencyKey: document.idempotency_key,
    products: (order.lines || []).map(line => {
      const quantity = Number(line.quantity || 0)
      return {
        name: line.description,
        description: line.description,
        price: quantity > 0 ? netLineValue(line) / quantity : 0,
        measuringUnit: line.unit || 'buc',
        vatPercentage: Number(line.tax_rate || 0),
        vatIncluded: 0,
        quantity,
        productType: 'Serviciu',
        save: 0
      }
    })
  }
}

function buildProformaPayload({ config, order, client, document }) {
  const payload = buildInvoicePayload({ config: { ...config, invoiceSeries: config.proformaSeries }, order, client, document })
  delete payload.deliveryDate
  delete payload.spvExtern
  payload.internalNote = `InfraFlow CRM proformă ${order.order_number}`
  return payload
}

function clientFromAccounting(db, order) {
  const client = ensureAccounting(db).thirdParties.find(item => String(item.id) === String(order.accounting_third_party_id))
  if (!client) throw Object.assign(new Error('Comanda nu are terț contabil valid pentru documentul Oblio.'), { status: 422 })
  return { cif: client.cui || client.cif || '', name: client.denumire, address: client.adresa || '', city: client.localitate || '', state: client.judet || '', country: client.tara || 'RO', email: client.email || '', phone: client.telefon || '', vatPayer: client.platitor_tva ? 1 : 0, save: 0 }
}
async function emitInvoice({ db, order, actor, fetchImpl = global.fetch }) {
  const config = configFromSettings(db.settings || {})
  assertConfigured(config)
  if (!config.invoiceSeries) throw Object.assign(new Error('Completează seria de facturi Oblio înainte de emitere.'), { status: 422 })
  const internalDraft = billingDocuments.listForOrder(order.id).find(item => item.document_kind === 'invoice_draft' && item.provider_key === 'infraflow_internal' && item.provider_document_id)
  if (!internalDraft) throw Object.assign(new Error('Creează mai întâi factura draft în Contabilitate și verific-o înainte de emiterea în Oblio.'), { status: 422 })
  const document = billingDocuments.createOrGet({ orderId: order.id, documentKind: 'invoice', providerKey: 'oblio', idempotencyKey: `crm-oblio:order:${order.id}:invoice`, request: { order_number: order.order_number, total: order.total, currency: order.currency }, actor })
  if (document.provider_document_id) return { document, idempotent: true }
  const token = await authorize(config, fetchImpl)
  const payload = buildInvoicePayload({ config, order, client: clientFromAccounting(db, order), document })
  const response = await fetchImpl('https://www.oblio.eu/api/docs/invoice', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result?.data?.number) throw Object.assign(new Error(result.statusMessage || result.message || 'Oblio nu a emis factura.'), { status: 422 })
  const completed = billingDocuments.completeInternal(document.id, { providerDocumentId: `${result.data.seriesName}-${result.data.number}`, status: 'issued', response: { provider: 'oblio', series: result.data.seriesName, number: result.data.number, link: result.data.link || '', order_number: order.order_number }, actor })
  return { document: completed, idempotent: false }
}

async function emitProforma({ db, order, actor, fetchImpl = global.fetch }) {
  const config = configFromSettings(db.settings || {})
  assertConfigured(config)
  if (!config.proformaSeries) throw Object.assign(new Error('Completează seria de proforme Oblio înainte de emitere.'), { status: 422 })
  if (order.status !== 'confirmed') throw Object.assign(new Error('Proforma Oblio se poate emite numai pentru o comandă confirmată.'), { status: 409 })
  const document = billingDocuments.createOrGet({ orderId: order.id, documentKind: 'proforma', providerKey: 'oblio', idempotencyKey: `crm-oblio:order:${order.id}:proforma`, request: { order_number: order.order_number, total: order.total, currency: order.currency }, actor })
  if (document.provider_document_id) return { document, idempotent: true }
  const token = await authorize(config, fetchImpl)
  const payload = buildProformaPayload({ config, order, client: clientFromAccounting(db, order), document })
  const response = await fetchImpl('https://www.oblio.eu/api/docs/proforma', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result?.data?.number) throw Object.assign(new Error(result.statusMessage || result.message || 'Oblio nu a emis proforma.'), { status: 422 })
  const completed = billingDocuments.completeInternal(document.id, { providerDocumentId: `${result.data.seriesName}-${result.data.number}`, status: 'issued', response: { provider: 'oblio', series: result.data.seriesName, number: result.data.number, link: result.data.link || '', order_number: order.order_number, payment_provider: 'netopia_via_oblio' }, actor })
  return { document: completed, idempotent: false }
}

module.exports = { configFromSettings, authorize, testConnection, buildInvoicePayload, buildProformaPayload, emitInvoice, emitProforma }
