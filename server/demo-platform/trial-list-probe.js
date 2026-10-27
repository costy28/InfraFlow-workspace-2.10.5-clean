'use strict'
// Local diagnostic: fixed reader identity, no mutations, no entity names printed.
const {createSqlReader,readPassword}=require('./sql-reader')
async function main(){
  let reader,stage='IDENTITY'
  try{
    if(process.platform!=='linux'||process.getuid()===0)throw Error()
    stage='SECRET';reader=createSqlReader(readPassword())
    stage='READER_CHECK';await reader.check()
    stage='REGISTRY_PAGE'
    const data=await reader.listTrials({limit:1,offset:0})
    console.log('REGISTRY_READ_OK')
    console.log('REGISTRY_TOTAL='+data.total)
    stage='FILTERS'
    await reader.listTrials({limit:1,offset:0,state:'active',search:'~%_['})
    console.log('REGISTRY_FILTERS_OK')
  }catch{console.log('REGISTRY_PROBE_FAILED_STAGE='+stage);process.exitCode=1}
  finally{if(reader)await reader.shutdown().catch(()=>{console.log('REGISTRY_PROBE_CLOSE_FAILED');process.exitCode=1})}
}
if(require.main===module)main().catch(()=>{console.log('REGISTRY_PROBE_FAILED');process.exitCode=1})
