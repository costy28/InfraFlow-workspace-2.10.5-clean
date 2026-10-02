const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { LICENSE_REGISTRY_FORMAT, createUpdateService, sha256 } = require('../../update-service/app')

function request(port, pathname, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method, headers }, (res) => {
      let responseBody = ''
      res.setEncoding('utf8')
      res.on('data', (part) => { responseBody += part })
      res.on('end', () => resolve({ status: res.statusCode, body: responseBody, headers: res.headers }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

test('serviciul central emite ticket scurt numai pentru componente licențiate', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'infraflow-updates-'))
  const licenses = path.join(root, 'licenses.json')
  fs.mkdirSync(path.join(root, 'catalog'), { recursive: true })
  fs.mkdirSync(path.join(root, 'packages', '2.12.616'), { recursive: true })
  const artifactUrl = 'https://updates.infraflow.ro/packages/2.12.616/InfraFlow-update-v2.12.616-linux.tar.gz'
  const payload = { format: 'infraflow-release-catalog-v1', releases: [{ version: '2.12.616', channel: 'stable', components: [{ id: 'core', type: 'core', artifacts: { 'server-linux': { url: artifactUrl } } }, { id: 'crm', type: 'module', modules: ['crm'], artifacts: { 'server-linux': { url: artifactUrl } } }] }] }
  fs.writeFileSync(path.join(root, 'catalog', 'stable.json'), JSON.stringify({ format: 'infraflow-release-catalog-v1', payload: Buffer.from(JSON.stringify(payload)).toString('base64url'), signature: 'not-used-by-distributor' }))
  fs.writeFileSync(licenses, JSON.stringify({ format: LICENSE_REGISTRY_FORMAT, licenses: [{ id: 'client-a', active: true, client_token_sha256: sha256('client-secret'), modules: [] }] }))
  fs.writeFileSync(path.join(root, 'packages', '2.12.616', 'InfraFlow-update-v2.12.616-linux.tar.gz'), 'package')
  const server = createUpdateService({ root, licenseFile: licenses, ticketSecret: 'ticket-signing-secret', ticketTtlSeconds: 60 })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  try {
    assert.equal((await request(port, '/packages/2.12.616/InfraFlow-update-v2.12.616-linux.tar.gz')).status, 401)
    assert.equal((await request(port, '/tickets', { method: 'POST', headers: { Authorization: 'Bearer wrong', 'Content-Type': 'application/json' }, body: JSON.stringify({ version: '2.12.616', platform: 'server-linux' }) })).status, 401)
    const ticket = await request(port, '/tickets', { method: 'POST', headers: { Authorization: 'Bearer client-secret', 'Content-Type': 'application/json' }, body: JSON.stringify({ version: '2.12.616', platform: 'server-linux' }) })
    assert.equal(ticket.status, 200)
    const value = JSON.parse(ticket.body)
    assert.equal(value.authorization_scheme, 'UpdateTicket')
    assert.match(value.ticket, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    const packageResponse = await request(port, value.download_path, { headers: { Authorization: `UpdateTicket ${value.ticket}` } })
    assert.equal(packageResponse.status, 200)
    assert.equal(packageResponse.body, 'package')
    assert.equal(packageResponse.headers['cache-control'], 'private, max-age=0, no-store')
    assert.equal((await request(port, '/tickets', { method: 'POST', headers: { Authorization: 'Bearer client-secret', 'Content-Type': 'application/json' }, body: JSON.stringify({ version: '2.12.616', platform: 'server-linux', component_id: 'crm' }) })).status, 403)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(root, { recursive: true, force: true })
  }
})
