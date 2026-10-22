'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { analyzeCoreReadiness } = require('../../scripts/lib/core-sync-readiness')
const { fingerprint } = require('../../scripts/lib/core-sync-manifest')
const { integratedFixture } = require('./support/core-integrated-fixture')
const { allPermissions, authHasPermission } = require('../core/permissions')
const { effectiveEntitlements } = require('../core/module-catalog')
function fixture() {
  const f = integratedFixture()
  return { source: JSON.parse(f.source), target: JSON.parse(f.target), manifest: f.manifest }
}
function run(f) {
  const hashes = { source: fingerprint(JSON.stringify(f.source)), target: fingerprint(JSON.stringify(f.target)) }
  f.manifest.snapshots = { sourceSha256: hashes.source, targetSha256: hashes.target }
  return analyzeCoreReadiness(f.source, f.target, f.manifest, hashes)
}
test('consolidated diagnostics distinguish snapshot checks from unverified pilot gates', () => {
  const f = fixture(), before = JSON.stringify({ source: f.source, target: f.target }), r = run(f)
  assert.equal(r.status, 'blocked'); assert.equal(r.writeAuthorized, false); assert.equal(r.pilotAuthorized, false)
  assert.equal(r.sections.manifest.mappingStatus, 'structurally_valid')
  assert.equal(r.sections.simulation.status, 'blocked'); assert.equal(r.sections.authorization.status, 'blocked')
  assert.equal(r.unresolvedGates.length, 6)
  assert.equal(JSON.stringify({ source: f.source, target: f.target }), before)
  for (const secret of ['Synthetic User', 'SYNTHETIC-SECRET', f.source.users[0].id, f.manifest.companyId]) assert.ok(!JSON.stringify(r).includes(secret))
})
test('stale fingerprint is a manifest blocker, not a passing historical test', () => {
  const f = fixture(); run(f)
  const r = analyzeCoreReadiness(f.source, f.target, f.manifest, { source: '0'.repeat(64), target: f.manifest.snapshots.targetSha256 })
  assert.equal(r.sections.manifest.status, 'blocked'); assert.equal(r.snapshotChecksWithoutDetectedBlockers, 0)
})
test('even three clean snapshot sections never authorize a pilot or import', () => {
  const f = fixture(), u = f.source.users[0], d = f.source.departments[0]
  delete u.twoFactorSecretEncrypted; delete u.roles; delete d.permissions
  u.role = 'viewer'; u.passwordHash = `scrypt:${'a'.repeat(32)}:${'b'.repeat(128)}`
  f.source.settings.customRoles = []; f.source.settings.rolePermissionOverrides = { viewer: ['logistics:view'] }
  f.target.roles = [{ role_key: 'viewer' }]
  f.manifest.mappings.roles = [{ source: 'viewer', target: 'viewer' }]
  f.target.users = [{ id: u.id, company_id: f.manifest.companyId, department_id: u.departmentId, role_key: u.role, username: u.username, display_name: u.name, active: true }]
  f.target.departments = [{ id: d.id, company_id: f.manifest.companyId, module_key: d.moduleKey, name: d.name, active: true }]
  f.target.permissions = allPermissions.map(permission_key => ({ permission_key }))
  const entitlements = effectiveEntitlements({ license: f.source.settings.license, settings: f.source.settings })
  f.target.role_permissions = allPermissions.filter(p => authHasPermission({ user: u, db: f.source, entitlements }, p)).map(permission_key => ({ role_key: 'viewer', permission_key }))
  const r = run(f)
  assert.equal(r.snapshotChecksWithoutDetectedBlockers, 3)
  assert.equal(r.status, 'blocked'); assert.equal(r.pilotAuthorized, false); assert.equal(r.writeAuthorized, false)
})
test('malformed inputs return redacted blocked diagnostics rather than a success', () => {
  for (const value of [null, [], { users: [null] }]) {
    const r = analyzeCoreReadiness(value, null, null, {})
    assert.equal(r.status, 'blocked'); assert.equal(r.globalRelationalReadiness, false)
    assert.equal(r.snapshotChecksWithoutDetectedBlockers, 0)
  }
})
test('readiness CLI writes no inputs, exits blocked and rejects apply', () => {
  const f = fixture(); run(f)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'infraflow-readiness-'))
  const files = ['source', 'target', 'manifest'].map(name => path.join(dir, name + '.json'))
  const data = [f.source, f.target, f.manifest].map(JSON.stringify)
  files.forEach((file, i) => fs.writeFileSync(file, data[i])) // Synthetic fixture only.
  const cli = path.resolve(__dirname, '../../scripts/diagnose-core-manifest.js')
  const args = ['--readiness', '--source', files[0], '--target', files[1], '--manifest', files[2]]
  const p = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
  assert.equal(p.status, 1); assert.equal(JSON.parse(p.stdout).format, 'infraflow-core-readiness-v1')
  files.forEach((file, i) => assert.equal(fs.readFileSync(file, 'utf8'), data[i]))
  assert.equal(spawnSync(process.execPath, [cli, ...args, '--apply', 'yes']).status, 2)
})
