'use strict'
const { prepareJobReport } = require('./demo-sql-job-report')
const { normalizePageRequest } = require('./demo-sql-job-report-page')
function fail(code='invalid_synthetic_job_export') { throw Object.assign(Error(code),{code}) }
function checkPage(page,request) {
  const r=normalizePageRequest(request)
  if(page?.format!=='synthetic-sql-job-report-page-v1' || page.executionAllowed!==false || page.productionReady!==false
    || page.summaryScope!=='page' || page.pageSize!==r.pageSize || page.filters?.state!==r.state || page.filters?.receipt!==r.receipt
    || !/^[a-f0-9]{64}$/.test(page.fingerprint||'') || !Array.isArray(page.jobs) || page.jobs.length>r.pageSize
    || !Number.isSafeInteger(page.totalJobs) || !Number.isSafeInteger(page.totalMatched) || page.totalMatched<0
    || page.totalJobs<page.totalMatched || page.totalMatched<page.jobs.length) fail()
  if(r.expectedFingerprint && r.expectedFingerprint!==page.fingerprint) fail('job_report_export_changed')
  if(page.asOf!==r.now) fail()
  const report=prepareJobReport({trialId:page.trialId,currentRevision:page.currentRevision,
    jobs:page.jobs.map(j=>({...j,state:j.persistedState}))},{trialId:r.trialId,now:r.now})
  let last=r.afterRevision
  for(const job of report.jobs) {
    if(job.revision<=last || (r.state!=='all' && job.state!==r.state)
      || (r.receipt==='present' && !job.receiptPresent) || (r.receipt==='missing' && job.receiptPresent)) fail()
    last=job.revision
  }
  let nextCursor=null
  if(page.nextCursor!==null) {
    const c=normalizePageRequest({...request,cursor:page.nextCursor})
    if(!report.jobs.length || report.jobs.length!==r.pageSize || c.afterRevision!==last || c.expectedFingerprint!==page.fingerprint) fail()
    nextCursor={format:'synthetic-job-page-cursor-v1',trialId:r.trialId,asOf:r.now,state:r.state,receipt:r.receipt,
      pageSize:r.pageSize,fingerprint:page.fingerprint,afterRevision:last}
  }
  return {...report,format:'synthetic-sql-job-report-page-v1',filters:{state:r.state,receipt:r.receipt},pageSize:r.pageSize,
    totalJobs:page.totalJobs,totalMatched:page.totalMatched,fingerprint:page.fingerprint,summaryScope:'page',nextCursor}
}
async function collectJobReportExport(options) {
  if(process.env.NODE_ENV!=='test') fail('synthetic_test_only')
  if(!options || Object.getPrototypeOf(options)!==Object.prototype || Object.keys(options).some(k=>!['readPage','request','maxPages'].includes(k))
    || typeof options.readPage!=='function' || !options.request || Object.hasOwn(options.request,'cursor')) fail()
  const maxPages=options.maxPages??20
  if(!Number.isInteger(maxPages)||maxPages<1||maxPages>20) fail()
  const r=normalizePageRequest(options.request),pages=[]
  const base={trialId:r.trialId,now:r.now,state:r.state,receipt:r.receipt,pageSize:r.pageSize}
  let request=base,total=0,last=-1
  for(let i=0;i<maxPages;i++) {
    const page=checkPage(await options.readPage(request),request),first=pages[0]
    if(first && ['fingerprint','currentRevision','totalJobs','totalMatched'].some(k=>page[k]!==first[k])) fail('job_report_export_changed')
    for(const job of page.jobs) {if(job.revision<=last)fail();last=job.revision}
    total+=page.jobs.length;pages.push(page)
    if(total>page.totalMatched || (page.nextCursor && total>=page.totalMatched)) fail()
    if(!page.nextCursor) {
      if(total!==page.totalMatched) fail('job_report_export_incomplete')
      return {format:'synthetic-sql-job-export-v1',trialId:r.trialId,currentRevision:page.currentRevision,asOf:r.now,
        filters:page.filters,pageSize:r.pageSize,totalJobs:page.totalJobs,totalMatched:page.totalMatched,fingerprint:page.fingerprint,
        pages,complete:true,executionAllowed:false,productionReady:false}
    }
    request={...base,cursor:page.nextCursor}
  }
  fail('job_report_export_limit')
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const labels={all:'Toate stările',pending:'În așteptare',leased:'În lucru',lease_expired:'Drept expirat',superseded:'Revizie înlocuită',completed:'Confirmat'}
function section(page,title) {
  const rows=page.jobs.map(j=>`<tr><td>${j.revision}</td><td>${labels[j.state]}</td><td>${j.generation}</td><td>${j.leaseUntil??'—'}</td><td>${j.receiptPresent?'Da':'Nu'}</td></tr>`).join('')
  return `<section><h2>${escape(title)}</h2><p>Înregistrări pe această pagină: ${page.jobs.length} · Rezultate filtrate: ${page.totalMatched} · Joburi în trial: ${page.totalJobs}</p><div class="table"><table><thead><tr><th>Revizie</th><th>Stare</th><th>Generație</th><th>Termen sintetic (ms)</th><th>Rezultat salvat</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Niciun rezultat pentru filtrele alese.</td></tr>'}</tbody></table></div></section>`
}
function document(report,content,note) {
  const receipt={all:'Toate',present:'Prezent',missing:'Lipsă'}[report.filters.receipt]
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Raport joburi Demo — test</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#183047;background:#f4f7fa;margin:0;padding:24px}main{max-width:1000px;margin:auto}header,section{background:white;border:1px solid #dce4eb;border-radius:12px;padding:20px;margin-bottom:18px}h1{font-size:24px;margin:0 0 10px}h2{font-size:19px}p{overflow-wrap:anywhere}.notice{background:#fff4d6;padding:12px;border-radius:8px}.table{overflow-x:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #e5eaf0}th{background:#f0f5f9}@media(max-width:600px){body{padding:10px}header,section{padding:14px}th,td{padding:7px;font-size:13px}}@media print{body{background:white;padding:0}section{break-inside:avoid}}</style></head><body><main><header><h1>Joburi Demo — numai citire</h1><p class="notice">Prototip de test. ${escape(note)} Nu autorizează execuția și nu este interfață de producție.</p><p>Trial: ${escape(report.trialId)} · Revizie: ${report.currentRevision}<br>Moment sintetic: ${report.asOf} ms UTC · Stare: ${labels[report.filters.state]} · Rezultat salvat: ${receipt}</p></header>${content}</main></body></html>`
}
function renderJobReportPagePreview(page,request) {
  const checked=checkPage(page,request),r=normalizePageRequest(request)
  return document(checked,section(checked,r.afterRevision<0?'Pagina inițială':`Continuare după revizia ${r.afterRevision}`),
    checked.nextCursor?'Previzualizare parțială; există pagini următoare.':'Sfârșitul selecției; această pagină nu reprezintă automat întregul raport.')
}
async function renderJobReportExport(report) {
  if(report?.format!=='synthetic-sql-job-export-v1'||report.complete!==true||report.executionAllowed!==false||report.productionReady!==false||!Array.isArray(report.pages)||report.pages.length>20)fail()
  let index=0
  const checked=await collectJobReportExport({request:{trialId:report.trialId,now:report.asOf,...report.filters,pageSize:report.pageSize},
    maxPages:20,readPage:async()=>{if(index>=report.pages.length)fail();return report.pages[index++]}})
  if(index!==report.pages.length||['fingerprint','currentRevision','totalJobs','totalMatched'].some(k=>checked[k]!==report[k]))fail()
  return document(checked,checked.pages.map((page,i)=>section(page,`Pagina ${i+1} din ${checked.pages.length}`)).join(''),
    `Export complet al selecției · Înregistrări: ${checked.totalMatched} · Pagini consistente: ${checked.pages.length}.`)
}
module.exports={collectJobReportExport,renderJobReportPagePreview,renderJobReportExport,normalizeJobReportPageOutput:checkPage}
