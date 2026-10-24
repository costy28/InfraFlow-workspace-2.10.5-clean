'use strict'
const { prepareJobReport } = require('./demo-sql-job-report')
function fail(code = 'invalid_synthetic_page_request') { throw Object.assign(Error(code), { code }) }
function normalizePageRequest(input) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype || Object.keys(input).some(k => !['trialId','now','state','receipt','pageSize','cursor'].includes(k))
    || typeof input.trialId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.trialId)
    || !Number.isSafeInteger(input.now) || input.now<0) fail()
  const state = input.state ?? 'all', receipt = input.receipt ?? 'all', pageSize = input.pageSize ?? 25
  if (!['all','pending','leased','lease_expired','completed','superseded'].includes(state)
    || !['all','present','missing'].includes(receipt) || !Number.isInteger(pageSize) || pageSize<1 || pageSize>100) fail()
  const request = { trialId: input.trialId, now: input.now, state, receipt, pageSize, afterRevision: -1, expectedFingerprint: null }
  if (input.cursor !== undefined) {
    const c = input.cursor
    if (!c || Object.getPrototypeOf(c) !== Object.prototype || Object.keys(c).some(k => !['format','trialId','asOf','state','receipt','pageSize','afterRevision','fingerprint'].includes(k))
      || c.format !== 'synthetic-job-page-cursor-v1' || c.trialId !== request.trialId || c.asOf !== request.now
      || c.state !== state || c.receipt !== receipt || c.pageSize !== pageSize
      || !Number.isInteger(c.afterRevision) || c.afterRevision<0 || c.afterRevision>2147483647
      || typeof c.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(c.fingerprint)) fail()
    request.afterRevision = c.afterRevision; request.expectedFingerprint = c.fingerprint
  }
  return request
}
function prepareJobReportPage(data, input) {
  const request = normalizePageRequest(input)
  if (data?.changed || (request.expectedFingerprint && data?.fingerprint !== request.expectedFingerprint)) fail('job_report_changed')
  if (!data || !/^[a-f0-9]{64}$/.test(data.fingerprint || '') || !Array.isArray(data.jobs) || data.jobs.length>request.pageSize+1
    || !Number.isSafeInteger(data.totalMatched) || data.totalMatched<0 || !Number.isSafeInteger(data.totalJobs) || data.totalJobs<data.totalMatched) fail('invalid_synthetic_job_page')
  const prepared = prepareJobReport({ ...data, jobs: data.jobs.slice(0,100) }, { trialId: request.trialId, now: request.now })
  if (data.jobs.length>100) prepared.jobs.push(...prepareJobReport({ ...data, jobs: data.jobs.slice(100) }, { trialId: request.trialId, now: request.now }).jobs)
  if (data.totalMatched<prepared.jobs.length || request.afterRevision>data.currentRevision
    || (!prepared.jobs.length && data.totalMatched>0)) fail('invalid_synthetic_job_page')
  let last = request.afterRevision
  for (const job of prepared.jobs) {
    if (job.revision<=last || (request.state !== 'all' && job.state !== request.state)
      || (request.receipt === 'present' && !job.receiptPresent) || (request.receipt === 'missing' && job.receiptPresent)) fail('invalid_synthetic_job_page')
    last = job.revision
  }
  const hasMore = prepared.jobs.length>request.pageSize, jobs = prepared.jobs.slice(0,request.pageSize)
  const report = prepareJobReport({ ...data, jobs: data.jobs.slice(0,jobs.length) }, { trialId: request.trialId, now: request.now })
  return { ...report, format: 'synthetic-sql-job-report-page-v1', fingerprint: data.fingerprint,
    filters: { state: request.state, receipt: request.receipt }, pageSize: request.pageSize,
    totalJobs: data.totalJobs, totalMatched: data.totalMatched, summaryScope: 'page',
    nextCursor: hasMore ? { format: 'synthetic-job-page-cursor-v1', trialId: request.trialId, asOf: request.now,
      state: request.state, receipt: request.receipt, pageSize: request.pageSize,
      fingerprint: data.fingerprint, afterRevision: jobs.at(-1).revision } : null }
}
module.exports = { normalizePageRequest, prepareJobReportPage }
