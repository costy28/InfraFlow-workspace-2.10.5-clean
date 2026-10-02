#!/usr/bin/env node

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { LICENSE_REGISTRY_FORMAT, sha256 } = require('../update-service/app')

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : ''
}

function fail(message) {
  console.error(`Licență update: ${message}`)
  process.exit(1)
}

const registryFile = option('--registry')
const clientId = option('--client-id')
const tokenFile = option('--token-file')
const modules = (option('--modules') || 'all').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
const updatesUntil = option('--updates-until')
if (!registryFile || !clientId || !tokenFile) {
  fail('folosește --registry licenses.json --client-id client-unic --token-file client-token.txt [--modules all] [--updates-until YYYY-MM-DD]')
}
if (!/^[a-z0-9][a-z0-9._-]{2,79}$/i.test(clientId)) fail('client-id invalid.')
if (!modules.length) fail('este necesar cel puțin un modul.')
if (updatesUntil && !/^\d{4}-\d{2}-\d{2}$/.test(updatesUntil)) fail('updates-until trebuie să fie YYYY-MM-DD.')

const registryPath = path.resolve(registryFile)
const secretPath = path.resolve(tokenFile)
if (fs.existsSync(secretPath)) fail(`fișierul de token există deja: ${secretPath}`)
let registry = { format: LICENSE_REGISTRY_FORMAT, licenses: [] }
if (fs.existsSync(registryPath)) {
  try { registry = JSON.parse(fs.readFileSync(registryPath, 'utf8').replace(/^\uFEFF/, '')) } catch { fail('registrul existent nu este JSON valid.') }
}
if (registry.format !== LICENSE_REGISTRY_FORMAT || !Array.isArray(registry.licenses)) fail('format registru invalid.')
if (registry.licenses.some((item) => String(item?.id) === clientId)) fail(`client-id există deja: ${clientId}`)

const token = crypto.randomBytes(32).toString('base64url')
registry.licenses.push({
  id: clientId,
  active: true,
  client_token_sha256: sha256(token),
  modules,
  ...(updatesUntil ? { updates_until: updatesUntil } : {})
})
fs.mkdirSync(path.dirname(registryPath), { recursive: true })
fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 })
fs.writeFileSync(secretPath, `${token}\n`, { mode: 0o600, flag: 'wx' })
console.log(`Registru actualizat: ${registryPath}`)
console.log(`Token creat local: ${secretPath}`)
console.log('Tokenul nu este inclus în registru; transmite-l o singură dată printr-un canal sigur.')
