'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const sql=fs.readFileSync(path.join(__dirname,'../../db/demo-platform-migrations/005_operator_queue_audit.sql'),'utf8')
test('operator queue migration stays platform-only and never grants runtime identities',()=>{
  assert.equal(sql.split("N'INFRAFLOW_DEMO_PLATFORM'").length,2)
  assert.match(sql,/THROW 51901/)
  assert.ok(!/\b(?:GRANT|CREATE LOGIN|ALTER LOGIN|CREATE DATABASE|DROP DATABASE|EXECUTE AS OWNER)\b/i.test(sql.replace(/--[^\r\n]*/g,'')))
  assert.ok(!/CREATE PROCEDURE platform\.activate_trial/i.test(sql))
})
test('operator queue transaction binds actor/revision/command and records audit before commit',()=>{
  assert.match(sql,/WITH\(UPDLOCK,HOLDLOCK\)/)
  assert.match(sql,/@current<>@revision/)
  assert.match(sql,/trial:queue/)
  assert.match(sql,/UNIQUE\(operator_id,command_id\)/)
  assert.match(sql,/INSERT platform\.operator_command_audit/)
  assert.match(sql,/INSERT operator_security\.audit/)
  assert.match(sql,/IF XACT_STATE\(\)<>0 ROLLBACK/)
  assert.ok(sql.indexOf('INSERT platform.operator_command_audit')<sql.lastIndexOf('COMMIT;SELECT @receipt'))
})
