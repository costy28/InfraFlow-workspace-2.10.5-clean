'use strict';
const {createPreparerRuntime}=require('./preparer-runtime');
async function main(){
 if(process.platform!=='linux'||process.getuid()===0||process.argv.length!==2)throw Error();
 let runtime;
 try{runtime=await createPreparerRuntime({directory:'/run/credentials/infraflow-preparer-check.service'});await runtime.shutdown();runtime=undefined;console.log('PREPARER_CREDENTIAL_SQL_OK');}
 finally{if(runtime)await runtime.shutdown();}
}
if(require.main===module)main().catch(()=>{console.error('PREPARER_CREDENTIAL_PROBE_FAILED');process.exitCode=1;});
