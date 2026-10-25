'use strict'
const assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto')
const {resolveDemoRoute}=require('../../../scripts/lib/demo-gateway-route')
const {createSqlBoundInstanceSessions}=require('./demo-sql-instance-session')
const {createDemoGatewaySessionHarness}=require('./demo-instance-session')
const {createGatewayPoolLifecycle}=require('./demo-gateway-pool-lifecycle')
async function probeNodeGateway({store,adapter,trialA,database}){
  if(process.env.NODE_ENV!=='test')throw Error('synthetic_test_only')
  const servers=[],hits={A:0,B:0},ids={A:trialA,B:crypto.randomUUID()}
  let gateway,handler,sqlUnavailable=false,slowSnapshot=false,snapshotAborted=false
  const listen=async server=>{servers.push(server);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});return server}
  try{
    await store.queue({id:ids.B,approvalId:ids.B,now:1000})
    for(const [action,kind,expectedRevision]of [['provision','worker',0],['ready','worker',1],['activate','activation_agent',2]])
      await store.command({trialId:ids.B,commandId:action,action,expectedRevision,actor:{id:'probe',kind},now:1001})
    await store.advanceRuntimeGeneration({trialId:ids.B,commandId:'first',expectedGeneration:0,now:2000})
    const clock=()=>2001,bindings=Object.entries(ids).map(([side,trialId])=>({host:side.toLowerCase()+'.demo.test',trialId,runtimeKey:trialId,revision:3}))
    const snapshotStore=require('../../core/demo-trial-sql-test-store').createSqlTestTrialStore({database,execute:(target,sql,input,options)=>{
      if(slowSnapshot&&options.signal){
        return adapter.execute(target,`INSERT dbo.node_gateway_deadline VALUES(1); WAITFOR DELAY '00:00:10'; INSERT dbo.node_gateway_deadline VALUES(2); ${sql}`,input,options)
          .catch(error=>{snapshotAborted=options.signal.aborted&&error.code==='synthetic_sql_aborted';throw error})
      }
      return adapter.execute(target,sql,input,options)
    }})
    const readSnapshot=async(options={})=>({registry:await snapshotStore.read(options),bindings})
    const route=async side=>resolveDemoRoute({...await readSnapshot(),host:side.toLowerCase()+'.demo.test',now:clock()})
    const sessions=createSqlBoundInstanceSessions({clock,readRuntimeGeneration:(input,options)=>{
      if(sqlUnavailable)throw Error('injected_private_sql_error')
      return store.readRuntimeGeneration(input,options)
    }})
    const runtimes=new Map(),tokens={}
    for(const side of ['A','B']){
      const server=await listen(http.createServer((req,res)=>{hits[side]++;res.end(JSON.stringify({format:'synthetic-runtime-probe-v1',trialId:ids[side],marker:'runtime-'+side}))}))
      runtimes.set(ids[side],server);await sessions.replaceRuntime(await route(side),server)
      tokens[side]=(await sessions.issue(await route(side))).token
    }
    handler=createDemoGatewaySessionHarness({sessions,runtimes,clock,readSnapshot,requestTimeoutMs:2000})
    gateway=await listen(http.createServer(handler))
    const get=(side,token=tokens[side])=>new Promise((resolve,reject)=>{
      const req=http.request({hostname:'127.0.0.1',port:gateway.address().port,path:'/synthetic-probe',headers:{Host:side.toLowerCase()+'.demo.test',Cookie:'demo_probe_session='+token}},res=>{
        let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}))
      });req.setTimeout(10000,()=>req.destroy(Error('probe_timeout')));req.on('error',reject);req.end()
    })
    assert.equal((await get('A')).status,200);assert.equal((await get('B',tokens.A)).status,401)
    assert.deepEqual(hits,{A:1,B:0})
    await store.advanceRuntimeGeneration({trialId:ids.A,commandId:'gateway-rotate',expectedGeneration:1,now:2001})
    assert.equal((await get('A')).status,401);assert.equal(hits.A,1)
    assert.equal((await get('B')).status,200)
    sqlUnavailable=true
    assert.deepEqual(await get('B'),{status:503,body:{code:'gateway_unavailable'}});assert.equal(hits.B,1)
    sqlUnavailable=false;assert.equal((await get('B')).status,200)
    await adapter.execute(database,'CREATE TABLE dbo.node_gateway_deadline(id int NOT NULL PRIMARY KEY); SELECT 1;')
    const before={...hits};slowSnapshot=true
    const delayed=get('B')
    let started=false;const until=performance.now()+1500
    while(performance.now()<until){
      started=await adapter.execute(database,'SELECT COUNT(*) FROM dbo.node_gateway_deadline WHERE id=1;')==='1'
      if(started)break
      await new Promise(resolve=>setTimeout(resolve,20))
    }
    assert.equal(started,true,'snapshot query must start before gateway deadline')
    assert.deepEqual(await delayed,{status:504,body:{code:'gateway_request_timeout'}})
    const drained=performance.now()+4000
    while(!snapshotAborted&&performance.now()<drained)await new Promise(resolve=>setTimeout(resolve,20))
    assert.equal(snapshotAborted,true);assert.deepEqual(hits,before)
    assert.equal(await adapter.execute(database,'SELECT COUNT(*) FROM dbo.node_gateway_deadline WHERE id=2;'),'0')
    slowSnapshot=false;assert.equal((await get('B')).status,200)
    const lifecycle=createGatewayPoolLifecycle({gateway:handler,pool:adapter})
    await lifecycle.shutdown();assert.equal(lifecycle.status().state,'closed')
    assert.deepEqual(await get('B'),{status:503,body:{code:'gateway_closed'}})
    return ['http_valid_session','http_cross_company_refused','sql_epoch_revokes_old_session','peer_survives_rotation','sql_failure_no_cached_authorization','gateway_deadline_cancels_started_sql_snapshot','no_runtime_contact_after_snapshot_deadline','recovery_after_snapshot_timeout','gateway_pool_shutdown']
  }finally{
    if(handler)await handler.shutdown()
    for(const server of servers.reverse())await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()})
  }
}
module.exports={probeNodeGateway}
