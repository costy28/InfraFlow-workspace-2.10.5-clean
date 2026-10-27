'use strict'
// Unmounted command client. Dedicated SQL identity, one fixed procedure, no provisioning.
const IDENTITY=`SET NOCOUNT ON;
SELECT DB_NAME() AS db,ORIGINAL_LOGIN() AS login,IS_SRVROLEMEMBER('sysadmin') AS sysadmin,
HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL') AS controlDb,
HAS_PERMS_BY_NAME('platform.queue_trial_by_operator','OBJECT','EXECUTE') AS canQueue,
HAS_PERMS_BY_NAME('platform.queue_trial','OBJECT','EXECUTE') AS canLegacyQueue,
HAS_PERMS_BY_NAME('platform.activate_trial','OBJECT','EXECUTE') AS canActivate,
HAS_PERMS_BY_NAME('platform.trials','OBJECT','SELECT') AS canRead,
HAS_PERMS_BY_NAME('platform.trials','OBJECT','INSERT') AS canInsert,
HAS_PERMS_BY_NAME('platform.trials','OBJECT','UPDATE') AS canUpdate,
HAS_PERMS_BY_NAME('platform.trials','OBJECT','DELETE') AS canDelete,
HAS_DBACCESS(N'INFRAFLOW_DEMO') AS accessDemo;
SELECT permission_name FROM sys.fn_my_permissions(NULL,'SERVER');`
function validateInput(input){
  if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).sort().join(',')!=='approvalId,commandId,companyName,operatorId,operatorRevision')throw Error('trial_registration_invalid')
  if(typeof input.operatorId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.operatorId)
    ||!Number.isInteger(input.operatorRevision)||input.operatorRevision<0||input.operatorRevision>2147483647)throw Error('trial_registration_invalid')
  for(const key of ['approvalId','commandId'])if(typeof input[key]!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(input[key]))throw Error('trial_registration_invalid')
  if(typeof input.companyName!=='string'||input.companyName!==input.companyName.trim()||!input.companyName||input.companyName.length>200||/[\x00-\x1f\x7f]/.test(input.companyName))throw Error('trial_registration_invalid')
  return Object.freeze({...input})
}
function validateIdentity(result){
  const row=result?.recordsets?.[0]?.[0],permissions=result?.recordsets?.[1]
  if(!row||row.db!=='INFRAFLOW_DEMO_PLATFORM'||row.login!=='infraflow_demo_registrar'||row.sysadmin!==0||row.controlDb!==0||row.canQueue!==1
    ||['canLegacyQueue','canActivate','canRead','canInsert','canUpdate','canDelete','accessDemo'].some(key=>row[key]!==0)
    ||!Array.isArray(permissions)||!permissions.some(r=>r.permission_name==='CONNECT SQL')
    ||permissions.some(r=>!['CONNECT SQL','VIEW ANY DATABASE'].includes(r.permission_name)))throw Error('registrar_identity_invalid')
}
function receipt(result){
  const rows=(result?.recordsets??[]).find(set=>set.length>0)??[]
  const raw=rows.map(row=>String(Object.values(row)[0]??'')).join('')
  if(Buffer.byteLength(raw)>2048)throw Error()
  const row=JSON.parse(raw)
  if(typeof row.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.id)
    ||row.state!=='queued'||row.revision!==0||typeof row.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z?$/.test(row.createdAt))throw Error()
  const date=new Date(row.createdAt.endsWith('Z')?row.createdAt:row.createdAt+'Z')
  if(!Number.isFinite(date.getTime()))throw Error()
  return Object.freeze({id:row.id,state:'queued',revision:0,createdAt:date.toISOString()})
}
function createTrialRegistrar(password,driver){
  if(typeof password!=='string'||!/^[\x20-\x7e]{16,128}$/.test(password))throw Error('registrar_secret_invalid')
  driver??=require('mssql')
  const pool=new driver.ConnectionPool({server:'127.0.0.1',port:1433,database:'INFRAFLOW_DEMO_PLATFORM',user:'infraflow_demo_registrar',password,
    connectionTimeout:5000,requestTimeout:10000,pool:{min:0,max:1,idleTimeoutMillis:10000},options:{encrypt:true,trustServerCertificate:true}})
  let connection,pending,closed=false,broken=false,stopping
  pool.on('error',()=>{broken=true})
  return {
    check(){
      if(closed||broken||pending)return Promise.reject(Error('registrar_check_unavailable'))
      pending=(async()=>{
        try{connection??=pool.connect();await connection;if(closed||broken)throw Error()
          validateIdentity(await pool.request().query(IDENTITY));if(closed||broken)throw Error()
          return {ok:true,code:'registrar_scope_verified'}
        }catch{throw Error('registrar_check_unavailable')}
        finally{pending=undefined}
      })()
      return pending
    },
    queue(input){
      let request
      try{request=validateInput(input)}catch(error){return Promise.reject(error)}
      if(closed||broken||pending)return Promise.reject(Error('trial_registration_unavailable'))
      pending=(async()=>{
        try{
          connection??=pool.connect();await connection;if(closed||broken)throw Error()
          validateIdentity(await pool.request().query(IDENTITY));if(closed||broken)throw Error()
          const result=await pool.request().input('json',driver.NVarChar(driver.MAX),JSON.stringify(request))
            .execute('platform.queue_trial_by_operator')
          return receipt(result)
        }catch(error){
          if(error.number===51913)throw Error('trial_registration_conflict')
          // No retry: a transport/receipt error may occur after the transaction committed.
          throw Error('trial_registration_result_unconfirmed')
        }finally{pending=undefined}
      })()
      return pending
    },
    shutdown(){if(stopping)return stopping;closed=true;stopping=(async()=>{if(pending)await pending.catch(()=>{});await pool.close()})();return stopping},
  }
}
module.exports={createTrialRegistrar,validateInput,validateIdentity,receipt}
