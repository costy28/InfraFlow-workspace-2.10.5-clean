'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { validateCoreManifest, fingerprint } = require('../../scripts/lib/core-sync-manifest')
const company = 'aaaaaaaa-0000-0000-0000-000000000001'
const user = 'bbbbbbbb-0000-0000-0000-000000000001'
const department = 'cccccccc-0000-0000-0000-000000000001'
function fixture() {
  const source = { users: [{ id: user, name: 'Private Person', username: 'private-login', role: 'employee', departmentId: department, active: true, passwordHash: `scrypt:${'a'.repeat(32)}:${'b'.repeat(128)}` }],
    departments: [{ id: department, name: 'Private Department', moduleKey: 'hr', active: true }] }
  const target = { users: [], departments: [], companies: [{ id: company }], roles: [{ role_key: 'employee' }], modules: [{ module_key: 'hr' }] }
  const hashes = { source: fingerprint(JSON.stringify(source)), target: fingerprint(JSON.stringify(target)) }
  const manifest = { format: 'infraflow-core-sync-manifest-v1', revision: 1, companyId: company,
    snapshots: { sourceSha256: hashes.source, targetSha256: hashes.target },
    mappings: { users: [{ source: user, target: user }], departments: [{ source: department, target: department }], modules: [{ source: 'hr', target: 'hr' }], roles: [{ source: 'employee', target: 'employee' }] } }
  return { source, target, hashes, manifest }
}
function check(f) { return validateCoreManifest(f.source, f.target, f.manifest, f.hashes) }
const codes = result => result.issues.map(i => i.code)
test('explicit identity manifest remains read-only and review-required', () => {
  const f = fixture(), before = JSON.stringify(f), r = check(f)
  assert.equal(r.mappingStatus, 'structurally_valid'); assert.equal(r.status, 'review_required')
  assert.equal(r.writeAuthorized, false); assert.equal(r.globalRelationalReadiness, false)
  assert.equal(JSON.stringify(f), before)
  for (const secret of [company, user, department, 'Private Person', 'private-login', f.source.users[0].passwordHash, f.hashes.source]) assert.ok(!JSON.stringify(r).includes(secret))
})
test('snapshot byte change or absent binding blocks', () => {
  const f = fixture(); f.hashes.source = fingerprint(JSON.stringify(f.source) + '\n')
  assert.ok(codes(check(f)).includes('snapshot_fingerprint_mismatch'))
  assert.equal(validateCoreManifest(f.source, f.target, f.manifest).mappingStatus, 'invalid')
})
test('legacy map can be structurally valid without concealing baseline blockers', () => {
  const f = fixture(); f.source.users[0].id = 'legacy-private'; f.manifest.mappings.users[0].source = 'legacy-private'
  const r = check(f)
  assert.equal(r.mappingStatus, 'structurally_valid'); assert.equal(r.status, 'blocked')
  assert.ok(r.baseline.issues.some(i => i.code === 'uuid_mapping_required'))
})
test('incomplete, duplicate and many-to-one mappings rejected', () => {
  const f = fixture(); f.manifest.mappings.departments = []
  f.manifest.mappings.users.push({ ...f.manifest.mappings.users[0] })
  const c = codes(check(f))
  for (const code of ['mapping_source_uncovered', 'duplicate_mapping_source', 'mapping_many_to_one_forbidden']) assert.ok(c.includes(code))
})
test('UUID remapping and occupied legacy target rejected', () => {
  const f = fixture(); f.manifest.mappings.users[0].target = department
  assert.ok(codes(check(f)).includes('existing_uuid_remap_forbidden'))
  f.source.users[0].id = 'legacy'; f.manifest.mappings.users[0].source = 'legacy'
  f.target.users = [{ id: department, company_id: company, username: 'other', active: true }]
  assert.ok(codes(check(f)).includes('mapping_target_identity_occupied'))
})
test('role renaming and multi-role cannot silently change permissions', () => {
  const f = fixture(); f.target.roles.push({ role_key: 'admin' }); f.manifest.mappings.roles[0].target = 'admin'
  assert.ok(codes(check(f)).includes('role_permission_equivalence_unverified'))
  f.source.users[0].roles = ['admin']
  const r = check(f)
  assert.ok(codes(r).includes('mapping_source_uncovered'))
  assert.ok(r.baseline.issues.some(i => i.code === 'single_role_mapping_required'))
})
test('malformed manifests and arbitrary secret fields rejected without echo', () => {
  for (const m of [null, [], {}, { format: 'future', password: 'DO-NOT-ECHO' }]) {
    const f = fixture(); f.manifest = m
    const r = check(f); assert.equal(r.status, 'blocked'); assert.ok(!JSON.stringify(r).includes('DO-NOT-ECHO'))
  }
  const f = fixture(); f.target.companies = {}; assert.equal(check(f).status, 'blocked')
})
test('CLI verifies exact file bytes, rejects apply and hides invalid JSON', () => {
  const f = fixture(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'infraflow-manifest-'))
  const source = path.join(dir, 'source.json'), target = path.join(dir, 'target.json'), manifest = path.join(dir, 'manifest.json')
  // Synthetic fixture files only; no installation data.
  fs.writeFileSync(source, JSON.stringify(f.source)); fs.writeFileSync(target, JSON.stringify(f.target)); fs.writeFileSync(manifest, JSON.stringify(f.manifest))
  const cli = path.resolve(__dirname, '../../scripts/diagnose-core-manifest.js')
  const args = ['--source', source, '--target', target, '--manifest', manifest]
  const invoke = extra => spawnSync(process.execPath, [cli, ...args, ...extra], { encoding: 'utf8' })
  assert.equal(invoke([]).status, 0)
  const simulated = spawnSync(process.execPath, [cli, '--simulate', ...args], { encoding: 'utf8' })
  assert.equal(simulated.status, 0)
  assert.equal(JSON.parse(simulated.stdout).simulationPerformed, true)
  assert.equal(JSON.parse(simulated.stdout).writeAuthorized, false)
  assert.equal(fs.readFileSync(source, 'utf8'), JSON.stringify(f.source))
  assert.equal(fs.readFileSync(target, 'utf8'), JSON.stringify(f.target))
  assert.equal(fs.readFileSync(manifest, 'utf8'), JSON.stringify(f.manifest))
  fs.appendFileSync(source, '\n'); assert.equal(invoke([]).status, 1)
  assert.equal(invoke(['--apply', 'yes']).status, 2)
  fs.writeFileSync(manifest, '{PRIVATE_INVALID_JSON')
  const r = invoke([]); assert.equal(r.status, 2); assert.ok(!(r.stdout + r.stderr).includes('PRIVATE_INVALID_JSON'))
})
