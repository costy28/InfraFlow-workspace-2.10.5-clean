const { Router } = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { parseStringPromise } = require('xml2js')
const { requireAuth } = require('../../../core/auth')
const { requirePermission } = require('../../../core/permissions')
const { readDb, writeDb } = require('../../../core/db')
const { addAudit } = require('../../../core/audit')

const router = Router()
const tempDir = path.join(__dirname, '../../../storage/temp/')
fs.mkdirSync(tempDir, { recursive: true })

const upload = multer({
  dest: tempDir,
  limits: { fileSize: 50 * 1024 * 1024 }
})

const vehicleMap = {
  'Status': 'active',
  'Număr de înmatriculare': 'registration',
  'Marcă': 'brand',
  'Model': 'model',
  'An fabricație': 'year',
  'Serie șasiu': 'vin',
  'Serie motor': 'engineSerial',
  'Culoare': 'color',
  'Tip': 'type',
  'Număr de axe': 'axleCount',
  'Ultima valoare odometru': 'currentMeter',
  'Locație': 'location',
  'Departament': 'department',
  'Utilizator curent': 'currentUser',
  'Marcă utilizator curent': 'currentUserMark',
  'Capacitate rezervor (litri)': 'tankCapacity',
  'Interval revizie (km)': 'serviceIntervalMeter',
  'Periodicitate revizie (luni)': 'serviceIntervalMonths',
  'Periodicitate ITP (luni)': 'inspectionIntervalMonths',
  'Consum standard (l/100km)': 'standardConsumption',
  'Data achiziției': 'purchaseDate',
  'Număr inventar': 'inventoryNo',
  'Carburant': 'fuelType',
  'Capacitate motor': 'engineCapacityCm3',
  'Putere motor': 'enginePowerKw',
  'Transmisie': 'transmission',
  'Număr certificat de înmatriculare': 'registrationCertificateNo',
  'Dată înmatriculare': 'registrationDate'
}

const equipmentMap = {
  'Status': 'active',
  'Marcă': 'brand',
  'Model': 'model',
  'Tip': 'type',
  'Locație': 'location',
  'Departament': 'department',
  'Cod utilaj': 'registration',
  'An fabricaţie': 'year',
  'An fabricație': 'year',
  'Seria': 'vin',
  'Valoare inventar': 'inventoryValue',
  'Număr inventar': 'inventoryNo',
  'Index iniţial': 'initialMeter',
  'Index inițial': 'initialMeter',
  'Periodicitate revizie (luni)': 'serviceIntervalMonths',
  'Interval revizie (ore funcţionare)': 'serviceIntervalHours',
  'Interval revizie (ore funcționare)': 'serviceIntervalHours',
  'Periodicitate ISCIR (luni)': 'iscirIntervalMonths'
}

function cleanupFiles(files) {
  Object.values(files || {}).flat().forEach(file => {
    if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path)
  })
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function arr(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function localName(key) {
  return String(key || '').split(':').pop()
}

function child(node, name) {
  if (!node || typeof node !== 'object') return undefined
  const found = Object.keys(node).find(key => localName(key) === name)
  return found ? node[found] : undefined
}

function textOfData(data) {
  if (data == null) return ''
  if (typeof data === 'string' || typeof data === 'number') return String(data)
  if (Array.isArray(data)) return textOfData(data[0])
  if (typeof data === 'object') return String(data._ || '')
  return ''
}

function cellText(cell) {
  return textOfData(child(cell, 'Data') || cell.Data || cell['ss:Data'])
}

function cellIndex(cell, fallback) {
  const attrs = cell?.$ || {}
  return Number(attrs['ss:Index'] || attrs.Index || fallback)
}

function worksheetRows(workbook) {
  const worksheets = arr(child(workbook, 'Worksheet') || workbook.Worksheet)
  const rows = []
  worksheets.forEach(sheet => {
    const table = child(sheet, 'Table') || sheet.Table
    arr(child(table, 'Row') || table?.Row).forEach(row => rows.push(row))
  })
  return rows
}

async function parseSpreadsheetXml(filePath) {
  const xml = fs.readFileSync(filePath, 'utf8')
  const parsed = await parseStringPromise(xml, {
    explicitArray: false,
    explicitCharkey: true,
    trim: true,
    mergeAttrs: false
  })
  const workbook = child(parsed, 'Workbook') || parsed.Workbook || parsed
  const rows = worksheetRows(workbook)
  if (rows.length < 2) return []

  const matrix = rows.map(row => {
    const values = []
    arr(child(row, 'Cell') || row.Cell).forEach((cell, index) => {
      const targetIndex = cellIndex(cell, index + 1) - 1
      values[targetIndex] = cellText(cell)
    })
    return values.map(value => String(value || '').trim())
  }).filter(row => row.some(Boolean))

  const headers = matrix[0] || []
  return matrix.slice(1).map(row => {
    const item = {}
    headers.forEach((header, index) => {
      if (header) item[header] = row[index] || ''
    })
    return item
  })
}

function value(row, header) {
  const wanted = normalizeKey(header)
  const key = Object.keys(row).find(item => normalizeKey(item) === wanted)
  return key ? row[key] : ''
}

function toNumber(input) {
  const clean = String(input || '').replace(/\s+/g, '').replace(',', '.')
  const value = Number(clean)
  return Number.isFinite(value) ? value : 0
}

function toDate(input) {
  const value = String(input || '').trim()
  if (!value) return ''
  const direct = new Date(value)
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10)
  const match = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (!match) return value
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

function isActiveStatus(input) {
  return normalizeKey(input || 'Activ') !== 'inactiv'
}

function mappedAsset(row, mapping, category) {
  const asset = {
    id: '',
    category,
    tip_asset: category === 'vehicle' ? 'autovehicul' : 'utilaj',
    active: true,
    status: 'disponibil',
    meterUnit: category === 'vehicle' ? 'km' : 'hours',
    source: 'autominder_xml',
    updatedAt: new Date().toISOString()
  }
  Object.entries(mapping).forEach(([header, field]) => {
    const raw = value(row, header)
    if (!raw) return
    if (field === 'active') {
      asset.active = isActiveStatus(raw)
      return
    }
    if (['year', 'axleCount', 'tankCapacity', 'serviceIntervalMeter', 'serviceIntervalMonths', 'inspectionIntervalMonths', 'standardConsumption', 'engineCapacityCm3', 'enginePowerKw', 'inventoryValue', 'initialMeter', 'serviceIntervalHours', 'iscirIntervalMonths'].includes(field)) {
      asset[field] = toNumber(raw)
      return
    }
    if (['purchaseDate', 'registrationDate'].includes(field)) {
      asset[field] = toDate(raw)
      return
    }
    asset[field] = raw
  })
  asset.registration = asset.registration || asset.cod || ''
  asset.name = asset.name || [asset.brand, asset.model, asset.type].filter(Boolean).join(' ') || asset.registration
  asset.cod = category === 'vehicle' ? (asset.inventoryNo || asset.registration) : asset.registration
  asset.nr_inmatriculare = category === 'vehicle' ? asset.registration : ''
  asset.marca = asset.brand
  asset.tip = asset.type
  asset.an_fabricatie = asset.year
  asset.serie_sasiu = asset.vin
  asset.serie_motor = asset.engineSerial
  asset.locatie = asset.location
  asset.departament = asset.department
  asset.tip_combustibil = asset.fuelType
  asset.km_curent = category === 'vehicle' ? asset.currentMeter : undefined
  asset.ore_motor = category !== 'vehicle' ? asset.initialMeter : undefined
  return asset
}

function upsertAssets(db, rows, mapping, category) {
  db.fleetAssets = Array.isArray(db.fleetAssets) ? db.fleetAssets : []
  const result = { importate: 0, actualizate: 0, erori: [] }

  rows.forEach((row, index) => {
    try {
      const asset = mappedAsset(row, mapping, category)
      const key = String(asset.registration || '').trim()
      if (!key) {
        result.erori.push({ rand: index + 2, motiv: category === 'vehicle' ? 'Lipsește numărul de înmatriculare.' : 'Lipsește codul utilajului.' })
        return
      }
      const existing = db.fleetAssets.find(item =>
        normalizeKey(item.registration || item.nr_inmatriculare || item.cod || item.assetCode) === normalizeKey(key)
      )
      if (existing) {
        Object.assign(existing, asset, { id: existing.id, updatedAt: new Date().toISOString() })
        result.actualizate += 1
      } else {
        db.fleetAssets.push({
          ...asset,
          id: `fleet-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
          createdAt: new Date().toISOString()
        })
        result.importate += 1
      }
    } catch (error) {
      result.erori.push({ rand: index + 2, motiv: error.message })
    }
  })
  return result
}

router.post('/integration/autominder/import-xml', upload.fields([
  { name: 'parc_auto', maxCount: 1 },
  { name: 'lista_utilaje', maxCount: 1 }
]), async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return

    const parcAuto = req.files?.parc_auto?.[0]
    const listaUtilaje = req.files?.lista_utilaje?.[0]
    if (!parcAuto && !listaUtilaje) {
      const error = new Error('Încarcă cel puțin un fișier XML Autominder.')
      error.status = 400
      throw error
    }

    const db = readDb()
    const vehiculeRows = parcAuto ? await parseSpreadsheetXml(parcAuto.path) : []
    const utilajeRows = listaUtilaje ? await parseSpreadsheetXml(listaUtilaje.path) : []
    const vehicule = upsertAssets(db, vehiculeRows, vehicleMap, 'vehicle')
    const utilaje = upsertAssets(db, utilajeRows, equipmentMap, 'equipment')
    const total = vehicule.importate + vehicule.actualizate + utilaje.importate + utilaje.actualizate

    addAudit(db, auth.user, 'autominder_import_xml', `${total} vehicule/utilaje procesate`)
    writeDb(db)
    res.json({ vehicule, utilaje, total })
  } catch (error) {
    next(error)
  } finally {
    cleanupFiles(req.files)
  }
})

module.exports = router
