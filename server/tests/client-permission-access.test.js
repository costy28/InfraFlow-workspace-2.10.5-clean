const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '../../client/src/lib/permission-access.js'), 'utf8').replace(/export /g, '')
const policy = {}
vm.runInNewContext(`${source}\nthis.canAccess = canAccess; this.modules = moduleAccess`, policy)

test('filtrul comun nu transformă utilizatorul limitat sau absent în administrator', () => {
  for (const user of [null, {}, { role: 'limited', permissions: [] }, { roles: ['limited'], permissions: [] }]) {
    assert.equal(policy.canAccess(user, 'hr:manage'), false)
    assert.equal(policy.canAccess(user, policy.modules.crm), false)
  }
})

test('permisiunea punctuală deschide numai cerința sau modulul corespunzător', () => {
  const user = { role: 'limited', permissions: ['hr:timesheet'] }
  assert.equal(policy.canAccess(user, 'hr:timesheet'), true)
  assert.equal(policy.canAccess(user, 'hr:manage'), false)
  assert.equal(policy.canAccess(user, policy.modules.hr), true)
  assert.equal(policy.canAccess(user, policy.modules.crm), false)
  assert.equal(policy.canAccess(user, policy.modules.contractManagement), false)
})

test('modulul dezactivat blochează URL-ul direct chiar dacă utilizatorul are o permisiune din modul', () => {
  const user = {
    role: 'limited',
    permissions: ['hr:view_own', 'crm:view'],
    entitlements: { effective_modules: ['core', 'crm'] },
  }
  assert.equal(policy.canAccess(user, policy.modules.hr), false)
  assert.equal(policy.canAccess(user, policy.modules.crm), true)
})

test('administratorul nu ocolește entitlement-ul canonic al modulului', () => {
  const admin = {
    role: 'admin',
    entitlements: { effective_modules: ['core', 'crm'] },
  }
  assert.equal(policy.canAccess(admin, policy.modules.hr), false)
  assert.equal(policy.canAccess(admin, policy.modules.crm), true)
  assert.equal(policy.canAccess(admin, 'hr:manage'), true)
})

test('rolurile administrative explicite păstrează accesul în filtrul UI', () => {
  for (const user of [{ role: 'admin' }, { role: 'superadmin' }, { role: 'limited', roles: ['admin'] }]) {
    assert.equal(policy.canAccess(user, 'hr:manage'), true)
  }
})
