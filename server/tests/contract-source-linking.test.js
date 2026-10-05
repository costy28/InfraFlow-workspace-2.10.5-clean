const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('contractele pot lega comenzile și recepțiile din toate sursele operaționale', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../modules/contracts/routes.js'), 'utf8')

  assert.match(routes, /type: 'comanda_achizitie', label: 'Comandă achiziție', rows: db\.procurementOrders/)
  assert.match(routes, /type: 'nir_depozit', label: 'Recepție depozit', rows: db\.inventory\?\.receipts/)
})

test('comenzile sunt documente-sursă și nu devin consum efectiv înainte de recepție sau factură', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../modules/contracts/routes.js'), 'utf8')
  const consumptionBlock = routes.slice(routes.indexOf('function contractConsumptions'), routes.indexOf('function linkedSourceRecord'))

  assert.match(consumptionBlock, /existingInvoiceConsumptions/)
  assert.match(consumptionBlock, /existingReceiptConsumptions/)
  assert.doesNotMatch(consumptionBlock, /procurementOrders/)
})
