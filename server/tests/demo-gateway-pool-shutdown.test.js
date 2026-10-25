'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http')
const model=require('../../scripts/lib/demo-trial-registry')
const {createDemoGatewayHttpHarness}=require('./support/demo-gateway-http-harness')
const {createSqlProcessPool}=require('./support/demo-sql-process-pool')
const {createGatewayPoolLifecycle}=require('./support/demo-gateway-pool-lifecycle')
const {runOwnedSqlProcess}=require('./support/demo-owned-sql-process')
const A='11111111-1111-4111-8111-111111111111'
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const tick=()=>new Promise(r=>setImmediate(r))
async function fixture(t,phase='authorize'){
  const old=process.env.NODE_ENV;process.env.NODE_ENV='test'
  t.after(()=>{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old})
  let registry=model.queueTrial(model.createRegistry(),{id:A,approvalId:A,now:1000})
  for(const [action,kind,expectedRevision]of [['provision','worker',0],['ready','worker',1],['activate','activation_agent',2]])
    registry=model.applyCommand(registry,{trialId:A,commandId:action,action,expectedRevision,actor:{id:'test',kind},now:1001})
  const snapshot={registry,bindings:[{host:'a.demo.test',trialId:A,runtimeKey:A,revision:3}]}
  const active=deferred(),queued=deferred(),closed=deferred(),runtimeStarted=deferred(),runtimeRelease=deferred(),started=[],gate=deferred()
  let hits=0,sequence=0,signal,ownedProcess,ownedClosed=false
  const pool=createSqlProcessPool({maxActive:1,queueTimeoutMs:2000,execute:({id,signal:ownSignal})=>{
    started.push(id);signal=ownSignal
    if(phase==='process'){
      const env={};for(const key of ['SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE'])if(process.env[key])env[key]=process.env[key]
      return runOwnedSqlProcess({script:'Start-Sleep -Seconds 2; [Console]::Write(1)',env,signal:ownSignal,onProcess:child=>{
        ownedProcess=child;child.once('close',()=>{ownedClosed=true});child.once('spawn',()=>active.resolve())
      }})
    }
    active.resolve();return closed.promise
  }})
  async function listen(server){await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections()}));return server}
  const runtime=await listen(http.createServer(async(req,res)=>{
    hits++;runtimeStarted.resolve();if(phase==='runtime')await runtimeRelease.promise
    if(!res.destroyed)res.end(JSON.stringify({format:'synthetic-runtime-probe-v1',trialId:A,marker:'runtime-A'}))
  }))
  const handler=createDemoGatewayHttpHarness({runtimes:new Map([[A,runtime]]),clock:()=>2000,requestTimeoutMs:5000,
    readSnapshot:async({signal:ownSignal})=>{
      if(phase==='snapshot'){signal=ownSignal;active.resolve();await gate.promise}return snapshot
    },
    authorizeRequest:({signal:ownSignal})=>{
      if(!['authorize','process'].includes(phase))return true
      const id=++sequence,work=pool.run({id,signal:ownSignal});if(id===2)queued.resolve();return work
    },
  })
  const server=await listen(http.createServer(handler)),lifecycle=createGatewayPoolLifecycle({gateway:handler,pool})
  const get=()=>new Promise((resolve,reject)=>{
    const req=http.get({hostname:'127.0.0.1',port:server.address().port,path:'/synthetic-probe',headers:{Host:'a.demo.test'}},res=>{
      let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}))
    });req.on('error',reject);t.after(()=>req.destroy())
  })
  t.after(()=>{closed.resolve(true);runtimeRelease.resolve();gate.resolve(snapshot)})
  return {get,lifecycle,handler,pool,active:active.promise,queued:queued.promise,closed,gate,started,hits:()=>hits,signal:()=>signal,runtimeStarted:runtimeStarted.promise,runtimeRelease,owned:()=>({child:ownedProcess,closed:ownedClosed})}
}
test('oprire coordonată: coadă și cereri noi refuzate; confirmarea așteaptă activa',{timeout:10000},async t=>{
  const f=await fixture(t),a=f.get();await f.active
  const b=f.get();await f.queued
  const stop=f.lifecycle.shutdown();assert.equal(f.lifecycle.shutdown(),stop)
  assert.equal(f.signal().aborted,true)
  assert.equal((await f.get()).status,503)
  assert.equal((await a).status,503);assert.equal((await b).status,503)
  let finished=false;stop.then(()=>{finished=true});await tick();assert.equal(finished,false)
  f.closed.reject(Object.assign(Error('synthetic_sql_aborted'),{code:'synthetic_sql_aborted'}));await stop
  assert.deepEqual(f.started,[1]);assert.equal(f.hits(),0);assert.equal(f.lifecycle.status().state,'closed')
  assert.equal(f.handler.status().activeRequests,0);assert.equal(f.pool.status().active,0)
})
test('oprire coordonată: snapshot întârziat nu produce conectare după închidere',{timeout:10000},async t=>{
  const f=await fixture(t,'snapshot'),request=f.get();await f.active
  await f.lifecycle.shutdown();assert.equal((await request).status,503)
  f.gate.resolve();await tick();assert.equal(f.hits(),0);assert.equal(f.handler.status().state,'closed')
})
test('oprire coordonată: upstream existent închis fără livrarea conținutului',{timeout:10000},async t=>{
  const f=await fixture(t,'runtime'),request=f.get();await f.runtimeStarted
  await f.lifecycle.shutdown();assert.equal((await request).status,503)
  assert.equal(f.handler.status().upstreams,0);assert.equal(f.hits(),1)
  f.runtimeRelease.resolve();await tick();assert.deepEqual(await f.get(),{status:503,body:{code:'gateway_closed'}})
})
test('oprire coordonată: așteaptă close al procesului PowerShell propriu anulat',{
  skip:process.platform!=='win32',timeout:15000,
},async t=>{
  const f=await fixture(t,'process'),request=f.get();await f.active
  await f.lifecycle.shutdown();assert.equal((await request).status,503)
  assert.equal(f.owned().closed,true);assert.equal(f.owned().child.killed,true)
  assert.equal(f.pool.status().active,0);assert.equal(f.hits(),0)
})
