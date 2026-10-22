'use strict'
const { isDeepStrictEqual } = require('node:util')
const { sealCoreSnapshot, openCoreSnapshot } = require('./core-sync-capsule')
const { encodePolicyContext, decodePolicyContext } = require('./core-policy-prototype')
const { encodeRoleLinks, decodeRoleLinks } = require('./core-role-links-prototype')
const { allPermissions, authHasPermission } = require('../../server/core/permissions')
const { effectiveEntitlements } = require('../../server/core/module-catalog')
const FORMAT = 'infraflow-integrated-stage-prototype-v1'
const fail = () => { throw Error('Proba integrată nu a putut fi reconciliată.') }
function model(source, target) {
  if (!Array.isArray(source.users) || !Array.isArray(target.roles)) fail()
  const catalog = new Set(target.roles.map(r => r.role_key)), seen = new Set()
  const users = source.users.map(user => {
    if (seen.has(String(user.id).toLowerCase())) fail()
    seen.add(String(user.id).toLowerCase())
    return { id: user.id, ...encodeRoleLinks(user, catalog) }
  })
  return { users, policy: encodePolicyContext(source) }
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]))
  return value
}
function normalized(stage) {
  if (!Array.isArray(stage.users) || !Array.isArray(stage.policy?.rows)) fail()
  return canonical({ users: stage.users.map(u => ({ ...u, id: u.id.toLowerCase(), links: [...u.links].sort((a, b) => a.position - b.position) })).sort((a, b) => a.id.localeCompare(b.id)),
    policy: { ...stage.policy, rows: [...stage.policy.rows].sort((a, b) => JSON.stringify([a.section, a.key]).localeCompare(JSON.stringify([b.section, b.key]))) } })
}
// EXCLUSIV prototip sintetic, neconectat la runtime/CLI. Conține politici sensibile.
function createIntegratedStage(sourceBytes, targetBytes, manifest, key) {
  try {
    const capsule = sealCoreSnapshot(sourceBytes, targetBytes, manifest, key)
    const source = JSON.parse(sourceBytes.toString('utf8')), target = JSON.parse(targetBytes.toString('utf8'))
    return { format: FORMAT, capsule, ...model(source, target) }
  } catch { fail() }
}
function verifyIntegratedStage(stage, targetBytes, manifest, key) {
  let bytes
  try {
    if (!stage || stage.format !== FORMAT || Object.keys(stage).sort().join(',') !== 'capsule,format,policy,users') fail()
    bytes = openCoreSnapshot(stage.capsule, targetBytes, manifest, key)
    const source = JSON.parse(bytes.toString('utf8')), target = JSON.parse(targetBytes.toString('utf8'))
    const expected = model(source, target)
    if (!isDeepStrictEqual(normalized(stage), normalized(expected))) fail()
    const db = decodePolicyContext(stage.policy), catalog = new Set(target.roles.map(r => r.role_key))
    const sourceEntitlements = effectiveEntitlements({ license: source.settings.license, settings: source.settings })
    const restoredEntitlements = effectiveEntitlements({ license: db.settings.license, settings: db.settings })
    let decisionsCompared = 0
    for (const user of source.users) {
      const saved = stage.users.find(u => u.id.toLowerCase() === user.id.toLowerCase())
      const restored = { ...user, ...decodeRoleLinks(saved.primaryRole, saved.links, catalog) }
      for (const permission of [...allPermissions, 'future:permission']) {
        if (authHasPermission({ user, db: source, entitlements: sourceEntitlements }, permission) !== authHasPermission({ user: restored, db, entitlements: restoredEntitlements }, permission)) fail()
        decisionsCompared++
      }
    }
    return { format: 'infraflow-integrated-stage-report-v1', status: 'review_required', writeAuthorized: false,
      globalRelationalReadiness: false, usersCompared: source.users.length, decisionsCompared,
      sourceByteIdentityVerified: true, roleAndPolicyReconciliationVerified: true,
      notEvaluated: ['live freshness', 'entity access', 'persistent importer', 'authentication and sessions', 'secret key compatibility'] }
  } catch { fail() } finally { if (bytes) bytes.fill(0) }
}
module.exports = { createIntegratedStage, verifyIntegratedStage }
