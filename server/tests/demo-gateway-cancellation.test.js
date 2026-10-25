'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http')
const model=require('../../scripts/lib/demo-trial-registry')
const {createDemoGatewayHttpHarness}=require('./support/demo-gateway-http-harness')
const A='11111111-1111-4111-8111-111111111111'
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
async function fixture(t,{kind,at=1,deadline=100}){
  const old=process.env.NODE_ENV;process.env.NODE_ENV='test'
  t.after(()=>{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old})
  let registry=model.queueTrial(model.createRegistry(),{id:A,approvalId:A,now:1000})
  for(const [action,actorKind,expectedRevision]of [['provision','worker',0],['ready','worker',1],['activate','activation_agent',2]])
    registry=model.applyCommand(registry,{trialId:A,commandId:action,action,expectedRevision,actor:{id:'test',kind:actorKind},now:1001})
  const snapshot={registry,bindings:[{host:'a.demo.test',trialId:A,runtimeKey:A,revision:3}]}
  const gate=deferred(),started=deferred(),aborted=deferred(),runtimeClosed=deferred()
  let hits=0,snapshots=0,authorizations=0,requestSignal
  async function listen(server){await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections()}));return server}
  const runtime=await listen(http.createServer(async(req,res)=>{
    hits++;res.on('close',()=>runtimeClosed.resolve())
    if(kind==='runtime')await block(requestSignal)
    if(!res.destroyed)res.end(JSON.stringify({format:'synthetic-runtime-probe-v1',trialId:A,marker:'runtime-A'}))
  }))
  const block=async signal=>{
    signal.addEventListener('abort',()=>aborted.resolve(signal.reason),{once:true})
    started.resolve(signal);await gate.promise
  }
  const gateway=await listen(http.createServer(createDemoGatewayHttpHarness({clock:()=>2000,runtimes:new Map([[A,runtime]]),requestTimeoutMs:deadline,
    readSnapshot:async({signal})=>{requestSignal=signal;snapshots++;if(kind==='snapshot'&&snapshots===at)await block(signal);return snapshot},
    authorizeRequest:async({signal})=>{authorizations++;if(kind==='authorize'&&authorizations===at)await block(signal);return true},
  })))
  const response=deferred()
  const req=http.get({hostname:'127.0.0.1',port:gateway.address().port,path:'/synthetic-probe',headers:{Host:'a.demo.test'}},res=>{
    let body='';res.on('data',c=>body+=c);res.on('end',()=>response.resolve({status:res.statusCode,body:JSON.parse(body)}))
  })
  req.on('error',error=>response.resolve({error:error.code}))
  t.after(()=>req.destroy())
  await started.promise
  return {gate,response:response.promise,aborted:aborted.promise,runtimeClosed:runtimeClosed.promise,abort:()=>req.destroy(),hits:()=>hits,snapshots:()=>snapshots,authorizations:()=>authorizations}
}
const flush=()=>new Promise(r=>setTimeout(r,40))
test('deadline: snapshot lent produce 504; rezolvarea târzie nu pornește upstream',async t=>{
  const f=await fixture(t,{kind:'snapshot'})
  assert.deepEqual(await f.response,{status:504,body:{code:'gateway_request_timeout'}})
  assert.equal((await f.aborted).code,'gateway_request_timeout')
  f.gate.resolve();await flush();assert.equal(f.hits(),0);assert.equal(f.authorizations(),0)
})
test('deadline: autorizare inițială lentă produce 504, fără conectare târzie',async t=>{
  const f=await fixture(t,{kind:'authorize'})
  assert.equal((await f.response).status,504);f.gate.resolve();await flush()
  assert.equal(f.hits(),0);assert.equal(f.snapshots(),1)
})
test('deadline: autorizare finală lentă nu divulgă răspunsul bufferizat',async t=>{
  const f=await fixture(t,{kind:'authorize',at:2})
  assert.deepEqual(await f.response,{status:504,body:{code:'gateway_request_timeout'}})
  f.gate.resolve();await flush();assert.equal(f.hits(),1)
})
test('client închis în citirea snapshotului: AbortSignal și fără conectare ulterioară',async t=>{
  const f=await fixture(t,{kind:'snapshot',deadline:1000});f.abort()
  assert.equal((await f.aborted).code,'gateway_client_closed')
  f.gate.resolve();await flush();assert.equal(f.hits(),0);assert.equal(f.authorizations(),0)
})
test('client închis în autorizare: finalizarea târzie nu pornește runtime-ul',async t=>{
  const f=await fixture(t,{kind:'authorize',deadline:1000});f.abort()
  assert.equal((await f.aborted).code,'gateway_client_closed')
  f.gate.resolve();await flush();assert.equal(f.hits(),0)
})
test('respingere târzie după timeout este consumată, fără răspuns sau conectare nouă',async t=>{
  const f=await fixture(t,{kind:'snapshot'})
  assert.equal((await f.response).status,504)
  f.gate.reject(Error('SECRET_LATE_ERROR'));await flush();assert.equal(f.hits(),0)
})
test('client închis după conectare: conexiunea upstream este închisă', {timeout:5000},async t=>{
  const f=await fixture(t,{kind:'runtime',deadline:1000});f.abort()
  assert.equal((await f.aborted).code,'gateway_client_closed');await f.runtimeClosed
  f.gate.resolve();await flush();assert.equal(f.hits(),1)
})
