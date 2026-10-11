const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { authHasPermission, requirePermission } = require('../core/permissions')
const source = fs.readFileSync(path.join(__dirname, '../modules/tickets/routes.js'), 'utf8')
const context = { authHasPermission, requirePermission, sendJson(res, status) { res.status = status } }
vm.runInNewContext(source.slice(source.indexOf('function rolePermissions'), source.indexOf('function supportPolicy')) + '\nthis.check = canViewTicket', context)

function authFor(permissions, departmentPermissions) {
  return { user: { id: 'u1', role: 'limited', departmentId: 'd1' }, db: {
    settings: { customRoles: [{ id: 'limited', permissions }] },
    departments: [{ id: 'd1', permissions: departmentPermissions || permissions }],
  } }
}
const own = { creat_de: 'u1', dept_sursa_id: 'd1' }
const colleague = { creat_de: 'u2', dept_sursa_id: 'd1' }
const other = { creat_de: 'u3', dept_sursa_id: 'd2' }

test('dreptul departamentului nu acordă singur acces global la Tichete', () => {
  assert.equal(context.check(authFor(['tickets:view_own'], ['tickets:view_own', 'tickets:view_all']), other), false)
})

test('proprii, departament și toate au arii distincte', () => {
  assert.equal(context.check(authFor(['tickets:view_own']), own), true)
  assert.equal(context.check(authFor(['tickets:view_own']), colleague), false)
  assert.equal(context.check(authFor(['tickets:view_dept']), colleague), true)
  assert.equal(context.check(authFor(['tickets:view_dept']), other), false)
  assert.equal(context.check(authFor(['tickets:view_all']), other), true)
})

test('dreptul de rezolvare nu acordă vizualizarea unui tichet străin', () => {
  assert.equal(context.check(authFor(['tickets:resolve', 'tickets:view_own']), other), false)
})

test('lista și detaliile acceptă dreptul departamentului fără drept propriu suplimentar', () => {
  assert.equal(context.requireTicketPermission(authFor(['tickets:view_dept']), {}, 'tickets:view_own'), true)
  assert.equal(context.requireTicketPermission(authFor(['tickets:view_all']), {}, 'tickets:view_own'), true)
  const res = {}
  assert.equal(context.requireTicketPermission(authFor(['tickets:resolve']), res, 'tickets:view_own'), false)
  assert.equal(res.status, 403)
})
