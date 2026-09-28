const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const routes = fs.readFileSync(path.join(root, 'server/modules/crm/routes.js'), 'utf8')
const page = fs.readFileSync(path.join(root, 'client/src/pages/modules/CrmPage.jsx'), 'utf8')

test('dashboardul CRM expune doar sumarul sigur al fluxului comercial', () => {
  assert.match(routes, /router\.get\('\/crm\/dashboard'/)
  assert.match(routes, /requireCrm\(req, res\)/)
  assert.match(routes, /pending_approval/)
  assert.match(routes, /awaiting_customer/)
  assert.match(routes, /confirmed_orders/)
  assert.match(routes, /quoteRepository\.listQuotes\(\{\}\)/)
  assert.match(routes, /orderRepository\.listOrders\(\{\}\)/)
})

test('pagina CRM încarcă și explică cele patru etape comerciale', () => {
  assert.match(page, /api\.get\('\/crm\/dashboard'\)/)
  assert.match(page, /Flux comercial/)
  assert.match(page, /Oferte de aprobat/)
  assert.match(page, /Așteaptă client/)
  assert.match(page, /Oferte acceptate/)
  assert.match(page, /Comenzi confirmate/)
  assert.match(page, /to="\/crm\/oferte"/)
})
