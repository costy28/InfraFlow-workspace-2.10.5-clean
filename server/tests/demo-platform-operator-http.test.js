'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http')
const {createOperatorHttp,validateOrigin,sessionCookie}=require('../demo-platform/operator-http')
const token='a'.repeat(64),csrf='b'.repeat(64),origin='https://operator.example.test'
test('operator HTTP configuration refuses insecure/arbitrary origins and ambiguous cookies',()=>{
  validateOrigin(origin)
  for(const value of ['http://operator.example.test','https://127.0.0.1','https://localhost','https://operator.example.test/','https://x:pass@operator.example.test'])assert.throws(()=>validateOrigin(value))
  assert.equal(sessionCookie('__Host-infraflow_operator='+token),token)
  for(const value of ['',token,'__Host-infraflow_operator='+token+'; __Host-infraflow_operator='+token])assert.throws(()=>sessionCookie(value))
})
test('operator HTTP: secure cookie, no token disclosure, logout CSRF, host/origin/proxy gate and bounded input',async()=>{
  let logins=0,authorizations=0
  const runtime={login:async()=>{logins++;return {token,csrfToken:csrf,expiresAt:123}},authorize:async input=>{authorizations++;if(input.token!==token||(input.operation==='session.logout'&&input.csrfToken!==csrf))throw Error('private error')}}
  const handler=createOperatorHttp({runtime,origin,trustLoopbackProxy:true})
  const server=http.createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end('{}')}})
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const request=(path,method='POST',payload={username:'infraop',password:'fixture',code:'123456'},extra={})=>new Promise((resolve,reject)=>{
    const raw=typeof payload==='string'?payload:JSON.stringify(payload)
    const req=http.request({host:'127.0.0.1',port:server.address().port,path,method,agent:false,
      headers:{host:'operator.example.test',origin,'x-forwarded-proto':'https','content-type':'application/json',...extra}},res=>{
        let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,raw:body}))
      });req.on('error',reject);req.end(method==='GET'?undefined:raw)
  })
  try{
    const login=await request('/operator/login')
    assert.equal(login.status,200);assert.equal(logins,1)
    assert.ok(!login.raw.includes(token));assert.equal(JSON.parse(login.raw).csrfToken,csrf)
    assert.match(login.headers['set-cookie'][0],/Path=\/; Secure; HttpOnly; SameSite=Strict/)
    for(const headers of [{host:'evil.test'},{origin:'https://evil.test'},{'x-forwarded-proto':'http'},{'x-forwarded-host':'operator.example.test'},{'sec-fetch-site':'cross-site'}])assert.equal((await request('/operator/login','POST',{},headers)).status,401)
    assert.equal(logins,1)
    for(const payload of ['{','x'.repeat(4097),{username:'infraop',password:'p',code:'123456',server:'evil'}])assert.equal((await request('/operator/login','POST',payload)).status,401)
    assert.equal(logins,1)
    const cookie='__Host-infraflow_operator='+token
    assert.equal((await request('/operator/session','GET',{}, {cookie})).status,200)
    assert.equal((await request('/operator/logout','POST',{}, {cookie})).status,401)
    const logout=await request('/operator/logout','POST',{}, {cookie,'x-csrf-token':csrf})
    assert.equal(logout.status,200);assert.match(logout.headers['set-cookie'][0],/Max-Age=0/)
    assert.equal(authorizations,3)
    assert.equal((await request('/operator/login','GET')).status,405)
    assert.equal((await request('/operator/login?x=1')).status,404)
  }finally{await new Promise(r=>server.close(r))}
})
test('operator HTTP does not trust forwarded HTTPS by default',async()=>{
  const handler=createOperatorHttp({runtime:{login:async()=>{throw Error()},authorize:async()=>{}},origin})
  const server=http.createServer((req,res)=>handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r))
  try{
    const status=await new Promise((resolve,reject)=>{http.get({host:'127.0.0.1',port:server.address().port,path:'/operator/session',headers:{host:'operator.example.test','x-forwarded-proto':'https'}},res=>{res.resume();resolve(res.statusCode)}).on('error',reject)})
    assert.equal(status,401)
  }finally{await new Promise(r=>server.close(r))}
})
test('HTTP + real auth: password/TOTP, replay refusal, audited read, CSRF logout and revoked cookie',async()=>{
  const {hashPassword,totpAtCounter}=require('../demo-platform/operator-credentials')
  const {createOperatorAuth}=require('../demo-platform/operator-auth')
  const password='Fixture-password-only-123!',secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
  const passwordHash=await hashPassword(password),events=[]
  let counter=-1,attempts=0
  const runtime=createOperatorAuth({clock:()=>59000,store:{
    readOperator:async()=>({id:'11111111-1111-4111-8111-111111111111',username:'infraop',revision:1,enabled:true,passwordHash,totpSecret:secret,scopes:['trial:read','session:own']}),
    reserveAttempt:async()=>++attempts<=5,
    claimTotpCounter:async input=>{if(input.counter<=counter)return false;counter=input.counter;return true},
    appendAudit:async event=>{events.push(event.action)},
  }})
  const handler=createOperatorHttp({runtime,origin,trustLoopbackProxy:true})
  const server=http.createServer((req,res)=>handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const call=(path,payload,cookie,csrfToken)=>new Promise((resolve,reject)=>{
    const headers={host:'operator.example.test',origin,'x-forwarded-proto':'https','content-type':'application/json'}
    if(cookie)headers.cookie=cookie;if(csrfToken)headers['x-csrf-token']=csrfToken
    const req=http.request({host:'127.0.0.1',port:server.address().port,path,method:payload===undefined?'GET':'POST',headers,agent:false},res=>{
      let raw='';res.on('data',c=>raw+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(raw)}))
    });req.on('error',reject);req.end(payload===undefined?undefined:JSON.stringify(payload))
  })
  try{
    const input={username:'infraop',password,code:totpAtCounter(secret,1)}
    const login=await call('/operator/login',input)
    assert.equal(login.status,200)
    const cookie=login.headers['set-cookie'][0].split(';')[0]
    assert.equal((await call('/operator/login',input)).status,401)
    const resumed=await call('/operator/session',undefined,cookie)
    assert.equal(resumed.status,200)
    assert.match(resumed.body.csrfToken,/^[a-f0-9]{64}$/)
    assert.equal((await call('/operator/logout',{},cookie,'c'.repeat(64))).status,401)
    assert.equal((await call('/operator/logout',{},cookie,resumed.body.csrfToken)).status,200)
    assert.equal((await call('/operator/session',undefined,cookie)).status,401)
    assert.deepEqual(events,['operator_login','trial.read','session.logout'])
    assert.equal(attempts,2)
  }finally{runtime.shutdown();await new Promise(r=>server.close(r))}
})
