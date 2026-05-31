/**
 * kiosk-sessions.js — sesiuni Kiosk Angajat (separate de sesiunile aplicației)
 * Importat de hr/routes.js și fleet/trip-routes.js
 */
const crypto = require('crypto')

const kioskSessions = new Map()   // token → { employee_id, username, created_at }
const kioskRateLimit = new Map()  // ip → { count, blockedUntil }

const BLOCK_DURATION_MS = 30 * 60 * 1000   // 30 minute
const BLOCK_THRESHOLD = 3
const SESSION_TTL_MS = 8 * 60 * 60 * 1000  // 8 ore

function isBlocked(ip) {
  const e = kioskRateLimit.get(ip)
  if (!e || !e.blockedUntil) return false
  if (Date.now() < e.blockedUntil) return true
  kioskRateLimit.delete(ip)
  return false
}

function recordFailure(ip) {
  const e = kioskRateLimit.get(ip) || { count: 0, blockedUntil: 0 }
  e.count++
  if (e.count >= BLOCK_THRESHOLD) {
    e.blockedUntil = Date.now() + BLOCK_DURATION_MS
    e.count = 0
  }
  kioskRateLimit.set(ip, e)
}

function clearLimit(ip) {
  kioskRateLimit.delete(ip)
}

function createSession(employee_id, username) {
  const token = crypto.randomBytes(32).toString('hex')
  kioskSessions.set(token, {
    employee_id: String(employee_id),
    username: String(username),
    created_at: new Date().toISOString()
  })
  return token
}

function getSession(token) {
  if (!token) return null
  const session = kioskSessions.get(token)
  if (!session) return null
  const age = Date.now() - new Date(session.created_at).getTime()
  if (age > SESSION_TTL_MS) {
    kioskSessions.delete(token)
    return null
  }
  return session
}

function tokenFromRequest(req) {
  const header = String(req.headers.authorization || '')
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

function requireKioskAuth(req, res) {
  const token = tokenFromRequest(req)
  const session = getSession(token)
  if (!session) {
    res.status(401).json({ error: 'Autentificare Kiosk necesară.' })
    return null
  }
  return session  // { employee_id, username, created_at }
}

function clientIp(req) {
  const raw = String(req.socket?.remoteAddress || '').trim()
  if (raw.startsWith('::ffff:')) return raw.slice(7)
  return raw === '::1' ? '127.0.0.1' : raw
}

module.exports = {
  isBlocked,
  recordFailure,
  clearLimit,
  createSession,
  getSession,
  tokenFromRequest,
  requireKioskAuth,
  clientIp
}
