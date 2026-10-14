'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = relativePath => fs.readFileSync(path.resolve(__dirname, '..', '..', relativePath), 'utf8')

const permissions = read('server/core/permissions.js')
const page = read('client/src/pages/modules/MecanizarePage.jsx')
const mechanizationRoutes = read('server/modules/mechanization/routes.js')
const fleetRoutes = read('server/modules/fleet/routes.js')
const assetRoutes = read('server/modules/fleet/asset-routes.js')
const importRoutes = read('server/modules/fleet/import-routes.js')
const piusiRoutes = read('server/modules/integration/piusi.js')

test('catalogul Parc si Resurse separa domeniile operationale si rapoartele', () => {
  for (const permission of [
    'mechanization:assets_view', 'mechanization:assets_manage',
    'mechanization:planning_view', 'mechanization:planning_manage',
    'mechanization:work_orders_view', 'mechanization:work_orders_manage',
    'mechanization:fuel_view', 'mechanization:fuel_manage', 'mechanization:import',
    'mechanization:maintenance_view', 'mechanization:maintenance_manage',
    'mechanization:compliance_view', 'mechanization:compliance_manage',
    'mechanization:reports_view', 'mechanization:reports_export',
  ]) assert.match(permissions, new RegExp(permission.replace(':', '\\:')))
})

test('pagina afiseaza numai filele si actiunile permise', () => {
  assert.match(page, /const visibleTabGroups = tabGroups/)
  assert.match(page, /Solicitări: canRequest \|\| canApproveRequests/)
  assert.match(page, /if \(!canAssetsManage\) return/)
  assert.match(page, /if \(!canPlanningManage\) return/)
  assert.match(page, /if \(!canWorkOrdersManage\) return/)
  assert.match(page, /if \(!canFuelManage\) return/)
  assert.match(page, /if \(!canMaintenanceManage\) return/)
  assert.match(page, /if \(!canComplianceManage\) return/)
  assert.match(page, /if \(!canReportsExport\) return/)
  assert.match(page, /open=\{assetModal && canAssetsManage\}/)
  assert.match(page, /open=\{planModal && canPlanningManage\}/)
  assert.match(page, /open=\{reqModal && canApproveRequests\}/)
})

test('API-ul accepta permisiunile granulare si pastreaza compatibilitatea legacy', () => {
  assert.match(mechanizationRoutes, /\[permission, 'mechanization:view'\]/)
  assert.match(mechanizationRoutes, /\[permission, 'mechanization:manage'\]/)
  assert.match(fleetRoutes, /mechanization:assets_view/)
  assert.match(fleetRoutes, /mechanization:compliance_manage/)
  assert.match(assetRoutes, /mechanization:assets_manage/)
  assert.match(importRoutes, /mechanization:import/)
  assert.match(piusiRoutes, /mechanization:fuel_view/)
  assert.match(piusiRoutes, /mechanization:fuel_manage/)
})
