const QUOTE_STATUSES = ['draft', 'pending_approval', 'approved', 'sent', 'accepted', 'declined', 'expired', 'rejected_internal', 'cancelled']
const ITEM_TYPES = ['material', 'service', 'custom']

function invalid(message) { return Object.assign(new Error(message), { status: 422 }) }
function text(value, max = 500) { return String(value == null ? '' : value).trim().slice(0, max) }
function number(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw invalid(`${label} este invalid.`)
  return parsed
}
function money(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100 }
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) }

function normalizeLines(lines) {
  if (!Array.isArray(lines)) throw invalid('Pozițiile ofertei trebuie transmise ca listă.')
  return lines.map((line, index) => {
    const item_type = text(line.item_type || 'custom', 30).toLowerCase()
    if (!ITEM_TYPES.includes(item_type)) throw invalid(`Tipul poziției ${index + 1} este invalid.`)
    const description = text(line.description, 1000)
    if (!description) throw invalid(`Descrierea poziției ${index + 1} este obligatorie.`)
    const quantity = number(line.quantity, `Cantitatea poziției ${index + 1}`, { min: 0.0001 })
    const unit_price = number(line.unit_price, `Prețul poziției ${index + 1}`, { min: 0 })
    const discount_percent = number(line.discount_percent ?? 0, `Discountul poziției ${index + 1}`, { min: 0, max: 100 })
    const tax_percent = number(line.tax_percent ?? line.tax_rate ?? 0, `TVA-ul poziției ${index + 1}`, { min: 0, max: 100 })
    const line_subtotal = money(quantity * unit_price)
    const line_discount = money(line_subtotal * discount_percent / 100)
    const taxable = money(line_subtotal - line_discount)
    const line_tax = money(taxable * tax_percent / 100)
    return { position: index + 1, item_type, item_reference: text(line.item_reference || line.item_code, 160) || null, description, quantity, unit: text(line.unit, 40) || null, unit_price, discount_percent, tax_percent, line_subtotal, line_discount, line_tax, line_total: money(taxable + line_tax), notes: text(line.notes, 2000) || null }
  })
}

function calculateQuote(lines) {
  const normalized = normalizeLines(lines)
  return { lines: normalized, subtotal: money(normalized.reduce((sum, line) => sum + line.line_subtotal, 0)), discount_total: money(normalized.reduce((sum, line) => sum + line.line_discount, 0)), tax_total: money(normalized.reduce((sum, line) => sum + line.line_tax, 0)), total: money(normalized.reduce((sum, line) => sum + line.line_total, 0)) }
}

function normalizeQuote(body = {}, { partial = false } = {}) {
  const result = {}
  for (const field of ['lead_id', 'account_id', 'contact_id']) if (body[field] != null) result[field] = body[field] === '' ? null : Number(body[field])
  if (!partial || body.account_id != null) { if (!Number.isInteger(result.account_id) || result.account_id < 1) throw invalid('Prospectul/clientul este obligatoriu.') }
  for (const field of ['title', 'currency', 'issue_date', 'valid_until', 'payment_terms', 'delivery_terms', 'notes_internal', 'notes_client', 'responsible_user_id']) if (body[field] != null) result[field] = text(body[field], field.includes('notes') ? 4000 : 500) || null
  if (!partial || body.title != null) { if (!result.title) throw invalid('Titlul ofertei este obligatoriu.') }
  if (!partial || body.currency != null) { result.currency = (result.currency || 'RON').toUpperCase(); if (!/^[A-Z]{3}$/.test(result.currency)) throw invalid('Moneda este invalidă.') }
  if (!partial || body.issue_date != null) { result.issue_date = result.issue_date || new Date().toISOString().slice(0, 10); if (!validDate(result.issue_date)) throw invalid('Data emiterii este invalidă.') }
  if (result.valid_until && !validDate(result.valid_until)) throw invalid('Data de valabilitate este invalidă.')
  if (result.valid_until && result.issue_date && result.valid_until < result.issue_date) throw invalid('Valabilitatea nu poate fi înaintea datei emiterii.')
  if (body.lines != null) Object.assign(result, calculateQuote(body.lines))
  return result
}

module.exports = { QUOTE_STATUSES, ITEM_TYPES, calculateQuote, normalizeQuote }
