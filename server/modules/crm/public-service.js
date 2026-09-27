const crypto = require('crypto')

const PUBLIC_DECISIONS = ['accepted', 'declined']

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex')
}

function createPublicToken() {
  return crypto.randomBytes(32).toString('base64url')
}

function safeTokenMatch(token, storedHash) {
  const candidate = Buffer.from(tokenHash(token), 'hex')
  const stored = Buffer.from(String(storedHash || ''), 'hex')
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored)
}

function compactText(value, max = 500) {
  return String(value == null ? '' : value).trim().slice(0, max)
}

function normalizePublicDecision(body = {}) {
  const decision = compactText(body.decision, 20).toLowerCase()
  if (!PUBLIC_DECISIONS.includes(decision)) throw Object.assign(new Error('Decizia nu este validă.'), { status: 422 })
  const decidedByName = compactText(body.decided_by_name, 300) || null
  const decidedByEmail = compactText(body.decided_by_email, 254) || null
  if (decidedByEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(decidedByEmail)) throw Object.assign(new Error('Emailul nu este valid.'), { status: 422 })
  return {
    decision,
    decided_by_name: decidedByName,
    decided_by_email: decidedByEmail,
    comment: compactText(body.comment, 2000) || null
  }
}

function publicQuoteView(record) {
  if (!record) return null
  return {
    quote_number: record.quote_number,
    revision_number: record.revision_number,
    title: record.title,
    account_name: record.account_name,
    currency: record.currency,
    issue_date: record.issue_date,
    valid_until: record.valid_until,
    payment_terms: record.payment_terms,
    delivery_terms: record.delivery_terms,
    notes_client: record.notes_client,
    subtotal: record.subtotal,
    discount_total: record.discount_total,
    tax_total: record.tax_total,
    total: record.total,
    lines: (record.lines || []).map(line => ({
      position: line.position,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unit_price: line.unit_price,
      discount_percent: line.discount_percent,
      tax_percent: line.tax_percent,
      line_total: line.line_total
    }))
  }
}

function createRateLimiter({ windowMs = 10 * 60 * 1000, limit = 20 } = {}) {
  const hits = new Map()
  return function limited(key) {
    const now = Date.now()
    const safeKey = tokenHash(key)
    const current = (hits.get(safeKey) || []).filter(at => at > now - windowMs)
    if (current.length >= limit) {
      hits.set(safeKey, current)
      return true
    }
    current.push(now)
    hits.set(safeKey, current)
    return false
  }
}

module.exports = { PUBLIC_DECISIONS, tokenHash, createPublicToken, safeTokenMatch, normalizePublicDecision, publicQuoteView, createRateLimiter }
