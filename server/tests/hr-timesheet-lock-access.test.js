const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

function fixture(permissions) {
  const filename = path.join(__dirname, '../modules/hr/timesheet-lock-routes.js')
  const localRequire = createRequire(filename)
  const routes = new Map()
  const router = { get(url, ...handlers) { routes.set(`get ${url}`, handlers) }, post(url, ...handlers) { routes.set(`post ${url}`, handlers) } }
  const db = { settings: { customRoles: [{ id: 'limited', permissions }] } }
  const auth = { db, user: { id: 'u1', role: 'limited' } }
  let writes = 0
  let data
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: { exports: {} },
    require(name) {
      if (name === 'express') return { Router: () => router }
      if (name === '../../core/auth') return { requireAuth: () => auth }
      if (name === '../../core/db') return { writeDb: () => { writes++ } }
      if (name === '../../core/audit') return { addAudit() {} }
      return localRequire(name)
    },
  }, { filename })
  return { db, auth, data: () => data, writes: () => writes, invoke(route, body) {
    const req = { body, query: body }
    let code = 200
    let continued = false
    const res = { status(value) { code = value; return this }, json(value) { data = value }, writeHead(value) { code = value }, end() {} }
    const handlers = routes.get(route)
    handlers[0](req, res, () => { continued = true })
    if (continued) handlers[1](req, res, error => { if (error) throw error })
    return code
  } }
}

test('aprobarea orelor suplimentare nu închide sau redeschide luna de pontaj', () => {
  for (const action of ['lock', 'unlock']) {
    const f = fixture(['hr:timesheet_approve'])
    assert.equal(f.invoke(`post /hr/timesheets/${action}`, { luna: '2026-10', motiv: 'Corecție pontaj' }), 403)
    assert.equal(f.writes(), 0)
  }
})

test('validatorul dedicat poate închide și redeschide luna cu motiv', () => {
  const f = fixture(['hr:timesheets_validate'])
  assert.equal(f.invoke('post /hr/timesheets/lock', { luna: '2026-10' }), 201)
  assert.equal(f.invoke('post /hr/timesheets/unlock', { luna: '2026-10', motiv: 'Corecție pontaj' }), 200)
  assert.equal(f.writes(), 2)
})

test('validatorul de departament nu poate închide sau redeschide luna globală', () => {
  for (const department of ['d1', null]) {
    for (const action of ['lock', 'unlock']) {
      const f = fixture(['hr:timesheets_validate', 'hr:timesheet_dept'])
      f.auth.user.department_id = department
      f.db.hr = { timesheetLocks: [{ id: 1, luna: '2026-10', locked_by: 'admin' }] }
      const before = JSON.stringify(f.db.hr.timesheetLocks)
      assert.equal(f.invoke(`post /hr/timesheets/${action}`, { luna: '2026-10', motiv: 'Corecție pontaj' }), 403)
      assert.equal(JSON.stringify(f.db.hr.timesheetLocks), before)
      assert.equal(f.writes(), 0)
    }
  }
})

test('administrarea globală permite închiderea chiar dacă există drept de departament', () => {
  const f = fixture(['hr:timesheets_validate', 'hr:timesheet_dept', 'hr:timesheets_manage'])
  f.auth.user.department_id = 'd1'
  assert.equal(f.invoke('post /hr/timesheets/lock', { luna: '2026-10' }), 201)
  assert.equal(f.writes(), 1)
})

test('starea lunii comunică interfeței dacă utilizatorul poate administra închiderea', () => {
  for (const [permissions, expected] of [
    [['hr:timesheets_validate'], true],
    [['hr:timesheets_validate', 'hr:timesheet_dept'], false],
    [['hr:timesheet_approve'], false],
  ]) {
    const f = fixture(permissions)
    assert.equal(f.invoke('get /hr/timesheets/lock', { luna: '2026-10' }), 200)
    assert.equal(f.data().can_manage, expected)
    assert.equal(f.writes(), 0)
  }
})
