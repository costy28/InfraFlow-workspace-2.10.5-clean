const billingDocuments = require('../billing-document-repository')
const { createDraftInvoice } = require('../../accounting/crm-billing-port')
const { writeDb } = require('../../../core/db')

function requestSnapshot(order) {
  return {
    order_id: order.id,
    order_number: order.order_number,
    quote_id: order.source_quote_id,
    quote_revision: order.source_quote_revision,
    account_id: order.account_id,
    currency: order.currency,
    subtotal: Number(order.subtotal || 0),
    tax_total: Number(order.tax_total || 0),
    total: Number(order.total || order.grand_total || 0),
    lines: (order.lines || []).map(line => ({ id: line.id, description: line.description, quantity: line.quantity, unit: line.unit, unit_price: line.unit_price, tax_rate: line.tax_rate, line_total: line.line_total }))
  }
}

function createProforma({ order, actor }) {
  const document = billingDocuments.createOrGet({
    orderId: order.id,
    documentKind: 'proforma',
    idempotencyKey: `crm-billing:order:${order.id}:proforma`,
    request: requestSnapshot(order),
    actor
  })
  if (document.provider_document_id) return { document, idempotent: true }
  const providerDocumentId = `PF-${order.order_number}`
  const completed = billingDocuments.completeInternal(document.id, {
    providerDocumentId,
    status: 'issued',
    response: { document_number: providerDocumentId, order_number: order.order_number, kind: 'proforma', total: Number(order.total || order.grand_total || 0), currency: order.currency },
    actor
  })
  return { document: completed, idempotent: false }
}

function createInvoiceDraft({ db, user, order, actor }) {
  const document = billingDocuments.createOrGet({
    orderId: order.id,
    documentKind: 'invoice_draft',
    idempotencyKey: `crm-billing:order:${order.id}:invoice-draft`,
    request: requestSnapshot(order),
    actor
  })
  if (document.provider_document_id) return { document, invoice: document.response?.invoice || null, idempotent: true }
  const result = createDraftInvoice({ db, user, order, billingDocument: document })
  // Persistăm factura-contabilitate înainte de a marca documentul CRM drept creat,
  // pentru ca o reluare să găsească mereu aceeași factură draft.
  writeDb(db)
  const completed = billingDocuments.completeInternal(document.id, {
    providerDocumentId: String(result.invoice.uuid),
    status: 'draft',
    response: { invoice: { id: result.invoice.id, uuid: result.invoice.uuid, number: `${result.invoice.serie || 'IF'}-${result.invoice.numar}`, status: result.invoice.status, total: result.invoice.total, an: result.invoice.an, luna: result.invoice.luna }, order_number: order.order_number, kind: 'invoice_draft' },
    actor
  })
  return { document: completed, invoice: result.invoice, idempotent: result.idempotent }
}

module.exports = { createProforma, createInvoiceDraft }
