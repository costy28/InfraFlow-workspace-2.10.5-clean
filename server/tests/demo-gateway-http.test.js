'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http')
const model=require('../../scripts/lib/demo-trial-registry')
const {createDemoGatewayHttpHarness}=require('./support/demo-gateway-http-harness')
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222'
async function fixture(t, options={}) {
  const old=process.env.NODE_ENV;process.env.NODE_ENV='test'
  t.after(()=>{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old})
  let registry=model.createRegistry(), now=1002
  for(const id of [A,B]){
    registry=model.queueTrial(registry,{id,approvalId:id,now:1000})
    for(const [action,kind,expectedRevision] of [['provision','worker',0],['ready','worker',1],['activate','activation_agent',2]])
      registry=model.applyCommand(registry,{trialId:id,commandId:action,action,expectedRevision,actor:{id:'test',kind},now:1001})
  }
  const snapshot={registry,bindings:registry.trials.map((trial,i)=>({host:i?'b.demo.test':'a.demo.test',trialId:trial.id,revision:trial.revision,runtimeKey:trial.id}))}
  const hits={A:0,B:0},received=[]
  async function listen(server){
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
    t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()}));return server
  }
  const make=async(side,id)=>listen(http.createServer(async(req,res)=>{
    hits[side]++;received.push(req.headers)
    if(options.onRuntime)await options.onRuntime({side,snapshot,setTime:value=>{now=value}})
    if(options.silent)return
    if(options.redirect){res.writeHead(302,{Location:'http://never-contact.invalid/'});return res.end()}
    res.setHeader('Content-Type','application/json');res.setHeader('Set-Cookie','unsafe=test; Domain=demo.test')
    res.end(JSON.stringify(options.oversized?{data:'x'.repeat(5000)}:{format:'synthetic-runtime-probe-v1',trialId:id,marker:'runtime-'+side}))
  }))
  const a=await make('A',A),b=await make('B',B)
  const targets=new Map([[A,options.swap?b:a],[B,b]])
  const gateway=await listen(http.createServer(createDemoGatewayHttpHarness({runtimes:targets,clock:()=>now,readSnapshot:async()=>snapshot})))
  const get=(host='a.demo.test',path='/synthetic-probe',extra={})=>new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:gateway.address().port,path,headers:{Host:host,...extra}},res=>{
      let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body),headers:res.headers}))
    });req.on('error',reject);req.end()
  })
  return {get,hits,received,a,b,snapshot,time:value=>{now=value}}
}
test('HTTP gateway: A ajunge numai la A, B numai la B; fără propagare cookie/autoritate',async t=>{
  const f=await fixture(t)
  const a=await f.get('a.demo.test',undefined,{Cookie:'session=PRIVATE',Authorization:'Bearer PRIVATE'})
  const b=await f.get('b.demo.test')
  assert.equal(a.status,200);assert.equal(a.body.trialId,A);assert.equal(a.body.marker,'runtime-A')
  assert.equal(b.status,200);assert.equal(b.body.trialId,B);assert.equal(b.body.marker,'runtime-B')
  assert.deepEqual(f.hits,{A:1,B:1})
  assert.ok(f.received.every(h=>!h.cookie&&!h.authorization&&!h['x-forwarded-host']))
  assert.equal(a.headers['set-cookie'],undefined);assert.equal(a.body.productionReady,false)
})
test('HTTP gateway: refuz înainte de conectare pentru necunoscut, expirat și selectors',async t=>{
  const f=await fixture(t)
  assert.equal((await f.get('unknown.demo.test')).status,404)
  assert.equal((await f.get('a.demo.test','/synthetic-probe?url=http://127.0.0.1')).status,400)
  assert.equal((await f.get('a.demo.test',undefined,{'X-Forwarded-Host':'b.demo.test'})).status,400)
  f.time(f.snapshot.registry.trials[0].expiresAt)
  assert.equal((await f.get()).status,404);assert.deepEqual(f.hits,{A:0,B:0})
})
test('HTTP gateway: destinație legată greșit nu divulgă răspunsul vecinului',async t=>{
  const f=await fixture(t,{swap:true}),response=await f.get()
  assert.equal(response.status,503);assert.deepEqual(response.body,{code:'gateway_unavailable'})
  assert.deepEqual(f.hits,{A:0,B:1})
})
test('HTTP gateway: runtime oprit nu folosește B ca fallback',async t=>{
  const f=await fixture(t);await new Promise(resolve=>f.a.close(resolve))
  assert.equal((await f.get()).status,503);assert.deepEqual(f.hits,{A:0,B:0})
})
test('HTTP gateway: runtime fără răspuns este oprit la termen, fără fallback',async t=>{
  const f=await fixture(t,{silent:true}),response=await f.get()
  assert.equal(response.status,503);assert.deepEqual(response.body,{code:'gateway_unavailable'})
  assert.deepEqual(f.hits,{A:1,B:0})
})
test('HTTP gateway: expirarea în timpul răspunsului blochează divulgarea',async t=>{
  const f=await fixture(t,{onRuntime:({snapshot,setTime})=>setTime(snapshot.registry.trials[0].expiresAt)})
  const response=await f.get();assert.equal(response.status,404);assert.deepEqual(response.body,{code:'route_unavailable'})
  assert.deepEqual(f.hits,{A:1,B:0})
})
test('HTTP gateway: redirect și răspuns prea mare nu sunt transmise',async t=>{
  for(const options of [{redirect:true},{oversized:true}]){
    await t.test(options.redirect?'redirect':'response limit',async sub=>{
      const f=await fixture(sub,options),response=await f.get()
      assert.equal(response.status,503);assert.deepEqual(response.body,{code:'gateway_unavailable'})
      assert.equal(response.headers.location,undefined);assert.equal(f.hits.B,0)
    })
  }
})
test('HTTP gateway: schimbarea legării în timpul răspunsului este refuzată',async t=>{
  const f=await fixture(t,{onRuntime:({snapshot})=>{snapshot.bindings[0].revision++}})
  assert.deepEqual((await f.get()).body,{code:'gateway_unavailable'})
  assert.deepEqual(f.hits,{A:1,B:0})
})
test('gateway HTTP: construcția este refuzată în afara testelor',()=>{
  const old=process.env.NODE_ENV;process.env.NODE_ENV='production'
  try{assert.throws(()=>createDemoGatewayHttpHarness({}),/synthetic_test_only/)}
  finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old}
})
