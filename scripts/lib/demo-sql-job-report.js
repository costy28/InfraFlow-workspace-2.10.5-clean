'use strict'
// Pure, bounded presentation only. The report is not execution authority.
const labels = { pending: 'În așteptare', leased: 'În lucru', lease_expired: 'Drept de lucru expirat',
  superseded: 'Înlocuit de o revizie nouă', completed: 'Confirmat' }
function fail() { throw Object.assign(Error('invalid_synthetic_job_report'), { code: 'invalid_synthetic_job_report' }) }
const integer = value => Number.isSafeInteger(value) && value>=0
function prepareJobReport(data, { trialId, now }) {
  if (data?.trialId !== trialId || !integer(now) || !integer(data.currentRevision)
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(trialId || '') || !Array.isArray(data.jobs) || data.jobs.length>100) fail()
  const seen = new Set()
  const jobs = data.jobs.map(row => {
    if (!row || !integer(row.revision) || row.revision>data.currentRevision || seen.has(row.revision)
      || !integer(row.generation) || !['pending','leased','superseded','completed'].includes(row.state)
      || typeof row.receiptPresent !== 'boolean') fail()
    seen.add(row.revision)
    for (const key of ['claimedAt','leaseUntil','completedAt','firstEffectGeneration']) if (row[key] !== null && !integer(row[key])) fail()
    if (row.receiptPresent !== (row.firstEffectGeneration !== null)
      || (row.receiptPresent && (row.firstEffectGeneration<1 || row.firstEffectGeneration>row.generation))) fail()
    if (['leased','completed'].includes(row.state) && (row.generation<1 || row.claimedAt===null || row.leaseUntil===null
      || row.leaseUntil<=row.claimedAt)) fail()
    if (row.state === 'completed' && (row.completedAt===null || row.completedAt<row.claimedAt || row.completedAt>=row.leaseUntil)) fail()
    if (row.state === 'pending' && (row.generation!==0 || row.claimedAt!==null || row.leaseUntil!==null || row.completedAt!==null || row.receiptPresent)) fail()
    if (row.state === 'leased' && row.completedAt!==null) fail()
    if ((row.claimedAt!==null && row.claimedAt>now) || (row.completedAt!==null && row.completedAt>now)) fail()
    const state = row.revision<data.currentRevision && ['pending','leased'].includes(row.state) ? 'superseded'
      : row.state === 'leased' && now>=row.leaseUntil ? 'lease_expired' : row.state
    return { revision: row.revision, generation: row.generation, persistedState: row.state, state,
      reason: { pending: 'waiting_for_claim', leased: 'owned_by_current_worker', lease_expired: 'lease_deadline_reached',
        superseded: 'job_not_current', completed: 'completion_already_saved' }[state],
      claimedAt: row.claimedAt, leaseUntil: row.leaseUntil, completedAt: row.completedAt,
      receiptPresent: row.receiptPresent, firstEffectGeneration: row.firstEffectGeneration }
  }).sort((a,b) => a.revision-b.revision)
  const summary = Object.fromEntries(Object.keys(labels).map(state => [state, jobs.filter(job => job.state === state).length]))
  return { format: 'synthetic-sql-job-report-v1', trialId, currentRevision: data.currentRevision, asOf: now,
    jobs, summary, executionAllowed: false, productionReady: false }
}
const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]))
function renderJobReport(report) {
  // Rebuild from the whitelisted source fields rather than reflecting arbitrary caller HTML.
  if (report?.format !== 'synthetic-sql-job-report-v1' || report.executionAllowed !== false || report.productionReady !== false) fail()
  const checked = prepareJobReport({ trialId: report.trialId, currentRevision: report.currentRevision,
    jobs: report.jobs?.map(j => ({ ...j, state: j.persistedState })) }, { trialId: report.trialId, now: report.asOf })
  const rows = checked.jobs.map(j => `<tr><td>${j.revision}</td><td>${escape(labels[j.state])}</td><td>${j.generation}</td><td>${j.leaseUntil ?? '—'}</td><td>${j.receiptPresent ? 'Da' : 'Nu'}</td></tr>`).join('')
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'"><title>Joburi Demo — raport sintetic</title></head><body><h1>Joburi Demo — numai citire</h1><p>Trial: ${escape(checked.trialId)} · Revizie: ${checked.currentRevision} · Moment sintetic (ms UTC): ${checked.asOf}</p><p>Acest raport nu autorizează execuția. Nu este interfață de producție.</p><table><thead><tr><th>Revizie</th><th>Stare și motiv</th><th>Generație</th><th>Termen (ms UTC)</th><th>Rezultat salvat</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Niciun job înregistrat.</td></tr>'}</tbody></table></body></html>`
}
module.exports = { prepareJobReport, renderJobReport }
