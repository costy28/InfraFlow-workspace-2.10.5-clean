const fs = require('fs')
const path = require('path')
const test = require('node:test')
const assert = require('node:assert/strict')

const page = fs.readFileSync(path.join(__dirname, '../../client/src/pages/modules/AchizitiiPage.jsx'), 'utf8')
const routes = fs.readFileSync(path.join(__dirname, '../modules/procurement/routes.js'), 'utf8')
const paapRoutes = fs.readFileSync(path.join(__dirname, '../modules/procurement/paap-routes.js'), 'utf8')
const inventoryRoutes = fs.readFileSync(path.join(__dirname, '../modules/inventory/routes.js'), 'utf8')

test('filele Achizitii sunt filtrate dupa dreptul punctual', () => {
  assert.match(page, /visibleTabs = useMemo\(\(\) => tabs\.filter\(tab => canAccess/)
  assert.match(page, /canCreateOrder = canAccess\(user, 'procurement_orders:create'\)/)
  assert.match(page, /canReceiveOrder = canAccess\(user, \{ anyOf: \['procurement_orders:receive', 'procurement:receive'\] \}\)/)
  assert.match(page, /canManagePlan = canAccess\(user, \{ anyOf: \['procurement_orders:create', 'procurement_orders:receive', 'procurement:receive'\] \}\)/)
})

test('formularele Achizitii raman inchise fara dreptul actiunii', () => {
  assert.match(page, /if \(!canCreateOrder\) return\s+setModalOpen\(true\)/)
  assert.match(page, /open=\{modalOpen && canCreateOrder\}/)
  assert.match(page, /open=\{!!receiveOrder && canReceiveOrder\}/)
  assert.match(page, /open=\{paapModal && canManagePlan\}/)
})

test('rutele comenzi si receptii accepta permisiunile moderne compatibile', () => {
  assert.match(routes, /'procurement_orders:view', 'procurement_orders:create', 'procurement_orders:receive', 'procurement:view', 'procurement:receive'/)
  assert.match(routes, /\['procurement_orders:receive', 'procurement:receive'\]/)
})

test('PAAP separa citirea de administrare', () => {
  assert.match(paapRoutes, /\['procurement_orders:view', 'procurement:view'\]/)
  assert.match(paapRoutes, /\['procurement_orders:create', 'procurement_orders:receive', 'procurement:receive'\]/)
})

test('crearea si receptia comenzilor primesc nomenclatorul minimal de materiale', () => {
  assert.match(inventoryRoutes, /"procurement_orders:create", "procurement_orders:receive", "procurement:receive"/)
  assert.match(page, /api\.get\('\/material-options'\)/)
})
