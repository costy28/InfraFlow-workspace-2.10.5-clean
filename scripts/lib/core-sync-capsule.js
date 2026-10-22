'use strict'
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto')
const { validateCoreManifest, fingerprint } = require('./core-sync-manifest')
const FORMAT = 'infraflow-core-preservation-capsule-v1'
const LIMIT = 16 * 1024 * 1024
const fail = () => { throw Error('Capsula de conservare nu a putut fi verificată.') }
function bytes(value) {
  if (!Buffer.isBuffer(value) || !value.length || value.length > LIMIT) fail()
  return value
}
function keyCheck(key) { if (!Buffer.isBuffer(key) || key.length !== 32) fail() }
function binding(targetBytes, manifest) {
  bytes(targetBytes)
  if (manifest?.format !== 'infraflow-core-sync-manifest-v1' || !Number.isSafeInteger(manifest.revision) || manifest.revision < 1 || fingerprint(targetBytes) !== manifest.snapshots?.targetSha256) fail()
  return Buffer.from(JSON.stringify({ format: FORMAT, manifest: fingerprint(JSON.stringify(manifest)), target: fingerprint(targetBytes) }))
}
function decode(value, length) {
  if (typeof value !== 'string' || value.length > LIMIT * 2 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) fail()
  const out = Buffer.from(value, 'base64')
  if (out.toString('base64') !== value || (length && out.length !== length)) fail()
  return out
}
// Exclusiv instrument intern: conservă snapshot-ul original, nu îl importă.
// Cheia este furnizată explicit de apelant, niciodată implicit din configurația ERP.
function sealCoreSnapshot(sourceBytes, targetBytes, manifest, key) {
  try {
    keyCheck(key); bytes(sourceBytes)
    const source = JSON.parse(sourceBytes.toString('utf8')), target = JSON.parse(bytes(targetBytes).toString('utf8'))
    if (!source || !Array.isArray(source.users) || !Array.isArray(source.departments)) fail()
    const hashes = { source: fingerprint(sourceBytes), target: fingerprint(targetBytes) }
    if (validateCoreManifest(source, target, manifest, hashes).mappingStatus !== 'structurally_valid') fail()
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(binding(targetBytes, manifest))
    const encrypted = Buffer.concat([cipher.update(sourceBytes), cipher.final()])
    return { format: FORMAT, algorithm: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: encrypted.toString('base64') }
  } catch { fail() }
}
function openCoreSnapshot(capsule, targetBytes, manifest, key) {
  try {
    keyCheck(key)
    if (!capsule || Object.keys(capsule).sort().join(',') !== 'algorithm,ciphertext,format,iv,tag' || capsule.format !== FORMAT || capsule.algorithm !== 'aes-256-gcm') fail()
    const decipher = createDecipheriv('aes-256-gcm', key, decode(capsule.iv, 12))
    decipher.setAAD(binding(targetBytes, manifest)); decipher.setAuthTag(decode(capsule.tag, 16))
    const data = Buffer.concat([decipher.update(decode(capsule.ciphertext)), decipher.final()])
    if (data.length > LIMIT || fingerprint(data) !== manifest.snapshots?.sourceSha256) { data.fill(0); fail() }
    return data // Sensibil: numai apelantului intern; niciodată în raport sau CLI.
  } catch { fail() }
}
module.exports = { sealCoreSnapshot, openCoreSnapshot }
