'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http')
const model=require('../../scripts/lib/demo-trial-registry')
const {resolveDemoRoute}=require('../../scripts/lib/demo-gateway-route')
const {createInstanceSessions,createDemoGatewaySessionHarness}=require('./support/demo-instance-session')
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222'
async function fixture(t,onRuntime) {
  const old=process.env.NODE_ENV;process.env.NODE_ENV='test'
  t.after(()=>{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old})
  let registry=model.createRegistry(),now=1002
  for(const id of [A,B]){
    registry=model.queueTrial(registry,{id,approvalId:id,now:1000})
    for(const [action,kind,expectedRevision] of [['provision','worker',0],['ready','worker',1],['activate','activation_agent',2]])
      registry=model.applyCommand(registry,{trialId:id,commandId:action,action,expectedRevision,actor:{id:'test',kind},now:1001})
  }
  const snapshot={registry,bindings:registry.trials.map((t,i)=>({host:i?'b.demo.test':'a.demo.test',trialId:t.id,runtimeKey:t.id,revision:t.revision}))}
  const route=host=>resolveDemoRoute({...snapshot,host,now})
  const sessions=createInstanceSessions({clock:()=>now}),tokens={},generations={}
  const hits={A:0,B:0},received=[]
  async function listen(server){await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections()}));return server}
  const runtimes=new Map()
  const makeRuntime=(side,id)=>listen(http.createServer((req,res)=>{
    hits[side]++;received.push(req.headers)
    if(onRuntime)onRuntime({sessions,tokens,time:n=>{now=n},replaceRuntime})
    res.end(JSON.stringify({format:'synthetic-runtime-probe-v1',trialId:id,marker:'runtime-'+side}))
  }))
  for(const [side,id]of [['A',A],['B',B]]){
    const server=await makeRuntime(side,id);runtimes.set(id,server)
    generations[side]=sessions.replaceRuntime(route(side.toLowerCase()+'.demo.test'),server).generation
    tokens[side]=sessions.issue(route(side.toLowerCase()+'.demo.test'),100)
  }
  const makeGateway=()=>listen(http.createServer(createDemoGatewaySessionHarness({sessions,runtimes,clock:()=>now,readSnapshot:async()=>snapshot})))
  let gateway=await makeGateway()
  async function replaceRuntime(side,expected=generations[side],rebind=true){
    const id=side==='A'?A:B,server=await makeRuntime(side,id),old=runtimes.get(id)
    const next=sessions.replaceRuntime(route(side.toLowerCase()+'.demo.test'),server,expected)
    generations[side]=next.generation;runtimes.set(id,server)
    if(rebind){const previous=gateway;gateway=await makeGateway();await new Promise(r=>previous.close(r))}
    return {old,server,generation:next.generation}
  }
  const get=(host='a.demo.test',token=tokens.A.token,extra={})=>new Promise((resolve,reject)=>{
    const headers={Host:host,...(token===null?{}:{Cookie:'demo_probe_session='+token}),...extra}
    const req=http.request({hostname:'127.0.0.1',port:gateway.address().port,path:'/synthetic-probe',headers},res=>{
      let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body),headers:res.headers}))
    });req.on('error',reject);req.end()
  })
  return {sessions,tokens,hits,received,get,route,time:n=>{now=n},snapshot,replaceRuntime,generations,runtimes,makeRuntime}
}
test('sesiuni: A/B merg numai pe instanța proprie; tokenul nu ajunge la runtime sau în răspuns',async t=>{
  const f=await fixture(t)
  assert.equal((await f.get()).status,200);assert.equal((await f.get('b.demo.test',f.tokens.B.token)).status,200)
  assert.equal((await f.get('b.demo.test')).status,401);assert.equal((await f.get('a.demo.test',f.tokens.B.token)).status,401)
  assert.deepEqual(f.hits,{A:1,B:1});assert.ok(f.received.every(h=>!h.cookie&&!h.authorization))
  const result=await f.get();assert.ok(!JSON.stringify(result).includes(f.tokens.A.token));assert.equal(result.headers['set-cookie'],undefined)
})
test('sesiuni: lipsă, token fals și cookie ambiguu sunt refuzate înainte de conectare',async t=>{
  const f=await fixture(t)
  for(const token of [null,'x','a'.repeat(64)])assert.equal((await f.get(undefined,token)).status,401)
  for(const extra of [{Cookie:'demo_probe_session='+f.tokens.A.token+'; demo_probe_session='+f.tokens.B.token},
    {Authorization:'Bearer '+f.tokens.A.token}])assert.equal((await f.get(undefined,undefined,extra)).status,401)
  assert.deepEqual(f.hits,{A:0,B:0})
})
test('sesiuni: expirare exactă și revocare, fără afectarea vecinului',async t=>{
  const f=await fixture(t);f.sessions.revoke(f.tokens.A.token)
  assert.equal((await f.get()).status,401);assert.equal((await f.get('b.demo.test',f.tokens.B.token)).status,200)
  f.time(f.tokens.B.expiresAt);assert.equal((await f.get('b.demo.test',f.tokens.B.token)).status,401)
  assert.deepEqual(f.hits,{A:0,B:1})
})
test('sesiuni: revocarea în timpul răspunsului blochează divulgarea',async t=>{
  const f=await fixture(t,({sessions,tokens})=>sessions.revoke(tokens.A.token)),result=await f.get()
  assert.equal(result.status,401);assert.deepEqual(result.body,{code:'instance_session_denied'});assert.deepEqual(f.hits,{A:1,B:0})
})
test('sesiuni: expirarea în timpul răspunsului blochează divulgarea',async t=>{
  const f=await fixture(t,({tokens,time})=>time(tokens.A.expiresAt))
  assert.equal((await f.get()).status,401);assert.deepEqual(f.hits,{A:1,B:0})
})
test('sesiuni: TTL/legare invalide refuzate, tokenuri distincte și runtime normal blocat',async t=>{
  const f=await fixture(t),route=f.route('a.demo.test'),a=f.sessions.issue(route),b=f.sessions.issue(route)
  assert.notEqual(a.token,b.token);assert.equal(f.sessions.authorize(a.token,{...route,host:'alias.demo.test'}),false)
  assert.throws(()=>f.sessions.issue(route,900001),/invalid_session_ttl/)
  assert.throws(()=>f.sessions.issue({...route,runtimeKey:B}),/invalid_session_binding/)
  assert.throws(()=>createDemoGatewaySessionHarness({}),/instance_sessions_required/)
  assert.throws(()=>createDemoGatewaySessionHarness({sessions:f.sessions,authorizeRequest:()=>true}),/instance_sessions_required/)
  process.env.NODE_ENV='production';assert.throws(()=>f.sessions.authorize(a.token,route),/synthetic_test_only/)
  assert.throws(()=>createDemoGatewaySessionHarness({}),/synthetic_test_only/)
})
test('generație: runtime A înlocuit refuză sesiunea veche, sesiunea B rămâne validă',async t=>{
  const f=await fixture(t);await f.replaceRuntime('A')
  assert.equal((await f.get()).status,401);assert.deepEqual(f.hits,{A:0,B:0})
  assert.equal((await f.get('b.demo.test',f.tokens.B.token)).status,200)
  const fresh=f.sessions.issue(f.route('a.demo.test'))
  assert.equal((await f.get('a.demo.test',fresh.token)).status,200)
  assert.deepEqual(f.hits,{A:1,B:1})
})
test('generație: CAS vechi și revenire la server retras sunt refuzate',async t=>{
  const f=await fixture(t),previous=f.generations.A,{old}=await f.replaceRuntime('A'),spare=await f.makeRuntime('A',A)
  assert.throws(()=>f.sessions.replaceRuntime(f.route('a.demo.test'),spare,previous),/runtime_generation_conflict/)
  assert.throws(()=>f.sessions.replaceRuntime(f.route('a.demo.test'),old,f.generations.A),/invalid_runtime_replacement/)
  assert.equal((await f.get()).status,401)
})
test('generație: schimbarea runtime-ului în timpul răspunsului nu divulgă date vechi',async t=>{
  let f,spare,rotated=false
  f=await fixture(t,()=>{
    if(!rotated){rotated=true;f.sessions.replaceRuntime(f.route('a.demo.test'),spare,f.generations.A)}
  })
  spare=await f.makeRuntime('A',A)
  const result=await f.get();assert.equal(result.status,401);assert.deepEqual(result.body,{code:'instance_session_denied'})
  const fresh=f.sessions.issue(f.route('a.demo.test'))
  // Old gateway still points at the old server, so even the NEW session is refused.
  assert.equal((await f.get('a.demo.test',fresh.token)).status,401)
  assert.deepEqual(f.hits,{A:1,B:0})
})
test('generație: închiderea și redeschiderea aceluiași server nu reactivează sesiuni',async t=>{
  const f=await fixture(t),server=f.runtimes.get(A),port=server.address().port
  await new Promise(r=>server.close(r))
  await new Promise(r=>server.listen(port,'127.0.0.1',r))
  assert.equal((await f.get()).status,401);assert.deepEqual(f.hits,{A:0,B:0})
  assert.throws(()=>f.sessions.issue(f.route('a.demo.test')),/runtime_not_registered/)
  assert.throws(()=>f.sessions.replaceRuntime(f.route('a.demo.test'),server,f.generations.A),/invalid_runtime_replacement/)
})
test('generație: registru de sesiuni reinițializat nu acceptă tokenurile vechi',async t=>{
  const f=await fixture(t),restarted=createInstanceSessions({clock:()=>1002}),route=f.route('a.demo.test')
  assert.equal(restarted.authorize(f.tokens.A.token,route),false)
  restarted.replaceRuntime(route,f.runtimes.get(A))
  assert.equal(restarted.authorize(f.tokens.A.token,route),false)
  const fresh=restarted.issue(route);assert.equal(restarted.authorize(fresh.token,route),true)
})
