'use strict'
const { randomBytes, createHash } = require('node:crypto')
const hash = token => createHash('sha256').update(token).digest('hex')
// Out-of-band identity adapter for isolated tests; never accepts ERP roles.
function createOperatorIdentity({ verifyIdentity, clock }) {
  if (process.env.NODE_ENV !== 'test') throw Error('synthetic_test_only')
  if (typeof verifyIdentity !== 'function' || typeof clock !== 'function') throw Error('invalid_identity_adapter')
  const operators = new Map(), sessions = new Map()
  function time() {
    if (process.env.NODE_ENV !== 'test') throw Error('synthetic_test_only')
    const value = clock()
    if (!Number.isSafeInteger(value) || value < 0) throw Error('invalid_operator_clock')
    return value
  }
  function configure({ subject, enabled, trialIds }) {
    time()
    if (typeof subject !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(subject) || typeof enabled !== 'boolean'
      || !Array.isArray(trialIds) || trialIds.length > 100 || trialIds.some(id => typeof id !== 'string'
        || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id))) throw Error('invalid_operator')
    const version = (operators.get(subject)?.version || 0) + 1
    operators.set(subject, { enabled, trialIds: [...new Set(trialIds)], version })
  }
  async function issue(proof, ttlMs = 300000) {
    time()
    if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 900000) throw Error('invalid_session_ttl')
    // Provider implementation owns verification; caller cannot supply subject/role as authority.
    const subject = await verifyIdentity(proof), now = time(), operator = operators.get(subject)
    if (!operator?.enabled) throw Error('operator_identity_denied')
    const token = randomBytes(32).toString('hex'), expiresAt = now + ttlMs
    if (!Number.isSafeInteger(expiresAt)) throw Error('invalid_session_ttl')
    sessions.set(hash(token), { subject, version: operator.version, expiresAt })
    return { token, expiresAt }
  }
  function resolveSession(token) {
    const now = time()
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null
    const s = sessions.get(hash(token)), operator = s && operators.get(s.subject)
    if (!s || now >= s.expiresAt || !operator?.enabled || s.version !== operator.version) return null
    return { subject: s.subject, realm: 'demo_platform_operator', permission: 'trial_jobs_read',
      expiresAt: s.expiresAt, trialIds: [...operator.trialIds] }
  }
  function revoke(token) { time(); if (typeof token === 'string') sessions.delete(hash(token)) }
  return { configure, issue, resolveSession, revoke }
}
module.exports = { createOperatorIdentity }
