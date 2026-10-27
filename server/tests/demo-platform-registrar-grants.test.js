'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const sql=fs.readFileSync(path.join(__dirname,'../../scripts/linux/restrict-demo-platform-registrar.sql'),'utf8')
test('registrar permission transition is platform-only, transactional and targets existing identity only',()=>{
  assert.match(sql,/THROW 52001/);assert.match(sql,/005_operator_queue_audit_v1/)
  assert.match(sql,/SUSER_SID\(N'infraflow_demo_registrar'\)/)
  assert.match(sql,/BEGIN TRANSACTION/);assert.match(sql,/IF XACT_STATE\(\)<>0 ROLLBACK/)
  const code=sql.replace(/--[^\r\n]*/g,'')
  assert.ok(!/\b(CREATE LOGIN|ALTER LOGIN|CREATE USER|DROP USER|CREATE DATABASE|ALTER ROLE)\b/i.test(code))
  assert.ok(!/\b(INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?platform\./i.test(code))
})
test('only audited queue is granted, legacy queue and activation are denied',()=>{
  assert.deepEqual([...sql.matchAll(/GRANT[^;]+;/g)].map(m=>m[0]),['GRANT EXECUTE ON OBJECT::platform.queue_trial_by_operator TO infraflow_demo_registrar;'])
  assert.match(sql,/DENY EXECUTE ON OBJECT::platform.queue_trial TO infraflow_demo_registrar/)
  assert.match(sql,/DENY EXECUTE ON OBJECT::platform.activate_trial TO infraflow_demo_registrar/)
  assert.match(sql,/DENY SELECT,INSERT,UPDATE,DELETE ON SCHEMA::operator_security/)
  assert.match(sql,/EXECUTE AS USER=N'infraflow_demo_registrar'/)
  assert.match(sql,/REVERT;SET @impersonating=0/)
})
