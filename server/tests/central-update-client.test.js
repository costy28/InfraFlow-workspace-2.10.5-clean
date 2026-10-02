const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { configuredCentralUpdate, downloadAuthorizedArtifact } = require('../../server/modules/system/central-update-client')

test('clientul central descarcă doar artefactul autorizat și verifică SHA-256', async () => {
  const archive = Buffer.from('infraflow-archive')
  const artifact = { url: 'https://updates.infraflow.ro/packages/2.12.617/InfraFlow-update-v2.12.617-linux.tar.gz', size_bytes: archive.length, sha256: crypto.createHash('sha256').update(archive).digest('hex') }
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options })
    if (String(url).endsWith('/tickets')) return new Response(JSON.stringify({ ticket: 'short-lived-ticket', authorization_scheme: 'UpdateTicket', download_path: '/packages/2.12.617/InfraFlow-update-v2.12.617-linux.tar.gz' }), { status: 200 })
    return new Response(archive, { status: 200 })
  }
  const result = await downloadAuthorizedArtifact({ catalogUrl: 'https://updates.infraflow.ro/catalog/stable.json', clientToken: 'local-secret', version: '2.12.617', platform: 'server-linux', artifact, fetchImpl })
  assert.deepEqual(result.archive, archive)
  assert.equal(calls[0].options.headers.Authorization, 'Bearer local-secret')
  assert.equal(calls[1].options.headers.Authorization, 'UpdateTicket short-lived-ticket')
  assert.equal(configuredCentralUpdate({ INFRAFLOW_UPDATE_CATALOG_URL: 'https://updates.infraflow.ro/catalog/stable.json', INFRAFLOW_UPDATE_CLIENT_TOKEN: 'x' }).configured, true)
  assert.throws(() => configuredCentralUpdate({ INFRAFLOW_UPDATE_CATALOG_URL: 'http://updates.infraflow.ro/catalog/stable.json' }), /HTTPS/)
})

test('configurația citește tokenul instalației din fișier protejat', () => {
  const tokenFile = path.join(os.tmpdir(), `infraflow-token-${Date.now()}.txt`)
  fs.writeFileSync(tokenFile, 'token-din-fisier\n', { mode: 0o600 })
  try {
    const config = configuredCentralUpdate({ INFRAFLOW_UPDATE_CATALOG_URL: 'https://updates.infraflow.ro/catalog/stable.json', INFRAFLOW_UPDATE_CLIENT_TOKEN_FILE: tokenFile })
    assert.equal(config.clientToken, 'token-din-fisier')
  } finally {
    fs.rmSync(tokenFile, { force: true })
  }
})
