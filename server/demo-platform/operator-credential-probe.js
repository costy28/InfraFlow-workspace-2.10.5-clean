'use strict'
const fs=require('node:fs')
const {createOperatorRuntime,validateCredentialStat}=require('./operator-runtime')
const DIRECTORY='/run/credentials/infraflow-operator-runtime-probe.service'
async function main(){
  let stage='CREDENTIALS',runtime
  try{
    if(process.platform!=='linux'||process.getuid()===0)throw Error()
    const read=name=>{
      if(!['operator-key','operator-sql-password','operator-id'].includes(name))throw Error()
      stage='CREDENTIAL_'+name
      const fd=fs.openSync(DIRECTORY+'/'+name,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW)
      try{
        const stat=fs.fstatSync(fd)
        console.log(name+': uid='+stat.uid+' gid='+stat.gid+' mode='+(stat.mode&0o7777).toString(8)+' links='+stat.nlink)
        validateCredentialStat(stat,process.getuid())
        return fs.readFileSync(fd)
      }finally{fs.closeSync(fd)}
    }
    runtime=await createOperatorRuntime({read})
    stage='SQL_CHECK';await runtime.check()
    console.log('OPERATOR_RUNTIME_SYSTEMD_PROBE_OK')
  }catch{console.log('PROBE_FAILED_STAGE='+stage);process.exitCode=1}
  finally{if(runtime)await runtime.shutdown().catch(()=>{process.exitCode=1})}
}
if(require.main===module)main().catch(()=>{console.log('PROBE_FAILED');process.exitCode=1})
