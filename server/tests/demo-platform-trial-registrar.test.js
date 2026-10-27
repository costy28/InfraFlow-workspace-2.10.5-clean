'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events')
const {createTrialRegistrar,validateInput,validateIdentity,receipt}=require('../demo-platform/trial-registrar')
const input={operatorId:'11111111-1111-4111-8111-111111111111',operatorRevision:1,approvalId:'lead:fixture-1',companyName:'Fixture SRL',commandId:'queue:fixture-1'}
const identity=()=>({recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login:'infraflow_demo_registrar',sysadmin:0,controlDb:0,canQueue:1,canLegacyQueue:0,canActivate:0,canRead:0,canInsert:0,canUpdate:0,canDelete:0,accessDemo:0}],[{permission_name:'CONNECT SQL'},{permission_name:'VIEW ANY DATABASE'}]]})
const result=()=>({recordsets:[[{json:JSON.stringify({id:'11111111-1111-4111-8111-111111111111',state:'queued',revision:0,createdAt:'2026-10-26T10:00:00.000',private:'not-returned'})}]]})
test('registration input exact and explicit approval/command identity',()=>{
  validateInput(input)
  for(const patch of [{companyName:' Fixture SRL'},{companyName:''},{approvalId:'../x'},{commandId:'x;DROP'},{companyName:'x'.repeat(201)},{procedure:'arbitrary'}])assert.throws(()=>validateInput({...input,...patch}))
})
test('registrar fails closed on missing permissions, broad rights and wrong identity',()=>{
  validateIdentity(identity())
  for(const patch of [{login:'sa'},{canQueue:0},{canLegacyQueue:1},{canRead:1},{canActivate:1},{accessDemo:1},{controlDb:null}]){const r=identity();Object.assign(r.recordsets[0][0],patch);assert.throws(()=>validateIdentity(r))}
  const r=identity();r.recordsets[1].push({permission_name:'CONTROL SERVER'});assert.throws(()=>validateIdentity(r))
})
test('registration receipt only returns queued projection',()=>{
  assert.equal(receipt(result()).createdAt,'2026-10-26T10:00:00.000Z')
  assert.ok(!JSON.stringify(receipt(result())).includes('not-returned'))
  assert.throws(()=>receipt({recordsets:[[{json:'{"state":"active"}'}]]}))
})
test('registrar binds parameters, invokes only queue procedure, refuses parallel work and waits on shutdown',async()=>{
  let config,params={},procedures=[],release,closed=0
  class Pool extends EventEmitter{
    constructor(c){super();config=c}async connect(){return this}
    request(){const request={input(name,type,value){params[name]=value;return request},query:async()=>identity(),execute:async name=>{procedures.push(name);await new Promise(r=>{release=r});return result()}};return request}
    async close(){closed++}
  }
  const client=createTrialRegistrar('fixture-password-1234',{ConnectionPool:Pool,NVarChar:n=>n,MAX:'MAX'})
  const first=client.queue(input);await new Promise(r=>setImmediate(r))
  await assert.rejects(client.queue(input),{message:'trial_registration_unavailable'})
  const stopping=client.shutdown();assert.equal(closed,0);release()
  assert.equal((await first).state,'queued');await stopping
  assert.equal(closed,1);assert.equal(config.user,'infraflow_demo_registrar')
  assert.deepEqual(procedures,['platform.queue_trial_by_operator']);assert.deepEqual(JSON.parse(params.json),input)
})
test('transport errors are uncertain outcomes, never automatically retried',async()=>{
  let executions=0
  class Pool extends EventEmitter{
    async connect(){return this}request(){return {query:async()=>identity(),input(){return this},execute:async()=>{executions++;throw Error('sensitive transport detail')}}}async close(){}
  }
  const client=createTrialRegistrar('fixture-password-1234',{ConnectionPool:Pool,NVarChar:n=>n})
  await assert.rejects(client.queue(input),{message:'trial_registration_result_unconfirmed'})
  assert.equal(executions,1);await client.shutdown()
})
test('registrar check performs metadata only and never executes registration procedure',async()=>{
  let queries=0,executions=0
  class Pool extends EventEmitter{
    async connect(){return this}request(){return {query:async()=>{queries++;return identity()},execute:async()=>{executions++}}}async close(){}
  }
  const client=createTrialRegistrar('fixture-password-1234',{ConnectionPool:Pool})
  assert.deepEqual(await client.check(),{ok:true,code:'registrar_scope_verified'})
  assert.equal(queries,1);assert.equal(executions,0);await client.shutdown()
  await assert.rejects(client.check(),{message:'registrar_check_unavailable'})
})
