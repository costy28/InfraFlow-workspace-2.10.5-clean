'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {validate}=require('../demo-platform/worker-os-delegation-sql-check');
const {check}=require('../demo-platform/worker-os-delegation-credential-probe');
function metadata(){return {recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login:'infraflow_demo_lease',principal:'infraflow_demo_lease',sysadmin:0,accessDemo:0}],
 [{permission_name:'CONNECT SQL'}],[{permission_name:'CONNECT'}],['provision_lease_command','record_step_intent','adapter_review_ticket_command','prepare_os_identity_delegation'].map(object_name=>({schema_name:'platform',object_name,permission_name:'EXECUTE'}))]};}
test('worker delegation metadata requires exact four RPC, no executor or activation',()=>{
 validate(metadata());
 for(const change of [r=>r.recordsets[3].pop(),r=>r.recordsets[3].push(r.recordsets[3][0]),r=>r.recordsets[0][0].login='infraflow_demo_os_executor',r=>r.recordsets[3][3].object_name='accept_os_identity_delegation',r=>r.recordsets[3][3].permission_name='SELECT',r=>r.recordsets[0][0].sysadmin=1]){
  const r=metadata();change(r);assert.throws(()=>validate(r));
 }
});
test('worker scope transition has exactly one grant, idle baseline and reversible impersonation',()=>{
 const s=fs.readFileSync('scripts/linux/grant-demo-worker-os-delegation-scope.sql','utf8');
 assert.equal((s.match(/\bGRANT\b/g)||[]).length,1);assert.ok(s.includes('GRANT EXECUTE ON OBJECT::platform.prepare_os_identity_delegation TO infraflow_demo_lease'));
 for(const t of ['worker_three_rpc_baseline_required','worker_four_rpc_scope_unconfirmed','worker_not_idle_requires_review','REVERT;SET @impersonating=0;\n IF @invalid=1 THROW 54407','ROLLBACK'])assert.ok(s.includes(t));
 assert.ok(!/CREATE LOGIN|ALTER LOGIN|UPDATE platform|INSERT platform|DELETE FROM/i.test(s));
});
test('worker credential check calls metadata only, wipes secret and closes on both outcomes',async()=>{
 for(const fail of [false,true]){
  const secret=Buffer.from('x'.repeat(20));let reads=0,closed=0;
  const operation=check({read:()=>secret,createSql:()=>({check:async()=>{reads++;if(fail)throw Error('private');},execute:()=>{throw Error('RPC forbidden');},shutdown:async()=>{closed++;}})});
  if(fail)await assert.rejects(operation);else await operation;
  assert.equal(reads,1);assert.equal(closed,1);assert.ok(secret.every(x=>x===0));
 }
});
