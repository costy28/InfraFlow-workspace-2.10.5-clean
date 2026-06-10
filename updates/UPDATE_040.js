const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const DB_FILE = path.join(DATA_DIR, 'app-db.json')
const FAZ_LOGS_FILE = path.join(DATA_DIR, 'faz-logs.json')
const FAZ_NOMENCLATOR_FILE = path.join(DATA_DIR, 'faz-nomenclator.json')

const FAZ_NOMENCLATOR = [
  'DESZAPEZIRE',
  'BALASTARE STRADA TARNEI',
  'FREZAT - ASFALT',
  'DESCARCARE - PAVELE',
  'INCARCARE - BALAST, PAMANT',
  'INCARCARE - REFUZ FREZA',
  'MATURARE - MATURAT SUPRAFATA LUCRU',
  'INCARCARE - PAVELE',
  'REPARATII - DEFECT',
  'MUTAT AGREGATE',
  'INCARCAT BETON - FORMATIA BETOANE',
  'ALIMENTARE STATIE ASFALT',
  'PICONAT',
  'PICONAT SI INCARCAT',
  'ESCAVAT',
  'COMPACTAT ASFALT',
  'TERASAT',
  'ASTERNERE ASFALT',
  'SCHIMBARE PUNCT DE LUCRU - MUTAT FINISOR',
  'ALIMENTARE CU CARBURANT',
  'FREZAT ASFALT',
  'PICONAT',
  'TAIAT ASFALT',
  'IMPRASTIAT EMULSIE BITUMINOASA',
  'SPALAT UTILAJE',
  'TRANSPORT APA',
  'MATURAT',
  'TRANSPORT APA SI MATURAT',
  'SUDURA',
  'MARCAJ RUTIER',
  'TRACTAT MASINA MARCAJ',
  'CAMINE - SCHIMBARE PLANSEE',
  'BORDURI - SCHIMBAT/SPART BORDURA',
  'SPATII JOACA',
  'PROFILAT DRUM',
  'TERASAT',
  'TAIAT BETON',
  'COMPACTAT SI TERASAT',
  'PICONAT',
  'TAIAT',
  'ASTERNERE ASFALT',
  'STAT LA DISPOZITIE',
  'INTRETINERE',
  'STATIE ASFALT'
].map((denumire, index) => ({
  id: index + 1,
  cod: `A${String(index + 1).padStart(2, '0')}`,
  denumire,
  activ: true
}))

function ensureJson(file, fallback) {
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2), 'utf8')
  }
}

function run() {
  ensureJson(FAZ_LOGS_FILE, [])
  ensureJson(FAZ_NOMENCLATOR_FILE, FAZ_NOMENCLATOR)

  if (!fs.existsSync(DB_FILE)) return { ok: true, message: 'Fisiere FAZ initializate. app-db.json lipseste.' }
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
  db.fazLogs = Array.isArray(db.fazLogs) ? db.fazLogs : []
  db.fazNomenclator = Array.isArray(db.fazNomenclator) ? db.fazNomenclator : []
  const existing = new Set(db.fazNomenclator.map(item => String(item.id)))
  for (const item of FAZ_NOMENCLATOR) {
    if (!existing.has(String(item.id))) db.fazNomenclator.push(item)
  }
  db.fleet = db.fleet || {}
  db.fleet.fazLogs = db.fazLogs
  db.fleet.fazNomenclator = db.fazNomenclator
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8')
  return { ok: true, fazLogs: db.fazLogs.length, fazNomenclator: db.fazNomenclator.length }
}

if (require.main === module) {
  console.log(JSON.stringify(run(), null, 2))
}

module.exports = { run }
