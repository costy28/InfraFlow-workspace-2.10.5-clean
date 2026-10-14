const fs = require('fs')
const path = require('path')
const test = require('node:test')
const assert = require('node:assert/strict')

const pagePath = path.join(__dirname, '../../client/src/pages/modules/StocuriPage.jsx')
const source = fs.readFileSync(pagePath, 'utf8')

test('Stocuri foloseste permisiunile efective, nu numele rolului', () => {
  assert.match(source, /import \{ canAccess \} from '\.\.\/\.\.\/lib\/permission-access'/)
  assert.doesNotMatch(source, /\['superadmin', 'admin', 'inventory'\]\.includes/)
  assert.match(source, /canCreateTransfers = canAccess\(user, \{ anyOf: \['stock_operations:create', 'inventory:transfers', 'inventory:exits'\] \}\)/)
  assert.match(source, /canCreateConsumption = canAccess\(user, \{ anyOf: \['inventory:exits', 'stock_operations:create', 'department_requests:create'\] \}\)/)
})

test('Stocuri afiseaza numai taburile permise', () => {
  assert.match(source, /canViewStock && 'Stoc curent'/)
  assert.match(source, /canViewMovements && 'Mișcări'/)
  assert.match(source, /canViewDeliveries && 'Livrări'/)
  assert.match(source, /canViewTransfers && 'Transferuri'/)
  assert.match(source, /canCreateConsumption && 'Consum pe lucrări'/)
  assert.match(source, /visibleTabs\.map\(tab =>/)
})

test('Stocuri nu cere API-uri pentru sectiuni nepermise', () => {
  assert.match(source, /canLoadMaterials\s+\? api\.get\('\/materials'\)/)
  assert.match(source, /needsMaterialOptions\s+\? api\.get\('\/material-options'\)/)
  assert.match(source, /canViewMovements \? api\.get\('\/stock-operations'\)/)
  assert.match(source, /canViewDeliveries \? api\.get\('\/deliveries'\)/)
  assert.match(source, /canViewStock \? api\.get\('\/inventory\/my-stock'\)/)
  assert.match(source, /canViewTransfers \? api\.get\('\/inventory\/transfers'\)/)
})

test('nomenclatorul minimal este disponibil actiunilor de stoc autorizate', () => {
  const routesPath = path.join(__dirname, '../modules/inventory/routes.js')
  const routes = fs.readFileSync(routesPath, 'utf8')
  const materialOptions = routes.slice(routes.indexOf('url.pathname === "/api/material-options"'), routes.indexOf('url.pathname === "/api/department-requests"'))
  for (const permission of ['deliveries:create', 'stock_operations:create', 'inventory:entries', 'inventory:exits', 'inventory:transfers']) {
    assert.match(materialOptions, new RegExp(`"${permission.replace(':', '\\:')}"`))
  }
})

test('Stocuri protejeaza formularele si modalul dupa actiunea acordata', () => {
  assert.match(source, /canCreateTransfers \? \(/)
  assert.match(source, /canCreateConsumption \? <form/)
  assert.match(source, /canCreateDeliveries \? <Button onClick=\{\(\) => setModalOpen\(true\)\}>Adaugă livrare<\/Button>/)
  assert.match(source, /canCreateDeliveries \? <Modal open=\{modalOpen\}/)
})
