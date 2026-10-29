'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {validateAdapterReviewIdentity}=require('../demo-platform/adapter-review-policy');
function fixture(){return {recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login:'infraflow_demo_adapter_review',principal:'infraflow_demo_adapter_review',sysadmin:0,accessDemo:0}],
 [{permission_name:'CONNECT SQL'},{permission_name:'VIEW ANY DATABASE'}],[{permission_name:'CONNECT'}],
 [{schema_name:'platform',object_name:'read_adapter_resource_review',permission_name:'EXECUTE'}]]};}
test('adapter review rejects admin, peer access, direct reads, other procedures and worker identity',()=>{
 validateAdapterReviewIdentity(fixture());
 for(const mutate of [f=>f.recordsets[0][0].sysadmin=1,f=>f.recordsets[0][0].accessDemo=1,
  f=>f.recordsets[0][0].login='infraflow_demo_lease',f=>f.recordsets[1].push({permission_name:'CONTROL SERVER'}),
  f=>f.recordsets[2].push({permission_name:'CREATE TABLE'}),f=>f.recordsets[3][0].object_name='record_step_intent',
  f=>f.recordsets[3].push({schema_name:'platform',object_name:'trials',permission_name:'SELECT'}),f=>f.recordsets.push([])]){
  const f=fixture();mutate(f);assert.throws(()=>validateAdapterReviewIdentity(f),/adapter_review_identity_refused/);
 }
});
test('adapter projection migration has no effects or grants and does not expose lease secrets',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../../db/demo-platform-migrations/011_adapter_resource_review.sql'),'utf8');
 assert.match(sql,/WITH\(HOLDLOCK\)/);assert.match(sql,/INCLUDE_NULL_VALUES/);assert.match(sql,/j.execution_ready=0/);
 assert.doesNotMatch(sql,/\bGRANT\s|\bCREATE\s+(?:LOGIN|DATABASE)|UPDATE\s+platform|DELETE\s+FROM/i);
 assert.doesNotMatch(sql,/lease_hash\s+(?:leaseHash|AS)|leaseToken/i);
});
