const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')

function invoke(status, permission, action = 'inainteaza') {
  const handlers = new Map()
  const router = {}
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    router[method] = (url, callback) => handlers.set(`${method} ${url}`, callback)
  }
  const referat = { id: 'r1', status, serie: 'R', numar: 1 }
  const db = { referate: [referat] }
  let writes = 0
  let code
  let error
  const filename = path.join(__dirname, '../modules/referate/routes.js')
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: { exports: {} },
    require(name) {
      if (name === 'express') return { Router: () => router }
      if (name.endsWith('/auth')) return { requireAuth: () => ({ db, user: { id: 'u1' } }) }
      if (name.endsWith('/permissions')) return {
        requirePermission: (_, res, expected) => {
          if (expected === permission) return true
          res.status(403).json({ error: 'Interzis' })
          return false
        },
        authHasPermission: (_, expected) => expected === permission,
      }
      if (name === '../documents/engine') return { buildWorkflowSnapshot: () => null }
      if (name.endsWith('/db')) return { writeDb: () => { writes++ } }
      if (name.endsWith('/audit')) return { addAudit() {} }
      return require(name)
    },
  }, { filename })
  handlers.get('post /referate/:id/inainteaza')(
    { params: { id: 'r1' }, body: { actiune: action } },
    { status(value) { code = value; return this }, json() {} },
    value => { error = value },
  )
  return { referat, writes, code, error }
}

test('vizualizarea nu permite avansarea sau respingerea etapei CFP', () => {
  for (const action of ['inainteaza', 'respinge']) {
    const result = invoke('cfp', 'referate:view', action)
    assert.equal(result.code, 403)
    assert.equal(result.writes, 0)
    assert.equal(result.referat.status, 'cfp')
  }
})

test('dreptul etapei CFP permite avansarea doar la următorul pas', () => {
  const result = invoke('cfp', 'referate:cfp')
  assert.equal(result.error, undefined)
  assert.equal(result.code, 200)
  assert.equal(result.writes, 1)
  assert.equal(result.referat.status, 'contabil_sef')
})

test('o etapă necunoscută nu poate fi respinsă cu simpla vizualizare', () => {
  for (const status of ['necunoscut', 'toString', '__proto__']) {
    const result = invoke(status, 'referate:view', 'respinge')
    assert.equal(result.error?.status, 409)
    assert.equal(result.writes, 0)
    assert.equal(result.referat.status, status)
  }
})
