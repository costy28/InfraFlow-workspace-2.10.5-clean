const fs = require('fs')
const path = require('path')

const STORAGE_ROOT = path.join(__dirname, '../../../storage/crm-quotes')

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

function amount(value) { return Number(value || 0).toFixed(2) }

function buildQuoteDocumentHtml(quote, company = {}) {
  const rows = (quote.lines || []).map(line => `<tr><td>${escapeHtml(line.position)}</td><td>${escapeHtml(line.description)}</td><td>${escapeHtml(line.quantity)} ${escapeHtml(line.unit || '')}</td><td>${amount(line.unit_price)}</td><td>${amount(line.discount_percent)}%</td><td>${amount(line.tax_percent)}%</td><td>${amount(line.line_total)}</td></tr>`).join('')
  const companyName = company.name || company.companyName || company.denumire || 'Organizație'
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(quote.quote_number)} revizia ${escapeHtml(quote.revision_number)}</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#172033}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{padding:8px;border:1px solid #cbd5e1;text-align:left}th{background:#f1f5f9}.total{text-align:right;margin-top:16px}.muted{color:#64748b}@media print{body{margin:18px}}</style></head><body><h1>Ofertă ${escapeHtml(quote.quote_number)} / Rev. ${escapeHtml(quote.revision_number)}</h1><p><strong>${escapeHtml(companyName)}</strong><br>Data emiterii: ${escapeHtml(quote.issue_date || '')}<br>Valabilă până la: ${escapeHtml(quote.valid_until || '—')}</p><p><strong>Client:</strong> ${escapeHtml(quote.account_name || '')}<br><strong>Contact:</strong> ${escapeHtml(quote.contact_name || '—')}</p><table><thead><tr><th>#</th><th>Descriere</th><th>Cant.</th><th>Preț unitar</th><th>Discount</th><th>TVA</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><p class="total">Subtotal: ${amount(quote.subtotal)} ${escapeHtml(quote.currency)}<br>Discount: ${amount(quote.discount_total)} ${escapeHtml(quote.currency)}<br>TVA: ${amount(quote.tax_total)} ${escapeHtml(quote.currency)}<br><strong>Total: ${amount(quote.total)} ${escapeHtml(quote.currency)}</strong></p><p><strong>Condiții plată:</strong> ${escapeHtml(quote.payment_terms || '—')}<br><strong>Condiții livrare:</strong> ${escapeHtml(quote.delivery_terms || '—')}</p>${quote.notes_client ? `<p>${escapeHtml(quote.notes_client).replace(/\n/g, '<br>')}</p>` : ''}</body></html>`
}

function documentFileName(quote) {
  const safeNumber = String(quote.quote_number || 'oferta').replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${safeNumber}-rev-${Number(quote.revision_number || 1)}.html`
}

function persistQuoteDocument(quote, company) {
  const html = buildQuoteDocumentHtml(quote, company)
  fs.mkdirSync(STORAGE_ROOT, { recursive: true })
  const fileName = documentFileName(quote)
  fs.writeFileSync(path.join(STORAGE_ROOT, fileName), html, 'utf8')
  return { html, fileName, documentPath: `storage/crm-quotes/${fileName}` }
}

function readQuoteDocument(documentPath) {
  const relative = String(documentPath || '').replace(/\\/g, '/').replace(/^storage\/crm-quotes\//, '')
  if (!relative || relative.includes('..') || path.basename(relative) !== relative) return null
  const filePath = path.join(STORAGE_ROOT, relative)
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath, 'utf8')
}

module.exports = { buildQuoteDocumentHtml, persistQuoteDocument, readQuoteDocument, documentFileName }
