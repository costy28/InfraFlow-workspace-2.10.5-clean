'use strict'
const { validateCoreManifest } = require('./core-sync-manifest')
const { allPermissions, authHasPermission, normalizedUserRoles, roleInfo } = require('../../server/core/permissions')
const { effectiveEntitlements } = require('../../server/core/module-catalog')
const uuidKey = v => typeof v === 'string' ? (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v) ? v.toLowerCase() : v) : ''
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v)

// Compară deciziile runtime actuale cu granturile STOCATE în SQL, nu cu un
// presupus motor de autorizare relațional. Nu acordă și nu rescrie drepturi.
function analyzeCoreAuthorization(source, target, manifest, fingerprints) {
  const validation = validateCoreManifest(source, target, manifest, fingerprints)
  const issues = [], rows = [], totals = { blockers: 0, comparedUsers: 0, gainedGrants: 0, lostGrants: 0 }
  function issue(code, row = null) { totals.blockers++; if (issues.length < 100) issues.push({ code, row }) }
  const finish = () => ({ format: 'infraflow-core-authorization-v1', mode: 'read-only', writeAuthorized: false,
    runtimeEquivalenceVerified: false, globalRelationalReadiness: false,
    status: totals.blockers || validation.mappingStatus !== 'structurally_valid' ? 'blocked' : 'review_required',
    totals, issues, rows, issuesTruncated: totals.blockers > issues.length,
    rowsTruncated: totals.comparedUsers > rows.length, validation,
    comparison: 'current runtime decisions versus stored SQL role grants',
    notEvaluated: ['relational authorization engine', 'entity-level access', 'sessions and device policies', 'future permissions', 'live snapshot freshness'] })
  if (validation.mappingStatus !== 'structurally_valid') return finish()
  if (!object(source?.settings) || !object(source.settings.license) || !Array.isArray(source.settings.modules_enabled)) issue('explicit_license_and_module_settings_required')
  if (!Array.isArray(source?.settings?.customRoles) || !object(source?.settings?.rolePermissionOverrides)) issue('explicit_role_configuration_required')
  if (!Array.isArray(source?.users) || !Array.isArray(source?.departments)) issue('source_collections_required')
  if (!Array.isArray(target?.permissions) || !Array.isArray(target?.role_permissions)) issue('target_permission_snapshot_required')
  if (totals.blockers) return finish()
  const universe = new Set(allPermissions), targetCatalog = new Set(), grants = new Map()
  const customIds = new Set()
  for (const role of source.settings.customRoles) {
    if (!object(role) || typeof role.id !== 'string' || !role.id || customIds.has(role.id) || !Array.isArray(role.permissions) || role.permissions.some(p => !universe.has(p))) issue('source_custom_role_configuration_invalid')
    else customIds.add(role.id)
  }
  for (const [role, permissions] of Object.entries(source.settings.rolePermissionOverrides)) {
    if (!Object.hasOwn(roleInfo, role) || role === 'superadmin' || !Array.isArray(permissions) || permissions.some(p => !universe.has(p))) issue('source_role_override_invalid')
  }
  for (const row of target.permissions) {
    if (!object(row) || typeof row.permission_key !== 'string' || !universe.has(row.permission_key) || targetCatalog.has(row.permission_key)) issue('target_permission_catalog_invalid')
    else targetCatalog.add(row.permission_key)
  }
  const roleKeys = new Set(target.roles.map(r => r?.role_key))
  for (const row of target.role_permissions) {
    if (!object(row) || !roleKeys.has(row.role_key) || !targetCatalog.has(row.permission_key)) { issue('target_role_grant_invalid'); continue }
    if (!grants.has(row.role_key)) grants.set(row.role_key, new Set())
    if (grants.get(row.role_key).has(row.permission_key)) issue('duplicate_target_role_grant')
    grants.get(row.role_key).add(row.permission_key)
  }
  // Fără întregul catalog nu declarăm că absența înseamnă refuz.
  if (targetCatalog.size !== universe.size) issue('target_permission_catalog_incomplete')
  if (totals.blockers) return finish()
  const entitlements = effectiveEntitlements({ license: source.settings.license, settings: source.settings })
  const mappings = new Map(manifest.mappings.users.map(e => [uuidKey(e.source), uuidKey(e.target)]))
  for (let index = 0; index < source.users.length; index++) {
    const user = source.users[index], row = index + 1
    if (!object(user) || typeof user.role !== 'string' || !user.role.trim() || (user.roles !== undefined && (!Array.isArray(user.roles) || user.roles.some(r => typeof r !== 'string' || !r.trim())))) { issue('explicit_user_roles_required', row); continue }
    const roles = normalizedUserRoles(user)
    if (roles.some(role => !Object.hasOwn(roleInfo, role) && !source.settings.customRoles.some(r => r?.id === role && Array.isArray(r.permissions)))) { issue('source_role_definition_missing', row); continue }
    if (roles.includes('superadmin')) { issue('superadmin_runtime_bypass_requires_model', row); continue }
    if (roles.length !== 1) { issue('multi_role_relational_model_required', row); continue }
    if (user.active !== true && user.active !== 1) { issue('inactive_or_ambiguous_user_not_compared', row); continue }
    const current = target.users.filter(u => uuidKey(u?.id) === mappings.get(uuidKey(user.id)))
    if (current.length !== 1 || uuidKey(current[0].company_id) !== uuidKey(manifest.companyId) || !roleKeys.has(current[0].role_key)) { issue('target_user_identity_or_role_unresolved', row); continue }
    if (current[0].active !== true && current[0].active !== 1) { issue('target_user_inactive_or_ambiguous', row); continue }
    const roleMapping = manifest.mappings.roles.find(e => e.source === roles[0])
    if (!roleMapping || current[0].role_key !== roleMapping.target) { issue('target_role_differs_from_manifest', row); continue }
    if (user.department_id && user.department_id !== user.departmentId) { issue('department_alias_requires_runtime_review', row); continue }
    if (user.departmentId && !source.departments.some(d => d?.id === user.departmentId)) { issue('source_department_missing', row); continue }
    const stored = grants.get(current[0].role_key) || new Set()
    const effective = new Set(allPermissions.filter(p => authHasPermission({ user, db: source, entitlements }, p)))
    const gained = [...stored].filter(p => !effective.has(p)).length
    const lost = [...effective].filter(p => !stored.has(p)).length
    totals.comparedUsers++; totals.gainedGrants += gained; totals.lostGrants += lost
    if (gained || lost) issue('stored_grants_differ_from_runtime', row)
    if (rows.length < 100) rows.push({ row, runtimePermissions: effective.size, storedGrants: stored.size, gainedGrants: gained, lostGrants: lost })
  }
  return finish()
}
module.exports = { analyzeCoreAuthorization }
