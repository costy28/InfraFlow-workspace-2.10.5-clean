#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function fail(message) {
  console.error(`EROARE: ${message}`)
  process.exit(1)
}

const args = new Set(process.argv.slice(2))
const root = path.resolve(__dirname, '..', '..')
const keyFile = path.join(root, 'runtime', 'app.key')
if (!args.has('--old-default')) fail('Folosește numai --old-default pentru instalările care au rulat fără APP_KEY.')
if (!args.has('--create-key-file')) fail('Folosește --create-key-file pentru a genera cheia locală runtime/app.key.')

if (fs.existsSync(keyFile)) fail('runtime/app.key există deja. Migrarea nu a fost pornită pentru a evita suprascrierea unei chei existente.')

const { readDb, writeDb } = require('../core/db')
const { LEGACY_DEFAULT_APP_KEY } = require('../core/settings-crypto')
const { planAppKeyRotation } = require('../core/app-key-rotation')

const newKey = crypto.randomBytes(48).toString('base64url')
const plan = planAppKeyRotation(readDb({ fresh: true }), { oldKey: LEGACY_DEFAULT_APP_KEY, newKey })
console.log(`Migrare pregătită: ${plan.rotated.length} secrete criptate, ${plan.skipped.length} valori neatinse.`)
if (!args.has('--apply')) {
  console.log('Verificare fără modificări. Pentru aplicare explicită, rulează din nou cu --apply.')
  process.exit(0)
}

fs.mkdirSync(path.dirname(keyFile), { recursive: true })
const temporaryKeyFile = `${keyFile}.tmp-${process.pid}`
fs.writeFileSync(temporaryKeyFile, `${newKey}\n`, { encoding: 'utf8', mode: 0o600 })
try {
  writeDb(plan.nextDb)
  fs.renameSync(temporaryKeyFile, keyFile)
  console.log(`Migrare aplicată: ${plan.rotated.length} secrete recriptate. Repornește serviciul InfraFlow.`)
} catch (error) {
  try { fs.rmSync(temporaryKeyFile, { force: true }) } catch {}
  fail(error.message)
}
