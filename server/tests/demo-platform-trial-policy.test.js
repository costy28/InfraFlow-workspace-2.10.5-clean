'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {createTrialRecord,activateTrialRecord,canAccessTrialRecord}=require('../demo-platform/trial-policy')
const id='11111111-1111-4111-8111-111111111111'
const fresh=()=>createTrialRecord({approvalId:'wordpress:123',companyName:' Companie exemplu '},{id,now:1000})
test('registru: queued fara termen pana la activare, resurse derivate exclusiv din UUID',()=>{
  const r=fresh();assert.equal(r.companyName,'Companie exemplu');assert.equal(r.state,'queued');assert.equal(r.expiresAt,null)
  assert.equal(r.resources.database,'INFRAFLOW_DEMO_T_'+id.replaceAll('-','').toUpperCase())
  assert.equal(canAccessTrialRecord(r,2000),false)
})
test('registru: activare 15x24 ore, acces refuzat exact la expirare, fara mutatie input',()=>{
  const r={...fresh(),state:'awaiting_activation',revision:2},active=activateTrialRecord(r,2000)
  assert.equal(active.expiresAt,2000+15*86400000);assert.equal(active.revision,3);assert.equal(r.activatedAt,null)
  assert.equal(canAccessTrialRecord(active,1999),false);assert.equal(canAccessTrialRecord(active,2000),true)
  assert.equal(canAccessTrialRecord(active,active.expiresAt-1),true);assert.equal(canAccessTrialRecord(active,active.expiresAt),false)
  assert.throws(()=>activateTrialRecord(active,3000))
})
test('registru: campuri arbitrare si identitati resurse injectate refuzate',()=>{
  for(const input of [{approvalId:'x',companyName:'x',database:'ERP'},{approvalId:'bad space',companyName:'x'},{approvalId:'x',companyName:'\0'}])
    assert.throws(()=>createTrialRecord(input,{id,now:1000}))
  assert.throws(()=>activateTrialRecord({...fresh(),state:'awaiting_activation',resources:{database:'ERP'}},2000))
  assert.throws(()=>activateTrialRecord({...fresh(),state:'awaiting_activation'},999))
})
test('migrare platforma: separata de ERP, tranzactie, audit si idempotenta structurala',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'../../db/demo-platform-migrations/001_company_registry.sql'),'utf8')
  for(const marker of ['platform_database_required','sp_getapplock','PLATFORM_REGISTRY_ALREADY_APPLIED','platform.trial_commands','platform.trial_events','ROLLBACK'])assert.ok(sql.includes(marker))
  assert.equal(/CREATE LOGIN|GRANT (INSERT|UPDATE|DELETE)|DROP DATABASE/i.test(sql),false)
})
test('proceduri platforma: timp si actor SQL, fara granturi sau efecte externe',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'../../db/demo-platform-migrations/002_trial_commands.sql'),'utf8')
  for(const marker of ['ORIGINAL_LOGIN()','SYSUTCDATETIME()','DATEADD(day,15,@now)','UPDLOCK,HOLDLOCK','request_digest','COMMIT; SELECT @receipt','ROLLBACK'])assert.ok(sql.includes(marker))
  assert.equal(/CREATE LOGIN|GRANT EXECUTE|xp_cmdshell|CREATE DATABASE|DROP DATABASE/i.test(sql),false)
})
