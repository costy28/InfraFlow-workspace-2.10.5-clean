const test = require('node:test')
const assert = require('node:assert/strict')

const { authHasPermission } = require('../core/permissions')

function authFor(permissions) {
  return {
    user: { id: 'user-limited', role: 'limited-role', active: true },
    db: {
      settings: {
        customRoles: [{ id: 'limited-role', name: 'Rol limitat', permissions }],
      },
      departments: [],
    },
  }
}

test('o permisiune punctuală nu devine administrare a întregului modul', () => {
  const auth = authFor(['logistics:view'])

  assert.equal(authHasPermission(auth, 'logistics:view'), true)
  assert.equal(authHasPermission(auth, 'logistics:manage'), false)
  assert.equal(authHasPermission(auth, 'procurement:view'), false)
})

test('o permisiune din achiziții nu acordă implicit acces la logistică', () => {
  const auth = authFor(['procurement:view'])

  assert.equal(authHasPermission(auth, 'procurement:view'), true)
  assert.equal(authHasPermission(auth, 'logistics:view'), false)
  assert.equal(authHasPermission(auth, 'logistics:manage'), false)
})

test('o permisiune financiară sau de achiziții nu devine administrare Contracte', () => {
  const procurementAuth = authFor(['procurement_orders:create'])
  const accountingAuth = authFor(['accounting:manage'])

  assert.equal(authHasPermission(procurementAuth, 'legal:contracts'), false)
  assert.equal(authHasPermission(procurementAuth, 'legal:manage'), false)
  assert.equal(authHasPermission(accountingAuth, 'legal:contracts'), false)
  assert.equal(authHasPermission(accountingAuth, 'legal:manage'), false)
})
