'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..')
const routes = fs.readFileSync(path.join(root, 'server', 'modules', 'asternere', 'routes.js'), 'utf8')
const page = fs.readFileSync(path.join(root, 'client', 'src', 'pages', 'modules', 'AsternerePage.jsx'), 'utf8')

test('API Lucrări / Execuție separă citirea, raportarea și administrarea', () => {
  assert.match(routes, /EXECUTION_READ_PERMISSIONS = \['asternere:view', 'asternere:rapoarte', 'asternere:manage'\]/)
  assert.match(routes, /EXECUTION_REPORT_PERMISSIONS = \['asternere:rapoarte', 'asternere:manage'\]/)
  assert.equal((routes.match(/requirePermission\(auth, res, 'asternere:manage'\)/g) || []).length, 3)
  // Include și apelul din declarația helperului, apoi cele patru rute protejate.
  assert.equal((routes.match(/requireExecutionReports\(auth, res\)/g) || []).length, 5)
  assert.equal((routes.match(/requireExecutionRead\(auth, res\)/g) || []).length, 5)
})

test('interfața ascunde filele și acțiunile care nu corespund permisiunii', () => {
  assert.match(page, /const canView = canAccess\(user, \['asternere:view', 'asternere:rapoarte', 'asternere:manage'\]\)/)
  assert.match(page, /const canReport = canAccess\(user, \['asternere:rapoarte', 'asternere:manage'\]\)/)
  assert.match(page, /const canManage = canAccess\(user, 'asternere:manage'\)/)
  assert.match(page, /\{visibleTabs\.map\(t =>/)
  assert.match(page, /tab === 'Lucrări' && canManage/)
  assert.match(page, /tab === 'Rapoarte zilnice' && canReport/)
})
