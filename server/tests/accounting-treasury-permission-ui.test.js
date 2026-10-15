'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const page = fs.readFileSync(path.resolve(__dirname, '..', '..', 'client', 'src', 'pages', 'accounting', 'Trezorerie.jsx'), 'utf8')
const routes = fs.readFileSync(path.resolve(__dirname, '..', 'modules', 'accounting', 'accounting-routes.js'), 'utf8')
const settlementRoutes = fs.readFileSync(path.resolve(__dirname, '..', 'modules', 'accounting', 'settlement-routes.js'), 'utf8')

test('trezoreria separa vizualizarea, postarea si raportarea', () => {
  assert.match(page, /const canPost = canAccess\(user, 'accounting:post'\)/)
  assert.match(page, /const canReport = canAccess\(user, 'accounting:reports'\)/)
  assert.match(page, /canPost \? \{ label: 'Operatie noua'/)
  assert.match(page, /canReport \? \{ label: 'Export Excel'/)
  assert.match(page, /canPost && canValidate \? \{ label: 'Editeaza operatia'/)
  assert.match(page, /open=\{modal && canPost\}/)
  assert.match(page, /open=\{settlementModal && canPost\}/)
})

test('rutele trezoreriei pastreaza limitele server-side', () => {
  assert.match(routes, /router\.get\("\/accounting\/treasury", requireAccountingView/)
  assert.match(routes, /router\.get\("\/accounting\/treasury\/export", requireAccountingReports/)
  assert.match(routes, /router\.post\("\/accounting\/treasury", requireAccountingPost/)
  assert.match(routes, /router\.patch\("\/accounting\/treasury\/:uuid", requireAccountingPost/)
  assert.match(routes, /router\.post\("\/accounting\/treasury\/:uuid\/validate", requireAccountingPost/)
  assert.match(routes, /router\.post\("\/accounting\/treasury\/:uuid\/classify", requireAccountingPost/)
  assert.match(settlementRoutes, /router\.get\("\/accounting\/treasury\/:uuid\/settlement-preview", requireAccountingView/)
  assert.match(settlementRoutes, /router\.post\("\/accounting\/treasury\/:uuid\/allocate", requireAccountingPost/)
  assert.match(settlementRoutes, /router\.post\("\/accounting\/settlement-groups\/:groupUuid\/reverse", requireAccountingPost/)
})
