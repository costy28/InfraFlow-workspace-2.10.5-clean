const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('Administrare module păstrează controalele, dar deschide detaliile la cerere', () => {
  const page = fs.readFileSync(path.join(__dirname, '../../client/src/pages/SetariPage.jsx'), 'utf8')

  assert.match(page, /moduleSectionsOpen/)
  assert.match(page, /Onboarding și ghid/)
  assert.match(page, /Fluxuri documente/)
  assert.match(page, /Pachete comerciale/)
  assert.match(page, /moduleGroupsOpen/)
  assert.match(page, /aria-expanded=\{Boolean\(moduleGroupsOpen\[group\.title\]\)\}/)
  assert.match(page, /Salvează module/)
})
