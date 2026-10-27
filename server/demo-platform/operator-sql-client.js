'use strict'
const names=Object.freeze({read_account:'operator_security.read_account',reserve_attempt:'operator_security.reserve_attempt',claim_totp:'operator_security.claim_totp',append_audit:'operator_security.append_audit'})
const fail=()=>{throw Error('operator_sql_unavailable')}
function validateCommand(command,input){
  if(!Object.hasOwn(names,command)||!input||Object.getPrototypeOf(input)!==Object.prototype
    ||typeof input.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.id))fail()
  const keys=Object.keys(input).sort().join(',')
  if(command==='claim_totp'){
    if(keys!=='counter,id,revision'||!Number.isSafeInteger(input.counter)||input.counter<0||!Number.isInteger(input.revision)||input.revision<0||input.revision>2147483647)fail()
  }else if(command==='append_audit'){
    if(keys!=='action,id'||!['operator_login','trial.read','trial.queue','trial.prepare','trial.activate','session.logout'].includes(input.action))fail()
  }else if(keys!=='id')fail()
}
function createOperatorSqlClient(password,driver){
  if(typeof password!=='string'||!/^[\x20-\x7e]{16,128}$/.test(password))fail()
  driver??=require('mssql')
  const pool=new driver.ConnectionPool({server:'127.0.0.1',port:1433,database:'INFRAFLOW_DEMO_PLATFORM',user:'infraflow_demo_auth',password,
    connectionTimeout:5000,requestTimeout:5000,pool:{min:0,max:2,idleTimeoutMillis:10000},options:{encrypt:true,trustServerCertificate:true}})
  let connection,closed=false,broken=false,stopping
  const active=new Set()
  pool.on('error',()=>{broken=true})
  return {
    execute(command,input){
      try{validateCommand(command,input);if(closed||broken||active.size>=2)fail()}catch{return Promise.reject(Error('operator_sql_unavailable'))}
      const json=JSON.stringify(input)
      const promise=(async()=>{
        try{
          connection??=pool.connect();await connection;if(closed||broken)fail()
          const result=await pool.request().input('json',driver.NVarChar(driver.MAX),json).execute(names[command])
          if(closed||broken)fail()
          const rows=(result.recordsets??[]).find(r=>r.length>0)??[]
          const value=rows.map(row=>String(Object.values(row)[0]??'')).join('')
          if(Buffer.byteLength(value)>8192)fail();return value
        }catch{fail()}
      })()
      active.add(promise);promise.then(()=>active.delete(promise),()=>active.delete(promise));return promise
    },
    shutdown(){
      if(stopping)return stopping
      closed=true;stopping=(async()=>{await Promise.allSettled([...active]);try{await pool.close()}catch{fail()}})();return stopping
    },
  }
}
module.exports={createOperatorSqlClient,validateCommand}
