const { authHasPermission } = require('../../core/permissions')

function timesheetScope(auth, write = false) {
  if (authHasPermission(auth, 'hr:timesheets_manage')) return { type: 'all' }
  const department = String(auth.user.departmentId || auth.user.department_id || auth.user.dept_id || auth.user.department || auth.user.departament || '').trim()
  if (authHasPermission(auth, 'hr:timesheet_dept')) {
    return department ? { type: 'department', department } : { type: 'own' }
  }
  if (!write && authHasPermission(auth, 'hr:timesheets_view')) return { type: 'all' }
  return { type: 'own' }
}

function employeeInScope(auth, employee, scope) {
  if (!employee) return false
  if (scope.type === 'none') return false
  if (scope.type === 'all') return true
  if (scope.type === 'department') {
    return [employee.department_id, employee.dept_id, employee.department_name, employee.department]
      .some(value => value != null && String(value) === scope.department)
  }
  const userId = String(auth.user.id || '')
  const linkedId = String(auth.user.employee_id || auth.user.employeeId || '')
  return Boolean(userId && String(employee.user_id || '') === userId)
    || Boolean(linkedId && String(employee.id) === linkedId)
}

function timesheetSqlAccess(auth, write = false) {
  const scope = timesheetScope(auth, write)
  const params = { accessDepartment: scope.department || '', accessUser: String(auth.user.id || ''), accessEmployee: String(auth.user.employee_id || auth.user.employeeId || '') }
  const condition = scope.type === 'department'
    ? `AND (CONVERT(nvarchar(100),e.department_id)=JSON_VALUE(@p,'$.accessDepartment') OR d.denumire=JSON_VALUE(@p,'$.accessDepartment'))`
    : scope.type === 'own'
      ? `AND (e.user_id=JSON_VALUE(@p,'$.accessUser') OR CONVERT(nvarchar(100),e.id)=NULLIF(JSON_VALUE(@p,'$.accessEmployee'),''))`
      : ''
  return { condition, params, scope }
}

function overtimeApprovalScope(auth) {
  if (authHasPermission(auth, 'hr:timesheets_manage')) return { type: 'all' }
  if (!authHasPermission(auth, 'hr:timesheet_dept')) return { type: 'all' }
  const scope = timesheetScope(auth, true)
  return scope.type === 'department' ? scope : { type: 'none' }
}

function canSubmitDepartment(auth, requested, own) {
  if (!requested) return false
  if (authHasPermission(auth, 'hr:timesheets_manage')) return true
  return authHasPermission(auth, 'hr:timesheet_dept') && Boolean(own) && requested === own
}

function canApproveEmployees(auth, employeeIds, employees) {
  if (!Array.isArray(employeeIds) || !employeeIds.length) return false
  const scope = overtimeApprovalScope(auth)
  return employeeIds.every(id => employeeInScope(auth, employees.find(employee => String(employee.id) === String(id)), scope))
}

module.exports = { timesheetScope, employeeInScope, timesheetSqlAccess, overtimeApprovalScope, canSubmitDepartment, canApproveEmployees }
