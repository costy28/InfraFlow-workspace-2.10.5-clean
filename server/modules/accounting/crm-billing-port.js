const accountingRoutes = require('./accounting-routes')
const { ensureAccounting } = require('./accounting-engine')

function snapshot(line) {
  try { return line.line_snapshot ? JSON.parse(line.line_snapshot) : {} } catch { return {} }
}

function netLineValue(line) {
  const source = snapshot(line)
  if (Number.isFinite(Number(source.line_subtotal)) || Number.isFinite(Number(source.line_discount))) {
    return round(Number(source.line_subtotal || 0) - Number(source.line_discount || 0))
  }
  const taxRate = Number(line.tax_rate || 0)
  return round(Number(line.line_total || 0) / (1 + taxRate / 100))
}

function round(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100 }

function resolveClient(db, order) {
  const accounting = ensureAccounting(db)
  const id = order.accounting_third_party_id
  const client = accounting.thirdParties.find(item => String(item.id) === String(id))
  if (!client || client.activ === false || !['client', 'ambele'].includes(String(client.tip || ''))) {
    const error = new Error('Clientul CRM nu este legat de un terț contabil activ. Configurează mai întâi terțul client în Contabilitate și legătura lui în CRM.')
    error.status = 422
    throw error
  }
  return client
}

function createDraftInvoice({ db, user, order, billingDocument }) {
  const accounting = ensureAccounting(db)
  const existing = accounting.invoicesOut.find(item => String(item.crm_billing_document_id || '') === String(billingDocument.id))
  if (existing) return { invoice: existing, idempotent: true }
  const client = resolveClient(db, order)
  const lines = (order.lines || []).map((line, index) => ({
    nr_crt: index + 1,
    denumire: line.description,
    um: line.unit || 'buc',
    cantitate: Number(line.quantity || 0),
    pret_unitar: Number(line.unit_price || 0),
    valoare: netLineValue(line),
    tva_procent: Number(line.tax_rate || 0),
    cont: '704'
  })).filter(line => line.valoare > 0)
  if (!lines.length) {
    const error = new Error('Comanda client nu are poziții facturabile valide.')
    error.status = 422
    throw error
  }
  const invoice = accountingRoutes.crmPort.createInvoiceOutDraft(db, user, {
    client_id: client.id,
    lines,
    explicatie: `Comandă client ${order.order_number}`
  })
  Object.assign(invoice, {
    crm_billing_document_id: billingDocument.id,
    crm_customer_order_id: order.id,
    crm_order_number: order.order_number,
    crm_source_quote_id: order.source_quote_id,
    crm_source_quote_revision: order.source_quote_revision
  })
  return { invoice, idempotent: false }
}

module.exports = { createDraftInvoice }
