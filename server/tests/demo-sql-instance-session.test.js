'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http')
const model=require('../../scripts/lib/demo-trial-registry')
const {resolveDemoRoute}=require('../../scripts/lib/demo-gateway-route')
const {createDemoGatewaySessionHarness}=require('./support/demo-instance-session')
const {createSqlBoundInstanceSessions}=require('./support/demo-sql-instance-session')
const {createSqlTestTrialStore}=require('../core/demo-trial-sql-test-store')
const {createTrialSqlFixture}=require('./support/demo-trial-sql-fixture')
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222'
function mode(t){const old=process.env.NODE_ENV;process.env.NODE_ENV='test';t.after(()=>{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old})}
async function httpFixture(t,registry,readRuntimeGeneration,onRuntime){
  let now=2000
  const clock=()=>now,hits={A:0,B:0}
  const snapshot={registry,bindings:registry.trials.map((r,i)=>({host:i?'b.demo.test':'a.demo.test',trialId:r.id,runtimeKey:r.id,revision:r.revision}))}
  const route=side=>resolveDemoRoute({...snapshot,host:side.toLowerCase()+'.demo.test',now})
  async function listen(server){await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections()}));return server}
  const runtimes=new Map(),sessions=createSqlBoundInstanceSessions({clock,readRuntimeGeneration}),generations={},tokens={}
  const makeRuntime=(side,id)=>listen(http.createServer(async(req,res)=>{
    hits[side]++;if(onRuntime)await onRuntime(side)
    res.end(JSON.stringify({format:'synthetic-runtime-probe-v1',trialId:id,marker:'runtime-'+side}))
  }))
  for(const [side,id]of [['A',A],['B',B]]){
    const server=await makeRuntime(side,id);runtimes.set(id,server)
    generations[side]=(await sessions.replaceRuntime(route(side),server)).generation
    tokens[side]=await sessions.issue(route(side))
  }
  const makeGateway=()=>listen(http.createServer(createDemoGatewaySessionHarness({sessions,runtimes,clock,readSnapshot:async()=>snapshot})))
  let gateway=await makeGateway()
  async function replaceA(){
    const server=await makeRuntime('A',A)
    generations.A=(await sessions.replaceRuntime(route('A'),server,generations.A)).generation
    runtimes.set(A,server);const old=gateway;gateway=await makeGateway();await new Promise(r=>old.close(r))
  }
  const get=(side='A',token=tokens.A.token)=>new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:gateway.address().port,path:'/synthetic-probe',
      headers:{Host:side.toLowerCase()+'.demo.test',Cookie:'demo_probe_session='+token}},res=>{
      let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}))
    });req.on('error',reject);req.end()
  })
  return {get,hits,sessions,tokens,replaceA,route,snapshot,time:n=>{now=n}}
}
function activeRegistry(){
  let registry=model.createRegistry()
  for(const id of [A,B]){
    registry=model.queueTrial(registry,{id,approvalId:id,now:1000})
    for(const [action,kind,expectedRevision]of [['provision','worker',0],['ready','worker',1],['activate','activation_agent',2]])
      registry=model.applyCommand(registry,{trialId:id,commandId:action,action,expectedRevision,actor:{id:'test',kind},now:1001})
  }
  return registry
}
test('adaptor sesiuni: SQL lipsă/indisponibil și avans în timpul răspunsului refuzate',async t=>{
  mode(t);const row={generation:1,epoch:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',changedAt:2000}
  let unavailable=false,rotate=false
  const rows=new Map([[A,{...row}],[B,{...row}]])
  const f=await httpFixture(t,activeRegistry(),async({trialId})=>{if(unavailable)throw Error('SQL_SECRET');return rows.get(trialId)},()=>{
    if(rotate){rows.set(A,{...row,generation:2,epoch:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});rotate=false}
  })
  unavailable=true;assert.deepEqual(await f.get(),{status:503,body:{code:'gateway_unavailable'}});assert.equal(f.hits.A,0)
  unavailable=false;rotate=true;assert.equal((await f.get()).status,401);assert.equal(f.hits.A,1)
  rows.set(A,null);assert.equal((await f.get()).status,401);assert.equal(f.hits.A,1)
  assert.equal((await f.get('B',f.tokens.B.token)).status,200)
})
test('adaptor sesiuni: semnalul gateway ajunge la cititorul generației SQL',async t=>{
  mode(t);let armed=false,signals=0
  const f=await httpFixture(t,activeRegistry(),async(input,options)=>{
    if(armed){assert.ok(options.signal instanceof AbortSignal);assert.equal(options.signal.aborted,false);signals++}
    return {generation:1,epoch:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}
  })
  armed=true;assert.equal((await f.get()).status,200);assert.equal(signals,2)
})

test('autorizare asincronă: expirare trial înainte de conectare și înainte de divulgare',async t=>{
  for(const phase of [1,2])await t.test('citire SQL '+phase,async sub=>{
    mode(sub);let f,armed=false,calls=0
    const row={generation:1,epoch:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}
    f=await httpFixture(sub,activeRegistry(),async()=>{
      await Promise.resolve()
      if(armed && ++calls===phase)f.time(f.snapshot.registry.trials[0].expiresAt)
      return {...row}
    })
    armed=true;const response=await f.get()
    assert.deepEqual(response,{status:404,body:{code:'route_unavailable'}})
    assert.deepEqual(f.hits,{A:phase===1?0:1,B:0})
  })
})
test('autorizare asincronă: rută retrasă sau revizie schimbată nu divulgă răspunsul',async t=>{
  for(const phase of [1,2])await t.test('citire SQL '+phase,async sub=>{
    mode(sub);let f,armed=false,calls=0
    f=await httpFixture(sub,activeRegistry(),async()=>{
      await Promise.resolve()
      if(armed && ++calls===phase)f.snapshot.bindings[0].revision++
      return {generation:1,epoch:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}
    })
    armed=true;assert.deepEqual(await f.get(),{status:503,body:{code:'gateway_unavailable'}})
    assert.deepEqual(f.hits,{A:phase===1?0:1,B:0})
  })
})
test('autorizare asincronă: lifecycle retras în timpul citirii, B rămâne accesibil',async t=>{
  mode(t);let f,armed=false
  f=await httpFixture(t,activeRegistry(),async({trialId})=>{
    await Promise.resolve()
    if(armed&&trialId===A)f.snapshot.registry.trials[0].state='expired'
    return {generation:1,epoch:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}
  })
  armed=true;assert.equal((await f.get()).status,404);assert.equal(f.hits.A,0)
  assert.equal((await f.get('B',f.tokens.B.token)).status,200);assert.equal(f.hits.B,1)
})
test('SQL real și HTTP: epocă persistentă în validarea sesiunilor, fără fallback',{
  skip:process.env.INFRAFLOW_TEST_TRIAL_SQL!=='1',timeout:240000,
},async t=>{
  mode(t);const fixture=await createTrialSqlFixture(),store=createSqlTestTrialStore(fixture)
  await store.initialize()
  for(const id of [A,B]){
    await store.queue({id,approvalId:id,now:1000})
    for(const [action,kind,expectedRevision]of [['provision','worker',0],['ready','worker',1],['activate','activation_agent',2]])
      await store.command({trialId:id,commandId:action,action,expectedRevision,actor:{id:'test',kind},now:1001})
    await store.advanceRuntimeGeneration({trialId:id,commandId:'first',expectedGeneration:0,now:2000})
  }
  const baseline=await store.read();let unavailable=false
  const f=await httpFixture(t,baseline,(input,options)=>{if(unavailable)throw Error('SQL unavailable injected');return store.readRuntimeGeneration(input,options)})
  await t.test('token corect acceptat; token A pe B refuzat înainte de contact',async()=>{
    assert.equal((await f.get()).status,200);assert.equal((await f.get('B')).status,401)
    assert.deepEqual(f.hits,{A:1,B:0})
  })
  await t.test('avans SQL invalidează A, B rămâne valid; emiterea pe runtime vechi este blocată',async()=>{
    await store.advanceRuntimeGeneration({trialId:A,commandId:'replace',expectedGeneration:1,now:2001})
    assert.equal((await f.get()).status,401);assert.equal(f.hits.A,1)
    await assert.rejects(f.sessions.issue(f.route('A')),/runtime_generation_changed/)
    assert.equal((await f.get('B',f.tokens.B.token)).status,200)
    await f.replaceA();const fresh=await f.sessions.issue(f.route('A'))
    assert.equal((await f.get('A',fresh.token)).status,200);assert.equal((await f.get()).status,401)
  })
  await t.test('SQL indisponibil refuză fără cache; lifecycle identic',async()=>{
    unavailable=true
    assert.deepEqual(await f.get('B',f.tokens.B.token),{status:503,body:{code:'gateway_unavailable'}})
    assert.equal(f.hits.B,1);unavailable=false
    assert.deepEqual(await store.read(),baseline)
  })
  console.log('SQL-backed session test database:',fixture.database)
})
