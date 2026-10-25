'use strict'
// Test-only boundary. Tokens are issued out of band by the trusted test owner.
// This is not ERP authentication, a login service, or a production operator API.
const { normalizePageRequest } = require('../../../scripts/lib/demo-sql-job-report-page')
const { collectJobReportExport, normalizeJobReportPageOutput } = require('../../../scripts/lib/demo-sql-job-report-export')

function createOperatorReportHarness({ sessions, resolveSession, audit, readPage, clock }) {
  if (process.env.NODE_ENV !== 'test') throw Error('synthetic_test_only')
  if ((!(sessions instanceof Map) && typeof resolveSession !== 'function') || typeof readPage !== 'function' || typeof clock !== 'function'
    || (resolveSession && typeof audit !== 'function')) throw Error('invalid_operator_harness')
  const resolve = resolveSession || (token => sessions.get(token))
  function authorize(token, trialId) {
    const now = clock(), s = resolve(token)
    if (!Number.isSafeInteger(now) || now < 0) throw Error('invalid_operator_clock')
    if (!s || s.revoked === true || !Number.isSafeInteger(s.expiresAt) || now >= s.expiresAt) return 401
    if (s.realm !== 'demo_platform_operator' || s.permission !== 'trial_jobs_read'
      || typeof s.subject !== 'string' || !s.subject || !Array.isArray(s.trialIds) || !s.trialIds.includes(trialId)) return 403
    return 200
  }
  return async function handler(req, res) {
    let context = { subject: null, trialId: null, operation: 'unknown' }
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" })
      res.end(JSON.stringify(body))
    }
    const finish = async (status, body) => {
      if (audit) {
        try { await audit(Object.freeze({ ...context, status, at: clock() })) }
        catch { return send(503, { code: 'operator_audit_unavailable' }) }
      }
      return send(status, body)
    }
    try {
      if (process.env.NODE_ENV !== 'test') return send(503, { code: 'synthetic_test_only' })
      if (!req.url || req.url.length > 16384) return send(400, { code: 'invalid_request' })
      const url = new URL(req.url, 'http://127.0.0.1')
      if (!['/operator/jobs', '/operator/jobs/export'].includes(url.pathname)) return send(404, { code: 'not_found' })
      context.operation = url.pathname.endsWith('/export') ? 'export' : 'page'
      if (req.method !== 'GET') return finish(405, { code: 'read_only' })
      const match = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')
      if (!match) return finish(401, { code: 'operator_auth_required' })
      const token = match[1]
      // Authenticate before parsing caller-selected trial/filter information.
      const identity = resolve(token)
      if (!identity) return finish(401, { code: 'operator_auth_required' })
      context.subject = identity.subject
      if ([...url.searchParams.keys()].some(k => k !== 'request') || url.searchParams.getAll('request').length !== 1)
        return finish(400, { code: 'invalid_request' })
      let request
      try { request = JSON.parse(url.searchParams.get('request')); normalizePageRequest(request) }
      catch { return finish(400, { code: 'invalid_request' }) }
      context.trialId = request.trialId
      if (url.pathname.endsWith('/export') && Object.hasOwn(request, 'cursor')) return finish(400, { code: 'invalid_request' })
      const status = authorize(token, request.trialId)
      if (status !== 200) return finish(status, { code: 'operator_access_denied' })
      const guardedRead = async input => {
        const status = authorize(token, input.trialId)
        if (status !== 200) throw Object.assign(Error('operator_access_denied'), { status })
        const page = await readPage(input)
        const after = authorize(token, input.trialId)
        if (after !== 200) throw Object.assign(Error('operator_access_denied'), { status: after })
        return normalizeJobReportPageOutput(page, input)
      }
      const result = url.pathname.endsWith('/export')
        ? await collectJobReportExport({ request, readPage: guardedRead })
        : await guardedRead(request)
      // Persist audit before disclosure, then recheck authority after the async sink.
      if (audit) {
        try { await audit(Object.freeze({ ...context, status: 200, at: clock() })) }
        catch { return send(503, { code: 'operator_audit_unavailable' }) }
      }
      const finalStatus = authorize(token, request.trialId)
      if (finalStatus !== 200) return finish(finalStatus, { code: 'operator_access_denied' })
      return send(200, result)
    } catch (error) {
      const status = [401, 403].includes(error.status) ? error.status
        : ['job_report_changed', 'job_report_export_changed'].includes(error.code) ? 409 : 500
      return finish(status, { code: status === 500 ? 'operator_report_failed' : status === 409 ? 'report_changed' : 'operator_access_denied' })
    }
  }
}
module.exports = { createOperatorReportHarness }
