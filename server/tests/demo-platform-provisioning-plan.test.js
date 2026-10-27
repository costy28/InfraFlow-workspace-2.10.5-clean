'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {buildProvisioningPlan}=require('../demo-platform/provisioning-plan')
const {resources}=require('../demo-platform/trial-policy')
const id='11111111-1111-4111-8111-111111111111'
const record=()=>({id,state:'queued',revision:0,activatedAt:null,expiresAt:null,resources:resources(id)})
test('provisioning plan deterministic and review-only; no runtime port, release or activation invented',()=>{
  const input=record(),before=structuredClone(input),plan=buildProvisioningPlan(input)
  assert.deepEqual(input,before);assert.deepEqual(buildProvisioningPlan(input),plan)
  assert.equal(plan.executionAllowed,false);assert.equal(plan.runtime.startAllowed,false)
  assert.equal(plan.runtime.port,null);assert.equal(plan.runtime.codeRelease,null)
  assert.equal(plan.activation.allowed,false);assert.equal(plan.activation.expiresAt,null)
  assert.equal(plan.activation.trialDays,15);assert.match(plan.fingerprint,/^[a-f0-9]{64}$/)
  assert.ok(plan.os.user.length<=32);assert.equal(plan.os.user,plan.os.group)
})
test('bindings cannot redirect database, storage, runtime, key or path',()=>{
  for(const [key,value]of [['database','INFRAFLOW_DEMO'],['storageKey','../neighbor'],['runtimeKey','another'],['keyRef','root']]){
    const input=record();input.resources[key]=value;assert.throws(()=>buildProvisioningPlan(input))
  }
  assert.throws(()=>buildProvisioningPlan({...record(),resources:{...resources(id),path:'/opt/infraflow/app'}}))
  assert.throws(()=>buildProvisioningPlan({...record(),id:'../../root'}))
})
test('non-queued, revised or already dated records are refused',()=>{
  for(const patch of [{state:'active'},{state:'provisioning'},{revision:1},{activatedAt:0},{expiresAt:0}])assert.throws(()=>buildProvisioningPlan({...record(),...patch}))
})
test('different UUIDs separate planned identities, DB names, directories and fingerprints',()=>{
  const other='22222222-2222-4222-8222-222222222222'
  const a=buildProvisioningPlan(record()),b=buildProvisioningPlan({...record(),id:other,resources:resources(other)})
  for(const key of ['database','login','user'])assert.notEqual(a.sql[key],b.sql[key])
  for(const key of ['user','group','unit'])assert.notEqual(a.os[key],b.os[key])
  for(const key of ['storage','state','config','keySource'])assert.notEqual(a.paths[key],b.paths[key])
  assert.notEqual(a.fingerprint,b.fingerprint)
})
