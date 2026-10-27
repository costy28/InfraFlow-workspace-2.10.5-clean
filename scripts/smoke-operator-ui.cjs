'use strict'
// Isolated browser smoke, fixture store only. HTTPS requests are intercepted, not a TLS deployment test.
const http=require('node:http'),assert=require('node:assert/strict')
const {chromium}=require('playwright')
const {createOperatorHttp}=require('../server/demo-platform/operator-http')
const {createOperatorAuth}=require('../server/demo-platform/operator-auth')
const {createTrialRegistration}=require('../server/demo-platform/trial-registration')
const {hashPassword,totpAtCounter}=require('../server/demo-platform/operator-credentials')
async function main(){
  const origin='https://operator.example.test',password='Fixture-only-password-123!',secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
  const passwordHash=await hashPassword(password),events=[];let counter=-1,attempts=0
  const runtime=createOperatorAuth({clock:()=>59000,store:{
    readOperator:async()=>({id:'11111111-1111-4111-8111-111111111111',username:'infraop',enabled:true,revision:1,passwordHash,totpSecret:secret,scopes:['trial:read','trial:queue','session:own']}),
    reserveAttempt:async()=>++attempts<=5,
    claimTotpCounter:async input=>{if(input.counter<=counter)return false;counter=input.counter;return true},
    appendAudit:async event=>events.push(event.action),
  }})
  const commands=[],ledger=new Map()
  const registration=createTrialRegistration({runtime,registrar:{queue:async input=>{
    commands.push(input)
    if(ledger.has(input.commandId))return ledger.get(input.commandId)
    ledger.set(input.commandId,{id:'22222222-2222-4222-8222-222222222222',state:'queued',revision:0,createdAt:'2026-10-27T10:00:00Z'})
    throw Error('simulated_lost_response_after_commit')
  }}})
  const handler=createOperatorHttp({runtime,registration,origin,trustLoopbackProxy:true,trialReader:{listTrials:async()=>({items:[{companyName:'<img src=x onerror=alert(1)>',state:'queued',createdAt:'2026-10-26T10:00:00Z',expiresAt:null}],total:1,limit:20,offset:0})}})
  const server=http.createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end('{}')}})
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  let browser
  try{
    browser=await chromium.launch({channel:'chrome',headless:true})
    const context=await browser.newContext(),page=await context.newPage(),errors=[]
    page.on('pageerror',error=>errors.push(error.message))
    await context.route(origin+'/**',async route=>{
      const request=route.request(),url=new URL(request.url())
      const result=await new Promise((resolve,reject)=>{
        const headers={...request.headers(),host:url.host,'x-forwarded-proto':'https'}
        delete headers['content-length']
        const req=http.request({host:'127.0.0.1',port:server.address().port,path:url.pathname+url.search,method:request.method(),headers},res=>{
          const parts=[];res.on('data',c=>parts.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(parts)}))
        });req.on('error',reject);req.end(request.postDataBuffer()??undefined)
      })
      const headers={};for(const [key,value]of Object.entries(result.headers))if(value!==undefined)headers[key]=Array.isArray(value)?value.join('\n'):String(value)
      await route.fulfill({status:result.status,headers,body:result.body})
    })
    await page.goto(origin+'/operator')
    await page.locator('#login').waitFor({state:'visible'})
    await page.locator('#username').fill('infraop');await page.locator('#password').fill(password)
    await page.locator('#code').fill(totpAtCounter(secret,1));await page.getByRole('button',{name:'Autentificare',exact:true}).click()
    await page.locator('#session').waitFor({state:'visible'})
    await page.locator('#companies td').first().waitFor()
    assert.equal(await page.locator('#companies td').first().textContent(),'<img src=x onerror=alert(1)>')
    assert.equal(await page.locator('#companies img').count(),0)
    const cookie=(await context.cookies()).find(c=>c.name==='__Host-infraflow_operator')
    assert.ok(cookie?.secure&&cookie.httpOnly&&cookie.sameSite==='Strict')
    assert.equal(await page.locator('#password').inputValue(),'')
    assert.equal(await page.locator('#code').inputValue(),'')
    assert.equal(await page.evaluate(()=>document.cookie.includes('__Host-infraflow_operator')),false)
    assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0)
    await page.reload();await page.locator('#session').waitFor({state:'visible'})
    await page.locator('#registration').waitFor({state:'visible'})
    assert.equal(commands.length,0)
    await page.locator('#approval').fill('fixture:lead-1');await page.locator('#company-name').fill('Fixture New SRL')
    await page.locator('#register-confirm').check();await page.locator('#register-submit').click()
    await page.waitForFunction(()=>document.getElementById('register-message').textContent.includes('Rezultat neconfirmat'))
    assert.equal(ledger.size,1);assert.equal(commands.length,1)
    const commandId=await page.locator('#command-id').inputValue();assert.match(commandId,/^queue:/)
    await page.getByRole('button',{name:'Reia explicit aceeași comandă'}).click()
    await page.waitForFunction(()=>document.getElementById('register-message').textContent.includes('Compania a fost înscrisă'))
    assert.equal(commands.length,2);assert.equal(ledger.size,1);assert.deepEqual(commands[0],commands[1])
    await page.getByRole('button',{name:'Ieșire din sesiune'}).click()
    await page.locator('#login').waitFor({state:'visible'})
    await page.reload();await page.locator('#login').waitFor({state:'visible'})
    await page.setViewportSize({width:390,height:844})
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth))
    assert.deepEqual(errors,[]);assert.equal(attempts,1);assert.ok(events.includes('session.logout'))
    console.log('OPERATOR_UI_BROWSER_SMOKE_OK: login, reload, explicit registration retry with same command/no duplicate, logout, mobile; fixture only, no VPS/TLS validation')
  }finally{runtime.shutdown();await browser?.close();await new Promise(r=>server.close(r))}
}
main().catch(()=>{console.error('OPERATOR_UI_BROWSER_SMOKE_FAILED');process.exitCode=1})
