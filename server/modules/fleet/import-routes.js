const { Router } = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const xlsx = require('xlsx')
const { parseStringPromise } = require('xml2js')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { readDb, writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')

const router = Router()
const tempDir = path.join(__dirname, '../../storage/temp')
fs.mkdirSync(tempDir, { recursive: true })
const upload = multer({ dest: tempDir, limits: { fileSize: 20 * 1024 * 1024 } })

const VEHICLE_COLUMNS = ['Număr de înmatriculare', 'Marcă', 'Model', 'Tip', 'An fabricație', 'Serie șasiu', 'Departament', 'Locație', 'Ultima valoare odometru', 'Capacitate rezervor (litri)', 'Carburant', 'Status']
const EQUIPMENT_COLUMNS = ['Cod utilaj', 'Marcă', 'Model', 'Tip', 'An fabricație', 'Serie', 'Departament', 'Locație', 'Index inițial', 'Capacitate rezervor (litri)', 'Status']

function normalizeKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function text(value) { return String(value ?? '').trim() }
function numberValue(value) {
  const parsed = Number(String(value ?? '').replace(/\s+/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function findValue(row, labels) {
  const wanted = labels.map(normalizeKey)
  const key = Object.keys(row || {}).find(item => wanted.includes(normalizeKey(item)))
  return key ? text(row[key]) : ''
}

function xmlEscape(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildXlsxTemplate() {
  const workbook = xlsx.utils.book_new()
  const vehicleSheet = xlsx.utils.aoa_to_sheet([VEHICLE_COLUMNS, ['NT 01 ABC', 'Exemplu', 'Model', 'Autoutilitară', '2024', 'SERIE-EXEMPLU', 'Operațional', 'Depozit', '12500', '70', 'Diesel', 'Activ']])
  const equipmentSheet = xlsx.utils.aoa_to_sheet([EQUIPMENT_COLUMNS, ['UT-001', 'Exemplu', 'Model', 'Încărcător', '2023', 'SERIE-UTILAJ', 'Operațional', 'Depozit', '850', '180', 'Activ']])
  vehicleSheet['!cols'] = VEHICLE_COLUMNS.map(header => ({ wch: Math.max(18, header.length + 2) }))
  equipmentSheet['!cols'] = EQUIPMENT_COLUMNS.map(header => ({ wch: Math.max(18, header.length + 2) }))
  xlsx.utils.book_append_sheet(workbook, vehicleSheet, 'Autovehicule')
  xlsx.utils.book_append_sheet(workbook, equipmentSheet, 'Utilaje')
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

function buildXmlTemplate() {
  const element = (name, values) => `    <${name}>\n${Object.entries(values).map(([key, value]) => `      <${key}>${xmlEscape(value)}</${key}>`).join('\n')}\n    </${name}>`
  return `<?xml version="1.0" encoding="UTF-8"?>\n<fleet_import version="1">\n  <vehicles>\n${element('vehicle', { registration: 'NT 01 ABC', brand: 'Exemplu', model: 'Model', type: 'Autoutilitară', year: '2024', vin: 'SERIE-EXEMPLU', department: 'Operațional', location: 'Depozit', current_meter: '12500', tank_capacity: '70', fuel_type: 'Diesel', status: 'Activ' })}\n  </vehicles>\n  <equipment>\n${element('equipment', { code: 'UT-001', brand: 'Exemplu', model: 'Model', type: 'Încărcător', year: '2023', vin: 'SERIE-UTILAJ', department: 'Operațional', location: 'Depozit', initial_meter: '850', tank_capacity: '180', status: 'Activ' })}\n  </equipment>\n</fleet_import>\n`
}

function parseXlsx(filePath) {
  const workbook = xlsx.read(fs.readFileSync(filePath), { type: 'buffer', cellDates: false })
  const getSheet = names => names.map(name => workbook.Sheets[name]).find(Boolean)
  const rows = sheet => sheet ? xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false }) : []
  return {
    vehicles: rows(getSheet(['Autovehicule', 'Vehicles', 'Vehicule'])),
    equipment: rows(getSheet(['Utilaje', 'Equipment', 'Echipamente']))
  }
}

function asList(value) { return Array.isArray(value) ? value : value ? [value] : [] }
function xmlText(value) {
  if (value == null) return ''
  if (Array.isArray(value)) return xmlText(value[0])
  if (typeof value === 'object') return text(value._)
  return text(value)
}
function xmlRow(node) { return Object.fromEntries(Object.entries(node || {}).filter(([key]) => key !== '$').map(([key, value]) => [key, xmlText(value)])) }

async function parseXml(filePath) {
  const parsed = await parseStringPromise(fs.readFileSync(filePath, 'utf8'), { explicitArray: false, trim: true })
  const root = parsed?.fleet_import
  if (!root) {
    const error = new Error('Fișierul XML nu respectă modelul InfraFlow. Descarcă modelul XML și completează-l fără a redenumi coloanele.')
    error.status = 422
    throw error
  }
  return {
    vehicles: asList(root.vehicles?.vehicle).map(xmlRow),
    equipment: asList(root.equipment?.equipment).map(xmlRow)
  }
}

function assetFromRow(row, kind) {
  const vehicle = kind === 'vehicle'
  const registration = findValue(row, vehicle ? ['Număr de înmatriculare', 'registration', 'nr_inmatriculare'] : ['Cod utilaj', 'code', 'registration', 'cod'])
  const brand = findValue(row, ['Marcă', 'brand', 'marca'])
  const model = findValue(row, ['Model', 'model'])
  const type = findValue(row, ['Tip', 'type', 'tip'])
  const status = findValue(row, ['Status', 'status'])
  const active = normalizeKey(status || 'activ') !== 'inactiv'
  const meter = numberValue(findValue(row, vehicle ? ['Ultima valoare odometru', 'current_meter', 'currentMeter', 'km_curent'] : ['Index inițial', 'initial_meter', 'initialMeter', 'ore_motor']))
  return {
    category: kind,
    tip_asset: vehicle ? 'autovehicul' : 'utilaj',
    active,
    status: active ? 'disponibil' : 'inactiv',
    meterUnit: vehicle ? 'km' : 'hours',
    source: 'fleet_file_import',
    registration,
    nr_inmatriculare: vehicle ? registration : '',
    cod: vehicle ? registration : registration,
    name: [brand, model, type].filter(Boolean).join(' ') || registration,
    brand,
    marca: brand,
    model,
    type,
    tip: type,
    year: numberValue(findValue(row, ['An fabricație', 'year', 'an_fabricatie'])) || undefined,
    an_fabricatie: numberValue(findValue(row, ['An fabricație', 'year', 'an_fabricatie'])) || undefined,
    vin: findValue(row, ['Serie șasiu', 'Serie', 'vin', 'serie_sasiu']),
    serie_sasiu: findValue(row, ['Serie șasiu', 'Serie', 'vin', 'serie_sasiu']),
    department: findValue(row, ['Departament', 'department', 'departament']),
    departament: findValue(row, ['Departament', 'department', 'departament']),
    location: findValue(row, ['Locație', 'location', 'locatie']),
    locatie: findValue(row, ['Locație', 'location', 'locatie']),
    currentMeter: vehicle ? meter : undefined,
    km_curent: vehicle ? meter : undefined,
    initialMeter: vehicle ? undefined : meter,
    ore_motor: vehicle ? undefined : meter,
    tankCapacity: numberValue(findValue(row, ['Capacitate rezervor (litri)', 'tank_capacity', 'tankCapacity'])) || undefined,
    fuelType: findValue(row, ['Carburant', 'fuel_type', 'fuelType', 'tip_combustibil']),
    tip_combustibil: findValue(row, ['Carburant', 'fuel_type', 'fuelType', 'tip_combustibil']),
    updatedAt: new Date().toISOString()
  }
}

function upsertAssets(db, rows, kind) {
  db.fleetAssets = Array.isArray(db.fleetAssets) ? db.fleetAssets : []
  const result = { imported: 0, updated: 0, errors: [] }
  rows.forEach((row, index) => {
    const asset = assetFromRow(row, kind)
    if (!asset.registration) {
      result.errors.push({ row: index + 2, reason: kind === 'vehicle' ? 'Lipsește numărul de înmatriculare.' : 'Lipsește codul utilajului.' })
      return
    }
    const existing = db.fleetAssets.find(item => normalizeKey(item.registration || item.nr_inmatriculare || item.cod || item.assetCode) === normalizeKey(asset.registration))
    if (existing) {
      Object.assign(existing, asset, { id: existing.id, updatedAt: new Date().toISOString() })
      result.updated += 1
    } else {
      db.fleetAssets.push({ ...asset, id: `fleet-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`, createdAt: new Date().toISOString() })
      result.imported += 1
    }
  })
  return result
}

function cleanup(file) { if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path) }

router.get('/fleet-import/templates/xlsx', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requirePermission(auth, res, 'mechanization:manage')) return
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.attachment('InfraFlow-model-import-parc-resurse.xlsx')
  res.send(buildXlsxTemplate())
})

router.get('/fleet-import/templates/xml', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requirePermission(auth, res, 'mechanization:manage')) return
  res.type('application/xml; charset=utf-8')
  res.attachment('InfraFlow-model-import-parc-resurse.xml')
  res.send(buildXmlTemplate())
})

router.post('/fleet-import/file', upload.single('file'), async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'mechanization:manage')) return
    if (!req.file) {
      const error = new Error('Selectează modelul Excel sau XML completat.')
      error.status = 400
      throw error
    }
    const extension = path.extname(req.file.originalname || '').toLowerCase()
    if (!['.xlsx', '.xml'].includes(extension)) {
      const error = new Error('Sunt acceptate doar fișierele .xlsx și .xml descărcate ca modele InfraFlow.')
      error.status = 422
      throw error
    }
    const parsed = extension === '.xlsx' ? parseXlsx(req.file.path) : await parseXml(req.file.path)
    const db = readDb()
    const vehicles = upsertAssets(db, parsed.vehicles, 'vehicle')
    const equipment = upsertAssets(db, parsed.equipment, 'equipment')
    const total = vehicles.imported + vehicles.updated + equipment.imported + equipment.updated
    addAudit(db, auth.user, 'fleet_file_import', `${total} resurse procesate din model ${extension.slice(1).toUpperCase()}`)
    writeDb(db)
    res.json({ vehicles, equipment, total, format: extension.slice(1).toUpperCase() })
  } catch (error) { next(error) } finally { cleanup(req.file) }
})

module.exports = router
module.exports._private = { buildXlsxTemplate, buildXmlTemplate, parseXml, assetFromRow, upsertAssets }
