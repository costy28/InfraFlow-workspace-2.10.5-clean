const fs = require('fs')
const http = require('http')
const path = require('path')
const crypto = require('crypto')

const DEFAULT_ROOT = '/var/lib/infraflow-updates'
const DEFAULT_LICENSE_FILE = '/etc/infraflow-updates/licenses.json'
const LICENSE_REGISTRY_FORMAT = 'infraflow-update-licenses-v1'
const PACKAGE_NAME = /^InfraFlow-[A-Za-z0-9._-]+\.(?:zip|tar\.gz)$/
const VERSION = /^\d+(?:\.\d+){2,}$/
const PLATFORM = /^(?:server-linux|server-windows)$/
const MAX_JSON_BODY = 16 * 1024

function contentType(filePath) {
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8'
  if (filePath.endsWith('.zip')) return 'application/zip'
  if (filePath.endsWith('.tar.gz')) return 'application/gzip'
  return 'application/octet-stream'
}

function send(res, status, body = '') {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(body)
}

function sendJson(res, status, value) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(JSON.stringify(value))
}

function fileResponse(req, res, filePath, { immutable = false, attachment = false } = {}) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return send(res, 404, 'Not found')
  const stat = fs.statSync(filePath)
  res.statusCode = 200
  res.setHeader('Content-Type', contentType(filePath))
  res.setHeader('Content-Length', stat.size)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', immutable ? 'private, max-age=0, no-store' : 'no-store')
  if (attachment) res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`)
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(filePath).on('error', () => send(res, 500, 'Read error')).pipe(res)
}

function safeTokenEqual(left, right) {
  const actual = Buffer.from(String(left || ''), 'utf8')
  const expected = Buffer.from(String(right || ''), 'utf8')
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex')
}

function authorizationToken(req, scheme) {
  const value = String(req.headers.authorization || '')
  const match = value.match(new RegExp(`^${scheme}\\s+(.+)$`, 'i'))
  return match ? match[1].trim() : ''
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function signTicket(claims, secret) {
  const encoded = base64urlJson(claims)
  const signature = crypto.createHmac('sha256', secret).update(encoded, 'utf8').digest('base64url')
  return `${encoded}.${signature}`
}

function verifyTicket(ticket, secret) {
  const [encoded, signature, extra] = String(ticket || '').split('.')
  if (!encoded || !signature || extra) return null
  const expected = crypto.createHmac('sha256', secret).update(encoded, 'utf8').digest('base64url')
  if (!safeTokenEqual(signature, expected)) return null
  try {
    const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    if (claims.v !== 1 || !Number.isInteger(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) return null
    if (!VERSION.test(String(claims.version || '')) || !PACKAGE_NAME.test(String(claims.filename || '')) || !PLATFORM.test(String(claims.platform || ''))) return null
    return claims
  } catch {
    return null
  }
}

function parseCatalog(catalogPath) {
  const document = JSON.parse(fs.readFileSync(catalogPath, 'utf8').replace(/^\uFEFF/, ''))
  const payload = JSON.parse(Buffer.from(String(document.payload || ''), 'base64url').toString('utf8'))
  if (payload?.format !== 'infraflow-release-catalog-v1' || !Array.isArray(payload.releases)) throw new Error('Catalog invalid')
  return payload
}

function parseLicenseRegistry(licenseFile) {
  const registry = JSON.parse(fs.readFileSync(licenseFile, 'utf8').replace(/^\uFEFF/, ''))
  if (registry?.format !== LICENSE_REGISTRY_FORMAT || !Array.isArray(registry.licenses)) throw new Error('Registru licențe invalid')
  return registry
}

function activeLicense(licenseFile, clientToken) {
  const tokenHash = sha256(clientToken)
  const license = parseLicenseRegistry(licenseFile).licenses.find((item) => safeTokenEqual(String(item?.client_token_sha256 || '').toLowerCase(), tokenHash))
  if (!license || license.active === false) return null
  if (license.updates_until && new Date(`${license.updates_until}T23:59:59.999Z`).getTime() < Date.now()) return null
  return license
}

function hasModules(license, requiredModules) {
  const allowed = new Set((Array.isArray(license.modules) ? license.modules : []).map((item) => String(item || '').trim().toLowerCase()))
  return allowed.has('all') || requiredModules.every((item) => allowed.has(String(item || '').trim().toLowerCase()))
}

function findEligibleArtifact(catalogPath, { version, componentId, platform, license }) {
  const release = parseCatalog(catalogPath).releases.find((item) => String(item.version) === version && String(item.channel || 'stable') === 'stable')
  const component = release?.components?.find((item) => String(item.id) === componentId)
  if (!component || !component.artifacts?.[platform]) return null
  if (component.type === 'module' && !hasModules(license, Array.isArray(component.modules) ? component.modules : [])) return null
  const artifact = component.artifacts[platform]
  const artifactPath = new URL(String(artifact.url || '')).pathname
  const expected = `/packages/${encodeURIComponent(version)}/`
  if (!artifactPath.startsWith(expected)) return null
  const filename = decodeURIComponent(artifactPath.slice(expected.length))
  if (!PACKAGE_NAME.test(filename)) return null
  return { filename, componentId: String(component.id) }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      raw += chunk
      if (Buffer.byteLength(raw, 'utf8') > MAX_JSON_BODY) reject(new Error('Payload prea mare'))
    })
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')) } catch { reject(new Error('JSON invalid')) }
    })
    req.on('error', reject)
  })
}

function createUpdateService({
  root = process.env.INFRAFLOW_UPDATES_ROOT || DEFAULT_ROOT,
  licenseFile = process.env.INFRAFLOW_UPDATES_LICENSE_FILE || DEFAULT_LICENSE_FILE,
  ticketSecret = process.env.INFRAFLOW_UPDATES_TICKET_SECRET || '',
  ticketTtlSeconds = Number(process.env.INFRAFLOW_UPDATES_TICKET_TTL_SECONDS || 600),
  downloadToken = process.env.INFRAFLOW_UPDATES_DOWNLOAD_TOKEN || ''
} = {}) {
  const storageRoot = path.resolve(root)
  const catalogPath = path.join(storageRoot, 'catalog', 'stable.json')
  const packageRoot = path.join(storageRoot, 'packages')
  const ttl = Math.min(Math.max(Number.isFinite(ticketTtlSeconds) ? ticketTtlSeconds : 600, 60), 3600)

  return http.createServer(async (req, res) => {
    const requestPath = new URL(req.url || '/', 'http://localhost').pathname
    if (requestPath === '/tickets') {
      if (req.method !== 'POST') return send(res, 405, 'Method not allowed')
      if (!ticketSecret || !fs.existsSync(licenseFile)) return send(res, 503, 'Ticket service unavailable')
      try {
        const clientToken = authorizationToken(req, 'Bearer')
        const license = clientToken ? activeLicense(licenseFile, clientToken) : null
        if (!license) return send(res, 401, 'Unauthorized')
        const body = await readJsonBody(req)
        const version = String(body.version || '')
        const componentId = String(body.component_id || 'core')
        const platform = String(body.platform || '')
        if (!VERSION.test(version) || !PLATFORM.test(platform) || !componentId) return send(res, 400, 'Cerere ticket invalidă')
        const artifact = findEligibleArtifact(catalogPath, { version, componentId, platform, license })
        if (!artifact) return send(res, 403, 'Componentă neautorizată')
        const expiresAt = Math.floor(Date.now() / 1000) + ttl
        const ticket = signTicket({ v: 1, sub: String(license.id || ''), exp: expiresAt, version, filename: artifact.filename, platform, component_id: artifact.componentId }, ticketSecret)
        return sendJson(res, 200, { ticket, authorization_scheme: 'UpdateTicket', download_path: `/packages/${version}/${encodeURIComponent(artifact.filename)}`, expires_at: new Date(expiresAt * 1000).toISOString() })
      } catch (error) {
        return send(res, error.message === 'JSON invalid' ? 400 : 503, error.message === 'JSON invalid' ? 'JSON invalid' : 'Ticket service unavailable')
      }
    }

    if (!['GET', 'HEAD'].includes(req.method || '')) return send(res, 405, 'Method not allowed')
    if (requestPath === '/health') return sendJson(res, 200, { ok: true, service: 'infraflow-updates', tickets: Boolean(ticketSecret && fs.existsSync(licenseFile)) })
    if (requestPath === '/catalog/stable.json') return fileResponse(req, res, catalogPath)

    const match = requestPath.match(/^\/packages\/(\d+(?:\.\d+){2,})\/([^/]+)$/)
    if (!match) return send(res, 404, 'Not found')
    const [, version, filename] = match
    if (!VERSION.test(version) || !PACKAGE_NAME.test(filename)) return send(res, 404, 'Not found')
    const ticket = ticketSecret ? verifyTicket(authorizationToken(req, 'UpdateTicket'), ticketSecret) : null
    const legacyAllowed = downloadToken && safeTokenEqual(authorizationToken(req, 'Bearer'), downloadToken)
    if (!legacyAllowed && (!ticket || ticket.version !== version || ticket.filename !== filename)) return send(res, 401, 'Unauthorized')
    const packagePath = path.resolve(packageRoot, version, filename)
    const expectedPrefix = path.resolve(packageRoot, version) + path.sep
    if (!packagePath.startsWith(expectedPrefix)) return send(res, 404, 'Not found')
    return fileResponse(req, res, packagePath, { immutable: true, attachment: true })
  })
}

if (require.main === module) {
  const host = process.env.INFRAFLOW_UPDATES_HOST || '127.0.0.1'
  const port = Number(process.env.INFRAFLOW_UPDATES_PORT || 4182)
  createUpdateService().listen(port, host, () => console.log(`InfraFlow Updates ascultă pe ${host}:${port}`))
}

module.exports = { LICENSE_REGISTRY_FORMAT, createUpdateService, contentType, safeTokenEqual, sha256, signTicket, verifyTicket }
