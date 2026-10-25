'use strict'
const { randomBytes, randomUUID, createHash } = require('node:crypto')
const http = require('node:http')
const { normalizeGatewayHost } = require('../../../scripts/lib/demo-gateway-route')
const { createDemoGatewayHttpHarness } = require('./demo-gateway-http-harness')
const hash = token => createHash('sha256').update(token).digest('hex')
function createInstanceSessions({ clock }) {
  const guard=()=>{if(process.env.NODE_ENV!=='test')throw Error('synthetic_test_only')}
  guard()
  if(typeof clock!=='function')throw Error('invalid_session_clock')
  const sessions=new Map(),runtimes=new Map(),seenServers=new WeakSet()
  const now=()=>{guard();const n=clock();if(!Number.isSafeInteger(n)||n<0)throw Error('invalid_session_clock');return n}
  function binding(route) {
    if(!route || route.format!=='synthetic-demo-route-v1' || route.executionAllowed!==false || route.productionReady!==false
      || typeof route.trialId!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(route.trialId)
      || route.runtimeKey!==route.trialId)throw Error('invalid_session_binding')
    return {trialId:route.trialId,runtimeKey:route.runtimeKey,host:normalizeGatewayHost(route.host)}
  }
  return {
    // Test controller only: compare-and-swap registration of a NEW server object.
    replaceRuntime(route,server,expectedGeneration=null) {
      now();const bound=binding(route),current=runtimes.get(bound.trialId)
      if((current?.generation??null)!==expectedGeneration)throw Error('runtime_generation_conflict')
      const address=server instanceof http.Server && server.address()
      if(!address||typeof address!=='object'||address.address!=='127.0.0.1'||seenServers.has(server))throw Error('invalid_runtime_replacement')
      const generation=randomUUID()
      const entry={server,generation,retired:false}
      server.once('close',()=>{entry.retired=true})
      seenServers.add(server);runtimes.set(bound.trialId,entry)
      return {generation}
    },
    // Trusted test fixture only; not an HTTP login or authentication proof.
    issue(route,ttlMs=300000) {
      const issuedAt=now(),bound=binding(route)
      const runtime=runtimes.get(bound.trialId)
      if(!runtime?.server.listening||runtime.retired)throw Error('runtime_not_registered')
      if(!Number.isInteger(ttlMs)||ttlMs<1||ttlMs>900000||!Number.isSafeInteger(issuedAt+ttlMs))throw Error('invalid_session_ttl')
      const token=randomBytes(32).toString('hex'),expiresAt=issuedAt+ttlMs
      sessions.set(hash(token),{...bound,expiresAt,generation:runtime.generation})
      return {token,expiresAt}
    },
    authorize(token,route,server) {
      const at=now(),bound=binding(route)
      if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return false
      const s=sessions.get(hash(token)),runtime=runtimes.get(bound.trialId)
      return !!s && !!runtime && !runtime.retired && runtime.server.listening && (server===undefined||server===runtime.server)
        && s.generation===runtime.generation && at<s.expiresAt && s.trialId===bound.trialId && s.runtimeKey===bound.runtimeKey && s.host===bound.host
    },
    revoke(token) {now();if(typeof token==='string')sessions.delete(hash(token))},
  }
}
function createDemoGatewaySessionHarness(options) {
  if(process.env.NODE_ENV!=='test')throw Error('synthetic_test_only')
  if(!options || typeof options.sessions?.authorize!=='function' || Object.hasOwn(options,'authorizeRequest'))throw Error('instance_sessions_required')
  return createDemoGatewayHttpHarness({...options,authorizeRequest:async({route,runtime,headers,rawHeaders,signal})=>{
    if(headers.authorization || rawHeaders.filter((_,i)=>i%2===0).filter(n=>n.toLowerCase()==='cookie').length!==1)return false
    const match=/^demo_probe_session=([a-f0-9]{64})$/.exec(headers.cookie||'')
    return !!match && (await options.sessions.authorize(match[1],route,runtime,{signal}))===true
  }})
}
module.exports={createInstanceSessions,createDemoGatewaySessionHarness}
