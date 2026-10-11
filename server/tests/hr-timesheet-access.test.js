const test = require('node:test')
const assert = require('node:assert/strict')
const { timesheetScope, employeeInScope, timesheetSqlAccess, overtimeApprovalScope, canSubmitDepartment, canApproveEmployees } = require('../modules/hr/timesheet-access')

function authFor(permissions, extra = {}) {
  return { user: { id: 'u1', role: 'limited', ...extra }, db: { settings: { customRoles: [{ id: 'limited', permissions }] }, departments: [] } }
}
const own = { id: 1, user_id: 'u1', department_id: 'd1' }
const colleague = { id: 2, user_id: 'u2', department_id: 'd1' }
const other = { id: 3, user_id: 'u3', department_id: 'd2' }

test('validarea în masă refuză integral selecțiile mixte sau identificatorii inexistenți', () => {
  const auth = authFor(['hr:timesheet_approve', 'hr:timesheet_dept'], { department_id: 'd1' })
  const employees = [own, colleague, other]
  assert.equal(canApproveEmployees(auth, [1, 2], employees), true)
  assert.equal(canApproveEmployees(auth, [1, 3], employees), false)
  assert.equal(canApproveEmployees(auth, [1, 999], employees), false)
  assert.equal(canApproveEmployees(auth, [], employees), false)
  assert.equal(canApproveEmployees(auth, '1', employees), false)
  assert.equal(canApproveEmployees(authFor(['hr:timesheet_approve']), [1, 3], employees), true)
})

test('finalizarea departamentului nu este acordată de pontajul propriu', () => {
  assert.equal(canSubmitDepartment(authFor(['hr:timesheet']), 'd1', 'd1'), false)
  const chief = authFor(['hr:timesheet_dept'])
  assert.equal(canSubmitDepartment(chief, 'd1', 'd1'), true)
  assert.equal(canSubmitDepartment(chief, 'd2', 'd1'), false)
  assert.equal(canSubmitDepartment(chief, 'd1', ''), false)
  assert.equal(canSubmitDepartment(authFor(['hr:timesheets_manage']), 'd2', 'd1'), true)
  assert.equal(canSubmitDepartment(authFor(['hr:timesheets_manage']), '', ''), false)
})

test('aprobatorul pe departament nu poate aproba în alt departament sau fără departament', () => {
  const rights = ['hr:timesheet_approve', 'hr:timesheet_dept']
  const auth = authFor(rights, { department_id: 'd1' })
  assert.equal(employeeInScope(auth, colleague, overtimeApprovalScope(auth)), true)
  assert.equal(employeeInScope(auth, other, overtimeApprovalScope(auth)), false)
  assert.equal(employeeInScope(authFor(rights), own, overtimeApprovalScope(authFor(rights))), false)
})

test('filtrul SQL folosește parametri de acces calculați din utilizator', () => {
  const access = timesheetSqlAccess(authFor(['hr:timesheet']))
  assert.match(access.condition, /accessUser/)
  assert.equal(access.params.accessUser, 'u1')
  assert.equal(access.params.accessEmployee, '')
  const department = timesheetSqlAccess(authFor(['hr:timesheet_dept'], { department_id: 'd1' }))
  assert.match(department.condition, /accessDepartment/)
  assert.equal(department.params.accessDepartment, 'd1')
})

test('pontaj simplu: acces propriu, fără acces la colegi prin schimbarea ID', () => {
  const auth = authFor(['hr:timesheet', 'hr:view_own'])
  for (const write of [false, true]) {
    const scope = timesheetScope(auth, write)
    assert.equal(employeeInScope(auth, own, scope), true)
    assert.equal(employeeInScope(auth, colleague, scope), false)
    assert.equal(employeeInScope(auth, other, scope), false)
  }
})

test('șef departament: vizualizarea pontajelor nu extinde accesul în afara departamentului', () => {
  const auth = authFor(['hr:timesheet', 'hr:timesheet_dept', 'hr:timesheets_view'], { department_id: 'd1' })
  for (const write of [false, true]) {
    const scope = timesheetScope(auth, write)
    assert.equal(employeeInScope(auth, colleague, scope), true)
    assert.equal(employeeInScope(auth, other, scope), false)
  }
})

test('departament absent: accesul revine la persoana proprie', () => {
  const auth = authFor(['hr:timesheet_dept', 'hr:timesheets_view'])
  assert.equal(employeeInScope(auth, colleague, timesheetScope(auth)), false)
})

test('vizualizarea globală nu permite modificarea globală', () => {
  const auth = authFor(['hr:timesheets_view', 'hr:timesheet'])
  assert.equal(employeeInScope(auth, other, timesheetScope(auth)), true)
  assert.equal(employeeInScope(auth, other, timesheetScope(auth, true)), false)
  const manager = authFor(['hr:timesheets_manage'])
  assert.equal(employeeInScope(manager, other, timesheetScope(manager, true)), true)
})

test('legarea explicită utilizator-angajat este acceptată; identificatorii lipsă nu se potrivesc', () => {
  const auth = authFor(['hr:timesheet'], { employee_id: 2 })
  assert.equal(employeeInScope(auth, colleague, timesheetScope(auth)), true)
  assert.equal(employeeInScope(auth, { id: 4 }, timesheetScope(auth)), false)
  assert.equal(employeeInScope(auth, null, timesheetScope(auth)), false)
})
