export function canAccessHrFileType(user, employee, type, hasPermission) {
  if (!employee?.id) return false
  const own = (employee.user_id && String(employee.user_id) === String(user?.id))
    || String(employee.id) === String(user?.employee_id || user?.employeeId || '')
  if (own) return true
  if (!hasPermission('hr:personal_sensitive')) return false
  const category = String(type || '').trim().toLowerCase()
  if (['medical', 'apt_medical', 'certificat_medical', 'adeverinta_medicala'].includes(category)) return hasPermission('hr:medical_view')
  if (['contract', 'cim', 'act_aditional', 'salariu', 'fluturas'].includes(category)) return hasPermission('hr:salary_view')
  return hasPermission('hr:salary_view') && hasPermission('hr:medical_view')
}
