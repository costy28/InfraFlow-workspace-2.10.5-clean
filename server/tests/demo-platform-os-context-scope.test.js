'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {validate}=require('../demo-platform/os-executor-context-sql-check');
const {validate:oldValidate}=require('../demo-platform/os-executor-sql-check');
function metadata(){return {recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login:'infraflow_demo_os_executor',principal:'infraflow_demo_os_executor',sysadmin:0,accessDemo:0}],
 [{permission_name:'CONNECT SQL'}],[{permission_name:'CONNECT'}],['accept_os_identity_delegation','record_os_identity_result','verify_os_identity_execution_context'].map(object_name=>({schema_name:'platform',object_name,permission_name:'EXECUTE'}))]};}
test('new checker requires exactly three RPC while old checker remains strict two RPC',()=>{
 validate(metadata());assert.throws(()=>oldValidate(metadata()));
 const old=metadata();old.recordsets[3].pop();oldValidate(old);assert.throws(()=>validate(old));
 for(const change of [r=>r.recordsets[3].push(r.recordsets[3][0]),r=>r.recordsets[0][0].sysadmin=1,r=>r.recordsets[3][0].permission_name='SELECT',r=>r.recordsets[3][2].object_name='activate_trial']){
  const r=metadata();change(r);assert.throws(()=>validate(r));
 }
});
test('scope transition contains only one grant and requires idle two-RPC baseline',()=>{
 const s=fs.readFileSync('scripts/linux/grant-demo-os-context-scope.sql','utf8');
 assert.equal((s.match(/\bGRANT\b/g)||[]).length,1);assert.ok(s.includes('GRANT EXECUTE ON OBJECT::platform.verify_os_identity_execution_context TO infraflow_demo_os_executor'));
 for(const word of ['017_os_identity_execution_context_v1','executor_not_idle_requires_review','executor_two_rpc_baseline_required','ROLLBACK','REVERT'])assert.ok(s.includes(word));
 assert.ok(!/CREATE LOGIN|ALTER LOGIN|UPDATE platform|INSERT platform|DELETE FROM/i.test(s));
 const p=fs.readFileSync('scripts/linux/preflight-demo-os-context-scope.sql','utf8');assert.ok(!/\bGRANT\b|\bDENY\b/.test(p));
 for(const source of [s,p])assert.ok(source.includes("REVERT;SET @impersonating=0;\n IF @invalid=1 THROW 54307"));
});
