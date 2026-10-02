const crypto = require('crypto')
const fs = require('fs')

const RELEASE_CATALOG_FORMAT = 'infraflow-release-catalog-v1'
const SUPPORTED_SERVER_PLATFORMS = new Set(['server-linux', 'server-windows'])

function compareVersions(left, right) {
  const a = String(left || '').split('.').map(Number)
  const b = String(right || '').split('.').map(Number)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0)
    if (delta) return delta
  }
  return 0
}

function runtimePlatform(platform = process.platform) {
  if (platform === 'win32') return 'server-windows'
  if (platform === 'linux') return 'server-linux'
  return 'server-unsupported'
}

function publicKeyFromEnvironment(env = process.env) {
  const filePath = String(env.INFRAFLOW_UPDATE_CATALOG_PUBLIC_KEY_FILE || '').trim()
  if (filePath) {
    try { return fs.readFileSync(filePath, 'utf8').trim() } catch { return '' }
  }
  const raw = String(env.INFRAFLOW_UPDATE_CATALOG_PUBLIC_KEY || '').trim()
  return raw ? raw.replace(/\\n/g, '\n') : ''
}

function assertCatalogPayload(payload) {
  if (!payload || payload.format !== RELEASE_CATALOG_FORMAT || !Array.isArray(payload.releases)) {
    throw new Error('Payload catalog update invalid.')
  }
  payload.releases.forEach((release) => {
    if (!/^\d+(?:\.\d+){2,}$/.test(String(release.version || ''))) throw new Error('Versiune invalidă în catalog.')
    if (!Array.isArray(release.components) || !release.components.length) throw new Error(`Release ${release.version} nu are componente.`)
    release.components.forEach((component) => {
      if (!['core', 'module'].includes(component.type)) throw new Error(`Componentă invalidă în ${release.version}.`)
      if (!String(component.id || '').trim()) throw new Error(`Componentă fără id în ${release.version}.`)
      if (component.type === 'module' && !Array.isArray(component.modules) || component.type === 'module' && !component.modules.length) {
        throw new Error(`Componentă modul fără drept necesar în ${release.version}.`)
      }
      const artifacts = component.artifacts || {}
      Object.entries(artifacts).forEach(([platform, artifact]) => {
        if (!SUPPORTED_SERVER_PLATFORMS.has(platform)) throw new Error(`Platformă necunoscută: ${platform}.`)
        if (!/^https:\/\//i.test(String(artifact?.url || ''))) throw new Error(`Artefact HTTPS lipsă pentru ${platform}.`)
        if (!/^[a-f0-9]{64}$/i.test(String(artifact?.sha256 || ''))) throw new Error(`SHA-256 invalid pentru ${platform}.`)
      })
    })
  })
  return payload
}

function verifyReleaseCatalog(document, publicKey) {
  if (!publicKey) throw new Error('Cheia publică pentru catalogul central nu este configurată.')
  if (!document || document.format !== RELEASE_CATALOG_FORMAT || !document.payload || !document.signature) {
    throw new Error('Catalog update nesemnat sau invalid.')
  }
  const valid = crypto.verify(
    null,
    Buffer.from(String(document.payload), 'utf8'),
    crypto.createPublicKey(publicKey),
    Buffer.from(String(document.signature), 'base64url')
  )
  if (!valid) throw new Error('Semnătura catalogului de update este invalidă.')
  let payload
  try {
    payload = JSON.parse(Buffer.from(String(document.payload), 'base64url').toString('utf8'))
  } catch {
    throw new Error('Payload catalog update invalid.')
  }
  return assertCatalogPayload(payload)
}

function licensedModules(license = {}) {
  const modules = [license.modules, license.module, license.addons]
    .flatMap((items) => Array.isArray(items) ? items : [])
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
  return new Set(modules)
}

function componentIsEligible(component, licensed) {
  if (component.type === 'core') return true
  const needed = (component.modules || []).map((item) => String(item).trim().toLowerCase()).filter(Boolean)
  return licensed.has('all') || needed.every((module) => licensed.has(module))
}

function selectEligibleRelease(payload, { currentVersion, platform = runtimePlatform(), license = {}, channel = 'stable' } = {}) {
  const licensed = licensedModules(license)
  const releases = [...payload.releases]
    .filter((release) => String(release.channel || 'stable') === channel && compareVersions(release.version, currentVersion) > 0)
    .sort((left, right) => compareVersions(right.version, left.version))

  for (const release of releases) {
    const components = release.components
      .filter((component) => component.artifacts?.[platform])
      .map((component) => ({
        ...component,
        eligible: componentIsEligible(component, licensed)
      }))
    const eligible = components.filter((component) => component.eligible)
    if (!eligible.length) continue
    return {
      available: true,
      version: release.version,
      channel: release.channel || 'stable',
      mandatory: release.mandatory || { mode: 'none' },
      notes: String(release.notes || ''),
      components: eligible.map(({ eligible: _eligible, ...component }) => component),
      unavailable_modules: components.filter((component) => !component.eligible).map((component) => component.id)
    }
  }
  return { available: false, version: currentVersion, channel, mandatory: { mode: 'none' }, components: [], unavailable_modules: [] }
}

module.exports = {
  RELEASE_CATALOG_FORMAT,
  compareVersions,
  runtimePlatform,
  publicKeyFromEnvironment,
  verifyReleaseCatalog,
  licensedModules,
  selectEligibleRelease
}
