'use strict'
// Isolated asynchronous adapter. Never reads ERP env or uses sql.connect's global pool.
const {createSqlProcessPool}=require('../tests/support/demo-sql-process-pool')
const fail=code=>{throw Object.assign(Error(code),{code})}
function createNodeSqlTestExecutor(config,driver){
  if(process.env.NODE_ENV!=='test')fail('synthetic_test_only')
  if(!config||Object.getPrototypeOf(config)!==Object.prototype||Object.keys(config).sort().join(',')!=='database,password,port,user'
    ||typeof config.database!=='string'||!/^INFRAFLOW_TEST_TRIALS_[A-F0-9]{12}$/.test(config.database)
    ||config.user!==`INFRAFLOW_TEST_CP_${config.database.slice(-12)}`
    ||typeof config.password!=='string'||config.password.length<32||config.password.length>128
    ||!Number.isInteger(config.port)||config.port<1024||config.port>65535)fail('invalid_node_sql_test_config')
  const database=config.database
  driver??=require('mssql')
  const pool=new driver.ConnectionPool({server:'127.0.0.1',port:config.port,database,user:config.user,password:config.password,
    connectionTimeout:5000,requestTimeout:15000,pool:{min:0,max:2,idleTimeoutMillis:10000},
    options:{encrypt:true,trustServerCertificate:true,enableArithAbort:true}})
  let connecting,failed=false,state='open',stopping
  pool.on('error',()=>{failed=true})
  const limiter=createSqlProcessPool({maxActive:2,maxQueued:16,queueTimeoutMs:10000,execute:query})
  async function query({sql,input,signal}){
    if(signal?.aborted)fail('synthetic_sql_aborted')
    if(failed)fail('synthetic_node_sql_failed')
    try{connecting??=pool.connect();await connecting}catch{failed=true;fail('synthetic_node_sql_failed')}
    if(signal?.aborted)fail('synthetic_sql_aborted')
    if(failed)fail('synthetic_node_sql_failed')
    let request,cancelled=false
    const abort=()=>{cancelled=true;try{request?.cancel()}catch{failed=true}}
    try{
      request=pool.request()
      signal?.addEventListener('abort',abort,{once:true})
      if(signal?.aborted)fail('synthetic_sql_aborted')
      request.input('json',driver.NVarChar(driver.MAX),JSON.stringify(input))
      const result=await request.query(`SET ANSI_NULLS ON;SET QUOTED_IDENTIFIER ON;SET ANSI_PADDING ON;SET ANSI_WARNINGS ON;SET ARITHABORT ON;SET CONCAT_NULL_YIELDS_NULL ON;SET NUMERIC_ROUNDABORT OFF;\n${sql}`)
      if(cancelled||signal?.aborted)fail('synthetic_sql_aborted')
      if(failed)fail('synthetic_node_sql_failed')
      const sets=result?.recordsets??[result?.recordset??[]]
      if(!Array.isArray(sets)||sets.some(rows=>!Array.isArray(rows)))fail('synthetic_node_sql_failed')
      const rows=sets.find(rows=>rows.some(row=>row&&Object.values(row).some(v=>v!==null&&v!==undefined)))??[]
      const output=rows.map(row=>String(Object.values(row).find(v=>v!==null&&v!==undefined)??'')).join('')
      if(Buffer.byteLength(output)>1024*1024)fail('synthetic_node_sql_output_limit')
      return output
    }catch(error){
      if(cancelled||signal?.aborted||error.code==='synthetic_sql_aborted')fail('synthetic_sql_aborted')
      fail(error.code==='synthetic_node_sql_output_limit'?'synthetic_node_sql_output_limit':'synthetic_node_sql_failed')
    }finally{signal?.removeEventListener('abort',abort)}
  }
  return {
    async execute(target,sql,input={},options={}){
      if(process.env.NODE_ENV!=='test')fail('synthetic_test_only')
      if(state!=='open')fail('synthetic_sql_pool_closed')
      if(target!==database||typeof sql!=='string'||!input||Object.getPrototypeOf(input)!==Object.prototype
        ||Buffer.byteLength(sql)>20000||Buffer.byteLength(JSON.stringify(input))>20000
        ||!options||Object.getPrototypeOf(options)!==Object.prototype||Object.keys(options).some(k=>k!=='signal')
        ||(options.signal!==undefined&&!(options.signal instanceof AbortSignal)))fail('invalid_node_sql_test_request')
      return limiter.run({sql,input:structuredClone(input),signal:options.signal})
    },
    shutdown(){
      if(process.env.NODE_ENV!=='test')return Promise.reject(Error('synthetic_test_only'))
      if(stopping)return stopping
      state='closing'
      stopping=limiter.shutdown().then(()=>pool.close()).then(()=>{state='closed'},()=>fail('synthetic_node_sql_close_failed'))
      return stopping
    },
    status:()=>({state,failed,limiter:limiter.status()}),
  }
}
module.exports={createNodeSqlTestExecutor}
