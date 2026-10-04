const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const page = fs.readFileSync(path.resolve(__dirname, '..', '..', 'client', 'src', 'pages', 'SetariPage.jsx'), 'utf8')

test('panoul de actualizare selectează doar secțiunea versiunii instalate', () => {
  assert.match(page, /function updateChangelogSummary\(value, version\)/)
  assert.match(page, /updateChangelogSummary\(manualUpdate\.changelog, manualUpdate\.versiune_noua\)/)
  assert.match(page, /updateChangelogSummary\(updateInfo\.changelog, updateInfo\.versiune_noua\)/)
  assert.match(page, /Vezi CHANGELOG/)
})
