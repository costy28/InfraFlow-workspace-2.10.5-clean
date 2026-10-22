'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { randomBytes } = require('node:crypto')
const { sealCoreSnapshot, openCoreSnapshot } = require('../../scripts/lib/core-sync-capsule')
const { fingerprint } = require('../../scripts/lib/core-sync-manifest')
function fixture() {
  const company = 'aaaaaaaa-0000-0000-0000-000000000001'
  const source = Buffer.from(JSON.stringify({ users: [{ id: 'legacy', role: 'viewer', roles: ['viewer', 'admin'], twoFactorSecretEncrypted: 'SYNTHETIC-SECRET',
    twoFactorRecoveryCodeHashes: ['SYNTHETIC-RECOVERY'], demoAccessExpiresAt: '2030-01-01', employee_id: 'E-1', custom: { x: null, y: false }, email: 'private@example.invalid' }], departments: [] }, null, 2) + '\n')
  const target = Buffer.from(JSON.stringify({ companies: [{ id: company }], users: [], departments: [], modules: [], roles: [{ role_key: 'viewer' }, { role_key: 'admin' }] }))
  const manifest = { format: 'infraflow-core-sync-manifest-v1', revision: 1, companyId: company,
    snapshots: { sourceSha256: fingerprint(source), targetSha256: fingerprint(target) }, mappings: {
      users: [{ source: 'legacy', target: 'bbbbbbbb-0000-0000-0000-000000000001' }], departments: [], modules: [], roles: [{ source: 'viewer', target: 'viewer' }, { source: 'admin', target: 'admin' }] } }
  return { source, target, manifest, key: randomBytes(32) }
}
test('capsule conserves exact snapshot bytes including security, multi-role and custom data', () => {
  const f = fixture(), before = fingerprint(f.source), c = sealCoreSnapshot(f.source, f.target, f.manifest, f.key)
  const restored = openCoreSnapshot(JSON.parse(JSON.stringify(c)), f.target, f.manifest, f.key)
  assert.equal(fingerprint(restored), before); assert.equal(fingerprint(f.source), before)
  for (const value of ['SYNTHETIC-SECRET', 'SYNTHETIC-RECOVERY', 'private@example.invalid', 'twoFactorSecretEncrypted']) assert.ok(!JSON.stringify(c).includes(value))
  const second = sealCoreSnapshot(f.source, f.target, f.manifest, f.key)
  assert.notEqual(second.iv, c.iv); assert.notEqual(second.ciphertext, c.ciphertext)
})
test('wrong key, tampered ciphertext and tag are rejected with generic errors', () => {
  const f = fixture(), c = sealCoreSnapshot(f.source, f.target, f.manifest, f.key)
  assert.throws(() => openCoreSnapshot(c, f.target, f.manifest, randomBytes(32)), /nu a putut fi verificată/)
  for (const field of ['ciphertext', 'tag', 'iv']) {
    const changed = { ...c, [field]: (c[field][0] === 'A' ? 'B' : 'A') + c[field].slice(1) }
    assert.throws(() => openCoreSnapshot(changed, f.target, f.manifest, f.key), /nu a putut fi verificată/)
  }
})
test('manifest revision, company and target snapshot bind the capsule', () => {
  const f = fixture(), c = sealCoreSnapshot(f.source, f.target, f.manifest, f.key)
  for (const change of [m => { m.revision++ }, m => { m.companyId = 'other' }]) {
    const m = structuredClone(f.manifest); change(m)
    assert.throws(() => openCoreSnapshot(c, f.target, m, f.key))
  }
  assert.throws(() => openCoreSnapshot(c, Buffer.concat([f.target, Buffer.from('\n')]), f.manifest, f.key))
})
test('invalid mapping, stale source, missing key and unknown envelope fields fail closed', () => {
  const f = fixture()
  assert.throws(() => sealCoreSnapshot(f.source, f.target, f.manifest))
  assert.throws(() => sealCoreSnapshot(Buffer.concat([f.source, Buffer.from(' ')]), f.target, f.manifest, f.key))
  const m = structuredClone(f.manifest); m.mappings.users = []
  assert.throws(() => sealCoreSnapshot(f.source, f.target, m, f.key))
  const c = sealCoreSnapshot(f.source, f.target, f.manifest, f.key)
  assert.throws(() => openCoreSnapshot({ ...c, unexpected: 'PRIVATE' }, f.target, f.manifest, f.key))
})
