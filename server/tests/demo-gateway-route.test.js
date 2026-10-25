'use strict'
const test = require('node:test'), assert = require('node:assert/strict'), http = require('node:http')
const model = require('../../scripts/lib/demo-trial-registry')
const { normalizeGatewayHost, resolveDemoRoute } = require('../../scripts/lib/demo-gateway-route')
const { createDemoGatewayRouteHarness } = require('./support/demo-gateway-route-harness')
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222'
function mode(t) {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'test'
  t.after(() => { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old })
}
function fixture() {
  let registry = model.createRegistry()
  for (const id of [A,B]) {
    registry = model.queueTrial(registry, { id, approvalId: id, now: 1000 })
    for (const [action, kind, expectedRevision] of [['provision','worker',0],['ready','worker',1],['activate','activation_agent',2]])
      registry = model.applyCommand(registry, { trialId: id, commandId: action, action, expectedRevision, actor: { id:'test', kind }, now: 1001 })
  }
  const bindings = registry.trials.map((t,i) => ({ host: i ? 'b.demo.test' : 'a.demo.test', trialId: t.id, revision: t.revision, runtimeKey: t.resources.runtimeKey }))
  return { registry, bindings }
}
test('gateway: host strict, fără port, cale sau adresă upstream', () => {
  assert.equal(normalizeGatewayHost('A.DEMO.TEST'), 'a.demo.test')
  for (const host of ['', 'a.demo.test:4180','a.demo.test.',' a.demo.test','a..test','a.test/path','a.test@127.0.0.1','a_test.test','*.test','a.test\r\n'])
    assert.throws(() => normalizeGatewayHost(host), { code:'invalid_gateway_host' })
})
test('gateway: A și B se rezolvă numai prin registru; ieșire fără secrete și fără mutație', t => {
  mode(t); const f = fixture(), before = structuredClone(f)
  assert.equal(resolveDemoRoute({ ...f, host:'a.demo.test', now:1002 }).runtimeKey, A)
  assert.equal(resolveDemoRoute({ ...f, host:'b.demo.test', now:1002 }).runtimeKey, B)
  assert.equal(resolveDemoRoute({ ...f, host:'a.demo.test', now:1002 }).productionReady, false)
  assert.deepEqual(f, before)
  assert.throws(() => resolveDemoRoute({ ...f, host:'unknown.demo.test', now:1002 }), { code:'gateway_route_denied' })
})
test('gateway: expirare exactă fără reconciliere și activare viitoare refuzate', t => {
  mode(t); const f = fixture(), trial = f.registry.trials[0]
  assert.equal(resolveDemoRoute({ ...f, host:'a.demo.test', now:trial.expiresAt-1 }).trialId,A)
  for (const now of [trial.activatedAt-1,trial.expiresAt,trial.expiresAt+1])
    assert.throws(() => resolveDemoRoute({ ...f, host:'a.demo.test', now }), { code:'gateway_route_denied' })
})
test('gateway: stări neactive, legare greșită, duplicat și revizie veche sunt refuzate', t => {
  mode(t)
  for (const mutation of [f=>f.bindings.push({...f.bindings[0],host:'A.DEMO.TEST'}),f=>f.bindings[0].runtimeKey=B,
    f=>f.bindings[0].revision--,f=>f.bindings[0].url='http://external.test',f=>f.bindings[0].trialId=B]) {
    const f=fixture();mutation(f);assert.throws(()=>resolveDemoRoute({...f,host:'a.demo.test',now:1002}))
  }
  for (const state of ['queued','provisioning','awaiting_activation','expired','purge_pending','purging','deleted']) {
    const f=fixture();f.registry.trials[0].state=state
    assert.throws(()=>resolveDemoRoute({...f,host:'a.demo.test',now:1002}))
  }
})
async function serverFixture(t) {
  mode(t); let snapshot=fixture(), now=1002, reads=0, failure=false
  const server=http.createServer(createDemoGatewayRouteHarness({readSnapshot:async()=>{reads++;if(failure)throw Error('SECRET');return snapshot},clock:()=>now}))
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()}))
  const get=(host='a.demo.test',url='/route-probe',extra={})=>new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:url,headers:{Host:host,...extra}},res=>{
      let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}))
    });req.on('error',reject);req.end()
  })
  const duplicateHost=()=>new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:'/route-probe',
      headers:['Host','a.demo.test','Host','b.demo.test']},res=>{
      res.resume();res.on('end',()=>resolve(res.statusCode))
    });req.on('error',reject);req.end()
  })
  return {get,duplicateHost,snapshot,reads:()=>reads,time:value=>{now=value},fail:()=>{failure=true}}
}
test('HTTP gateway: host necunoscut/expirat, selectors și forwarded spoofing refuzate', async t => {
  const f=await serverFixture(t)
  assert.equal((await f.get()).body.trialId,A)
  assert.equal((await f.get('b.demo.test')).body.trialId,B)
  assert.equal((await f.get('unknown.demo.test')).status,404)
  const before=f.reads()
  for(const [url,extra] of [['/route-probe?port=4180',{}],['/route-probe?trialId='+B,{}],['/route-probe',{'X-Forwarded-Host':'b.demo.test'}],['/route-probe',{Forwarded:'host=b.demo.test'}]])
    assert.equal((await f.get('a.demo.test',url,extra)).status,400)
  assert.equal(f.reads(),before)
  assert.equal(await f.duplicateHost(),400);assert.equal(f.reads(),before)
  f.time(f.snapshot.registry.trials[0].expiresAt);assert.equal((await f.get()).status,404)
})
test('HTTP gateway: registru indisponibil sau legare nevalidă nu produce fallback', async t => {
  const f=await serverFixture(t);f.snapshot.bindings[0].runtimeKey=B
  assert.deepEqual(await f.get(),{status:503,body:{code:'gateway_unavailable'}})
  f.fail();assert.deepEqual(await f.get(),{status:503,body:{code:'gateway_unavailable'}})
})
test('gateway: runtime normal refuzat', () => {
  assert.throws(()=>resolveDemoRoute({}),{code:'synthetic_test_only'})
  assert.throws(()=>createDemoGatewayRouteHarness({}),/synthetic_test_only/)
})
