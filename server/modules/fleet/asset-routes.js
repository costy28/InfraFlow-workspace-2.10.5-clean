const { Router, raw } = require('express')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { requireAuth } = require('../../core/auth')
const { requirePermission, requireAnyPermission, authHasPermission } = require('../../core/permissions')
const { readDb, writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')

const router = Router()
const ROOT = path.resolve(__dirname, '../../..')
const STORAGE_DIR = path.join(ROOT, 'storage', 'fleet-files')
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png'])

function sendJson(res, status, data) {
  res.status(status).json(data)
}

function nowIso() {
  return new Date().toISOString()
}

function todayIso() {
  return nowIso().slice(0, 10)
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
}

function num(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function round2(value) {
  return Math.round(num(value) * 100) / 100
}

function normalizeDate(value, fallback = todayIso()) {
  const text = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback
}

function ensureAssetDb(db) {
  if (!Array.isArray(db.fleetAssetDrivers)) db.fleetAssetDrivers = []
  if (!Array.isArray(db.fleetAssetFiles)) db.fleetAssetFiles = []
  if (!Array.isArray(db.fleetAssets)) db.fleetAssets = []
  if (!Array.isArray(db.audit)) db.audit = []
  if (!db.fleet || typeof db.fleet !== 'object') db.fleet = {}
  db.fleet.assetDrivers = db.fleetAssetDrivers
  db.fleet.assetFiles = db.fleetAssetFiles
  return db
}

function assets(db) {
  return Array.isArray(db.fleetAssets) ? db.fleetAssets : []
}

function assetById(db, assetId) {
  return assets(db).find(asset => String(asset.id) === String(assetId))
}

function employees(db) {
  return db.hr?.employees || db.hrEmployees || db.employees || []
}

function employeeName(employee) {
  if (!employee) return ''
  return [employee.nume, employee.prenume].filter(Boolean).join(' ') || employee.name || employee.fullName || ''
}

function employeeId(employee) {
  return String(employee?.id ?? employee?.employee_id ?? '')
}

function employeeById(db, employeeIdValue) {
  return employees(db).find(employee => employeeId(employee) === String(employeeIdValue))
}

function assetKind(asset = {}) {
  const explicit = String(asset.tip_asset || asset.tipAsset || '').toLowerCase()
  if (explicit === 'autovehicul' || explicit === 'utilaj') return explicit
  if (asset.category === 'vehicle') return 'autovehicul'
  if (asset.category === 'equipment') return 'utilaj'
  return asset.registration || asset.nr_inmatriculare ? 'autovehicul' : 'utilaj'
}

function assetLabel(asset = {}) {
  return [
    asset.nr_inmatriculare || asset.registration || asset.cod || asset.assetCode || asset.nr_inventar,
    [asset.marca || asset.brand, asset.model].filter(Boolean).join(' '),
    asset.name || asset.assetName
  ].filter(Boolean).join(' / ') || `#${asset.id}`
}

function visibleDocumentRecords(db, assetIdValue) {
  const fleet = db.fleet || {}
  const all = []
  ;(fleet.asigurari || []).forEach(item => all.push({
    id: item.id,
    tip: item.tip || 'asigurare',
    label: String(item.tip || '').toUpperCase().includes('CASCO') ? 'CASCO' : 'RCA',
    data_expirare: item.data_expirarii || item.data_expirare,
    source: 'asigurari',
    detail_url: `/mecanizare?tab=scadente&asset_id=${assetIdValue}`,
    raw: item
  }))
  ;(fleet.itp || []).forEach(item => all.push({
    id: item.id,
    tip: 'itp',
    label: 'ITP',
    data_expirare: item.planificat_pe || item.data_expirarii,
    source: 'itp',
    detail_url: `/mecanizare?tab=scadente&asset_id=${assetIdValue}`,
    raw: item
  }))
  ;(fleet.iscir || []).forEach(item => all.push({
    id: item.id,
    tip: 'iscir',
    label: item.tip_autorizare || 'ISCIR',
    data_expirare: item.data_expirarii || item.data_expirare,
    source: 'iscir',
    detail_url: `/mecanizare?tab=scadente&asset_id=${assetIdValue}`,
    raw: item
  }))
  ;(fleet.taxe || []).forEach(item => all.push({
    id: item.id,
    tip: item.tip || 'taxa',
    label: item.tip || 'Taxa',
    data_expirare: item.data_scadenta || item.data_expirarii,
    source: 'taxe',
    detail_url: `/mecanizare?tab=scadente&asset_id=${assetIdValue}`,
    raw: item
  }))
  return all
    .filter(item => String(item.raw?.asset_id) === String(assetIdValue))
    .map(statusForDocument)
}

function statusForDocument(doc) {
  const days = daysUntil(doc.data_expirare)
  const status = days === null ? 'necunoscut' : days < 0 ? 'expirat' : days <= 30 ? 'expira_curand' : 'valid'
  return { ...doc, days_until: days, status }
}

function daysUntil(dateValue) {
  const text = String(dateValue || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  return Math.ceil((new Date(`${text}T00:00:00`).getTime() - new Date(`${todayIso()}T00:00:00`).getTime()) / 86400000)
}

function activeDrivers(db, assetIdValue) {
  return (db.fleetAssetDrivers || [])
    .filter(row => String(row.asset_id) === String(assetIdValue))
    .filter(row => row.activ !== false && row.activ !== 0 && !row.data_sfarsit)
    .map(row => withEmployee(db, row))
}

function allDrivers(db, assetIdValue) {
  return (db.fleetAssetDrivers || [])
    .filter(row => String(row.asset_id) === String(assetIdValue))
    .map(row => withEmployee(db, row))
    .sort((a, b) => String(b.data_start || '').localeCompare(String(a.data_start || '')))
}

function withEmployee(db, row) {
  const employee = employeeById(db, row.employee_id)
  return { ...row, employee, employee_name: employeeName(employee) || row.employee_name || `#${row.employee_id}` }
}

function filesForAsset(db, assetIdValue) {
  return (db.fleetAssetFiles || [])
    .filter(file => String(file.asset_id) === String(assetIdValue) && !file.cancelled_at)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
}

function tripLogsForAsset(db, assetIdValue, limit = 30) {
  const list = db.fleetTripLogs || db.fleet?.tripLogs || db.tripLogs || []
  return list
    .filter(row => String(row.asset_id || row.assetId) === String(assetIdValue))
    .sort((a, b) => String(b.data || b.date || '').localeCompare(String(a.data || a.date || '')))
    .slice(0, limit)
}

function fazLogsForAsset(db, assetIdValue, limit = 30) {
  return (db.fazLogs || [])
    .filter(row => String(row.utilaj_id || row.asset_id) === String(assetIdValue) && !row.cancelled_at)
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))
    .slice(0, limit)
}

function maintenanceForAsset(db, assetIdValue, limit = 100) {
  const m = db.mechanization || {}
  return (m.interventions || [])
    .filter(row => String(row.asset_id) === String(assetIdValue))
    .sort((a, b) => String(b.data_intrare || b.data || '').localeCompare(String(a.data_intrare || a.data || '')))
    .slice(0, limit)
}

function fuelForAsset(db, assetIdValue, limit = 100) {
  const m = db.mechanization || {}
  return (m.fuelLogs || [])
    .filter(row => String(row.asset_id) === String(assetIdValue))
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))
    .slice(0, limit)
}

function fuelChart(asset, fuelRows, tripRows, fazRows) {
  const months = []
  const now = new Date()
  for (let index = 5; index >= 0; index -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - index, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months.map(month => {
    const real = fuelRows.filter(row => String(row.data || '').startsWith(month)).reduce((sum, row) => sum + num(row.cantitate_litri || row.litri || row.consum_efectiv), 0)
    const normTrip = tripRows
      .filter(row => String(row.data || row.date || '').startsWith(month))
      .reduce((sum, row) => {
        const km = num(row.km_parcursi || row.km_total || row.km_sosire - row.km_plecare)
        return sum + (km * num(asset.consum_normat_km || asset.standardConsumption) / 100)
      }, 0)
    const normFaz = fazRows
      .filter(row => String(row.data || '').startsWith(month))
      .reduce((sum, row) => sum + (num(row.ore_lucrate) * num(row.consum_orar_normat || asset.consum_orar_normat)), 0)
    return { luna: month, real: round2(real), normat: round2(normTrip + normFaz) }
  })
}

function fullAssetPayload(db, asset) {
  const assetDrivers = allDrivers(db, asset.id)
  const documents = visibleDocumentRecords(db, asset.id)
  const files = filesForAsset(db, asset.id)
  const tripLogs = tripLogsForAsset(db, asset.id)
  const fazLogs = fazLogsForAsset(db, asset.id)
  const fuelRows = fuelForAsset(db, asset.id)
  const maintenances = maintenanceForAsset(db, asset.id)
  return {
    asset: {
      ...asset,
      asset_kind: assetKind(asset),
      asset_label: assetLabel(asset),
      principal_driver: assetDrivers.find(row => row.activ !== false && !row.data_sfarsit) || null
    },
    drivers: assetDrivers,
    active_drivers: activeDrivers(db, asset.id),
    documents,
    files,
    gps: gpsSnapshotForAsset(asset),
    trip_logs: tripLogs.slice(0, 30),
    faz_logs: fazLogs.slice(0, 30),
    maintenances,
    fuel: fuelRows,
    fuel_chart: fuelChart(asset, fuelRows, tripLogs, fazLogs)
  }
}

function gpsSnapshotForAsset(asset = {}) {
  if (!asset.gps_device_id && !asset.gpsDeviceId) return null
  return {
    lat: null,
    lng: null,
    viteza: null,
    ultima_actualizare: null,
    status: 'neconfigurat_api',
    gps_device_id: asset.gps_device_id || asset.gpsDeviceId
  }
}

async function fetchGpsLive(asset = {}) {
  const deviceId = asset.gps_device_id || asset.gpsDeviceId
  if (!deviceId) return null
  const apiUrl = process.env.GPS_API_URL
  const apiKey = process.env.GPS_API_KEY
  if (!apiUrl || !apiKey) return gpsSnapshotForAsset(asset)
  const url = new URL(apiUrl)
  url.searchParams.set('device_id', deviceId)
  url.searchParams.set('api_key', apiKey)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`GPS ${response.status}`)
    const data = await response.json()
    return {
      lat: data.lat ?? data.latitude ?? null,
      lng: data.lng ?? data.lon ?? data.longitude ?? null,
      viteza: data.viteza ?? data.speed ?? null,
      ultima_actualizare: data.ultima_actualizare ?? data.updated_at ?? data.last_update ?? null,
      status: data.status || 'online'
    }
  } catch {
    return { ...gpsSnapshotForAsset(asset), status: 'offline' }
  } finally {
    clearTimeout(timeout)
  }
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = String(contentType || '').match(/boundary=(?:"([^"]+)"|([^;]+))/i)
  if (!boundaryMatch) return { fields: {}, files: [] }
  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`
  const rawText = buffer.toString('binary')
  const parts = rawText.split(boundary).slice(1, -1)
  const fields = {}
  const files = []
  for (const part of parts) {
    const clean = part.replace(/^\r\n/, '').replace(/\r\n$/, '')
    const splitAt = clean.indexOf('\r\n\r\n')
    if (splitAt < 0) continue
    const headerText = clean.slice(0, splitAt)
    const bodyText = clean.slice(splitAt + 4)
    const name = (headerText.match(/name="([^"]+)"/i) || [])[1]
    const filename = (headerText.match(/filename="([^"]*)"/i) || [])[1]
    const mime = (headerText.match(/Content-Type:\s*([^\r\n]+)/i) || [])[1]
    const body = Buffer.from(bodyText, 'binary')
    if (filename) files.push({ field: name, filename, mime: mime || 'application/octet-stream', buffer: body })
    else if (name) fields[name] = body.toString('utf8')
  }
  return { fields, files }
}

function safeFileName(name) {
  return path.basename(String(name || 'fisier').replace(/[^\w.\- ]+/g, '_')).slice(0, 180)
}

function publicFilePath(filePath) {
  return `/storage/${path.relative(path.join(ROOT, 'storage'), filePath).replace(/\\/g, '/')}`
}

function requireFleetRead(auth, res) {
  return requireAnyPermission(auth, res, ['mechanization:view', 'fleet:trip_log_view', 'fleet:faz_view'])
}

router.get('/fleet/assets/:id/full', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requireFleetRead(auth, res)) return
  ensureAssetDb(auth.db)
  const asset = assetById(auth.db, req.params.id)
  if (!asset) return sendJson(res, 404, { error: 'Vehiculul/utilajul nu a fost gasit.' })
  sendJson(res, 200, fullAssetPayload(auth.db, asset))
})

router.get('/fleet/assets/:id/drivers', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requireFleetRead(auth, res)) return
  ensureAssetDb(auth.db)
  sendJson(res, 200, { drivers: allDrivers(auth.db, req.params.id) })
})

router.post('/fleet/assets/:id/drivers', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return
    ensureAssetDb(auth.db)
    const asset = assetById(auth.db, req.params.id)
    if (!asset) return sendJson(res, 404, { error: 'Vehiculul/utilajul nu a fost gasit.' })
    const body = req.body || {}
    const employee = employeeById(auth.db, body.employee_id)
    if (!employee) return sendJson(res, 422, { error: 'Angajatul selectat nu exista.' })
    const row = {
      id: id('assetdriver'),
      asset_id: asset.id,
      employee_id: employee.id,
      employee_name: employeeName(employee),
      tip: ['sofer', 'operator', 'rezerva'].includes(String(body.tip || '')) ? body.tip : 'sofer',
      data_start: normalizeDate(body.data_start),
      data_sfarsit: body.data_sfarsit ? normalizeDate(body.data_sfarsit) : '',
      activ: true,
      created_at: nowIso()
    }
    auth.db.fleetAssetDrivers.push(row)
    asset.sofer_principal_id = asset.sofer_principal_id || employee.id
    addAudit(auth.db, auth.user, 'fleet_asset_driver_added', `${assetLabel(asset)} / ${row.employee_name}`)
    writeDb(auth.db)
    sendJson(res, 201, { driver: withEmployee(auth.db, row) })
  } catch (error) {
    next(error)
  }
})

router.delete('/fleet/assets/:id/drivers/:driverId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return
    ensureAssetDb(auth.db)
    const row = auth.db.fleetAssetDrivers.find(item => String(item.id) === String(req.params.driverId) && String(item.asset_id) === String(req.params.id))
    if (!row) return sendJson(res, 404, { error: 'Alocarea nu a fost gasita.' })
    row.activ = false
    row.data_sfarsit = row.data_sfarsit || todayIso()
    row.cancelled_at = nowIso()
    row.cancelled_by = auth.user.id
    const asset = assetById(auth.db, req.params.id)
    if (asset && String(asset.sofer_principal_id || '') === String(row.employee_id)) asset.sofer_principal_id = null
    addAudit(auth.db, auth.user, 'fleet_asset_driver_removed', `${req.params.id} / ${row.employee_name || row.employee_id}`)
    writeDb(auth.db)
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

router.get('/fleet/assets/:id/files', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requireFleetRead(auth, res)) return
  ensureAssetDb(auth.db)
  sendJson(res, 200, { files: filesForAsset(auth.db, req.params.id) })
})

router.post('/fleet/assets/:id/files', raw({ type: () => true, limit: MAX_UPLOAD_BYTES }), (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return
    ensureAssetDb(auth.db)
    const asset = assetById(auth.db, req.params.id)
    if (!asset) return sendJson(res, 404, { error: 'Vehiculul/utilajul nu a fost gasit.' })
    const { fields, files } = parseMultipart(req.body || Buffer.alloc(0), req.headers['content-type'])
    const upload = files[0]
    if (!upload) return sendJson(res, 422, { error: 'Fisierul este obligatoriu.' })
    if (!ALLOWED_MIME.has(upload.mime)) return sendJson(res, 422, { error: 'Sunt acceptate doar PDF, JPG sau PNG.' })
    if (upload.buffer.length > MAX_UPLOAD_BYTES) return sendJson(res, 413, { error: 'Fisierul depaseste 10MB.' })
    const folder = path.join(STORAGE_DIR, `asset_${asset.id}`)
    fs.mkdirSync(folder, { recursive: true })
    const storedName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeFileName(upload.filename)}`
    const fullPath = path.join(folder, storedName)
    fs.writeFileSync(fullPath, upload.buffer)
    const item = {
      id: id('assetfile'),
      uuid: crypto.randomUUID(),
      asset_id: asset.id,
      tip: String(fields.tip || 'altul').trim(),
      denumire: String(fields.denumire || upload.filename).trim(),
      file_path: publicFilePath(fullPath),
      local_path: fullPath,
      file_name: safeFileName(upload.filename),
      file_size: upload.buffer.length,
      mime_type: upload.mime,
      uploaded_by: auth.user.id,
      created_at: nowIso()
    }
    auth.db.fleetAssetFiles.push(item)
    addAudit(auth.db, auth.user, 'fleet_asset_file_uploaded', `${assetLabel(asset)} / ${item.file_name}`)
    writeDb(auth.db)
    sendJson(res, 201, { file: item })
  } catch (error) {
    next(error)
  }
})

router.delete('/fleet/assets/:id/files/:fileId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return
    ensureAssetDb(auth.db)
    const file = auth.db.fleetAssetFiles.find(item => String(item.id) === String(req.params.fileId) && String(item.asset_id) === String(req.params.id))
    if (!file) return sendJson(res, 404, { error: 'Fisierul nu a fost gasit.' })
    file.cancelled_at = nowIso()
    file.cancelled_by = auth.user.id
    addAudit(auth.db, auth.user, 'fleet_asset_file_removed', `${req.params.id} / ${file.file_name}`)
    writeDb(auth.db)
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

router.get('/fleet/assets/:id/gps-live', async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFleetRead(auth, res)) return
    const asset = assetById(auth.db, req.params.id)
    if (!asset) return sendJson(res, 404, { error: 'Vehiculul/utilajul nu a fost gasit.' })
    sendJson(res, 200, { gps: await fetchGpsLive(asset) })
  } catch (error) {
    next(error)
  }
})

router.get('/fleet/assets/:id/trip-logs', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requireFleetRead(auth, res)) return
  sendJson(res, 200, { trip_logs: tripLogsForAsset(auth.db, req.params.id, 30) })
})

router.get('/fleet/assets/:id/faz-logs', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requireFleetRead(auth, res)) return
  sendJson(res, 200, { faz_logs: fazLogsForAsset(auth.db, req.params.id, 30) })
})

router.get('/fleet/assets/:id/maintenances', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requireFleetRead(auth, res)) return
  sendJson(res, 200, { maintenances: maintenanceForAsset(auth.db, req.params.id) })
})

router.get('/fleet/assets/:id/fuel', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requireFleetRead(auth, res)) return
  sendJson(res, 200, { fuel: fuelForAsset(auth.db, req.params.id) })
})

router.get('/fleet/my-vehicle', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  ensureAssetDb(auth.db)
  const employeeKey = auth.user.employee_id || auth.user.employeeId || auth.user.hr_employee_id || auth.user.id
  const allocation = (auth.db.fleetAssetDrivers || []).find(row =>
    row.activ !== false &&
    !row.data_sfarsit &&
    (String(row.employee_id) === String(employeeKey) || String(row.user_id || '') === String(auth.user.id))
  )
  const principalAsset = assets(auth.db).find(asset => String(asset.sofer_principal_id || '') === String(employeeKey))
  const asset = allocation ? assetById(auth.db, allocation.asset_id) : principalAsset
  if (!asset) return sendJson(res, 404, { error: 'Nu exista vehicul/utilaj alocat utilizatorului curent.' })
  sendJson(res, 200, fullAssetPayload(auth.db, asset))
})

module.exports = router
