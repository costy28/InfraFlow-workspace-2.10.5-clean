'use strict'
const { createHash } = require('node:crypto')
const { analyzeCoreSync } = require('./core-sync-preflight')
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
const key = value => uuid(value) ? value.toLowerCase() : value
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const fingerprint = bytes => createHash('sha256').update(bytes).digest('hex')

// Validează intențiile, nu proiectează/mută date și nu reduce blocajele preflight.
function validateCoreManifest(source, target, manifest, fingerprints = {}) {
  const issues = [], totals = { blockers: 0, warnings: 0 }
  function issue(code, entity = 'manifest', row = null) {
    totals.blockers++
    if (issues.length < 100) issues.push({ code, entity, row, severity: 'blocker' })
  }
  const m = record(manifest) ? manifest : {}
  const allowed = ['format', 'revision', 'companyId', 'snapshots', 'mappings']
  if (!record(manifest) || Object.keys(m).some(k => !allowed.includes(k))) issue('manifest_shape_invalid')
  if (m.format !== 'infraflow-core-sync-manifest-v1') issue('manifest_format_invalid')
  if (!Number.isSafeInteger(m.revision) || m.revision < 1) issue('manifest_revision_invalid')
  if (!uuid(m.companyId) || !Array.isArray(target?.companies) || !target.companies.some(r => record(r) && key(r.id) === key(m.companyId))) issue('manifest_company_invalid')
  if (!record(m.snapshots) || Object.keys(m.snapshots).some(k => !['sourceSha256', 'targetSha256'].includes(k))) issue('snapshot_binding_invalid')
  for (const name of ['source', 'target']) {
    const hash = m.snapshots?.[`${name}Sha256`]
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash) || hash !== fingerprints[name]) issue('snapshot_fingerprint_mismatch', name)
  }
  if (!record(m.mappings) || Object.keys(m.mappings).some(k => !['users', 'departments', 'modules', 'roles'].includes(k))) issue('mapping_collections_invalid')
  const counts = {}
  for (const name of ['users', 'departments', 'modules', 'roles']) {
    const entries = m.mappings?.[name]
    if (!Array.isArray(entries)) { issue('mapping_collection_required', name); continue }
    const rows = Array.isArray(source?.[name]) ? source[name] : []
    const expected = name === 'users' || name === 'departments'
      ? rows.filter(record).map(r => key(r.id))
      : name === 'modules'
        ? (Array.isArray(source?.departments) ? source.departments : []).filter(record).flatMap(r => [r.moduleKey, r.module_key]).filter(v => v !== undefined && v !== null && v !== '')
        : (Array.isArray(source?.users) ? source.users : []).filter(record).flatMap(r => [r.role, ...(Array.isArray(r.roles) ? r.roles : [])]).filter(v => v !== undefined && v !== null && v !== '')
    const seen = new Set(), destinations = new Set()
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i], row = i + 1
      if (!record(e) || Object.keys(e).length !== 2 || !Object.hasOwn(e, 'source') || !Object.hasOwn(e, 'target') || typeof e.source !== 'string' || !e.source || e.source !== e.source.trim() || typeof e.target !== 'string' || !e.target || e.target !== e.target.trim()) {
        issue('mapping_entry_invalid', name, row); continue
      }
      const from = key(e.source), to = key(e.target)
      if (seen.has(from)) issue('duplicate_mapping_source', name, row)
      seen.add(from)
      if (!expected.includes(from)) issue('mapping_source_missing', name, row)
      if (destinations.has(to)) issue('mapping_many_to_one_forbidden', name, row)
      destinations.add(to)
      if (name === 'users' || name === 'departments') {
        if (!uuid(e.target)) issue('mapping_target_uuid_required', name, row)
        // Un UUID sursă nu poate fi rescris prin această versiune a manifestului.
        if (uuid(e.source) && from !== to) issue('existing_uuid_remap_forbidden', name, row)
        const existing = Array.isArray(target?.[name]) ? target[name].find(r => record(r) && key(r.id) === to) : null
        if (existing && from !== to) issue('mapping_target_identity_occupied', name, row)
        if (existing && key(existing.company_id) !== key(m.companyId)) issue('mapping_target_company_conflict', name, row)
      } else {
        const field = name === 'modules' ? 'module_key' : 'role_key'
        if (!Array.isArray(target?.[name]) || !target[name].some(r => record(r) && r[field] === e.target)) issue('mapping_target_catalog_missing', name, row)
        if (name === 'roles' && e.source !== e.target) issue('role_permission_equivalence_unverified', name, row)
      }
    }
    for (const from of new Set(expected)) if (!seen.has(from)) issue('mapping_source_uncovered', name)
    counts[name] = { entries: entries.length, distinctSources: seen.size, expectedSources: new Set(expected).size }
  }
  const baseline = analyzeCoreSync(source, target, { companyId: m.companyId })
  return { format: 'infraflow-core-sync-manifest-report-v1', mode: 'read-only', writeAuthorized: false,
    globalRelationalReadiness: false, status: totals.blockers || baseline.totals.blockers ? 'blocked' : 'review_required',
    mappingStatus: totals.blockers ? 'invalid' : 'structurally_valid', totals, counts, issues,
    issuesTruncated: totals.blockers > issues.length, baseline,
    notEvaluated: ['mapping approval authenticity', 'live SQL schema', 'live snapshot freshness', 'permission equivalence', 'mapped projection', 'import'] }
}
module.exports = { validateCoreManifest, fingerprint }
