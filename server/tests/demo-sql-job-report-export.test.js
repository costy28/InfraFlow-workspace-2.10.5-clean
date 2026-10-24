'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path')
const {prepareJobReportPage}=require('../../scripts/lib/demo-sql-job-report-page')
const {collectJobReportExport,renderJobReportPagePreview,renderJobReportExport}=require('../../scripts/lib/demo-sql-job-report-export')
const {createSqlTestTrialStore}=require('../core/demo-trial-sql-test-store')
const {createTrialSqlFixture}=require('./support/demo-trial-sql-fixture')
const trialId='11111111-1111-4111-8111-111111111111',request={trialId,now:3000,pageSize:1}
const row=revision=>({revision,generation:0,state:'pending',claimedAt:null,leaseUntil:null,completedAt:null,receiptPresent:false,firstEffectGeneration:null})
const qa=path.resolve(__dirname,'../../installer/output/qa')
async function mode(t){const old=process.env.NODE_ENV;process.env.NODE_ENV='test';t.after(()=>{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old})}
function fixturePages(){
  const source={trialId,currentRevision:2,fingerprint:'a'.repeat(64),totalJobs:3,totalMatched:3}
  const first=prepareJobReportPage({...source,jobs:[row(0),row(1)]},request)
  const second=prepareJobReportPage({...source,jobs:[row(1),row(2)]},{...request,cursor:first.nextCursor})
  const third=prepareJobReportPage({...source,jobs:[row(2)]},{...request,cursor:second.nextCursor})
  return [first,second,third]
}
const reader=pages=>{let i=0;return async()=>{assert.ok(i<pages.length);return pages[i++]}}
test('export: selecția completă are pagini numerotate și câmpuri strict permise',async t=>{
  await mode(t);const pages=fixturePages();pages[0].nonce='SECRET_NONCE';pages[0].jobs[0].worker='SECRET_WORKER'
  const report=await collectJobReportExport({request,readPage:reader(pages)})
  assert.equal(report.complete,true);assert.equal(report.pages.length,3);assert.equal(report.totalMatched,3)
  const html=await renderJobReportExport(report)
  assert.match(html,/Pagina 1 din 3/);assert.match(html,/Pagina 3 din 3/);assert.match(html,/Export complet al selecției/)
  assert.doesNotMatch(html+JSON.stringify(report),/SECRET_|<script|<form|<button|<input|https?:\/\//i)
  assert.equal(report.executionAllowed,false)
})
test('previzualizare: pagina parțială și continuarea nu sunt prezentate ca export integral',()=>{
  const pages=fixturePages()
  assert.match(renderJobReportPagePreview(pages[0],request),/Previzualizare parțială/)
  assert.match(renderJobReportPagePreview(pages[2],{...request,cursor:pages[1].nextCursor}),/Continuare după revizia 1/)
  assert.match(renderJobReportPagePreview(pages[2],{...request,cursor:pages[1].nextCursor}),/nu reprezintă automat întregul raport/)
})
test('export: amprente, totaluri, pagini duplicate și cursor greșit sunt refuzate',async t=>{
  await mode(t)
  for(const mutate of [p=>{p[1].fingerprint='b'.repeat(64)},p=>{p[1].totalJobs=4},p=>{p[1]=p[0]},p=>{p[0].nextCursor.afterRevision=1}]){
    const pages=fixturePages();mutate(pages)
    await assert.rejects(collectJobReportExport({request,readPage:reader(pages)}))
  }
})
test('export: final prematur, limită depășită și citire eșuată nu produc succes parțial',async t=>{
  await mode(t);let pages=fixturePages();pages[0].nextCursor=null
  await assert.rejects(collectJobReportExport({request,readPage:reader(pages)}),{code:'job_report_export_incomplete'})
  await assert.rejects(collectJobReportExport({request,maxPages:1,readPage:reader(fixturePages())}),{code:'job_report_export_limit'})
  let calls=0
  await assert.rejects(collectJobReportExport({request,readPage:async()=>{if(calls++)throw Object.assign(Error('changed'),{code:'job_report_changed'});return fixturePages()[0]}}),{code:'job_report_changed'})
})
test('export: selecția goală rămâne explicită și nu permite falsificarea autorității',async t=>{
  await mode(t);const page=prepareJobReportPage({trialId,currentRevision:2,fingerprint:'a'.repeat(64),totalJobs:3,totalMatched:0,jobs:[]},{...request,state:'leased'})
  const report=await collectJobReportExport({request:{...request,state:'leased'},readPage:reader([page])})
  assert.match(await renderJobReportExport(report),/Niciun rezultat/)
  await assert.rejects(renderJobReportExport({...report,executionAllowed:true}))
  await assert.rejects(collectJobReportExport({request:{...request,cursor:{}},readPage:()=>assert.fail()}))
})
test('export: runtime normal și opțiuni nesigure sunt refuzate',async t=>{
  await mode(t);process.env.NODE_ENV='production'
  await assert.rejects(collectJobReportExport({request,readPage:()=>assert.fail()}),{code:'synthetic_test_only'})
  process.env.NODE_ENV='test'
  await assert.rejects(collectJobReportExport({request,maxPages:21,readPage:()=>assert.fail()}))
  await assert.rejects(collectJobReportExport({request,path:'../other',readPage:()=>assert.fail()}))
})
test('Chrome: previzualizare statică desktop/mobil și captură fără resurse externe',{
  skip:!process.env.INFRAFLOW_PLAYWRIGHT_MODULE,timeout:60000,
},async t=>{
  await mode(t);const report=await collectJobReportExport({request,readPage:reader(fixturePages())}),html=await renderJobReportExport(report)
  const {chromium}=require(process.env.INFRAFLOW_PLAYWRIGHT_MODULE),browser=await chromium.launch({channel:'chrome',headless:true})
  t.after(()=>browser.close());await fs.mkdir(qa,{recursive:true})
  const page=await browser.newPage({viewport:{width:1100,height:900}}),requests=[]
  page.on('request',r=>requests.push(r.url()))
  await page.setContent(html,{waitUntil:'load'})
  assert.equal(await page.locator('section').count(),3);assert.equal(await page.locator('button,input,script,form').count(),0)
  await page.screenshot({path:path.join(qa,'demo-job-export-desktop.png'),fullPage:true})
  await page.setViewportSize({width:390,height:844})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true)
  assert.deepEqual(requests,[])
  await page.screenshot({path:path.join(qa,'demo-job-export-mobile.png'),fullPage:true})
  await fs.writeFile(path.join(qa,'demo-job-export-fixture.html'),html)
})
test('SQL real: export consistent, previzualizare și refuz dacă se schimbă jobul între pagini',{
  skip:process.env.INFRAFLOW_TEST_TRIAL_SQL!=='1',timeout:180000,
},async t=>{
  await mode(t);const fixture=await createTrialSqlFixture(),store=createSqlTestTrialStore(fixture)
  await store.initialize();await store.queue({id:trialId,approvalId:'export-test',now:1000})
  const command=(commandId,action,expectedRevision)=>({trialId,commandId,action,expectedRevision,now:1001,actor:{id:'controller',kind:'worker'}})
  await store.command(command('start','provision',0));await store.command(command('ready','ready',1))
  const before=await store.read()
  const report=await collectJobReportExport({request,readPage:r=>store.readJobReportPage(r)})
  assert.equal(report.pages.length,3);assert.equal(report.totalMatched,3)
  const html=await renderJobReportExport(report)
  assert.match(html,/Pagina 3 din 3/);assert.doesNotMatch(html,/export-test|controller|INFRAFLOW_TEST/)
  assert.deepEqual(await store.read(),before)
  await fs.mkdir(qa,{recursive:true})
  await fs.writeFile(path.join(qa,'demo-job-export-sql.html'),html)
  await fs.writeFile(path.join(qa,'demo-job-export-sql.json'),JSON.stringify(report,null,2))
  let calls=0
  await assert.rejects(collectJobReportExport({request,readPage:async r=>{
    if(calls++===1)await store.claimJob({trialId,workerId:'test-worker',now:2000,leaseMs:100})
    return store.readJobReportPage(r)
  }}),{code:'job_report_changed'})
})
