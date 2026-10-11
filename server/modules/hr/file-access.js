const { authHasPermission } = require('../../core/permissions')

function canReadEmployeeFile(auth, item) {
  const employee = (auth.db.hr?.employees || []).find(row => String(row.id) === String(item.employee_id))
  if (!employee) return false
  const own = employee && ((employee.user_id && String(employee.user_id) === String(auth.user.id))
    || String(employee.id) === String(auth.user.employee_id || auth.user.employeeId || ''))
  if (own) return true
  if (!authHasPermission(auth, 'hr:personal_sensitive')) return false
  const type = String(item.tip || '').trim().toLowerCase()
  if (['medical', 'apt_medical', 'certificat_medical', 'adeverinta_medicala'].includes(type)) return authHasPermission(auth, 'hr:medical_view')
  if (['contract', 'cim', 'act_aditional', 'salariu', 'fluturas'].includes(type)) return authHasPermission(auth, 'hr:salary_view')
  // Un fișier neclasificat poate conține atât salarii cât și informații medicale.
  return authHasPermission(auth, 'hr:salary_view') && authHasPermission(auth, 'hr:medical_view')
}

module.exports = { canReadEmployeeFile }
