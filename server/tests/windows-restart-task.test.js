const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('restartul Windows așteaptă task-ul permanent înainte de repornire', () => {
  const service = fs.readFileSync(path.join(__dirname, '../modules/system/service.js'), 'utf8')

  assert.match(service, /function Wait-InfraFlowTaskStopped/)
  assert.match(service, /function Wait-InfraFlowPortReleased/)
  assert.match(service, /function Start-InfraFlowTask/)
  assert.match(service, /Wait-InfraFlowTaskStopped \| Out-Null\s+Stop-Process/)
  assert.match(service, /Wait-InfraFlowPortReleased \| Out-Null\s+Start-InfraFlowTask/)
  assert.match(service, /Task-ul InfraFlow ERP nu a pornit dupa 10 secunde/)
})
