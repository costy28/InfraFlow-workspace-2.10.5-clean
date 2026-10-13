const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  authHasPermission,
  ensureDefaultCustomRoles,
  rolesList,
  updateRolePermissions,
} = require('../core/permissions')

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

test('deschiderea listei de roluri nu reacordă permisiuni eliminate de client', () => {
  const settings = {
    customRoles: [{
      id: 'operator',
      name: 'Operator producție',
      description: 'Restrâns de client',
      tip: 'default',
      customized: true,
      permissions: ['dashboard:view'],
    }],
  }

  ensureDefaultCustomRoles(settings)

  const operator = settings.customRoles.find(role => role.id === 'operator')
  assert.deepEqual(operator.permissions, ['dashboard:view'])
  assert.equal(rolesList(settings).find(role => role.id === 'operator').customized, true)
})

test('salvarea și resetarea unui rol implicit sunt explicite și reversibile', () => {
  const db = { settings: {} }
  const user = { id: 'admin-1', name: 'Administrator' }
  ensureDefaultCustomRoles(db.settings)

  updateRolePermissions(db, user, 'operator', { permissions: ['dashboard:view'] })
  let operator = db.settings.customRoles.find(role => role.id === 'operator')
  assert.deepEqual(operator.permissions, ['dashboard:view'])
  assert.equal(operator.customized, true)

  updateRolePermissions(db, user, 'operator', { reset: true })
  operator = db.settings.customRoles.find(role => role.id === 'operator')
  assert.equal(operator.customized, false)
  assert.equal(operator.permissions.includes('consumptions:create'), true)
})

test('rolurile implicite cu scopuri diferite au denumiri neambigue', () => {
  const settings = {}
  ensureDefaultCustomRoles(settings)

  const names = settings.customRoles.map(role => role.name)
  assert.equal(new Set(names).size, names.length)
  assert.equal(settings.customRoles.find(role => role.id === 'operator-statie').name, 'Operator stație / servicii')
})

test('eticheta veche duplicată este corectată fără schimbarea permisiunilor existente', () => {
  const settings = {
    customRoles: [{
      id: 'operator-statie',
      name: 'Operator producție',
      description: 'Descriere păstrată',
      tip: 'default',
      permissions: ['dashboard:view'],
    }],
  }

  assert.equal(ensureDefaultCustomRoles(settings), true)
  const role = settings.customRoles.find(item => item.id === 'operator-statie')
  assert.equal(role.name, 'Operator stație / servicii')
  assert.equal(role.description, 'Descriere păstrată')
  assert.deepEqual(role.permissions, ['dashboard:view'])
  assert.equal(rolesList(settings).find(item => item.id === 'operator-statie').customized, true)
})

test('lista pentru editor numără numai permisiunile vizibile în catalog', () => {
  const settings = {}
  ensureDefaultCustomRoles(settings)

  for (const role of rolesList(settings)) {
    assert.equal(role.permissions.every(permission => !['read', 'write'].includes(permission)), true)
  }
})

test('modulele operaționale nu interceptează administrarea centrală a rolurilor', () => {
  const root = path.resolve(__dirname, '..', '..')
  const modulesMountedBeforeSystem = ['inventory', 'production', 'procurement', 'fleet', 'technical', 'workflow']

  for (const moduleName of modulesMountedBeforeSystem) {
    const source = fs.readFileSync(path.join(root, 'server', 'modules', moduleName, 'routes.js'), 'utf8')
    assert.equal(source.includes('url.pathname === "/api/roles"'), false, moduleName)
    assert.equal(source.includes('url.pathname.match(/^\\/api\\/roles'), false, moduleName)
  }
})
