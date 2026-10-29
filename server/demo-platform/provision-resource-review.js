'use strict';
// Trusted SQL projection only. This review never grants authority to create resources.
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
function exact(value,keys){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)throw Error();
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))throw Error();}
}
function reviewProvisionResources(snapshot){
 try{
  exact(snapshot,['jobId','trialId','jobRevision','generation','trialRevision','state','trialState','executionReady','leaseAbsent','activatedAt','expiresAt','manifest','reservations']);
  if(!UUID.test(snapshot.jobId)||!UUID.test(snapshot.trialId)||typeof snapshot.jobId!=='string'||typeof snapshot.trialId!=='string'||
   !Number.isInteger(snapshot.jobRevision)||snapshot.jobRevision<0||snapshot.jobRevision>=2147483647||
   !Number.isInteger(snapshot.generation)||snapshot.generation<0||snapshot.generation>=2147483647||
   !Number.isInteger(snapshot.trialRevision)||snapshot.trialRevision<1||snapshot.trialRevision>=2147483647||
   snapshot.state!=='queued'||snapshot.trialState!=='queued'||snapshot.executionReady!==false||snapshot.leaseAbsent!==true||
   snapshot.activatedAt!==null||snapshot.expiresAt!==null)throw Error();
  const id=snapshot.trialId,compact=id.replaceAll('-','');
  const manifest={format:'infraflow-provision-job-v1',trialId:id,databaseName:'INFRAFLOW_DEMO_T_'+compact.toUpperCase(),
   sqlLogin:'infraflow_t_'+compact,osIdentity:'ift_'+compact.slice(0,28),storageRoot:'/var/lib/infraflow-demo-tenants/'+id,
   configRoot:'/etc/infraflow-demo-tenants/'+id,unitName:'infraflow-trial-'+compact+'.service',keyRef:'trial:'+id,runtimePort:null,codeRelease:null};
  exact(snapshot.manifest,Object.keys(manifest));
  for(const key of Object.keys(manifest))if(snapshot.manifest[key]!==manifest[key])throw Error();
  const expected={database:manifest.databaseName,sql_login:manifest.sqlLogin,os_identity:manifest.osIdentity,
   storage_root:manifest.storageRoot,config_root:manifest.configRoot,systemd_unit:manifest.unitName,key_ref:manifest.keyRef};
  if(!Array.isArray(snapshot.reservations)||snapshot.reservations.length!==7)throw Error();
  const seen=new Set();
  for(const row of snapshot.reservations){
   exact(row,['resourceType','resourceKey','jobId','trialId']);
   if(!Object.hasOwn(expected,row.resourceType)||seen.has(row.resourceType)||row.resourceKey!==expected[row.resourceType]||
    row.jobId!==snapshot.jobId||row.trialId!==id)throw Error();
   seen.add(row.resourceType);
  }
  return Object.freeze({format:'infraflow-resource-review-v1',jobId:snapshot.jobId,trialId:id,
   expectedJobRevision:snapshot.jobRevision,generation:snapshot.generation,trialRevision:snapshot.trialRevision,
   resources:Object.freeze(expected),executionAllowed:false,
   nextGate:'privileged_adapter_authority_and_durable_step_journal'});
 }catch{throw Error('provision_resource_review_refused');}
}
module.exports={reviewProvisionResources};
