'use strict'
// Review-only plan from a trusted registry row. Never executes SQL/OS operations or allocates a port.
const {resources}=require('./trial-policy')
const {createHash}=require('node:crypto')
function buildProvisioningPlan(record){
  if(!record||Object.getPrototypeOf(record)!==Object.prototype||record.state!=='queued'||record.revision!==0
    ||record.activatedAt!==null||record.expiresAt!==null)throw Error('trial_not_ready_for_planning')
  const binding=resources(record.id)
  if(!record.resources||Object.getPrototypeOf(record.resources)!==Object.prototype
    ||Object.keys(record.resources).sort().join(',')!=='database,keyRef,runtimeKey,storageKey'
    ||Object.keys(binding).some(key=>record.resources[key]!==binding[key]))throw Error('trial_resource_binding_invalid')
  const compact=record.id.replaceAll('-','')
  const plan={
    format:'infraflow-provisioning-review-v1',trialId:record.id,expectedRevision:0,
    executionAllowed:false,
    sql:{database:binding.database,login:'infraflow_t_'+compact,user:'infraflow_t_'+compact},
    os:{user:'ift_'+compact.slice(0,28),group:'ift_'+compact.slice(0,28),unit:'infraflow-trial-'+compact+'.service'},
    paths:{storage:'/var/lib/infraflow-demo-tenants/'+record.id+'/storage',state:'/var/lib/infraflow-demo-tenants/'+record.id+'/state',
      config:'/etc/infraflow-demo-tenants/'+record.id,keySource:'/etc/infraflow-demo-tenants/'+record.id+'/app.key'},
    keyRef:binding.keyRef,
    runtime:{codeRelease:null,host:'127.0.0.1',port:null,startAllowed:false},
    requiredPolicy:{dedicatedOsIdentity:true,dedicatedSqlIdentity:true,sqlServerAdministration:false,controlPlaneAccess:false,peerTenantAccess:false},
    gates:['resource_collision_inventory','durable_job_lease_and_resource_binding','clean_erp_release_and_schema_bootstrap',
      'runtime_sql_permissions_inventory','durable_port_allocation','sql_os_peer_isolation_tests','explicit_activation'],
    activation:{allowed:false,activatedAt:null,expiresAt:null,trialDays:15},
  }
  // Fingerprint only detects plan changes; it is not an authorization token or a lease.
  return {...plan,fingerprint:createHash('sha256').update(JSON.stringify(plan)).digest('hex')}
}
module.exports={buildProvisioningPlan}
