#!/usr/bin/env node

/*
 * Promovează local o versiune validată din payload-ul Preview în payload-ul
 * Stable. Nu semnează și nu publică: aceștia rămân pași separați, expliciți.
 */
const fs = require('fs')
const path = require('path')
const { assertCatalogPayload, RELEASE_CATALOG_FORMAT } = require('../server/modules/system/release-catalog')

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : ''
}

function fail(message) {
  console.error(`Promovare Preview: ${message}`)
  process.exit(1)
}

function readPayload(filePath, label) {
  if (!fs.existsSync(filePath)) fail(`lipsește payload-ul ${label}: ${filePath}`)
  try {
    return assertCatalogPayload(JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')))
  } catch (error) {
    fail(`payload ${label} invalid: ${error.message}`)
  }
}

const previewInput = option('--preview-input')
const stableInput = option('--stable-input')
const output = option('--output')
const history = option('--history')
const version = option('--version')
const confirmation = option('--confirm-promote')
const approvalNote = option('--approval-note')

if (!previewInput || !stableInput || !output || !history || !version || !confirmation || !approvalNote) {
  fail('folosește --preview-input preview.payload.json --stable-input stable.payload.json --output stable.payload.json --history promotion-history.jsonl --version X.Y.Z --confirm-promote X.Y.Z --approval-note "validat manual"')
}
if (!/^\d+(?:\.\d+){2,}$/.test(version)) fail('versiune invalidă.')
if (confirmation !== version) fail('confirmarea trebuie să fie exact aceeași versiune ca --version.')
if (approvalNote.length > 300) fail('nota de aprobare poate avea cel mult 300 caractere.')

const previewPath = path.resolve(previewInput)
const stablePath = path.resolve(stableInput)
const outputPath = path.resolve(output)
const historyPath = path.resolve(history)
if (previewPath === outputPath) fail('payload-ul Preview nu poate fi suprascris.')
if (outputPath === historyPath) fail('payload-ul Stable și istoricul trebuie să fie fișiere diferite.')

const preview = readPayload(previewPath, 'Preview')
const stable = readPayload(stablePath, 'Stable')
const release = preview.releases.find((item) => String(item.version) === version && String(item.channel || 'stable') === 'preview')
if (!release) fail(`versiunea ${version} nu există în canalul Preview.`)
if (stable.releases.some((item) => String(item.version) === version)) fail(`versiunea ${version} există deja în payload-ul Stable.`)

const promoted = { ...release, channel: 'stable' }
const promotedAt = new Date().toISOString()
const payload = {
  format: RELEASE_CATALOG_FORMAT,
  generated_at: null,
  releases: [promoted, ...stable.releases]
}
assertCatalogPayload(payload)

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`)
fs.mkdirSync(path.dirname(historyPath), { recursive: true })
fs.appendFileSync(historyPath, `${JSON.stringify({
  promoted_at: promotedAt,
  version,
  from_channel: 'preview',
  to_channel: 'stable',
  approval_note: approvalNote
})}\n`)

console.log(`Pregătit pentru semnare: ${outputPath}`)
console.log(`Istoric promovare: ${historyPath}`)
console.log('Catalogul nu a fost semnat sau publicat. Rulează separat semnarea și publicarea controlată.')
