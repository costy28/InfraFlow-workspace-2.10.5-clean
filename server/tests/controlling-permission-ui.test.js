'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const page = fs.readFileSync(path.resolve(__dirname, '..', '..', 'client', 'src', 'pages', 'modules', 'ControllingPage.jsx'), 'utf8')
const routes = fs.readFileSync(path.resolve(__dirname, '..', 'modules', 'controlling', 'routes.js'), 'utf8')

test('Controlling filtreaza filele si actiunile dupa dreptul punctual', () => {
  assert.match(page, /const canCreateEntry = canAccess\(user, 'controlling:entry_create'\)/)
  assert.match(page, /const canManageCenters = canAccess\(user, 'controlling:cost_centers'\)/)
  assert.match(page, /const canViewReports = canAccess\(user, 'controlling:reports'\)/)
  assert.match(page, /\{visibleTabs\.map\(tab =>/)
  assert.match(page, /modalOpen && canCreateEntry/)
  assert.match(page, /centerModal && canManageCenters/)
})

test('Controlling incarca numai datele permise', () => {
  assert.match(page, /canReadCenters \? api\.get\('\/controlling\/cost-centers'\)/)
  assert.match(page, /canViewReports \? api\.get\('\/controlling\/reports\/buget-vs-real'/)
  assert.match(page, /canReadEntries \? api\.get\('\/controlling\/entries'/)
  assert.match(page, /if \(canManageCenters\) api\.get\('\/controlling\/cost-centers\/link-options'\)/)
})

test('API ofera numai contextul de citire necesar dreptului acordat', () => {
  assert.match(routes, /requireAnyPermission\(auth, res, \['controlling:view', 'controlling:view_all', 'controlling:entry_create'/)
  assert.match(routes, /router\.get\('\/controlling\/cost-centers\/link-options'[\s\S]*?requirePermission\(auth, res, 'controlling:cost_centers'\)/)
  assert.match(routes, /router\.get\('\/controlling\/entries'[\s\S]*?requireAnyPermission\(auth, res, \['controlling:view', 'controlling:view_all', 'controlling:entry_create', 'controlling:entry_validate'\]\)/)
})
