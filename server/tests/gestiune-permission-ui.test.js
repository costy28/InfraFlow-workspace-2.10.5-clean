const fs = require('fs')
const path = require('path')
const test = require('node:test')
const assert = require('node:assert/strict')

const page = fs.readFileSync(path.join(__dirname, '../../client/src/pages/modules/GestiunePage.jsx'), 'utf8')
const routes = fs.readFileSync(path.join(__dirname, '../modules/gestiune/routes.js'), 'utf8')
const inventoryRoutes = fs.readFileSync(path.join(__dirname, '../modules/inventory/routes.js'), 'utf8')

test('filele Gestiune recunosc permisiunile punctuale oficiale', () => {
  for (const permission of ['gestiune:view', 'gestiune:nir', 'gestiune:bon_consum', 'gestiune:inventar', 'gestiune:manage', 'gestiune:reports']) {
    assert.match(page, new RegExp(`'${permission}'`))
  }
  assert.match(page, /visibleTabs = useMemo\(\(\) => tabs\.filter\(tab => canAccess/)
})

test('actiunile Gestiune sunt separate de simpla vizualizare', () => {
  assert.match(page, /canManageMaterials = canAccess\(user, \{ anyOf: \['gestiune:manage'/)
  assert.match(page, /canCreateNir = canAccess\(user, \{ anyOf: \['gestiune:nir'/)
  assert.match(page, /canCreateConsumption = canAccess\(user, \{ anyOf: \['gestiune:bon_consum'/)
  assert.match(page, /canManageInventory = canAccess\(user, \{ anyOf: \['gestiune:inventar'/)
  assert.match(page, /canExportReports = canAccess\(user, \{ anyOf: \['gestiune:reports'/)
  assert.match(page, /canDeleteSuppliers \? <button/)
})

test('asistentul nu deschide formulare fara permisiunea actiunii', () => {
  assert.match(page, /if \(canManageMaterials\) setMatModal\(true\)/)
  assert.match(page, /if \(canManageSuppliers\) setFurModal\(true\)/)
  assert.match(page, /if \(canCreateNir\) setNirModal\(true\)/)
  assert.match(page, /if \(canCreateConsumption\) setBcModal\(true\)/)
})

test('rutele Gestiune accepta permisiunile oficiale si pastreaza aliasurile vechi', () => {
  for (const permission of ['gestiune:view', 'gestiune:nir', 'gestiune:bon_consum', 'gestiune:inventar', 'gestiune:manage', 'gestiune:reports']) {
    assert.match(routes, new RegExp(`'${permission}'`))
  }
  assert.match(routes, /'gestiune:nir', 'stock_operations:create', 'procurement_orders:receive'/)
  assert.match(routes, /'gestiune:bon_consum', 'stock_operations:create', 'consumptions:create'/)
})

test('nomenclatorul materialelor este disponibil drepturilor Gestiune', () => {
  assert.match(inventoryRoutes, /"gestiune:view", "gestiune:nir", "gestiune:bon_consum", "gestiune:inventar", "gestiune:manage", "gestiune:reports", "materials:view"/)
  assert.match(inventoryRoutes, /\["gestiune:manage", "materials:edit"\]/)
})
