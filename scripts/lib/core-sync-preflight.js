'use strict'
// Analiză pură, fără conexiuni, efecte secundare sau plan SQL executabil.
const guid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''))
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
const identity = value => guid(text(value)) ? text(value).toLowerCase() : text(value)
function analyzeCoreSync(source, target, options = {}) {
  const issues = [], counts = {}, totals = { blockers: 0, warnings: 0 }
  function issue(code, entity, row = null, severity = 'blocker') {
    totals[severity === 'blocker' ? 'blockers' : 'warnings']++
    if (issues.length < 100) issues.push({ code, entity, row, severity })
  }
  function collection(object, key, scope) {
    if (!object || !Array.isArray(object[key])) { issue('collection_required', `${scope}.${key}`); return [] }
    return object[key].flatMap((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) { issue('record_required', `${scope}.${key}`, index + 1); return [] }
      return [{ value: row, row: index + 1 }]
    })
  }
  const users = collection(source, 'users', 'source'), departments = collection(source, 'departments', 'source')
  for (const key of ['users','departments']) if (Array.isArray(source?.core?.[key]) && source.core[key].length) issue('parallel_core_collection_requires_review', `source.core.${key}`)
  const targets = Object.fromEntries(['users','departments','companies','roles','modules'].map(key => [key, collection(target, key, 'target')]))
  const company = identity(options?.companyId)
  if (!guid(company)) issue('explicit_company_uuid_required', 'company')
  else if (!targets.companies.some(item => identity(item.value.id) === company)) issue('company_missing_in_target', 'company')
  const targetIds = {}, sourceIds = {}
  for (const key of ['users','departments']) {
    targetIds[key] = new Map(); sourceIds[key] = new Set()
    for (const item of targets[key]) {
      activeFlag(item.value, `target.${key}`, item.row)
      const id = identity(item.value.id)
      if (!guid(id)) issue('target_uuid_required', `target.${key}`, item.row)
      if (targetIds[key].has(id)) issue('duplicate_id', `target.${key}`, item.row)
      targetIds[key].set(id, item.value)
    }
  }
  const usernames = new Map(), targetUsernames = new Map()
  for (const item of targets.users) {
    const name = text(item.value.username).toLowerCase()
    if (!name) issue('username_required', 'target.users', item.row)
    if (targetUsernames.has(name)) issue('duplicate_username', 'target.users', item.row)
    targetUsernames.set(name, identity(item.value.id))
  }
  const roleKeys = new Set(targets.roles.map(item => text(item.value.role_key)))
  const moduleKeys = new Set(targets.modules.map(item => text(item.value.module_key)))
  function aliases(row, keys, entity, index) {
    const values = [...new Set(keys.map(key => identity(row[key])).filter(Boolean))]
    if (values.length > 1) issue('conflicting_aliases', entity, index)
    return values[0] || ''
  }
  function activeFlag(row, entity, index) {
    const values = ['active','activ'].filter(key => row[key] !== undefined).map(key => row[key])
    if (!values.length || values.some(value => ![true,false,0,1].includes(value))) { issue('active_state_mapping_required', entity, index); return undefined }
    const states = [...new Set(values.map(value => value === true || value === 1))]
    if (states.length > 1) issue('conflicting_aliases', entity, index)
    return states[0]
  }
  for (const [key, rows] of [['departments', departments], ['users', users]]) {
    for (const item of rows) {
      const row = item.value, id = identity(row.id), entity = `source.${key}`
      if (!guid(id)) issue('uuid_mapping_required', entity, item.row)
      if (sourceIds[key].has(id)) issue('duplicate_id', entity, item.row)
      sourceIds[key].add(id)
      const rowCompany = aliases(row, ['companyId','company_id'], entity, item.row)
      if (rowCompany && rowCompany !== company) issue('source_company_conflict', entity, item.row)
      const current = targetIds[key].get(id)
      if (current) {
        if (identity(current.company_id) !== company) issue('target_company_conflict', entity, item.row)
      }
      const name = text(row.name)
      const active = activeFlag(row, entity, item.row)
      if (!name || name.length > 180) issue('display_name_required_or_too_long', entity, item.row)
      if (key === 'departments') {
        const module = aliases(row, ['moduleKey','module_key'], entity, item.row)
        if (!moduleKeys.has(module)) issue('module_mapping_required', entity, item.row)
        if (current && (text(current.name) !== name || text(current.module_key) !== module || (current.active !== false && current.active !== 0) !== active)) issue('existing_record_differs', entity, item.row)
      } else {
        const username = text(row.username), usernameKey = username.toLowerCase()
        if (!username || username.length > 120) issue('username_required_or_too_long', entity, item.row)
        if (usernames.has(usernameKey)) issue('duplicate_username', entity, item.row)
        usernames.set(usernameKey, id)
        if (targetUsernames.has(usernameKey) && targetUsernames.get(usernameKey) !== id) issue('target_username_collision', entity, item.row)
        const roles = [...new Set([...(Array.isArray(row.roles) ? row.roles.map(text) : []), text(row.role)].filter(Boolean))]
        if (row.roles !== undefined && !Array.isArray(row.roles)) issue('roles_array_required', entity, item.row)
        if (roles.length !== 1) issue('single_role_mapping_required', entity, item.row)
        else if (!roleKeys.has(roles[0])) issue('role_missing_in_target', entity, item.row)
        const department = aliases(row, ['departmentId','department_id'], entity, item.row)
        if (!department && row.department !== undefined && row.department !== null && row.department !== '') issue('department_name_mapping_required', entity, item.row)
        if (department && !guid(department)) issue('department_uuid_mapping_required', entity, item.row)
        if (department && !sourceIds.departments.has(department) && !targetIds.departments.has(department)) issue('department_reference_missing', entity, item.row)
        const targetDepartment = targetIds.departments.get(department)
        if (targetDepartment && identity(targetDepartment.company_id) !== company) issue('department_company_conflict', entity, item.row)
        // Doar formatul curent; nu verifică parola și nu exportă hash-ul.
        if (!/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/i.test(String(row.passwordHash || ''))) issue('compatible_password_hash_required', entity, item.row)
        if (row.password !== undefined) issue('legacy_plaintext_password_present', entity, item.row)
        if (text(row.email) || row.employee_id !== undefined || row.manager_id !== undefined) issue('profile_links_outside_core_projection', entity, item.row, 'warning')
        if (current && (text(current.username) !== username || text(current.display_name) !== name || text(current.role_key) !== roles[0] || identity(current.department_id) !== department || (current.active !== false && current.active !== 0) !== active)) issue('existing_record_differs', entity, item.row)
      }
    }
    const validSourceIds = [...sourceIds[key]].filter(guid)
    counts[key] = { source: Array.isArray(source?.[key]) ? source[key].length : null, sourceRecordsAnalyzed: rows.length, target: targets[key].length,
      identitiesPresentInBoth: validSourceIds.filter(id => targetIds[key].has(id)).length,
      sourceOnlyIdentities: validSourceIds.filter(id => !targetIds[key].has(id)).length,
      targetOnlyIdentities: [...targetIds[key].keys()].filter(id => guid(id) && !sourceIds[key].has(id)).length }
    if (counts[key].targetOnlyIdentities) issue('target_only_rows_preserved', `target.${key}`, null, 'warning')
  }
  for (const code of ['sql_collation_unverified','permission_matrix_not_reconciled','credential_validity_unverified','snapshot_freshness_unverified']) issue(code, 'scope', null, 'warning')
  return { format: 'infraflow-core-sync-preflight-v1', scope: ['core.users','core.departments'], mode: 'read-only',
    writeAuthorized: false, globalRelationalReadiness: false, status: totals.blockers ? 'blocked' : 'review_required', counts, totals,
    issues, issuesTruncated: totals.blockers + totals.warnings > issues.length,
    notEvaluated: ['SQL schema metadata', 'role_permissions', 'password equality', 'other modules', 'existing data migration', 'concurrency'] }
}
module.exports = { analyzeCoreSync }
