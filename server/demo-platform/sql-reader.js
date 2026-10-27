'use strict'
const fs=require('node:fs')
const trialList=require('./trial-list')
const PASSWORD_FILE='/etc/infraflow-demo-platform/sql-reader.password'
function validateSecretStat(stat,gid){
  if(!stat.isFile()||stat.uid!==0||stat.gid!==gid||(stat.mode&0o777)!==0o640||stat.nlink!==1||stat.size<16||stat.size>128)throw Error('platform_secret_invalid')
}
function readPassword(){
  if(process.platform!=='linux'||typeof process.getgid!=='function')throw Error('platform_linux_required')
  const fd=fs.openSync(PASSWORD_FILE,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW)
  try{
    validateSecretStat(fs.fstatSync(fd),process.getgid())
    const password=fs.readFileSync(fd,'utf8')
    if(!/^[\x20-\x7e]{16,128}$/.test(password))throw Error('platform_secret_invalid')
    return password
  }finally{fs.closeSync(fd)}
}
const SQL=`SET NOCOUNT ON;
SELECT DB_NAME() AS db,ORIGINAL_LOGIN() AS login,IS_SRVROLEMEMBER('sysadmin') AS sysadmin,
HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL') AS controlDb,
HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CREATE TABLE') AS createTable,
HAS_PERMS_BY_NAME('platform.bootstrap','OBJECT','INSERT') AS insertBootstrap,
HAS_DBACCESS(N'INFRAFLOW_DEMO') AS accessDemo;
SELECT permission_name FROM sys.fn_my_permissions(NULL,'SERVER');
SELECT singleton,format FROM platform.bootstrap;`
function validateProbe(result){
  const sets=result?.recordsets
  if(!Array.isArray(sets)||sets.length!==3||sets[0].length!==1||sets[2].length!==1)throw Error('platform_sql_identity_invalid')
  const row=sets[0][0],bootstrap=sets[2][0]
  if(row.db!=='INFRAFLOW_DEMO_PLATFORM'||row.login!=='infraflow_demo_platform'
    ||row.sysadmin!==0||row.controlDb!==0||row.createTable!==0||row.insertBootstrap!==0||row.accessDemo!==0
    ||bootstrap.singleton!==true||bootstrap.format!=='infraflow-platform-bootstrap-v1'
    ||!sets[1].some(r=>r.permission_name==='CONNECT SQL')
    ||sets[1].some(r=>!['CONNECT SQL','VIEW ANY DATABASE'].includes(r.permission_name)))throw Error('platform_sql_identity_invalid')
}
function createSqlReader(password,driver){
  if(typeof password!=='string'||!/^[\x20-\x7e]{16,128}$/.test(password))throw Error('platform_secret_invalid')
  driver??=require('mssql')
  const pool=new driver.ConnectionPool({server:'127.0.0.1',port:1433,database:'INFRAFLOW_DEMO_PLATFORM',user:'infraflow_demo_platform',password,
    connectionTimeout:5000,requestTimeout:5000,pool:{min:0,max:1,idleTimeoutMillis:10000},options:{encrypt:true,trustServerCertificate:true}})
  let connection,pending,listing,closing=false,stopping,broken=false
  pool.on('error',()=>{broken=true})
  return {
    check(){
      if(closing||broken||listing)return Promise.reject(Error('platform_sql_unavailable'))
      if(pending)return pending
      pending=(async()=>{
        try{connection??=pool.connect();await connection;if(closing||broken)throw Error();validateProbe(await pool.request().query(SQL));if(closing||broken)throw Error();return {ok:true,code:'platform_sql_reader_verified'}}
        catch{throw Error('platform_sql_unavailable')}
        finally{pending=undefined}
      })()
      return pending
    },
    listTrials(input){
      let options
      try{options=trialList.filters(input);if(closing||broken||pending||listing)throw Error()}catch{return Promise.reject(Error('platform_sql_unavailable'))}
      listing=(async()=>{
        try{
          connection??=pool.connect();await connection
          if(closing||broken)throw Error()
          validateProbe(await pool.request().query(SQL))
          const pattern='%'+options.search.replace(/[~%_\[]/g,char=>'~'+char)+'%'
          const request=pool.request().input('limit',driver.Int,options.limit).input('offset',driver.Int,options.offset)
            .input('state',driver.VarChar(32),options.state).input('search',driver.NVarChar(100),options.search)
            .input('pattern',driver.NVarChar(202),pattern)
          const result=await request.query(trialList.SQL)
          if(closing||broken)throw Error()
          return trialList.project(result,options)
        }catch{throw Error('platform_sql_unavailable')}
        finally{listing=undefined}
      })()
      return listing
    },
    shutdown(){
      if(stopping)return stopping
      closing=true
      stopping=(async()=>{await Promise.allSettled([pending,listing]);try{await pool.close()}catch{throw Error('platform_sql_close_failed')}})()
      return stopping
    },
  }
}
module.exports={readPassword,validateSecretStat,validateProbe,createSqlReader}
