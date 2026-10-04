const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..', '..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('interfața afișează integrarea de devize generic, fără schimbarea cheilor tehnice', () => {
  const permissions = read('server/core/permissions.js')
  const department = read('client/src/pages/DepartamentPage.jsx')
  const technical = read('client/src/pages/modules/TehnicPage.jsx')
  const integrationPage = read('client/src/pages/modules/IntersoftPage.jsx')

  assert.match(permissions, /integration:intersoft_view/)
  assert.match(permissions, /Devize — integrare/)
  assert.match(department, /Devize — integrare/)
  assert.match(technical, /Devize — integrare/)
  assert.match(integrationPage, /Devize — integrare/)
  assert.doesNotMatch(department, /Integrare Intersoft/)
})

test('filele de lucru folosesc titluri contextuale pentru rutele concrete', () => {
  const layout = read('client/src/components/layout/Layout.jsx')

  assert.match(layout, /'\/crm\/oferte': 'Oferte CRM'/)
  assert.match(layout, /'\/intersoft': 'Devize — integrare'/)
  assert.match(layout, /label=\{workspaceTitle\}/)
})
