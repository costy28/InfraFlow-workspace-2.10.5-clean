const fs = require('fs')
const { Router } = require('express')
const crypto = require('crypto')
const childProcess = require('child_process')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { readDb, writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')

const router = Router()
let schedulerStarted = false
let schedulerTimer = null

function id(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
}

function nowIso() { return new Date().toISOString() }
function todayIso() { return new Date().toISOString().slice(0, 10) }
function num(value) { return Number(value) || 0 }
function round3(value) { return Math.round(num(value) * 1000) / 1000 }
function round2(value) { return Math.round(num(value) * 100) / 100 }

function throwHttp(status, message) {
  const err = new Error(message)
  err.status = status
  throw err
}

function ensurePiusiDb(db) {
  db.integration = db.integration || {}
  db.integration.piusiSync = Array.isArray(db.integration.piusiSync) ? db.integration.piusiSync : []
  db.integration.piusiMapare = Array.isArray(db.integration.piusiMapare) ? db.integration.piusiMapare : []
  db.integration.piusiConfig = db.integration.piusiConfig && typeof db.integration.piusiConfig === 'object' ? db.integration.piusiConfig : {}
  db.mechanization = db.mechanization || {}
  db.mechanization.fuelLogs = Array.isArray(db.mechanization.fuelLogs) ? db.mechanization.fuelLogs : []
  return db.integration
}

function configValue(db, key, fallback = '') {
  const integration = ensurePiusiDb(db)
  return integration.piusiConfig[key] ?? db.settings?.[key] ?? fallback
}

function setConfigValue(db, key, value) {
  ensurePiusiDb(db).piusiConfig[key] = String(value ?? '')
}

function assets(db) {
  return db.fleetAssets || db.fleet?.assets || []
}

function assetLabel(asset) {
  return [asset?.name, asset?.registration, asset?.cod].filter(Boolean).join(' / ') || String(asset?.id || '')
}

function findMapare(db, operatorCod) {
  const integration = ensurePiusiDb(db)
  const code = String(operatorCod || '').trim()
  return integration.piusiMapare.find(item => item.activ !== false && String(item.operator_cod || '').trim().toLowerCase() === code.toLowerCase()) || null
}

function normalizeAccessBool(value) {
  if (value === true || value === false) return value
  const text = String(value || '').toLowerCase()
  return ['true', '1', '-1', 'yes', 'da'].includes(text)
}

function piusiDate(value) {
  if (!value) return nowIso()
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return nowIso()
  return d.toISOString()
}

function normalizePiusiRecord(row) {
  const odometru = num(row.ReqNum || row.Odometer || row.odometer)
  return {
    piusi_id_prog: Number(row.IdProg ?? row.idprog),
    data_ora: piusiDate(row.DataOra ?? row.dataora),
    numar_pompa: Number(row.Numero ?? row.numero) || null,
    serial_cheie: String(row.SerialNum ?? row.serialnum ?? '').trim(),
    cantitate_litri: round3(row.Utn ?? row.utn),
    operator_cod: String(row.Operatore ?? row.operatore ?? '').trim(),
    odometru: Math.round(odometru),
    refused: normalizeAccessBool(row.Refused ?? row.refused),
  }
}

async function readMdbTable(mdbPath, table, where) {
  let ADODB
  try {
    ADODB = require('node-adodb')
  } catch (error) {
    return readMdbTableWithPowershell(mdbPath, table, where)
  }
  if (process.platform !== 'win32') {
    const err = new Error('Citirea PIUSI MDB funcționează doar pe Windows, prin ADODB/COM.')
    err.code = 'PIUSI_WINDOWS_ONLY'
    throw err
  }
  if (!fs.existsSync(mdbPath)) {
    const err = new Error(`Fișierul MDB nu există: ${mdbPath}`)
    err.code = 'PIUSI_MDB_NOT_FOUND'
    throw err
  }
  const safeTable = String(table).replace(/[^\w]/g, '')
  const connection = ADODB.open(`Provider=Microsoft.Jet.OLEDB.4.0;Data Source=${mdbPath};`)
  return connection.query(`SELECT * FROM ${safeTable} WHERE ${where} ORDER BY IdProg ASC`)
}

function readMdbTableWithPowershell(mdbPath, table, where) {
  if (process.platform !== 'win32') {
    const err = new Error('Citirea PIUSI MDB funcționează doar pe Windows, prin ADODB/COM.')
    err.code = 'PIUSI_WINDOWS_ONLY'
    throw err
  }
  if (!fs.existsSync(mdbPath)) {
    const err = new Error(`Fișierul MDB nu există: ${mdbPath}`)
    err.code = 'PIUSI_MDB_NOT_FOUND'
    throw err
  }
  const safeTable = String(table).replace(/[^\w]/g, '')
  const sql = `SELECT * FROM ${safeTable} WHERE ${where} ORDER BY IdProg ASC`
  const script = `
$ErrorActionPreference = 'Stop'
$connection = New-Object -ComObject ADODB.Connection
$connection.Open("Provider=Microsoft.Jet.OLEDB.4.0;Data Source=${mdbPath.replace(/"/g, '""')};")
$recordset = New-Object -ComObject ADODB.Recordset
$recordset.Open("${sql.replace(/"/g, '""')}", $connection)
$rows = @()
while (-not $recordset.EOF) {
  $row = [ordered]@{}
  for ($i = 0; $i -lt $recordset.Fields.Count; $i++) {
    $field = $recordset.Fields.Item($i)
    $row[$field.Name] = $field.Value
  }
  $rows += [pscustomobject]$row
  $recordset.MoveNext()
}
$recordset.Close()
$connection.Close()
$rows | ConvertTo-Json -Depth 5
`
  const output = childProcess.execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024
  })
  const text = String(output || '').trim()
  if (!text) return []
  const parsed = JSON.parse(text)
  return Array.isArray(parsed) ? parsed : [parsed]
}

async function syncPiusi(options = {}) {
  const db = options.db || readDb()
  const integration = ensurePiusiDb(db)
  const mdbPath = String(db.settings?.piusi_mdb_path || configValue(db, 'piusi_mdb_path') || configValue(db, 'mdb_path') || 'C:\\Piusi\\SelfService\\Data\\Self.mdb').trim()
  if (!mdbPath) return { skip: true, reason: 'neconfigurat' }

  const lastId = Number(configValue(db, 'piusi_last_id_prog', 0) || 0)
  const records = (await readMdbTable(mdbPath, 'Erogaz', `IdProg > ${lastId} AND (Refused = False OR Refused = 0 OR Refused IS NULL)`))
    .map(normalizePiusiRecord)
    .filter(row => row.piusi_id_prog && !row.refused && row.cantitate_litri > 0)

  let imported = 0
  let duplicates = 0
  let errors = 0
  for (const rec of records) {
    if (integration.piusiSync.some(item => Number(item.piusi_id_prog) === Number(rec.piusi_id_prog))) {
      duplicates += 1
      continue
    }
    const mapare = findMapare(db, rec.operator_cod)
    integration.piusiSync.push({
      id: id('piusi'),
      ...rec,
      asset_id: mapare?.asset_id || '',
      importat_la: nowIso(),
      procesat: false,
      eroare: mapare?.asset_id ? '' : 'Operator PIUSI nemapat la utilaj/autovehicul.'
    })
    if (!mapare) upsertMapare(db, rec.operator_cod, '', rec.operator_cod, false)
    imported += 1
  }
  if (records.length) {
    setConfigValue(db, 'piusi_last_id_prog', Math.max(...records.map(row => row.piusi_id_prog)))
  }
  setConfigValue(db, 'piusi_last_sync', nowIso())
  if (!options.db) writeDb(db)
  return { imported, duplicate: duplicates, errors, maxId: Number(configValue(db, 'piusi_last_id_prog', 0) || 0) }
}

function upsertMapare(db, operatorCod, assetId, denumire = '', activ = true) {
  const integration = ensurePiusiDb(db)
  const code = String(operatorCod || '').trim()
  if (!code) throwHttp(400, 'Codul operator PIUSI este obligatoriu.')
  const existing = integration.piusiMapare.find(item => String(item.operator_cod || '').trim().toLowerCase() === code.toLowerCase())
  const asset = assetId ? assets(db).find(item => String(item.id) === String(assetId)) : null
  if (assetId && !asset) throwHttp(404, 'Vehiculul/utilajul selectat nu există.')
  const payload = {
    operator_cod: code,
    asset_id: assetId ? String(assetId) : '',
    denumire: denumire || assetLabel(asset) || code,
    activ: activ !== false,
    updated_at: nowIso()
  }
  if (existing) Object.assign(existing, payload)
  else integration.piusiMapare.push({ id: id('piusimap'), ...payload })
  integration.piusiSync.forEach(item => {
    if (String(item.operator_cod || '').trim().toLowerCase() === code.toLowerCase()) {
      item.asset_id = payload.asset_id
      item.eroare = payload.asset_id ? '' : 'Operator PIUSI nemapat la utilaj/autovehicul.'
    }
  })
  return existing || integration.piusiMapare[integration.piusiMapare.length - 1]
}

function piusiStatus(db) {
  const integration = ensurePiusiDb(db)
  const pathValue = String(db.settings?.piusi_mdb_path || configValue(db, 'piusi_mdb_path') || configValue(db, 'mdb_path') || 'C:\\Piusi\\SelfService\\Data\\Self.mdb')
  const nemapate = integration.piusiSync.filter(item => !item.asset_id).length
  const nesincronizate = integration.piusiSync.filter(item => item.asset_id && item.procesat !== true).length
  return {
    configurat: Boolean(pathValue),
    mdb_path: pathValue,
    mdb_accesibil: pathValue ? fs.existsSync(pathValue) : false,
    ultima_sincronizare: configValue(db, 'piusi_last_sync', ''),
    last_id_prog: Number(configValue(db, 'piusi_last_id_prog', 0) || 0),
    sync_interval_min: Number(db.settings?.piusi_sync_min || configValue(db, 'piusi_sync_interval_min', configValue(db, 'piusi_sync_min', 30)) || 30),
    inregistrari_totale: integration.piusiSync.length,
    nemapate,
    nesincronizate
  }
}

function fuelLogExists(db, piusiId) {
  return (db.mechanization?.fuelLogs || []).some(item => String(item.sursa) === 'PIUSI' && String(item.piusi_id_prog) === String(piusiId))
}

function processPiusiRowsToFuelLogs(db, rowIds = []) {
  const integration = ensurePiusiDb(db)
  const selected = new Set((rowIds || []).map(String))
  const rows = integration.piusiSync.filter(item =>
    item.procesat !== true &&
    item.asset_id &&
    (!selected.size || selected.has(String(item.id)) || selected.has(String(item.piusi_id_prog)))
  )
  let processed = 0
  let skipped = 0
  rows.forEach(row => {
    if (fuelLogExists(db, row.piusi_id_prog)) {
      row.procesat = true
      skipped += 1
      return
    }
    const asset = assets(db).find(item => String(item.id) === String(row.asset_id))
    db.mechanization.fuelLogs.push({
      id: id('fuel'),
      data: String(row.data_ora || todayIso()).slice(0, 10),
      asset_id: String(row.asset_id),
      asset_name: assetLabel(asset) || row.operator_cod,
      nr_document: `PIUSI-${row.piusi_id_prog}`,
      furnizor: 'PIUSI Self-Service',
      cantitate_litri: round2(row.cantitate_litri),
      pret_litru: 0,
      valoare_totala: 0,
      km_ore: num(row.odometru),
      sofer_operator: row.operator_cod || '',
      cost_center_id: asset?.cost_center_id || '',
      observatii: `Import automat PIUSI ${String(row.data_ora).slice(11, 16)} · pompă ${row.numar_pompa || '-'}`,
      sursa: 'PIUSI',
      piusi_id_prog: row.piusi_id_prog,
      badge: `⛽ PIUSI ${round2(row.cantitate_litri)}L ${String(row.data_ora).slice(11, 16)}`,
      created_by: 'PIUSI',
      created_at: nowIso()
    })
    row.procesat = true
    row.eroare = ''
    processed += 1
  })
  return { processed, skipped }
}

function filterPiusiRows(rows, query = {}) {
  let list = [...rows]
  if (query.de_la) list = list.filter(item => String(item.data_ora || '').slice(0, 10) >= String(query.de_la))
  if (query.pana_la) list = list.filter(item => String(item.data_ora || '').slice(0, 10) <= String(query.pana_la))
  if (query.asset_id) list = list.filter(item => String(item.asset_id) === String(query.asset_id))
  if (query.procesat !== undefined && query.procesat !== '') {
    const expected = ['1', 'true', 'da'].includes(String(query.procesat).toLowerCase())
    list = list.filter(item => item.procesat === expected)
  }
  return list.sort((a, b) => String(b.data_ora).localeCompare(String(a.data_ora)))
}

function comparativeReport(db, luna, assetId = '') {
  const integration = ensurePiusiDb(db)
  const m = db.mechanization || {}
  const assetIds = new Set()
  integration.piusiSync.filter(item => String(item.data_ora || '').startsWith(luna)).forEach(item => assetIds.add(String(item.asset_id || '')))
  ;(m.fuelLogs || []).filter(item => String(item.data || '').startsWith(luna)).forEach(item => assetIds.add(String(item.asset_id || '')))
  const rows = [...assetIds].filter(Boolean).filter(idValue => !assetId || idValue === String(assetId)).map(idValue => {
    const piusi = integration.piusiSync.filter(item => String(item.asset_id) === idValue && String(item.data_ora || '').startsWith(luna))
    const faz = (m.fuelLogs || []).filter(item => String(item.asset_id) === idValue && String(item.data || '').startsWith(luna))
    const litriPiusi = round2(piusi.reduce((sum, item) => sum + num(item.cantitate_litri), 0))
    const litriFaz = round2(faz.reduce((sum, item) => sum + num(item.cantitate_litri), 0))
    const diferenta = round2(litriPiusi - litriFaz)
    const procent = litriPiusi ? round2(Math.abs(diferenta) / litriPiusi * 100) : 0
    return {
      asset_id: idValue,
      asset: assetLabel(assets(db).find(asset => String(asset.id) === idValue)),
      piusi_litri: litriPiusi,
      faz_litri: litriFaz,
      diferenta_litri: diferenta,
      diferenta_prc: procent,
      alerta: procent > 5
    }
  })
  return { luna, rows, totals: rows.reduce((acc, row) => ({
    piusi_litri: round2(acc.piusi_litri + row.piusi_litri),
    faz_litri: round2(acc.faz_litri + row.faz_litri),
    diferenta_litri: round2(acc.diferenta_litri + row.diferenta_litri)
  }), { piusi_litri: 0, faz_litri: 0, diferenta_litri: 0 }) }
}

function formatBytes(bytes) {
  const value = Number(bytes || 0)
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)}GB`
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)}MB`
  if (value >= 1024) return `${(value / 1024).toFixed(2)}KB`
  return `${value}B`
}

function testExternalPath(rawPath) {
  const targetPath = String(rawPath || '').trim()
  if (!targetPath) throwHttp(400, 'Calea este obligatorie.')
  try {
    fs.accessSync(targetPath, fs.constants.R_OK)
    const stat = fs.statSync(targetPath)
    return {
      ok: true,
      path: targetPath,
      type: stat.isDirectory() ? 'folder' : 'fisier',
      size: stat.isDirectory() ? '' : formatBytes(stat.size),
      modified: stat.mtime ? stat.mtime.toISOString() : ''
    }
  } catch (error) {
    return {
      ok: false,
      path: targetPath,
      error: error.code === 'ENOENT' ? 'Fișierul sau folderul nu există.' : (error.message || 'Calea nu este accesibilă.')
    }
  }
}

router.get('/integration/test', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'settings:manage')) return
  res.json(testExternalPath(req.query.path))
})

router.get('/integration/piusi/status', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'mechanization:view')) return
  res.json(piusiStatus(auth.db))
})

router.post('/integration/piusi/config', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return
    const body = req.body || {}
    setConfigValue(auth.db, 'piusi_mdb_path', body.mdb_path || body.piusi_mdb_path || 'C:\\Piusi\\SelfService\\Data\\Self.mdb')
    setConfigValue(auth.db, 'piusi_sync_interval_min', Math.max(5, Number(body.sync_interval_min || 30)))
    auth.db.settings = auth.db.settings || {}
    auth.db.settings.piusi_mdb_path = String(body.mdb_path || body.piusi_mdb_path || auth.db.settings.piusi_mdb_path || '').trim()
    auth.db.settings.piusi_sync_min = String(Math.max(5, Number(body.sync_interval_min || auth.db.settings.piusi_sync_min || 30)))
    writeDb(auth.db)
    addAudit(auth.db, auth.user, 'piusi_config', 'Configurare PIUSI Self-Service')
    res.json({ ok: true, status: piusiStatus(auth.db) })
  } catch (error) { next(error) }
})

router.post('/integration/piusi/sync-now', async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return
    const result = await syncPiusi({ db: auth.db })
    writeDb(auth.db)
    addAudit(auth.db, auth.user, 'piusi_sync_now', `${result.imported || 0} alimentări importate`)
    res.json({ ok: true, importate: result.imported || 0, erori: result.errors || 0, result, status: piusiStatus(auth.db) })
  } catch (error) { next(error) }
})

router.get('/integration/piusi/mapari', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'mechanization:view')) return
  const integration = ensurePiusiDb(auth.db)
  const operators = new Set(integration.piusiSync.map(item => item.operator_cod).filter(Boolean))
  integration.piusiMapare.forEach(item => operators.add(item.operator_cod))
  const rows = [...operators].sort().map(operator_cod => {
    const mapare = findMapare(auth.db, operator_cod) || { operator_cod, asset_id: '', activ: true }
    return { ...mapare, nemapat: !mapare.asset_id }
  })
  res.json({ mapari: rows, assets: assets(auth.db).map(asset => ({ id: asset.id, label: assetLabel(asset) })) })
})

router.post('/integration/piusi/mapari', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return
    const body = req.body || {}
    const rows = Array.isArray(body.mapari) ? body.mapari : [body]
    const saved = rows.map(row => upsertMapare(auth.db, row.operator_cod, row.asset_id, row.denumire, row.activ !== false))
    writeDb(auth.db)
    addAudit(auth.db, auth.user, 'piusi_mapari', `${saved.length} mapări PIUSI salvate`)
    res.json({ ok: true, mapari: saved })
  } catch (error) { next(error) }
})

router.get('/integration/piusi/alimentari', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'mechanization:view')) return
  const rows = filterPiusiRows(ensurePiusiDb(auth.db).piusiSync, req.query)
  res.json({ alimentari: rows })
})

router.post('/integration/piusi/import-faz', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return
    const result = processPiusiRowsToFuelLogs(auth.db, req.body?.ids || [])
    writeDb(auth.db)
    addAudit(auth.db, auth.user, 'piusi_import_faz', `${result.processed} alimentări transferate în FAZ`)
    res.json({ ok: true, ...result })
  } catch (error) { next(error) }
})

router.get('/integration/piusi/raport-comparativ', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'mechanization:view')) return
  res.json(comparativeReport(auth.db, String(req.query.luna || todayIso().slice(0, 7)), req.query.asset_id || ''))
})

function startPiusiScheduler() {
  if (schedulerStarted) return
  schedulerStarted = true
  schedulerTimer = setInterval(() => {
    syncPiusi().catch(error => console.warn('[PIUSI] Sync eșuat:', error.message))
  }, 30 * 60 * 1000)
}

module.exports = router
module.exports.syncPiusi = syncPiusi
module.exports.startPiusiScheduler = startPiusiScheduler
module.exports._private = { ensurePiusiDb, processPiusiRowsToFuelLogs, comparativeReport }
