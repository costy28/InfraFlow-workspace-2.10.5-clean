const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', '..')
const sidebar = fs.readFileSync(path.join(root, 'client', 'src', 'components', 'layout', 'Sidebar.jsx'), 'utf8')
const catalog = fs.readFileSync(path.join(root, 'server', 'modules', 'system', 'settings-routes.js'), 'utf8')

test('terminologia comercială implicită este generică în navigare și catalog', () => {
  for (const label of ['Stocuri & Depozite', 'Aprovizionare & Achiziții', 'Rute & Operațiuni teren', 'Semnalizare & Intervenții', 'Operațiuni sezoniere', 'Mediu & Conformitate']) {
    assert.ok(sidebar.includes(label), `lipsește eticheta din sidebar: ${label}`)
  }
  for (const label of ['Rute & operațiuni teren', 'Semnalizare & intervenții', 'Operațiuni sezoniere', 'Mediu & conformitate']) {
    assert.ok(catalog.includes(label), `lipsește eticheta din catalog: ${label}`)
  }
})
