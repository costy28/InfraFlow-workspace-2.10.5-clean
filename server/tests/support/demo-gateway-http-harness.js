'use strict'
// Deliberately narrow probe, NOT a general reverse proxy or an ERP route.
const http = require('node:http')
const { normalizeGatewayHost, resolveDemoRoute } = require('../../../scripts/lib/demo-gateway-route')
function createDemoGatewayHttpHarness({ readSnapshot, clock, runtimes, authorizeRequest, requestTimeoutMs=30000 }) {
  if (process.env.NODE_ENV !== 'test') throw Error('synthetic_test_only')
  if (typeof readSnapshot !== 'function' || typeof clock !== 'function' || !(runtimes instanceof Map)) throw Error('invalid_gateway_harness')
  if (authorizeRequest !== undefined && typeof authorizeRequest !== 'function') throw Error('invalid_gateway_authorizer')
  if(!Number.isInteger(requestTimeoutMs)||requestTimeoutMs<20||requestTimeoutMs>60000)throw Error('invalid_gateway_deadline')
  // Server handles, not URLs/ports supplied by a browser or imported env.
  const targets = new Map(runtimes)
  let state='open',shutdownPromise,resolveShutdown
  const requests=new Set(),upstreams=new Set()
  const completeShutdown=()=>{
    if(state==='closing'&&requests.size===0&&upstreams.size===0){state='closed';resolveShutdown()}
  }
  const handler = async (req, res) => {
    if(state!=='open'){
      res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'})
      return res.end(JSON.stringify({code:'gateway_closed'}))
    }
    let upstream
    const controller=new AbortController(),signal=controller.signal
    const cancel=code=>{
      if(!signal.aborted)controller.abort(Object.assign(Error(code),{code}))
      upstream?.destroy()
    }
    requests.add(cancel)
    const guard=()=>{if(signal.aborted)throw signal.reason}
    const bounded=work=>new Promise((resolve,reject)=>{
      if(signal.aborted)return reject(signal.reason)
      const abort=()=>reject(signal.reason)
      signal.addEventListener('abort',abort,{once:true})
      Promise.resolve().then(()=>{guard();return work()}).then(value=>{
        signal.removeEventListener('abort',abort)
        if(signal.aborted)reject(signal.reason);else resolve(value)
      },error=>{signal.removeEventListener('abort',abort);reject(error)})
    })
    const decide=async host=>{
      const snapshot=await bounded(()=>readSnapshot({signal}))
      guard()
      return resolveDemoRoute({registry:snapshot.registry,bindings:snapshot.bindings,host,now:clock()})
    }
    const onClose=()=>{if(!res.writableFinished)cancel('gateway_client_closed')}
    res.on('close',onClose)
    const requestDeadline=setTimeout(()=>cancel('gateway_request_timeout'),requestTimeoutMs)
    const send = (status, body) => {
      if (res.destroyed) return
      res.writeHead(status, { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' })
      res.end(JSON.stringify(body))
    }
    try {
      if (process.env.NODE_ENV !== 'test') return send(503, { code:'synthetic_test_only' })
      if (req.method !== 'GET') return send(405, { code:'read_only' })
      if (req.url !== '/synthetic-probe'
        || req.rawHeaders.filter((_,i)=>i%2===0).filter(n=>n.toLowerCase()==='host').length !== 1
        || Object.keys(req.headers).some(n=>n==='forwarded'||n.startsWith('x-forwarded-')))
        return send(400, { code:'invalid_gateway_request' })
      let host
      try { host=normalizeGatewayHost(req.headers.host) } catch { return send(400,{code:'invalid_gateway_request'}) }
      const route=await decide(host)
      const server=targets.get(route.runtimeKey)
      const authorized=async route=>!authorizeRequest || (await bounded(()=>authorizeRequest({route,runtime:server,headers:req.headers,rawHeaders:req.rawHeaders,signal})))===true
      const revalidate=async()=>{
        const current=await decide(host)
        if(current.trialId!==route.trialId || current.runtimeKey!==route.runtimeKey || current.revision!==route.revision)throw Error('gateway_route_changed')
        return current
      }
      const initiallyAuthorized=await authorized(route)
      await revalidate()
      if(!initiallyAuthorized)return send(401,{code:'instance_session_denied'})
      if (!(server instanceof http.Server)) throw Error('runtime_not_registered')
      const address=server.address()
      if (!address || typeof address!=='object' || address.address!=='127.0.0.1'
        || !Number.isInteger(address.port) || address.port<1 || address.port>65535) throw Error('runtime_unavailable')
      guard()
      const body=await bounded(()=>new Promise((resolve,reject)=>{
        let settled=false
        const finish=(error,value)=>{
          if(settled)return
          settled=true;clearTimeout(deadline)
          if(error){upstream?.destroy();reject(error)}else resolve(value)
        }
        const deadline=setTimeout(()=>finish(Error('runtime_deadline')),1500)
        upstream=http.get({hostname:'127.0.0.1',port:address.port,path:'/runtime-probe',agent:false,
          headers:{Accept:'application/json'}}, response=>{
          if(response.statusCode!==200){response.resume();return finish(Error('runtime_status_refused'))}
          let size=0, chunks=[]
          response.on('data',chunk=>{
            size+=chunk.length
            if(size>4096){response.destroy(Error('runtime_response_limit'));return}
            chunks.push(chunk)
          })
          response.on('error',error=>finish(error))
          response.on('end',()=>{try{finish(null,JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{finish(Error('invalid_runtime_response'))}})
        })
        upstreams.add(upstream)
        upstream.once('close',()=>{upstreams.delete(upstream);completeShutdown()})
        upstream.setTimeout(1500,()=>upstream.destroy(Error('runtime_timeout')))
        upstream.on('error',error=>finish(error))
      }))
      if (!body || Object.getPrototypeOf(body)!==Object.prototype || Object.keys(body).sort().join(',')!=='format,marker,trialId'
        || body.format!=='synthetic-runtime-probe-v1' || body.trialId!==route.trialId
        || !['runtime-A','runtime-B'].includes(body.marker)) throw Error('runtime_identity_mismatch')
      // Never release buffered content after expiry or a changed route.
      const current=await revalidate()
      const finallyAuthorized=await authorized(current)
      await revalidate()
      guard()
      if(!finallyAuthorized)return send(401,{code:'instance_session_denied'})
      return send(200,{format:'synthetic-gateway-response-v1',trialId:route.trialId,marker:body.marker,productionReady:false})
    } catch(error) {
      upstream?.destroy()
      if(error.code==='gateway_request_timeout')return send(504,{code:'gateway_request_timeout'})
      return send(error.code==='gateway_route_denied'?404:503,
        {code:error.code==='gateway_route_denied'?'route_unavailable':'gateway_unavailable'})
    } finally {
      clearTimeout(requestDeadline)
      res.removeListener('close',onClose)
      requests.delete(cancel);completeShutdown()
    }
  }
  handler.shutdown=()=>{
    if(process.env.NODE_ENV!=='test')return Promise.reject(Error('synthetic_test_only'))
    if(shutdownPromise)return shutdownPromise
    state='closing';shutdownPromise=new Promise(resolve=>{resolveShutdown=resolve})
    for(const cancel of requests)cancel('gateway_shutdown')
    completeShutdown();return shutdownPromise
  }
  handler.status=()=>({state,activeRequests:requests.size,upstreams:upstreams.size})
  return handler
}
module.exports={createDemoGatewayHttpHarness}
