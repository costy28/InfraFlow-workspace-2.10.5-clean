'use strict'
const crypto=require('node:crypto')
const {verifyPassword,acceptedTotpCounter}=require('./operator-credentials')
const fail=()=>{throw Error('operator_access_denied')}
const hash=v=>crypto.createHash('sha256').update(v).digest('hex')
const operations=Object.freeze({'trial.read':'trial:read','trial.queue':'trial:queue','trial.prepare':'trial:prepare','trial.activate':'trial:activate','session.logout':'session:own'})
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
function validateRecord(r){
  if(!r||!uuid(r.id)||!Number.isSafeInteger(r.revision)||r.revision<0||r.enabled!==true
    ||typeof r.username!=='string'||!/^[a-z0-9_.-]{1,64}$/.test(r.username)
    ||typeof r.passwordHash!=='string'||!/^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(r.passwordHash)
    ||typeof r.totpSecret!=='string'||!/^[A-Z2-7]{32}$/.test(r.totpSecret)
    ||!Array.isArray(r.scopes)||r.scopes.some(s=>!Object.values(operations).includes(s)))fail()
}
function createOperatorAuth({store,clock=Date.now}){
  for(const method of ['readOperator','reserveAttempt','claimTotpCounter','appendAudit'])if(typeof store?.[method]!=='function')throw Error('operator_store_required')
  const sessions=new Map();let busy=false,closed=false
  const now=()=>{const n=clock();if(!Number.isSafeInteger(n)||n<0)fail();return n}
  const read=async()=>{const r=await store.readOperator();validateRecord(r);return r}
  const prune=at=>{for(const [key,s]of sessions)if(at>=s.expiresAt||at-s.lastSeen>=15*60000||at<s.lastSeen)sessions.delete(key)}
  const api={
    async login(input){
      if(closed||busy)fail()
      busy=true
      try{
        const at=now();prune(at)
        if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).sort().join(',')!=='code,password,username'
          ||typeof input.username!=='string'||input.username.length>64||typeof input.password!=='string'||Buffer.byteLength(input.password)>1024)fail()
        const record=await read()
        // Durable atomic budget is mandatory; no in-memory fallback after restart.
        if(await store.reserveAttempt({operatorId:record.id,now:at,limit:5,windowMs:15*60000})!==true)fail()
        const passwordOk=await verifyPassword(input.password,record.passwordHash)
        const counter=acceptedTotpCounter(record.totpSecret,input.code,at)
        if(!passwordOk||input.username!==record.username||counter===null)fail()
        if(await store.claimTotpCounter({operatorId:record.id,revision:record.revision,counter})!==true)fail()
        const current=await read()
        if(current.id!==record.id||current.revision!==record.revision)fail()
        const issuedAt=now();if(issuedAt<at||issuedAt-at>30000)fail()
        await store.appendAudit({operatorId:record.id,action:'operator_login',at:issuedAt})
        const finalRecord=await read()
        if(finalRecord.id!==record.id||finalRecord.revision!==record.revision)fail()
        if(closed)fail()
        prune(issuedAt);if(sessions.size>=8)fail()
        const token=crypto.randomBytes(32).toString('hex'),csrfToken=crypto.randomBytes(32).toString('hex')
        const expiresAt=issuedAt+4*60*60000
        sessions.set(hash(token),{id:record.id,revision:record.revision,csrfHash:hash(csrfToken),expiresAt,lastSeen:issuedAt})
        return {token,csrfToken,expiresAt,canQueue:finalRecord.scopes.includes('trial:queue'),canPrepare:finalRecord.scopes.includes('trial:prepare')}
      }catch{fail()}finally{busy=false}
    },
    async authorize({token,csrfToken,operation}={}){
      try{
        if(closed||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||!Object.hasOwn(operations,operation))fail()
        const at=now();prune(at);const key=hash(token),s=sessions.get(key)
        if(!s)fail()
        if(operation!=='trial.read'&&(typeof csrfToken!=='string'||!/^[a-f0-9]{64}$/.test(csrfToken)
          ||!crypto.timingSafeEqual(Buffer.from(s.csrfHash,'hex'),Buffer.from(hash(csrfToken),'hex'))))fail()
        const r=await read()
        if(r.id!==s.id||r.revision!==s.revision||!r.scopes.includes(operations[operation])){sessions.delete(key);fail()}
        await store.appendAudit({operatorId:s.id,action:operation,at})
        const current=await read()
        if(current.id!==s.id||current.revision!==s.revision||!current.scopes.includes(operations[operation])){sessions.delete(key);fail()}
        const finalAt=now();prune(finalAt)
        if(closed||sessions.get(key)!==s)fail()
        s.lastSeen=finalAt
        if(operation==='session.logout')sessions.delete(key)
        return Object.freeze({operatorId:r.id,revision:r.revision,operation})
      }catch{fail()}
    },
    async resume({token}={}){
      await api.authorize({token,operation:'trial.read'})
      const at=now();prune(at)
      const session=sessions.get(hash(token))
      if(closed||!session)fail()
      const record=await read()
      prune(now())
      if(closed||sessions.get(hash(token))!==session||record.id!==session.id||record.revision!==session.revision)fail()
      const csrfToken=crypto.randomBytes(32).toString('hex')
      session.csrfHash=hash(csrfToken)
      return {csrfToken,expiresAt:session.expiresAt,canQueue:record.scopes.includes('trial:queue'),canPrepare:record.scopes.includes('trial:prepare')}
    },
    shutdown(){closed=true;sessions.clear()},
  }
  return api
}
module.exports={createOperatorAuth}
