const { authHasPermission } = require('../../core/permissions')

function canReadHrNotification(db, user, notification) {
  const event = String(notification.event || notification.type || '')
  if (!['hr_expiration', 'hr_auto_inbox', 'hr_dossier_ack_reminder'].includes(event)) return true
  if (event === 'hr_dossier_ack_reminder') {
    const employeeId = notification.employee_id
    const employee = (db.hr?.employees || []).find(item => employeeId && String(item.id) === String(employeeId))
    const own = employee && ((employee.user_id && String(employee.user_id) === String(user.id))
      || String(employee.id) === String(user.employee_id || user.employeeId || ''))
    if (own) return true
  }
  return ['hr:personal_sensitive', 'hr:medical_view', 'hr:salary_view']
    .every(permission => authHasPermission({ db, user }, permission))
}

module.exports = { canReadHrNotification }
