const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('căutarea globală rămâne o paletă de navigare sigură', () => {
  const component = fs.readFileSync(path.join(__dirname, '../../client/src/components/layout/GlobalSearch.jsx'), 'utf8')
  const navbar = fs.readFileSync(path.join(__dirname, '../../client/src/components/layout/Navbar.jsx'), 'utf8')

  assert.match(component, /Ctrl\+K/)
  assert.match(component, /normalizedText/)
  assert.match(component, /moduleAliases/)
  assert.match(component, /infraflow_workspace_tabs_v1/)
  assert.doesNotMatch(component, /api\.(get|post|patch|put|delete)\(/)
  assert.match(navbar, /GlobalSearch/)
})
