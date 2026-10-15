'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const page = fs.readFileSync(path.resolve(__dirname, '..', '..', 'client', 'src', 'pages', 'accounting', 'TertiContab.jsx'), 'utf8')
const routes = fs.readFileSync(path.resolve(__dirname, '..', 'modules', 'accounting', 'accounting-routes.js'), 'utf8')

test('pagina tertilor separa administrarea, postarea si raportarea', () => {
  assert.match(page, /const canManage = canAccess\(user, 'accounting:manage'\)/)
  assert.match(page, /const canPost = canAccess\(user, 'accounting:post'\)/)
  assert.match(page, /const canReport = canAccess\(user, 'accounting:reports'\)/)
  assert.match(page, /canManage \? \{ label: `Adauga/)
  assert.match(page, /canPost \? \{ label: 'Marcheaza trimisa'/)
  assert.match(page, /canReport \? \{ label: 'Export scadentar'/)
  assert.match(page, /canPost \? <DropdownMenu[\s\S]*?creditNoteMenu/)
})

test('rutele tertilor pastreaza aceleasi limite pe server', () => {
  assert.match(routes, /router\.post\("\/accounting\/third-parties", requireAccountingManage/)
  assert.match(routes, /router\.patch\("\/accounting\/third-parties\/:id", requireAccountingManage/)
  assert.match(routes, /router\.get\("\/accounting\/suppliers-status\/export", requireAccountingReports/)
  assert.match(routes, /router\.post\("\/accounting\/suppliers-status\/:id\/confirmation\/sent", requireAccountingPost/)
  assert.match(routes, /router\.post\("\/accounting\/clients-status\/:id\/confirmation\/received", requireAccountingPost/)
})
