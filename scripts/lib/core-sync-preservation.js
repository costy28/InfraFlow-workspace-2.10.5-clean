'use strict'
// Inventar de prezență, nu export de valori. Numele custom nu ajung în raport.
const projected = {
  users: new Set(['id', 'companyId', 'company_id', 'departmentId', 'department_id', 'role', 'roles', 'username', 'name', 'passwordHash', 'active', 'activ']),
  departments: new Set(['id', 'companyId', 'company_id', 'moduleKey', 'module_key', 'name', 'active', 'activ'])
}
const groups = {
  security: new Set(['password', 'twoFactorSecretEncrypted', 'twoFactorEnabledAt', 'twoFactorRecoveryCodeHashes', 'mustChangePassword', 'must_change_password']),
  hr_links: new Set(['employee_id', 'employeeId', 'manager_id', 'managerId']),
  authorization: new Set(['permissions', 'permissionOverrides', 'deniedPermissions', 'allowedPermissions']),
  demo_lifecycle: new Set(['createdBy', 'demoAccessExpiresAt', 'demoAccessDurationDays', 'demoInvitePending']),
  profile: new Set(['email', 'phone', 'telefon', 'avatar']),
  history: new Set(['createdAt', 'updatedAt', 'created_at', 'updated_at'])
}
function analyzeCorePreservation(source) {
  const issues = [], counts = {}, totals = { blockers: 0, uncoveredFields: 0 }
  for (const entity of ['users', 'departments']) {
    const rows = source?.[entity]
    counts[entity] = { rows: Array.isArray(rows) ? rows.length : 0, rowsWithUncoveredFields: 0, categories: {} }
    if (!Array.isArray(rows)) {
      totals.blockers++; if (issues.length < 100) issues.push({ code: 'collection_required', entity, row: null })
      continue
    }
    rows.forEach((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        totals.blockers++; if (issues.length < 100) issues.push({ code: 'record_required', entity, row: index + 1 })
        return
      }
      const categories = new Set()
      for (const field of Object.keys(row)) {
        if (projected[entity].has(field)) continue
        // Nici null/false/[] nu sunt eliminate: absența nu e echivalentă cu valoarea.
        const category = Object.keys(groups).find(group => groups[group].has(field)) || 'unclassified'
        totals.uncoveredFields++
        counts[entity].categories[category] = (counts[entity].categories[category] || 0) + 1
        categories.add(category)
      }
      if (categories.size) counts[entity].rowsWithUncoveredFields++
      for (const category of categories) {
        totals.blockers++
        if (issues.length < 100) issues.push({ code: 'field_preservation_required', entity, row: index + 1, category })
      }
    })
  }
  return { format: 'infraflow-core-preservation-v1', status: totals.blockers ? 'blocked' : 'review_required',
    writeAuthorized: false, counts, totals, issues, issuesTruncated: totals.blockers > issues.length,
    scope: 'root users and departments only',
    notEvaluated: ['other collections and settings', 'nested field semantics', 'SQL persistence', 'role permission equivalence'] }
}
module.exports = { analyzeCorePreservation }
