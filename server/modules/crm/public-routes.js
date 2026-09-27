const { Router } = require('express')
const { readDb, writeDb, DB_MODE, getMssqlRelationalStatus } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const { notifyUser } = require('../messaging/routes')
const quoteRepository = require('./quote-repository')
const { buildCrmHealth } = require('./service')
const { tokenHash, safeTokenMatch, normalizePublicDecision, publicQuoteView, createRateLimiter } = require('./public-service')

const router = Router()
const limitPublicView = createRateLimiter({ limit: 60, windowMs: 10 * 60 * 1000 })
const limitPublicDecision = createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 })

function applyPublicHeaders(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  })
}

function genericUnavailable(res) {
  return res.status(404).json({ error: 'Linkul nu este disponibil sau a expirat.' })
}

function publicHealthReady() {
  const db = readDb()
  const health = buildCrmHealth({
    db,
    license: global.LICENTA || db.settings?.license || {},
    dbMode: DB_MODE,
    relationalStatus: ['mssql', 'sqlserver'].includes(DB_MODE) ? getMssqlRelationalStatus() : null
  })
  return { db, ready: health.operational }
}

function clientKey(req, token) {
  return `${req.ip || req.socket?.remoteAddress || ''}:${tokenHash(token)}`
}

function usableLink(token) {
  const record = quoteRepository.findPublicLinkByHash(tokenHash(token))
  if (!record || !safeTokenMatch(token, record.token_hash)) return null
  if (record.cancelled_at || record.revoked_at || record.status === 'revoked') return null
  if (record.expires_at && new Date(record.expires_at).getTime() <= Date.now()) return null
  if (Number(record.quote_revision) !== Number(record.current_revision)) return null
  return record
}

function decisionFingerprint(req) {
  return tokenHash(`${req.ip || req.socket?.remoteAddress || ''}|${req.get('user-agent') || ''}`)
}

function notifyOwner(db, quote, decision) {
  const userId = String(quote.responsible_user_id || '').trim()
  if (!userId) return
  db.notifications = Array.isArray(db.notifications) ? db.notifications : []
  const key = `crm-quote-decision:${quote.id}:${quote.revision_number}`
  if (!db.notifications.some(item => item?.key === key && !item.read && !item.read_at)) {
    db.notifications.push({
      id: `notification-crm-${Date.now()}`,
      key,
      event: 'crm_quote_decision',
      user_id: userId,
      severity: decision === 'accepted' ? 'info' : 'warning',
      title: decision === 'accepted' ? 'Ofertă acceptată de client' : 'Ofertă refuzată de client',
      detail: `${quote.quote_number} · Rev. ${quote.revision_number}`,
      target_view: `/crm/oferte/${quote.id}`,
      target_label: 'Deschide oferta',
      created_at: new Date().toISOString(),
      read: false
    })
  }
  notifyUser(userId, 'crm_quote_decision', { quote_id: quote.id, revision: quote.revision_number, decision })
}

router.get('/quote/:token', (req, res) => {
  applyPublicHeaders(res)
  const token = String(req.params.token || '')
  if (!token || token.length < 40 || limitPublicView(clientKey(req, token))) return genericUnavailable(res)
  try {
    const runtime = publicHealthReady()
    if (!runtime.ready) return genericUnavailable(res)
    const link = usableLink(token)
    if (!link) return genericUnavailable(res)
    const quote = quoteRepository.getPublicQuote(link.id)
    if (!quote) return genericUnavailable(res)
    if (link.status === 'active' && !['approved', 'sent'].includes(String(link.quote_status))) return genericUnavailable(res)
    if (link.status === 'active') quoteRepository.markPublicLinkOpened(link.id)
    return res.json({ quote: publicQuoteView(quote), decision_recorded: link.status === 'used', expires_at: link.expires_at || null })
  } catch (error) {
    console.error('[CRM public] offer view failed', error)
    return genericUnavailable(res)
  }
})

router.post('/quote/:token/decision', (req, res) => {
  applyPublicHeaders(res)
  const token = String(req.params.token || '')
  if (!token || token.length < 40 || limitPublicDecision(clientKey(req, token))) return genericUnavailable(res)
  try {
    const runtime = publicHealthReady()
    if (!runtime.ready) return genericUnavailable(res)
    const link = usableLink(token)
    if (!link) return genericUnavailable(res)
    if (link.status === 'used') {
      const previous = quoteRepository.getPublicDecision(link.id)
      if (!previous) return genericUnavailable(res)
      return res.json({ ok: true, decision: previous.decision, already_recorded: true })
    }
    if (link.status !== 'active' || !['approved', 'sent'].includes(String(link.quote_status))) return genericUnavailable(res)
    const payload = normalizePublicDecision(req.body || {})
    const result = quoteRepository.recordPublicDecision(link.id, payload.decision, { ...payload, request_fingerprint: decisionFingerprint(req), evidence_hash: tokenHash(`${link.id}:${payload.decision}:${Date.now()}`) })
    const quote = quoteRepository.getQuote(link.quote_id)
    if (!quote) return genericUnavailable(res)
    const actor = { id: 'public-link', name: 'Client prin link securizat', role: 'external' }
    addAudit(runtime.db, actor, 'crm:quote_public_decision', { quoteId: quote.id, revision: quote.revision_number, linkId: link.id, decision: result.decision, idempotent: Boolean(result.already_decided) })
    if (!result.already_decided) notifyOwner(runtime.db, quote, result.decision)
    writeDb(runtime.db)
    return res.status(result.already_decided ? 200 : 201).json({ ok: true, decision: result.decision, already_recorded: Boolean(result.already_decided) })
  } catch (error) {
    if (Number(error?.status) === 422) return res.status(422).json({ error: error.message })
    console.error('[CRM public] decision failed', error)
    return genericUnavailable(res)
  }
})

module.exports = router
