const fs = require('fs')
const path = require('path')

const SEED_FILE = path.resolve(__dirname, '../../../db/seeds/cpv_codes.json')
const CPV_PATTERN = /^\d{8}-\d$/
let seedCache = null

function seedCodes() {
  if (!seedCache) seedCache = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'))
  return seedCache
}

function ensureCpvCodes(db) {
  db.cpvCodes = Array.isArray(db.cpvCodes) ? db.cpvCodes : []
  return db.cpvCodes
}

function cpvCatalog(db) {
  const stored = ensureCpvCodes(db)
  const byCode = new Map(seedCodes().map((item, index) => [item.cod, {
    id: `cpv-seed-${index + 1}`,
    ...item,
    activ: true,
    created_by: null,
  }]))
  stored.forEach(item => byCode.set(item.cod, item))
  return [...byCode.values()]
}

function findCpv(db, code) {
  return cpvCatalog(db).find(item => item.cod === String(code || '').trim()) || null
}

function searchCpv(db, query, lang = 'ro') {
  const term = String(query || '').trim().toLocaleLowerCase('ro-RO')
  if (term.length < 2) return []
  const descriptionKey = lang === 'en' ? 'denumire_en' : 'denumire_ro'
  return cpvCatalog(db)
    .filter(item => item.activ !== false)
    .filter(item => item.cod.includes(term) || String(item[descriptionKey] || '').toLocaleLowerCase('ro-RO').includes(term))
    .slice(0, 20)
}

function importSeed(db) {
  const codes = ensureCpvCodes(db)
  const known = new Set(codes.map(item => item.cod))
  let imported = 0
  let duplicates = 0
  seedCodes().forEach((item, index) => {
    if (known.has(item.cod)) {
      duplicates += 1
      return
    }
    codes.push({ id: `cpv-${index + 1}`, ...item, activ: true, created_at: new Date().toISOString(), created_by: null })
    known.add(item.cod)
    imported += 1
  })
  return { imported, duplicates }
}

function bootstrapCpvCatalog(db, syncMssqlCpvCodes) {
  const result = importSeed(db)
  const synced = typeof syncMssqlCpvCodes === 'function' ? syncMssqlCpvCodes(ensureCpvCodes(db)) : 0
  return { ...result, synced }
}

module.exports = { CPV_PATTERN, ensureCpvCodes, cpvCatalog, findCpv, searchCpv, importSeed, bootstrapCpvCatalog }
