'use strict';
// Future one-shot systemd probe: metadata only, no job mutations or tenant effects.
const {createProvisionLeaseRuntime}=require('./provision-lease-runtime');
async function main(){
 if(process.platform!=='linux'||typeof process.getuid!=='function'||process.getuid()===0||process.argv.length!==2)throw Error();
 let runtime;
 try{
  runtime=await createProvisionLeaseRuntime({directory:'/run/credentials/infraflow-demo-lease-check.service'});
  await runtime.shutdown();runtime=undefined;
  console.log('LEASE_SYSTEMD_SCOPE_PROBE_OK');
 }finally{if(runtime)await runtime.shutdown();}
}
if(require.main===module)main().catch(()=>{console.error('LEASE_SYSTEMD_SCOPE_PROBE_FAILED');process.exitCode=1;});
