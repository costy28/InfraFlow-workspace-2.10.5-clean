'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

test('server/app.js este entry point-ul canonic în manifestele NPM', () => {
  const rootPackage = JSON.parse(read('package.json'))
  const serverPackage = JSON.parse(read('server/package.json'))

  assert.equal(rootPackage.scripts.start, 'node server/app.js')
  assert.equal(rootPackage.scripts['dev:server'], 'node server/app.js')
  assert.equal(serverPackage.scripts.start, 'node app.js')
  assert.equal(serverPackage.scripts.check, 'node --check app.js')
})

test('smoke-urile și lansatoarele active pornesc entry point-ul canonic', () => {
  const files = [
    'scripts/smoke-modules-readonly.js',
    'scripts/release-accounting-acceptance.js',
    'scripts/audit-commercial-smoke.js',
    'scripts/windows/start-demo.ps1',
    'scripts/windows/start-commercial-demo-mssql.ps1',
    'scripts/linux/infraflow.service',
    'scripts/setup-task.ps1',
  ]

  for (const file of files) {
    const source = read(file)
    assert.match(source, /(?:['"]server['"]\s*,\s*['"]app\.js['"]|server[\\/]app\.js)/, file)
    assert.doesNotMatch(source, /server[\\/]src[\\/]server\.js/, file)
  }
})

test('entry point-ul legacy este doar adaptor către server/app.js', () => {
  const legacy = read('server/src/server.js')
  assert.match(legacy, /require\(['"]\.\.\/app['"]\)/)
  assert.match(legacy, /startServer\(\)/)
  assert.doesNotMatch(legacy, /createServer|\.listen\(/)
})

test('server/app.js acceptă INFRAFLOW_PORT și exportă pornirea unică', () => {
  const source = read('server/app.js')
  assert.match(source, /process\.env\.INFRAFLOW_PORT\s*\|\|\s*process\.env\.PORT/)
  assert.match(source, /function startServer\(\)/)
  assert.match(source, /module\.exports\.startServer\s*=\s*startServer/)
})
