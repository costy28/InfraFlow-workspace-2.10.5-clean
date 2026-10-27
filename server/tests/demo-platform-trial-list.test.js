'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events')
const {filters,project,SQL}=require('../demo-platform/trial-list')
const {createSqlReader}=require('../demo-platform/sql-reader')
const row={id:'11111111-1111-4111-8111-111111111111',companyName:'Fixture SRL',state:'queued',revision:0,createdAt:new Date('2026-10-26T10:00:00Z'),activatedAt:null,expiresAt:null,database_name:'PRIVATE',key_ref:'PRIVATE'}
test('trial filters bounded and projection excludes internal resource identifiers',()=>{
  assert.deepEqual(filters(),{limit:20,offset:0,state:'',search:''})
  for(const input of [{limit:51},{offset:-1},{state:'unknown'},{search:'x'.repeat(101)},{sql:'SELECT'},{search:'a\n'}])assert.throws(()=>filters(input))
  const data=project({recordsets:[[{total:1}],[row]]},filters())
  assert.equal(data.items[0].companyName,'Fixture SRL');assert.ok(!JSON.stringify(data).includes('PRIVATE'))
  assert.throws(()=>project({recordsets:[[{total:1}],[{...row,state:'unsafe'}]]},filters()))
})
test('trial SQL reader uses fixed identity, parameter binding, escaped LIKE and no writes',async()=>{
  let configuration,params={},queries=[]
  class Pool extends EventEmitter{
    constructor(config){super();configuration=config}
    async connect(){return this}
    request(){const request={input(name,type,value){params[name]=value;return request},async query(sql){queries.push(sql);if(sql===SQL)return {recordsets:[[{total:1}],[row]]};return {recordsets:[[{db:'INFRAFLOW_DEMO_PLATFORM',login:'infraflow_demo_platform',sysadmin:0,controlDb:0,createTable:0,insertBootstrap:0,accessDemo:0}],[{permission_name:'CONNECT SQL'}],[{singleton:true,format:'infraflow-platform-bootstrap-v1'}]]}}};return request}
    async close(){}
  }
  const reader=createSqlReader('fixture-password-1234',{ConnectionPool:Pool,Int:'Int',VarChar:n=>n,NVarChar:n=>n})
  try{
    const data=await reader.listTrials({search:"%'_[~",state:'queued',limit:20,offset:0})
    assert.equal(configuration.user,'infraflow_demo_platform');assert.equal(data.total,1)
    assert.equal(params.pattern,"%~%'~_~[~~%")
    assert.equal(queries.length,2);assert.ok(!SQL.includes("%'_[~"));assert.ok(!/\b(INSERT|UPDATE|DELETE|EXEC)\b/i.test(SQL))
  }finally{await reader.shutdown()}
})
