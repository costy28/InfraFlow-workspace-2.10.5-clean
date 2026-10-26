'use strict'
// Private runtime assembly only. No HTTP routes or privileged SQL fallback.
const fs=require('node:fs')
const {createOperatorSqlClient}=require('./operator-sql-client')
const {createSqlOperatorStore}=require('./operator-store')
const {createOperatorAuth}=require('./operator-auth')
const DIRECTORY='/run/credentials/infraflow-demo-platform.service'
function validateCredentialStat(stat,uid){
  // systemd 255 prefers root-owned files + read-only ACL for the service UID.
  // The ACL mask appears as group-read (0440); gid remains root, not a public group.
  const mode=stat.mode&0o7777
  const serviceOwned=stat.uid===uid&&mode===0o400
  const rootAcl=stat.uid===0&&stat.gid===0&&mode===0o440
  if(!Number.isInteger(uid)||uid<=0||!stat.isFile()||(!serviceOwned&&!rootAcl)||stat.nlink!==1
    ||stat.size<1||stat.size>128)throw Error('operator_credential_invalid')
}
function readCredential(name){
  if(!['operator-key','operator-sql-password','operator-id'].includes(name))throw Error('operator_credential_invalid')
  const fd=fs.openSync(DIRECTORY+'/'+name,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW)
  try{validateCredentialStat(fs.fstatSync(fd),process.getuid());return fs.readFileSync(fd)}finally{fs.closeSync(fd)}
}
function validateMaterial({key,password,id}){
  if(!Buffer.isBuffer(key)||key.length!==32||!Buffer.isBuffer(password)||!Buffer.isBuffer(id)
    ||! /^[\x20-\x7e]{16,128}$/.test(password.toString('ascii'))
    ||password.some(byte=>byte<32||byte>126)
    ||! /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id.toString('utf8')))
    throw Error('operator_credential_invalid')
}
async function createOperatorRuntime({read=readCredential,createClient=createOperatorSqlClient}={}){
  let key,password,id,client,store,auth
  try{
    key=read('operator-key');password=read('operator-sql-password');id=read('operator-id')
    validateMaterial({key,password,id})
    client=createClient(password.toString('ascii'))
    store=createSqlOperatorStore({operatorId:id.toString('utf8'),key,procedures:true,execute:client.execute})
    const account=await store.readOperator()
    if(!account||!account.enabled)throw Error('operator_runtime_unavailable')
    auth=createOperatorAuth({store})
    let stopping
    return Object.freeze({
      async check(){const current=await store.readOperator();if(!current||!current.enabled)throw Error('operator_runtime_unavailable');return {ok:true,code:'platform_operator_runtime_verified'}},
      login:input=>auth.login(input),authorize:input=>auth.authorize(input),resume:input=>auth.resume(input),
      shutdown(){return stopping??=(async()=>{auth.shutdown();store.shutdown();await client.shutdown()})()},
    })
  }catch{
    auth?.shutdown();store?.shutdown();if(client)await client.shutdown().catch(()=>{})
    throw Error('operator_runtime_unavailable')
  }finally{key?.fill(0);password?.fill(0);id?.fill(0)}
}
module.exports={createOperatorRuntime,validateCredentialStat,validateMaterial}
