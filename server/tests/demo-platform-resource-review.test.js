'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reviewProvisionResources}=require('../demo-platform/provision-resource-review');
function fixture(){
 const trialId='b1100b43-48d0-42fa-8a1d-73b1286f8242',jobId='00f612ed-a8ac-4688-a26f-679760eee0be',c=trialId.replaceAll('-','');
 const manifest={format:'infraflow-provision-job-v1',trialId,databaseName:'INFRAFLOW_DEMO_T_'+c.toUpperCase(),sqlLogin:'infraflow_t_'+c,
  osIdentity:'ift_'+c.slice(0,28),storageRoot:'/var/lib/infraflow-demo-tenants/'+trialId,configRoot:'/etc/infraflow-demo-tenants/'+trialId,
  unitName:'infraflow-trial-'+c+'.service',keyRef:'trial:'+trialId,runtimePort:null,codeRelease:null};
 const names={database:'databaseName',sql_login:'sqlLogin',os_identity:'osIdentity',storage_root:'storageRoot',config_root:'configRoot',systemd_unit:'unitName',key_ref:'keyRef'};
 return {jobId,trialId,jobRevision:3,generation:1,trialRevision:1,state:'queued',trialState:'queued',executionReady:false,leaseAbsent:true,
  activatedAt:null,expiresAt:null,manifest,reservations:Object.entries(names).map(([resourceType,key])=>({resourceType,resourceKey:manifest[key],jobId,trialId}))};
}
test('seven exact bindings produce review only, including after released generation',()=>{
 const f=fixture(),before=JSON.stringify(f),r=reviewProvisionResources(f);
 assert.equal(r.executionAllowed,false);assert.equal(r.expectedJobRevision,3);assert.equal(Object.keys(r.resources).length,7);
 assert.equal(JSON.stringify(f),before);assert.equal(Object.isFrozen(r.resources),true);
});
test('tampered paths, peer binding, duplicates and unallocated runtime are refused',()=>{
 for(const change of [f=>f.manifest.storageRoot+='/../peer',f=>f.reservations[0].jobId=f.trialId,
  f=>f.reservations[1]=f.reservations[0],f=>f.manifest.runtimePort=4180,f=>f.manifest.codeRelease='/opt/infraflow/app',
  f=>f.reservations.pop(),f=>f.extra='shell',f=>f.executionReady=true,f=>f.leaseAbsent=false,
  f=>f.state='leased',f=>f.activatedAt='2026-10-28',f=>f.jobRevision=-1]){
  const f=fixture();change(f);assert.throws(()=>reviewProvisionResources(f),/provision_resource_review_refused/);
 }
});
test('accessor payload never evaluated',()=>{
 const f=fixture();let called=false;Object.defineProperty(f,'manifest',{get(){called=true;throw Error('secret');}});
 assert.throws(()=>reviewProvisionResources(f));assert.equal(called,false);
});
