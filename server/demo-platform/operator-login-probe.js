'use strict'
// Root-only local diagnostic, not runtime service authentication or HTTP API.
const fs=require('node:fs')
const {createSqlOperatorStore}=require('./operator-store')
const {createOperatorAuth}=require('./operator-auth')
const {createOperatorSqlClient}=require('./operator-sql-client')
function validateKeyStat(stat){
  if(!stat.isFile()||stat.uid!==0||stat.gid!==0||(stat.mode&0o777)!==0o600||stat.nlink!==1||stat.size!==32)throw Error('operator_key_invalid')
}
function readKey(){
  const fd=fs.openSync('/etc/infraflow-demo-platform/operator-auth.key',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW)
  try{validateKeyStat(fs.fstatSync(fd));const key=fs.readFileSync(fd);if(key.length!==32)throw Error('operator_key_invalid');return key}finally{fs.closeSync(fd)}
}
function validateInput(input){
  if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).sort().join(',')!=='code,operatorId,password,sqlPassword,username'
    ||typeof input.sqlPassword!=='string'||!/^[\x20-\x7e]{16,128}$/.test(input.sqlPassword)
    ||typeof input.operatorId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input.operatorId)
    ||typeof input.password!=='string'||Buffer.byteLength(input.password)>1024
    ||typeof input.username!=='string'||!/^[a-z0-9_.-]{1,64}$/.test(input.username)
    ||typeof input.code!=='string'||!/^\d{6}$/.test(input.code))throw Error('probe_input_invalid')
}
async function main(input){
  if(process.platform!=='linux'||typeof process.getuid!=='function'||process.getuid()!==0)throw Error('root_linux_required')
  validateInput(input)
  let client,store,auth,key,stage='KEY'
  try{
    key=readKey();stage='CONNECT'
    const sql=require('/opt/infraflow-demo-platform/releases/sql-reader-v1/node_modules/mssql')
    client=createOperatorSqlClient(input.sqlPassword,sql);stage='ACCOUNT'
    store=createSqlOperatorStore({operatorId:input.operatorId,key,procedures:true,execute:client.execute})
    const account=await store.readOperator()
    if(!account||account.username!==input.username||!account.enabled)throw Error()
    auth=createOperatorAuth({store});stage='PASSWORD_TOTP'
    const session=await auth.login({username:input.username,password:input.password,code:input.code})
    stage='READ_SCOPE';await auth.authorize({...session,operation:'trial.read'})
    stage='LOGOUT';await auth.authorize({...session,operation:'session.logout'})
    console.log('OPERATOR_PASSWORD_TOTP_OK\nOPERATOR_READ_SCOPE_OK\nOPERATOR_LOGOUT_OK')
  }catch{console.log('OPERATOR_PROBE_FAILED_STAGE='+stage);process.exitCode=1}
  finally{auth?.shutdown();store?.shutdown();key?.fill(0);if(client)await client.shutdown().catch(()=>{process.exitCode=1})}
}
if(require.main===module){
  let size=0,chunks=[]
  process.stdin.on('data',chunk=>{size+=chunk.length;if(size>8192){process.stderr.write('probe_input_limit\n');process.exit(1)}chunks.push(chunk)})
  process.stdin.on('end',()=>Promise.resolve().then(()=>main(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
    .catch(()=>{console.log('OPERATOR_PROBE_PREFLIGHT_FAILED');process.exitCode=1}).finally(()=>{chunks=[]}))
}
module.exports={validateKeyStat,validateInput}
