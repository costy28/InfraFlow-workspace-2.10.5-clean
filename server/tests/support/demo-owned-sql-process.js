'use strict'
const {execFile}=require('node:child_process')
const aborted=()=>Object.assign(Error('synthetic_sql_aborted'),{code:'synthetic_sql_aborted'})
function runOwnedSqlProcess({script,env,signal,onProcess}){
  if(process.env.NODE_ENV!=='test')throw Error('synthetic_test_only')
  if(signal?.aborted)return Promise.reject(aborted())
  return new Promise((resolve,reject)=>{
    let outcome,cancelled=false
    // Kill only this ChildProcess object; never enumerate PIDs or SQL sessions.
    const child=execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],
      {env,encoding:'utf8',timeout:25000,maxBuffer:1024*1024,windowsHide:true},
      (error,stdout)=>{outcome={error,stdout}})
    const cancel=()=>{cancelled=true;child.kill()}
    signal?.addEventListener('abort',cancel,{once:true})
    child.once('close',()=>{
      signal?.removeEventListener('abort',cancel)
      if(cancelled||signal?.aborted)return reject(aborted())
      if(outcome?.error||!outcome)return reject(Object.assign(Error('synthetic_sql_process_failed'),{code:'synthetic_sql_process_failed'}))
      resolve(outcome.stdout)
    })
    if(signal?.aborted)cancel()
    if(onProcess)onProcess(child)
  })
}
module.exports={runOwnedSqlProcess}
