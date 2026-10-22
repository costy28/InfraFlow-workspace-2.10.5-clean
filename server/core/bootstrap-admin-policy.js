'use strict'

const DEMO_COMPANY_ADMIN_ROLE = 'demo_company_admin'
function isRestrictedDemoAdministrator(user) {
  return user?.role === DEMO_COMPANY_ADMIN_ROLE
    || (Array.isArray(user?.roles) && user.roles.includes(DEMO_COMPANY_ADMIN_ROLE))
}
function ensureActiveSuperadmin(db) {
  if (!Array.isArray(db.users) || !db.users.length) return
  // Preserve explicit existing administrators; never elevate the reserved trial role.
  if (db.users.some(user => user.active !== false && user.role === 'superadmin')) return
  const candidates = db.users.filter(user => user.active !== false && !isRestrictedDemoAdministrator(user))
  const admin = candidates.find(user => user.username === 'admin')
    || candidates.find(user => user.role === 'admin') || candidates[0]
  if (admin) admin.role = 'superadmin'
}
module.exports = { DEMO_COMPANY_ADMIN_ROLE, isRestrictedDemoAdministrator, ensureActiveSuperadmin }
