const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..')

test('Lucrări / Execuție nu mai afișează terminologia veche de asfaltare', () => {
  const page = fs.readFileSync(path.join(root, 'client/src/pages/modules/AsternerePage.jsx'), 'utf8')

  assert.doesNotMatch(page, /Consum asfalt/i)
  assert.doesNotMatch(page, /Cantitate asfalt/i)
  assert.doesNotMatch(page, /Șofer finisor/i)
  assert.doesNotMatch(page, /Temperatură mix/i)
  assert.match(page, /Materiale utilizate/)
  assert.match(page, /Responsabil execuție/)
})

test('endpoint-ul legacy rămâne disponibil pentru compatibilitatea datelor existente', () => {
  const routes = fs.readFileSync(path.join(root, 'server/modules/asternere/routes.js'), 'utf8')

  assert.match(routes, /router\.get\('\/asternere\/consum-asfalt'/)
  assert.match(routes, /Endpoint-ul păstrează denumirea legacy/)
})
