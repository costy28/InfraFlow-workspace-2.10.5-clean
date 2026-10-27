'use strict'
const fs=require('node:fs')
const {createTrialRegistrar}=require('./trial-registrar')
const DIRECTORIES=Object.freeze(['/run/credentials/infraflow-demo-platform.service','/run/credentials/infraflow-registrar-check.service'])
function validateCredentialStat(stat,uid){
  const mode=stat.mode&0o7777
  if(!Number.isInteger(uid)||uid<=0||!stat.isFile()||stat.nlink!==1||stat.size<16||stat.size>128
    ||!((stat.uid===uid&&mode===0o400)||(stat.uid===0&&stat.gid===0&&mode===0o440)))throw Error('registrar_credential_invalid')
}
function readCredential(directory=DIRECTORIES[0]){
  if(process.platform!=='linux'||!DIRECTORIES.includes(directory))throw Error('registrar_credential_invalid')
  const fd=fs.openSync(directory+'/registrar-password',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW)
  try{validateCredentialStat(fs.fstatSync(fd),process.getuid());return fs.readFileSync(fd)}finally{fs.closeSync(fd)}
}
async function createRegistrarRuntime({directory=DIRECTORIES[0],read=readCredential,createClient=createTrialRegistrar}={}){
  let password,client
  try{
    if(!DIRECTORIES.includes(directory))throw Error()
    password=read(directory)
    if(!Buffer.isBuffer(password)||password.length<16||password.length>128||password.some(byte=>byte<32||byte>126))throw Error()
    client=createClient(password.toString('ascii'))
    await client.check()
    return client
  }catch{if(client)await client.shutdown().catch(()=>{});throw Error('registrar_runtime_unavailable')}
  finally{password?.fill(0)}
}
module.exports={createRegistrarRuntime,validateCredentialStat}
