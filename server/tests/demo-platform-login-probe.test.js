'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {validateKeyStat,validateInput}=require('../demo-platform/operator-login-probe')
test('private login probe: root-only key metadata, no symlink/hardlink permissions shortcuts',()=>{
  const stat={isFile:()=>true,uid:0,gid:0,mode:0o100600,nlink:1,size:32}
  validateKeyStat(stat)
  for(const patch of [{uid:1000},{gid:999},{mode:0o100640},{nlink:2},{size:31},{isFile:()=>false}])assert.throws(()=>validateKeyStat({...stat,...patch}))
})
test('private login probe: exact bounded input and no arbitrary target/SQL',()=>{
  const input={operatorId:'12345678-1234-1234-1234-123456789abc',sqlPassword:'test-password-1234',username:'infraop',password:'test',code:'123456'}
  validateInput(input)
  for(const patch of [{server:'external'},{username:'../admin'},{code:'1234567'},{adminPassword:'forbidden'},{sqlPassword:'short'},{operatorId:'invalid'}])assert.throws(()=>validateInput({...input,...patch}))
})
