'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),net=require('node:net')
const {parseConfig,createPlatformService}=require('../demo-platform/service')
test('platform config: explicit foundation mode and non-ERP loopback port',()=>{
  assert.deepEqual(parseConfig({INFRAFLOW_DEMO_PLATFORM_MODE:'foundation',INFRAFLOW_DEMO_PLATFORM_PORT:'4280'}),{host:'127.0.0.1',port:4280})
  for(const env of [{},{INFRAFLOW_DEMO_PLATFORM_MODE:'production',INFRAFLOW_DEMO_PLATFORM_PORT:'4280'},...['4180','4181','0','65536','4280x'].map(port=>({INFRAFLOW_DEMO_PLATFORM_MODE:'foundation',INFRAFLOW_DEMO_PLATFORM_PORT:port}))])assert.throws(()=>parseConfig(env))
})
test('platform HTTP: liveness only, never ready/provisioning; listener closes on shutdown',async()=>{
  // Reserve then release an ephemeral port; production factory still refuses port 0.
  const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r))
  const port=reservation.address().port;await new Promise(r=>reservation.close(r))
  const service=createPlatformService()
  const get=(path,method='GET')=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,path,method,agent:false},res=>{let raw='';res.on('data',c=>raw+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(raw)}))});req.on('error',reject);req.end()
  })
  try{
    await service.start({host:'127.0.0.1',port})
    assert.equal((await get('/health/live')).status,200)
    assert.deepEqual(await get('/health/ready'),{status:503,body:{ok:false,code:'platform_not_ready'}})
    assert.equal((await get('/trials')).status,404)
    assert.equal((await get('/trials','POST')).status,405)
    assert.equal((await get('/health/live?secret=x')).status,404)
    const stopping=service.shutdown();assert.equal(service.shutdown(),stopping);await stopping
    assert.equal(service.status().state,'stopped')
    await assert.rejects(get('/health/live'))
    await assert.rejects(service.start({host:'127.0.0.1',port}),/platform_already_started/)
  }finally{await service.shutdown()}
})
test('platform refuses external bind before creating listener',async()=>{
  const service=createPlatformService()
  await assert.rejects(service.start({host:'0.0.0.0',port:4280}),/invalid_platform_config/)
  await service.shutdown()
})

test('operator integration: health only, errors masked, no login routes and runtime closed',async()=>{
  const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r))
  const port=reservation.address().port;await new Promise(r=>reservation.close(r))
  let failed=false,closed=0
  const service=createPlatformService({operatorRuntime:{check:async()=>{if(failed)throw Error('private details');return {ok:true,code:'platform_operator_runtime_verified'}},shutdown:async()=>{closed++}}})
  const get=path=>new Promise((resolve,reject)=>{http.get({host:'127.0.0.1',port,path,agent:false},res=>{let raw='';res.on('data',c=>raw+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(raw)}))}).on('error',reject)})
  try{
    await service.start({host:'127.0.0.1',port})
    assert.deepEqual(await get('/health/operator'),{status:200,body:{ok:true,code:'platform_operator_runtime_verified'}})
    assert.equal((await get('/operator/login')).status,404)
    assert.equal((await get('/health/ready')).status,503)
    failed=true
    assert.deepEqual(await get('/health/operator'),{status:503,body:{ok:false,code:'platform_operator_unavailable'}})
  }finally{await service.shutdown()}
  assert.equal(closed,1)
})
