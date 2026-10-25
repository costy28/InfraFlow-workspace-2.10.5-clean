'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http')
const model=require('../../scripts/lib/demo-trial-registry')
const {createSqlProcessPool}=require('./support/demo-sql-process-pool')
const {createDemoGatewayHttpHarness}=require('./support/demo-gateway-http-harness')
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222'
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
async function fixture(t,{maxQueued=1,queueTimeoutMs=500}={}){
  const old=process.env.NODE_ENV;process.env.NODE_ENV='test'
  t.after(()=>{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old})
  let registry=model.createRegistry()
  for(const id of [A,B]){
    registry=model.queueTrial(registry,{id,approvalId:id,now:1000})
    for(const [action,kind,expectedRevision]of [['provision','worker',0],['ready','worker',1],['activate','activation_agent',2]])
      registry=model.applyCommand(registry,{trialId:id,commandId:action,action,expectedRevision,actor:{id:'test',kind},now:1001})
  }
  const snapshot={registry,bindings:registry.trials.map((r,i)=>({host:i?'b.demo.test':'a.demo.test',trialId:r.id,runtimeKey:r.id,revision:r.revision}))}
  const blocked=deferred(),started=deferred(),queued=deferred(),queueAborted=deferred(),executed=[],hits={A:0,B:0}
  let sequence=0
  const pool=createSqlProcessPool({maxActive:1,maxQueued,queueTimeoutMs,execute:({id})=>{
    executed.push(id)
    if(id===1){started.resolve();return blocked.promise}
    return true
  }})
  async function listen(server){await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections()}));return server}
  const runtimes=new Map()
  for(const [side,id]of [['A',A],['B',B]])runtimes.set(id,await listen(http.createServer((req,res)=>{
    hits[side]++;res.end(JSON.stringify({format:'synthetic-runtime-probe-v1',trialId:id,marker:'runtime-'+side}))
  })))
  const gateway=await listen(http.createServer(createDemoGatewayHttpHarness({clock:()=>2000,readSnapshot:async()=>snapshot,runtimes,requestTimeoutMs:5000,
    authorizeRequest:({signal})=>{
      const id=++sequence,work=pool.run({id,signal})
      if(id===2){signal.addEventListener('abort',()=>queueAborted.resolve(),{once:true});queued.resolve()}
      return work
    },
  })))
  const get=(side='A')=>{
    const response=deferred()
    const req=http.get({hostname:'127.0.0.1',port:gateway.address().port,path:'/synthetic-probe',headers:{Host:side.toLowerCase()+'.demo.test'}},res=>{
      let body='';res.on('data',c=>body+=c);res.on('end',()=>response.resolve({status:res.statusCode,body:JSON.parse(body)}))
    });req.on('error',e=>response.resolve({error:e.code}));t.after(()=>req.destroy())
    return {response:response.promise,abort:()=>req.destroy()}
  }
  t.after(()=>blocked.resolve(true))
  return {get,blocked,started:started.promise,queued:queued.promise,queueAborted:queueAborted.promise,pool,executed,hits}
}
test('HTTP suprasarcină: plin și coadă expirată dau 503; A activ rămâne, B revine după eliberare',{timeout:10000},async t=>{
  const f=await fixture(t),a=f.get();await f.started
  const waiting=f.get('B');await f.queued
  assert.deepEqual(await f.get('B').response,{status:503,body:{code:'gateway_unavailable'}})
  assert.deepEqual(await waiting.response,{status:503,body:{code:'gateway_unavailable'}})
  assert.deepEqual(f.hits,{A:0,B:0});assert.deepEqual(f.executed,[1]);assert.equal(f.pool.status().active,1)
  f.blocked.resolve(true);assert.equal((await a.response).status,200)
  const b=await f.get('B').response;assert.equal(b.status,200);assert.equal(b.body.trialId,B)
  assert.deepEqual(f.hits,{A:1,B:1});assert.ok(!f.executed.includes(2));assert.ok(!f.executed.includes(3))
  assert.equal(f.pool.status().active,0);assert.equal(f.pool.status().queued,0)
})
test('HTTP suprasarcină: client anulat în coadă nu execută; capacitatea este reutilizabilă',{timeout:10000},async t=>{
  const f=await fixture(t,{queueTimeoutMs:2000}),a=f.get();await f.started
  const abandoned=f.get('B');await f.queued;abandoned.abort();await f.queueAborted
  assert.equal(f.pool.status().queued,0)
  const b=f.get('B');f.blocked.resolve(true)
  assert.equal((await a.response).status,200);assert.equal((await b.response).status,200)
  assert.ok(!f.executed.includes(2));assert.deepEqual(f.hits,{A:1,B:1});assert.equal(f.pool.status().active,0)
})
test('HTTP suprasarcină: eroarea activei eliberează locul pentru vecin',{timeout:10000},async t=>{
  const f=await fixture(t,{queueTimeoutMs:2000}),a=f.get();await f.started
  const b=f.get('B');await f.queued;f.blocked.reject(Error('PRIVATE_EXECUTOR_ERROR'))
  assert.deepEqual(await a.response,{status:503,body:{code:'gateway_unavailable'}})
  assert.equal((await b.response).status,200);assert.deepEqual(f.hits,{A:0,B:1});assert.equal(f.pool.status().active,0)
})
test('HTTP suprasarcină: fără coadă, refuz imediat și revenire după finalizare',{timeout:10000},async t=>{
  const f=await fixture(t,{maxQueued:0}),a=f.get();await f.started
  assert.equal((await f.get('B').response).status,503);assert.equal(f.pool.status().queued,0)
  f.blocked.resolve(true);assert.equal((await a.response).status,200)
  assert.equal((await f.get('B').response).status,200);assert.deepEqual(f.hits,{A:1,B:1})
})
