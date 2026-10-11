const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { requireAnyPermission } = require('../core/permissions')

const source = fs.readFileSync(path.join(__dirname, '../modules/crm/routes.js'), 'utf8')
const boundary = source.slice(source.indexOf('const CONTRACT_MANAGE_PERMISSIONS'), source.indexOf('function commercialContractStore'))
const context = { requireAnyPermission }
vm.runInNewContext(`${boundary}\nthis.check = requireCommercialContractManage`, context)

function check(permissions) {
  const auth = { user: { id: 'u1', role: 'limited' }, db: { departments: [], settings: { customRoles: [{ id: 'limited', permissions }] } } }
  let status
  const allowed = context.check(auth, { writeHead(code) { status = code }, end() {} })
  return { allowed, status }
}

test('facturarea și achizițiile nu acordă creare contract comercial din CRM', () => {
  for (const permission of ['accounting:manage', 'procurement_orders:create', 'controlling:budget_manage']) {
    const result = check(['crm:order_manage', permission])
    assert.equal(result.allowed, false)
    assert.equal(result.status, 403)
  }
})

test('drepturile explicite de Contracte permit pregătirea dosarului', () => {
  assert.equal(check(['crm:order_manage', 'legal:contracts']).allowed, true)
  assert.equal(check(['crm:order_manage', 'legal:manage']).allowed, true)
})
