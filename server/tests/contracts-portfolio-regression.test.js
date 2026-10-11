const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')

test('lista Contracte filtrează portofoliul cu un contract existent', () => {
  const handlers = new Map()
  const router = {}
  for (const method of ['get', 'post', 'patch', 'put', 'delete']) {
    router[method] = (url, ...callbacks) => handlers.set(`${method} ${url}`, callbacks.at(-1))
  }
  const db = { users: [], contractManagement: { contracts: [{ id: 'qa-contract', numar: 'QA-C01', titlu: 'Contract test', status: 'activ', valoare: 100, moneda: 'RON' }] } }
  const filename = path.join(__dirname, '../modules/contracts/routes.js')
  const sandbox = {
    __dirname: path.dirname(filename), module: { exports: {} }, console, Buffer,
    require(name) {
      if (name === 'express') return { Router: () => router }
      if (name === 'multer') return Object.assign(() => ({ single: () => () => {} }), { memoryStorage: () => ({}) })
      if (name === 'xlsx') return {}
      if (name.endsWith('/auth')) return { requireAuth: () => ({ db, user: { id: 'qa-user', role: 'superadmin' } }) }
      if (name.endsWith('/permissions')) return { requireAnyPermission: () => true }
      if (name.endsWith('/db')) return { writeDb() {} }
      if (name.endsWith('/audit')) return { addAudit() {} }
      return require(name)
    },
  }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename })
  const invoke = query => {
    let body
    handlers.get('get /contracts')({ query }, { status(code) { assert.equal(code, 200); return this }, json(value) { body = value } })
    return body
  }
  assert.equal(invoke({}).contracts.length, 1)
  assert.equal(invoke({ q: 'QA-C01' }).contracts[0].id, 'qa-contract')
  assert.equal(invoke({ q: 'absent' }).contracts.length, 0)
  assert.equal(invoke({ risk: 'missing_manager' }).contracts.length, 1)
})
