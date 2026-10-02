const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const test = require('node:test')
const {
  RELEASE_CATALOG_FORMAT,
  runtimePlatform,
  verifyReleaseCatalog,
  selectEligibleRelease
} = require('../modules/system/release-catalog')

function signedCatalog(payload) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    document: {
      format: RELEASE_CATALOG_FORMAT,
      payload: encoded,
      signature: crypto.sign(null, Buffer.from(encoded, 'utf8'), privateKey).toString('base64url')
    }
  }
}

test('catalogul semnat filtrează componentele de modul după licență și platformă', () => {
  const payload = {
    format: RELEASE_CATALOG_FORMAT,
    generated_at: '2026-10-01T10:00:00.000Z',
    releases: [{
      version: '2.12.700', channel: 'stable', notes: 'Core și HR.', mandatory: { mode: 'required' },
      components: [
        { id: 'core', type: 'core', artifacts: { 'server-linux': { url: 'https://updates.example/700/linux.tar.gz', sha256: 'a'.repeat(64) } } },
        { id: 'module:hr', type: 'module', modules: ['hr'], artifacts: { 'server-linux': { url: 'https://updates.example/700/hr.tar.gz', sha256: 'b'.repeat(64) } } }
      ]
    }]
  }
  const { document, publicKey } = signedCatalog(payload)
  const catalog = verifyReleaseCatalog(document, publicKey)
  const withoutHr = selectEligibleRelease(catalog, { currentVersion: '2.12.699', platform: 'server-linux', license: { module: ['core'] } })
  assert.deepEqual(withoutHr.components.map((component) => component.id), ['core'])
  assert.deepEqual(withoutHr.unavailable_modules, ['module:hr'])
  const withHr = selectEligibleRelease(catalog, { currentVersion: '2.12.699', platform: 'server-linux', license: { module: ['core', 'hr'] } })
  assert.deepEqual(withHr.components.map((component) => component.id), ['core', 'module:hr'])
})

test('catalogul refuză semnătura greșită și URL-ul nesigur', () => {
  const { document, publicKey } = signedCatalog({ format: RELEASE_CATALOG_FORMAT, releases: [] })
  document.signature = 'invalid'
  assert.throws(() => verifyReleaseCatalog(document, publicKey), /Semnătura|catalog/i)
  const unsafe = signedCatalog({
    format: RELEASE_CATALOG_FORMAT,
    releases: [{
      version: '2.12.700',
      components: [{ id: 'core', type: 'core', artifacts: { 'server-linux': { url: 'http://updates.example/package.tar.gz', sha256: 'a'.repeat(64) } } }]
    }]
  })
  assert.throws(() => verifyReleaseCatalog(unsafe.document, unsafe.publicKey), /HTTPS/i)
  assert.equal(runtimePlatform('linux'), 'server-linux')
  assert.equal(runtimePlatform('win32'), 'server-windows')
})
