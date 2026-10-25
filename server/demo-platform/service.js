'use strict'
// Separate platform process. Never imports ERP app/db or synthetic test harnesses.
const http=require('node:http')
function parseConfig(env){
  if(env.INFRAFLOW_DEMO_PLATFORM_MODE!=='foundation')throw Error('invalid_platform_mode')
  const raw=env.INFRAFLOW_DEMO_PLATFORM_PORT
  if(typeof raw!=='string'||!/^\d{4,5}$/.test(raw)||Number(raw)<1024||Number(raw)>65535)throw Error('invalid_platform_port')
  const port=Number(raw)
  if([4180,4181].includes(port))throw Error('reserved_platform_port')
  return Object.freeze({host:'127.0.0.1',port})
}
function createPlatformService({onError=()=>{},sqlReader}={}){
  let state='created',stopping,starting
  const server=http.createServer(async(req,res)=>{
    req.resume()
    const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body))}
    if(state!=='listening')return send(503,{code:'platform_stopping'})
    if(req.method!=='GET')return send(405,{code:'method_not_allowed'})
    if(req.url==='/health/live')return send(200,{ok:true,service:'demo-platform',mode:'foundation'})
    if(req.url==='/health/sql'){
      if(!sqlReader)return send(503,{ok:false,code:'platform_sql_not_configured'})
      try{const result=await sqlReader.check();if(state!=='listening')return send(503,{code:'platform_stopping'});return send(200,result)}
      catch{return send(503,{ok:false,code:'platform_sql_unavailable'})}
    }
    if(req.url==='/health/ready')return send(503,{ok:false,code:'platform_not_ready'})
    return send(404,{code:'not_found'})
  })
  server.requestTimeout=5000;server.headersTimeout=5000;server.keepAliveTimeout=1000
  server.maxHeadersCount=32
  server.on('error',()=>onError('platform_listener_failed'))
  return {
    start(config){
      if(state!=='created')return Promise.reject(Error('platform_already_started'))
      if(!config||config.host!=='127.0.0.1'||!Number.isInteger(config.port)||config.port<1024||config.port>65535||[4180,4181].includes(config.port))return Promise.reject(Error('invalid_platform_config'))
      state='starting'
      starting=new Promise((resolve,reject)=>{
        const failed=()=>{server.removeListener('listening',ready);state='failed';reject(Error('platform_listener_failed'))}
        const ready=()=>{server.removeListener('error',failed);state='listening';resolve()}
        server.once('error',failed);server.once('listening',ready);server.listen(config.port,config.host)
      })
      return starting
    },
    shutdown(){
      if(stopping)return stopping
      stopping=(async()=>{
        if(state==='starting')await starting.catch(()=>{})
        state='stopping'
        if(server.listening)await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()})
        if(sqlReader)await sqlReader.shutdown()
        state='stopped'
      })()
      return stopping
    },
    status:()=>({state}),
  }
}
async function main(){
  if(process.platform!=='linux')throw Error('platform_linux_required')
  if(typeof process.getuid!=='function'||process.getuid()===0)throw Error('platform_unprivileged_identity_required')
  const config=parseConfig(process.env)
  if(process.env.INFRAFLOW_DEMO_PLATFORM_SQL!==undefined&&process.env.INFRAFLOW_DEMO_PLATFORM_SQL!=='1')throw Error('invalid_platform_sql_mode')
  let sqlReader
  if(process.env.INFRAFLOW_DEMO_PLATFORM_SQL==='1'){
    const reader=require('./sql-reader');sqlReader=reader.createSqlReader(reader.readPassword())
  }
  const service=createPlatformService({sqlReader,onError:code=>console.error(code)})
  const stop=()=>{service.shutdown().catch(()=>{console.error('platform_shutdown_failed');process.exitCode=1})}
  process.once('SIGTERM',stop);process.once('SIGINT',stop)
  await service.start(config)
  console.log('demo_platform_foundation_listening')
}
if(require.main===module)main().catch(()=>{console.error('demo_platform_start_failed');process.exitCode=1})
module.exports={parseConfig,createPlatformService}
