const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('logistica este configurabilă și apare în ambele surse ale catalogului Module', () => {
  const root = path.join(__dirname, '..', '..')
  const systemRoutes = fs.readFileSync(path.join(root, 'server/modules/system/routes.js'), 'utf8')
  const settingsPage = fs.readFileSync(path.join(root, 'client/src/pages/SetariPage.jsx'), 'utf8')

  assert.match(systemRoutes, /"procurement",\s*\n\s*"logistics",\s*\n\s*"contract_management"/)
  assert.match(settingsPage, /key: 'logistics', icon: '🚚', label: 'Logistică & transport'/)
})
