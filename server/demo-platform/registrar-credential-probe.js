'use strict'
const {createRegistrarRuntime}=require('./registrar-runtime')
async function main(){
  let client
  try{
    if(process.platform!=='linux'||process.getuid()===0)throw Error()
    client=await createRegistrarRuntime({directory:'/run/credentials/infraflow-registrar-check.service'})
    console.log('REGISTRAR_CREDENTIAL_SQL_OK')
  }catch{console.log('REGISTRAR_CREDENTIAL_PROBE_FAILED');process.exitCode=1}
  finally{if(client)await client.shutdown().catch(()=>{console.log('REGISTRAR_PROBE_CLOSE_FAILED');process.exitCode=1})}
}
if(require.main===module)main().catch(()=>{console.log('REGISTRAR_CREDENTIAL_PROBE_FAILED');process.exitCode=1})
