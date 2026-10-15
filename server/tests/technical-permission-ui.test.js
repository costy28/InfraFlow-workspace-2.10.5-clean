'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const page = fs.readFileSync(path.resolve(__dirname, '..', '..', 'client', 'src', 'pages', 'modules', 'TehnicPage.jsx'), 'utf8')
const routes = fs.readFileSync(path.resolve(__dirname, '..', 'modules', 'technical', 'routes.js'), 'utf8')
const devizePage = fs.readFileSync(path.resolve(__dirname, '..', '..', 'client', 'src', 'pages', 'modules', 'IntersoftPage.jsx'), 'utf8')
const devizeRoutes = fs.readFileSync(path.resolve(__dirname, '..', 'modules', 'integration', 'intersoft', 'routes.js'), 'utf8')

test('Tehnic filtreaza filele dupa dreptul punctual', () => {
  assert.match(page, /const canViewTechnical = canAccess\(user, 'technical:view'\)/)
  assert.match(page, /const canManageWork = canAccess\(user, 'technical:worklog'\)/)
  assert.match(page, /const canManageSales = canAccess\(user, 'technical:sales'\)/)
  assert.match(page, /const canExportTechnical = canAccess\(user, 'technical:export'\)/)
  assert.match(page, /const visibleTabs = tabs\.filter/)
  assert.match(page, /\{visibleTabs\.map\(tab =>/)
})

test('Tehnic nu incarca sectiuni fara drept si nu deschide formulare de scriere', () => {
  assert.match(page, /\(canViewTechnical \|\| canManageWork\) \? api\.get\('\/technical\/work-logs'/)
  assert.match(page, /\(canViewTechnical \|\| canManageSales\) \? api\.get\('\/technical\/asphalt-sales'/)
  assert.match(page, /canManageSales \? api\.get\('\/recipes'/)
  assert.match(page, /open=\{modal === 'Lucrări' && canManageWork\}/)
  assert.match(page, /open=\{modal === 'Vânzări \/ Output' && canManageSales\}/)
  assert.match(page, /\{canExportTechnical \? <div className="flex items-end">/)
})

test('API separa citirea de operarea comenzilor si outputului', () => {
  assert.match(routes, /\['technical:view', 'technical:worklog', 'department_requests:view'\]/)
  assert.match(routes, /router\.post\('\/work\/orders'[\s\S]*?requirePermission\(auth, res, 'technical:worklog'\)/)
  assert.match(routes, /router\.post\('\/work\/orders\/month-close'[\s\S]*?requirePermission\(auth, res, 'technical:worklog'\)/)
  assert.match(routes, /router\.get\('\/technical\/asphalt-sales'[\s\S]*?\["technical:view", "technical:sales"\]/)
  assert.match(routes, /router\.get\('\/technical\/clients'[\s\S]*?\["technical:view", "technical:sales"\]/)
})

test('Devize separa vizualizarea, importul si exportul', () => {
  assert.match(devizePage, /const canView = canAccess\(user, 'integration:intersoft_view'\)/)
  assert.match(devizePage, /const canImport = canAccess\(user, 'integration:intersoft_import'\)/)
  assert.match(devizePage, /const canExport = canAccess\(user, 'integration:intersoft_export'\)/)
  assert.match(devizePage, /\{visibleTabs\.map\(tab =>/)
  assert.match(devizePage, /\{canImport && <Button icon=/)
  assert.match(devizePage, /open=\{projectModalOpen && canImport\}/)
})

test('Devize permite context de citire pentru import si export, fara a largi scrierile', () => {
  const contextualReads = devizeRoutes.match(/requireAnyPermission\(auth, res, \['integration:intersoft_view', 'integration:intersoft_import', 'integration:intersoft_export'\]\)/g) || []
  assert.equal(contextualReads.length, 3)
  assert.match(devizeRoutes, /router\.post\('\/integration\/intersoft\/projects'[\s\S]*?requirePermission\(auth, res, 'integration:intersoft_import'\)/)
  assert.match(devizeRoutes, /router\.get\('\/integration\/intersoft\/projects\/:id\/export-cantitati'[\s\S]*?requirePermission\(auth, res, 'integration:intersoft_export'\)/)
})
