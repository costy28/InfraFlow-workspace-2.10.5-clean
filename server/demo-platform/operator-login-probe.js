'use strict'
// Root-only local diagnostic, not runtime service authentication or HTTP API.
const fs=require('node:fs')
const {createSqlOperatorStore}=require('./operator-store')
const {createOperatorAuth}=require('./operator-auth')
function validateKeyStat(stat){
  if(!stat.isFile()||stat.uid!==0||stat.gid!==0||(stat.mode&0o777)!==0o600||stat.nlink!==1||stat.size!==32)throw Error('operator_key_invalid')
}
function readKey(){
  const fd=fs.openSync('/etc/infraflow-demo-platform/operator-auth.key',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW)
  try{validateKeyStat(fs.fstatSync(fd));const key=fs.readFileSync(fd);if(key.length!==32)throw Error('operator_key_invalid');return key}finally{fs.closeSync(fd)}
}
function validateInput(input){
  if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).sort().join(',')!=='adminPassword,code,password,username'
    ||typeof input.adminPassword!=='string'||!input.adminPassword||Buffer.byteLength(input.adminPassword)>1024
    ||typeof input.password!=='string'||Buffer.byteLength(input.password)>1024
    ||typeof input.username!=='string'||!/^[a-z0-9_.-]{1,64}$/.test(input.username)
    ||typeof input.code!=='string'||!/^\d{6}$/.test(input.code))throw Error('probe_input_invalid')
}
async function main(input){
  if(process.platform!=='linux'||typeof process.getuid!=='function'||process.getuid()!==0)throw Error('root_linux_required')
  validateInput(input)
  let pool,store,auth,key,stage='KEY'
  try{
    key=readKey();stage='CONNECT'
    const sql=require('/opt/infraflow-demo-platform/releases/sql-reader-v1/node_modules/mssql')
    pool=new sql.ConnectionPool({server:'127.0.0.1',port:1433,database:'INFRAFLOW_DEMO_PLATFORM',user:'sa',password:input.adminPassword,
      connectionTimeout:5000,requestTimeout:5000,pool:{min:0,max:1},options:{encrypt:true,trustServerCertificate:true}})
    pool.on('error',()=>{});await pool.connect();stage='ACCOUNT'
    const found=await pool.request().input('username',sql.VarChar(64),input.username)
      .query('SELECT LOWER(CONVERT(char(36),operator_id)) id FROM operator_security.accounts WHERE username=@username;')
    if(found.recordset.length!==1)throw Error()
    store=createSqlOperatorStore({operatorId:found.recordset[0].id,key,execute:async(query,json)=>{
      const result=await pool.request().input('json',sql.NVarChar(sql.MAX),JSON.stringify(json)).query(query)
      const rows=(result.recordsets??[]).find(set=>set.length>0)??[]
      return rows.map(row=>String(Object.values(row)[0]??'')).join('')
    }})
    auth=createOperatorAuth({store});stage='PASSWORD_TOTP'
    const session=await auth.login({username:input.username,password:input.password,code:input.code})
    stage='READ_SCOPE';await auth.authorize({...session,operation:'trial.read'})
    stage='LOGOUT';await auth.authorize({...session,operation:'session.logout'})
    console.log('OPERATOR_PASSWORD_TOTP_OK\nOPERATOR_READ_SCOPE_OK\nOPERATOR_LOGOUT_OK')
  }catch{console.log('OPERATOR_PROBE_FAILED_STAGE='+stage);process.exitCode=1}
  finally{auth?.shutdown();store?.shutdown();key?.fill(0);if(pool)await pool.close().catch(()=>{process.exitCode=1})}
}
if(require.main===module){
  let size=0,chunks=[]
  process.stdin.on('data',chunk=>{size+=chunk.length;if(size>8192){process.stderr.write('probe_input_limit\n');process.exit(1)}chunks.push(chunk)})
  process.stdin.on('end',()=>Promise.resolve().then(()=>main(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
    .catch(()=>{console.log('OPERATOR_PROBE_PREFLIGHT_FAILED');process.exitCode=1}).finally(()=>{chunks=[]}))
}
module.exports={validateKeyStat,validateInput}
