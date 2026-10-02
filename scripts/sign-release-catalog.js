#!/usr/bin/env node

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { RELEASE_CATALOG_FORMAT } = require('../server/modules/system/release-catalog')

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : ''
}

function fail(message) {
  console.error(`Catalog release: ${message}`)
  process.exit(1)
}

const input = option('--input')
const output = option('--output')
const privateKeyFile = option('--private-key-file')
if (!input || !output || !privateKeyFile) {
  fail('folosește --input catalog.payload.json --output stable.json --private-key-file catalog-private.pem')
}

const sourcePath = path.resolve(input)
const outputPath = path.resolve(output)
const privatePath = path.resolve(privateKeyFile)
if (!fs.existsSync(sourcePath)) fail(`lipsește input-ul ${sourcePath}`)
if (!fs.existsSync(privatePath)) fail(`lipsește cheia privată ${privatePath}`)

let payload
try {
  // PowerShell poate genera UTF-8 cu BOM; catalogul semnat acceptă ambele forme.
  payload = JSON.parse(fs.readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, ''))
} catch (error) {
  fail(`payload JSON invalid: ${error.message}`)
}
if (payload.format !== RELEASE_CATALOG_FORMAT) fail(`format obligatoriu: ${RELEASE_CATALOG_FORMAT}`)
if (!Array.isArray(payload.releases)) fail('payload-ul trebuie să conțină releases.')

payload.generated_at = new Date().toISOString()
const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
const signature = crypto.sign(null, Buffer.from(encoded, 'utf8'), fs.readFileSync(privatePath, 'utf8')).toString('base64url')
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify({
  format: RELEASE_CATALOG_FORMAT,
  payload: encoded,
  signature
}, null, 2)}\n`)
console.log(`Catalog semnat: ${outputPath}`)
