'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const page = fs.readFileSync(path.resolve(__dirname, '..', '..', 'client', 'src', 'pages', 'accounting', 'FacturiContab.jsx'), 'utf8')
const routes = fs.readFileSync(path.resolve(__dirname, '..', 'modules', 'accounting', 'accounting-routes.js'), 'utf8')

test('facturile separa consultarea de toate actiunile de postare', () => {
  assert.match(page, /const canPost = canAccess\(user, 'accounting:post'\)/)
  assert.match(page, /canPost \? \{ label: isIn \? 'Factura intrare noua'/)
  assert.match(page, /canPost && row\.status === 'draft' \? \{ label: 'Editeaza factura'/)
  assert.match(page, /canPost && canPayInvoice\(row\)/)
  assert.match(page, /open=\{modal && canPost\}/)
  assert.match(page, /open=\{paymentModal && canPost\}/)
  assert.match(page, /open=\{Boolean\(confirmAction\) && canPost\}/)
})

test('rutele facturilor cer postare pentru orice mutatie', () => {
  assert.match(routes, /router\.get\("\/accounting\/invoices-in", requireAccountingView/)
  assert.match(routes, /router\.post\("\/accounting\/invoices-in", requireAccountingPost/)
  assert.match(routes, /router\.patch\("\/accounting\/invoices-in\/:uuid", requireAccountingPost/)
  assert.match(routes, /router\.post\("\/accounting\/invoices-in\/:uuid\/validate", requireAccountingPost/)
  assert.match(routes, /router\.post\("\/accounting\/invoices-in\/:uuid\/pay", requireAccountingPost/)
  assert.match(routes, /router\.get\("\/accounting\/invoices-out", requireAccountingView/)
  assert.match(routes, /router\.post\("\/accounting\/invoices-out", requireAccountingPost/)
  assert.match(routes, /router\.post\("\/accounting\/invoices-out\/:uuid\/collect", requireAccountingPost/)
  assert.match(routes, /router\.post\("\/accounting\/invoices-out\/:uuid\/efactura", requireAccountingPost/)
})
