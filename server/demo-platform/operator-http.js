'use strict'
// Not mounted by default. HTTPS origin and loopback proxy trust must be configured explicitly.
const {TextDecoder}=require('node:util')
const fs=require('node:fs'),path=require('node:path')
const assets=new Map([
  ['/operator',['index.html','text/html; charset=utf-8']],
  ['/operator/app.js',['app.js','text/javascript; charset=utf-8']],
  ['/operator/style.css',['style.css','text/css; charset=utf-8']],
].map(([url,[file,type]])=>[url,{type,data:fs.readFileSync(path.join(__dirname,'operator-ui',file))}]))
const COOKIE='__Host-infraflow_operator'
function validateOrigin(value){
  let url;try{url=new URL(value)}catch{throw Error('operator_origin_invalid')}
  if(url.protocol!=='https:'||url.origin!==value||url.username||url.password||url.hostname==='localhost'
    ||! /^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(url.hostname))throw Error('operator_origin_invalid')
  return url
}
function sessionCookie(raw){
  if(typeof raw!=='string'||raw.length>4096)throw Error()
  const entries=raw.split(';').map(part=>part.trim()).filter(part=>part.split('=')[0]===COOKIE)
  if(entries.length!==1||!new RegExp('^'+COOKIE+'=[a-f0-9]{64}$').test(entries[0]))throw Error()
  return entries[0].slice(COOKIE.length+1)
}
async function body(req){
  if(req.headers['content-type']!=='application/json'||req.headers['content-encoding']!==undefined)throw Error()
  const length=req.headers['content-length']
  if(length!==undefined&&(!/^\d+$/.test(length)||Number(length)>4096))throw Error()
  return new Promise((resolve,reject)=>{
    let bytes=0,parts=[],done=false
    const finish=(error,value)=>{
      if(done)return;done=true;clearTimeout(timer)
      req.removeListener('data',data);req.removeListener('end',end);req.removeListener('error',errorHandler);req.removeListener('aborted',errorHandler)
      parts=[];if(error){req.resume();reject(Error())}else resolve(value)
    }
    const errorHandler=()=>finish(true)
    const data=chunk=>{bytes+=chunk.length;if(bytes>4096)finish(true);else parts.push(chunk)}
    const end=()=>{try{finish(false,JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts))))}catch{finish(true)}}
    const timer=setTimeout(()=>finish(true),3000)
    req.on('data',data);req.once('end',end);req.once('error',errorHandler);req.once('aborted',errorHandler)
  })
}
function createOperatorHttp({runtime,origin,trustLoopbackProxy=false}){
  const expected=validateOrigin(origin)
  if(typeof runtime?.login!=='function'||typeof runtime?.authorize!=='function'||typeof trustLoopbackProxy!=='boolean')throw Error('operator_http_config_invalid')
  let active=0
  return async function handle(req,res){
    const paths=['/operator/login','/operator/session','/operator/logout',...assets.keys()]
    if(!paths.includes(req.url))return false
    const send=(status,data,cookie)=>{
      const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'}
      if(cookie)headers['Set-Cookie']=cookie
      res.writeHead(status,headers);res.end(JSON.stringify(data))
    }
    let reserved=false
    try{
      const sensitive=['host','origin','cookie','content-type','content-length','x-forwarded-proto','x-forwarded-host','x-csrf-token','sec-fetch-site']
      for(const name of sensitive){let count=0;for(let i=0;i<req.rawHeaders.length;i+=2)if(req.rawHeaders[i].toLowerCase()===name)count++;if(count>1)throw Error()}
      const proxy=trustLoopbackProxy&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
      if(req.headers.host!==expected.host||req.headers['x-forwarded-host']!==undefined)throw Error()
      if(!req.socket.encrypted&&!(proxy&&req.headers['x-forwarded-proto']==='https'))throw Error()
      if(req.headers.origin!==undefined&&req.headers.origin!==origin)throw Error()
      const asset=assets.get(req.url)
      const topNavigation=asset&&req.url==='/operator'&&req.headers['sec-fetch-site']==='none'
      if(req.headers['sec-fetch-site']!==undefined&&req.headers['sec-fetch-site']!=='same-origin'&&!topNavigation)throw Error()
      const method=req.url==='/operator/session'||asset?'GET':'POST'
      if(req.method!==method){req.resume();send(405,{code:'method_not_allowed'});return true}
      if(method==='POST'&&req.headers.origin!==origin)throw Error()
      if(asset){
        req.resume()
        res.writeHead(200,{'Content-Type':asset.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
          'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'})
        res.end(asset.data);return true
      }
      if(active>=4){req.resume();send(503,{code:'operator_busy'});return true}
      active++;reserved=true
      if(req.url==='/operator/login'){
        const input=await body(req)
        if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).sort().join(',')!=='code,password,username'
          ||typeof input.username!=='string'||!/^[a-z0-9_.-]{1,64}$/.test(input.username)
          ||typeof input.password!=='string'||Buffer.byteLength(input.password)>1024
          ||typeof input.code!=='string'||!/^\d{6}$/.test(input.code))throw Error()
        const session=await runtime.login(input)
        send(200,{ok:true,csrfToken:session.csrfToken,expiresAt:session.expiresAt},
          COOKIE+'='+session.token+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=14400')
      }else{
        if(method==='GET')req.resume()
        const token=sessionCookie(req.headers.cookie)
        if(method==='POST'){
          const input=await body(req)
          if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).length!==0)throw Error()
        }
        if(method==='GET'&&typeof runtime.resume==='function'){
          const session=await runtime.resume({token});send(200,{ok:true,...session});return true
        }
        await runtime.authorize({token,csrfToken:req.headers['x-csrf-token'],operation:method==='GET'?'trial.read':'session.logout'})
        send(200,{ok:true},method==='POST'?COOKIE+'=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0':undefined)
      }
    }catch{req.resume();if(!res.headersSent)send(401,{code:'operator_access_denied'})}
    finally{if(reserved)active--}
    return true
  }
}
module.exports={createOperatorHttp,validateOrigin,sessionCookie}
