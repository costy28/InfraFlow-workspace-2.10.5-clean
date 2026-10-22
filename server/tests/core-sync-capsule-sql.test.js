'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { randomBytes } = require('node:crypto')
const { createDocumentsSqlFixture } = require('./support/documents-sql-fixture')
const { sealCoreSnapshot, openCoreSnapshot } = require('../../scripts/lib/core-sync-capsule')
const { fingerprint } = require('../../scripts/lib/core-sync-manifest')
test('capsulă sintetică: persistare SQL criptată și recitire exactă', {
  skip: process.env.INFRAFLOW_TEST_RELATIONAL_SQL !== '1', timeout: 120000
}, () => {
  const f = createDocumentsSqlFixture({ empty: true })
  assert.match(f.database, /^INFRAFLOW_TEST_DOCS_[A-F0-9]{12}$/)
  const company = 'aaaaaaaa-0000-0000-0000-000000000001'
  const source = Buffer.from(JSON.stringify({ users: [], departments: [], syntheticMetadata: {
    twoFactorSecretEncrypted: 'SYNTHETIC-ONLY-NOT-A-REAL-SECRET', roles: ['viewer', 'admin'], extra: [null, false, { unicode: 'Țară' }] } }, null, 2) + '\n')
  const target = Buffer.from(JSON.stringify({ companies: [{ id: company }], users: [], departments: [], roles: [], modules: [] }))
  const manifest = { format: 'infraflow-core-sync-manifest-v1', revision: 1, companyId: company,
    snapshots: { sourceSha256: fingerprint(source), targetSha256: fingerprint(target) },
    mappings: { users: [], departments: [], roles: [], modules: [] } }
  const key = randomBytes(32), capsule = sealCoreSnapshot(source, target, manifest, key)
  try {
    // Numai ciphertext în tabela sintetică; nici cheia, nici sursa nu ajung în SQL.
    f.sql(`CREATE TABLE dbo.capsule_probe(id int PRIMARY KEY,payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1));
      INSERT dbo.capsule_probe VALUES(1,@json); SELECT 1;`, { jsonInput: JSON.stringify(capsule) })
    const stored = f.sql('SELECT payload FROM dbo.capsule_probe WHERE id=1;')
    assert.ok(!stored.includes('SYNTHETIC-ONLY')); assert.ok(!stored.includes(key.toString('base64')))
    const restored = openCoreSnapshot(JSON.parse(stored), target, manifest, key)
    assert.equal(fingerprint(restored), fingerprint(source)); restored.fill(0)
    assert.throws(() => openCoreSnapshot(JSON.parse(stored), target, manifest, randomBytes(32)))
    assert.equal(f.sql('SELECT COUNT(*) FROM dbo.capsule_probe;').trim(), '1')
    console.log(`Capsulă SQL OK: ${f.database}; sursă sintetică recitită exact, numai ciphertext persistat, cheie nepersistată.`)
  } finally { key.fill(0) }
})
