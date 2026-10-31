'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {classifyOsIdentity}=require('../demo-platform/os-identity-reconciliation');
const present={userPresent:true,groupPresent:true,uid:10001,gid:10002,groupGid:10002,home:'/nonexistent',shell:'/usr/sbin/nologin',passwordLocked:true,supplementaryGroups:[]};
const absent={userPresent:false,groupPresent:false,uid:null,gid:null,groupGid:null,home:null,shell:null,passwordLocked:null,supplementaryGroups:[]};
const input={identity:'ift_b1100b4348d042fa8a1d73b1286f',journalOutcome:'uncertain',recordedUid:null,recordedGid:null,observation:present};
test('reconciliation never authorizes adoption or mutation, even with matching recorded ids',()=>{
 for(const value of [input,{...input,observation:null},{...input,observation:absent},{...input,journalOutcome:'observed_created',recordedUid:10001,recordedGid:10002}]){
  const before=JSON.stringify(value),r=classifyOsIdentity(value);assert.equal(r.executionAllowed,false);assert.equal(r.reconciliationRequired,true);assert.deepEqual(r.automaticActions,[]);assert.equal(JSON.stringify(value),before);
 }
});
test('missing, partial and conflicting identities remain distinct',()=>{
 assert.equal(classifyOsIdentity({...input,observation:absent}).classification,'absent_requires_review');
 assert.equal(classifyOsIdentity({...input,observation:{...present,groupPresent:false,groupGid:null}}).classification,'partial_identity_requires_review');
 for(const change of [{shell:'/bin/bash'},{passwordLocked:false},{supplementaryGroups:[27]},{groupGid:10003}])assert.equal(classifyOsIdentity({...input,observation:{...present,...change}}).classification,'identity_conflict_requires_review');
});
test('arbitrary fields, root ids and getters refused without execution',()=>{
 for(const change of [{identity:'root'},{extra:1},{recordedUid:0},{observation:{...present,uid:0}}])assert.throws(()=>classifyOsIdentity({...input,...change}));
 let read=false;const x={...input};Object.defineProperty(x,'observation',{get(){read=true;}});assert.throws(()=>classifyOsIdentity(x));assert.equal(read,false);
});
test('result SQL immutable journal, audited, uncertain after fence loss, no grants or activation',()=>{
 const s=fs.readFileSync('db/demo-platform-migrations/016_os_identity_results.sql','utf8');
 for(const text of ['015_os_identity_acceptance_v1',"N''infraflow_demo_os_executor''",'os_result_fence_lost_record_uncertainty','platform.os_identity_result_events','os_result_already_recorded_requires_review','INCLUDE_NULL_VALUES','CAST(0 AS bit) executionAllowed'])assert.ok(s.includes(text));
 assert.ok(!/\bGRANT\b|\buseradd\b|\bxp_cmdshell\b/i.test(s.replace(/^--.*$/gm,'')));assert.ok(!s.includes('UPDATE platform.provision_jobs'));
});
