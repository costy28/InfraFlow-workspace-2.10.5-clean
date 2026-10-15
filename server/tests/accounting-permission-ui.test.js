'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const app = fs.readFileSync(path.resolve(__dirname, '..', '..', 'client', 'src', 'App.jsx'), 'utf8')
const shell = fs.readFileSync(path.resolve(__dirname, '..', '..', 'client', 'src', 'pages', 'accounting', 'accounting-shared.jsx'), 'utf8')
const routes = fs.readFileSync(path.resolve(__dirname, '..', 'modules', 'accounting', 'accounting-routes.js'), 'utf8')

test('rutele contabile administrative folosesc drepturile dedicate', () => {
  assert.match(app, /path="\/contabilitate\/alerte"[\s\S]*?permission="accounting:alerts"/)
  assert.match(app, /path="\/contabilitate\/sabloane-note"[\s\S]*?permission="accounting:manage"/)
})

test('navigarea contabila nu expune administrarea prin simpla vizualizare', () => {
  assert.match(shell, /sabloane: 'accounting:manage', alerte: 'accounting:alerts'/)
})

test('API alerte cere dreptul dedicat sau administrare contabila', () => {
  assert.match(routes, /router\.get\("\/accounting\/alerts"[\s\S]*?\["accounting:alerts", "accounting:manage"\]/)
  assert.match(routes, /router\.patch\("\/accounting\/alerts\/:id\/read"[\s\S]*?\["accounting:alerts", "accounting:manage"\]/)
  assert.match(routes, /router\.patch\("\/accounting\/alerts\/:id\/done", requireAccountingManage/)
})
