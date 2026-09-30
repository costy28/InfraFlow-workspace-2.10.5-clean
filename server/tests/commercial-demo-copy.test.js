const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', '..')

test('demo-ul comercial nu mai este prezentat ca având module limitate', () => {
  const settingsPage = fs.readFileSync(path.join(root, 'client', 'src', 'pages', 'SetariPage.jsx'), 'utf8')
  const app = fs.readFileSync(path.join(root, 'server', 'app.js'), 'utf8')
  assert.match(settingsPage, /DEMO COMERCIAL — Acces complet/)
  assert.doesNotMatch(settingsPage, /MOD DEMO — Module limitate/)
  assert.match(app, /DEMO comercial complet/)
})
