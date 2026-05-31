const { Router } = require('express')
const multer = require('multer')
const path = require('path')
const xlsx = require('xlsx')
const crypto = require('crypto')
const fs = require('fs')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { readDb, writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const calculator = require('./calculator')
const { getMeteo } = require('./weather')
const router = Router()
const upload = multer({ dest: path.join(__dirname, '../../../storage/temp/') })

function sendJson(res, status, data) {
  res.status(status).json(data)
}

function throwHttp(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

function nowIso() {
  return new Date().toISOString()
}

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function toNumber(value, fallback = 0) {
  const number = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(number) ? number : fallback
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1
}

function firstDayOfMonth(luna) {
  if (!luna) return todayDate().slice(0, 7) + '-01'
  return String(luna).length === 7 ? `${luna}-01` : String(luna).slice(0, 10)
}

function sameMonth(dateValue, luna) {
  return String(dateValue || '').slice(0, 7) === String(luna || '').slice(0, 7)
}

function ensureSnowDb(db) {
  db.snowRemoval = db.snowRemoval || {}
  const snow = db.snowRemoval
  snow.seasons = Array.isArray(snow.seasons) ? snow.seasons : []
  snow.streetSectors = Array.isArray(snow.streetSectors) ? snow.streetSectors : []
  snow.manualZones = Array.isArray(snow.manualZones) ? snow.manualZones : []
  snow.recipes = Array.isArray(snow.recipes) ? snow.recipes : []
  snow.dutyLogs = Array.isArray(snow.dutyLogs) ? snow.dutyLogs : []
  snow.vehicleRouteSheets = Array.isArray(snow.vehicleRouteSheets) ? snow.vehicleRouteSheets : []
  snow.vehicleRouteLines = Array.isArray(snow.vehicleRouteLines) ? snow.vehicleRouteLines : []
  snow.standbyLogs = Array.isArray(snow.standbyLogs) ? snow.standbyLogs : []
  snow.gpsTracks = Array.isArray(snow.gpsTracks) ? snow.gpsTracks : []
  snow.monthlyReports = Array.isArray(snow.monthlyReports) ? snow.monthlyReports : []
  snow.signTokens = Array.isArray(snow.signTokens) ? snow.signTokens : []
  return snow
}

function currentCompanyId(db, user) {
  return user.companyId || user.company_id || db.settings?.company_id || db.company?.id || 1
}

function defaultSeasonDates() {
  const year = new Date().getFullYear()
  return {
    data_start: `${year}-11-15`,
    data_sfarsit: `${year + 1}-04-15`
  }
}

function findDutyLog(snow, uuid) {
  return snow.dutyLogs.find(item => item.uuid === uuid) || null
}

function findRouteSheet(snow, uuid) {
  return snow.vehicleRouteSheets.find(item => item.uuid === uuid) || null
}

function linesForSheet(snow, routeSheetId) {
  return snow.vehicleRouteLines
    .filter(item => String(item.route_sheet_id) === String(routeSheetId))
    .sort((a, b) => Number(a.nr_crt || 0) - Number(b.nr_crt || 0))
}

function sheetsForDutyLog(snow, dutyLogId) {
  return snow.vehicleRouteSheets
    .filter(item => String(item.duty_log_id) === String(dutyLogId))
    .map(sheet => ({ ...sheet, linii: linesForSheet(snow, sheet.id) }))
}

function standbyForDutyLog(snow, dutyLogId) {
  return snow.standbyLogs.filter(item => String(item.duty_log_id) === String(dutyLogId))
}

function rowText(value) {
  return String(value ?? '').trim()
}

function cleanupUpload(file) {
  if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path)
}

function readCsvRows(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const firstLine = text.split(/\r?\n/).find(Boolean) || ''
  const delimiter = [';', ',', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0]
  const lines = text.split(/\r?\n/).filter(line => line.trim())
  const headers = lines.shift().split(delimiter).map(item => item.trim())
  return lines.map(line => {
    const cells = line.split(delimiter)
    return headers.reduce((row, header, index) => {
      row[header] = cells[index]
      return row
    }, {})
  })
}

function readUploadRows(file) {
  const ext = path.extname(file.originalname || file.path).toLowerCase()
  if (ext === '.csv' || ext === '.txt') return readCsvRows(file.path)
  const workbook = xlsx.readFile(file.path)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return xlsx.utils.sheet_to_json(sheet, { defval: '' })
}

function maybeNotifyUser(userId, event, data) {
  try {
    const { notifyUser } = require('../messaging/routes')
    notifyUser(userId, event, data)
  } catch {
    // Notificarile in timp real sunt optionale pentru modulul de deszapezire.
  }
}

async function maybeRegisterSnowStandby(row, db) {
  try {
    const { registerSnowStandby } = require('../controlling/auto-register')
    const employees = db.hr?.employees || []
    const angajat = employees.find(item => String(item.id) === String(row.angajat_id)) || {}
    if (typeof registerSnowStandby === 'function') await registerSnowStandby(row, angajat, db)
  } catch {
    // Integrarea controlling pentru standby va fi disponibila incremental.
  }
}

function applyDutyLogConsumptions(snow, dutyLogId) {
  const sheets = snow.vehicleRouteSheets.filter(item => String(item.duty_log_id) === String(dutyLogId))
  const dutyLog = snow.dutyLogs.find(item => String(item.id) === String(dutyLogId))
  if (!dutyLog) return
  dutyLog.consum_nisip_to = sheets.reduce((sum, item) => sum + toNumber(item.nisip_consumat_to), 0)
  dutyLog.consum_sare_to = sheets.reduce((sum, item) => sum + toNumber(item.sare_consumata_to), 0)
  dutyLog.consum_cacl_to = sheets.reduce((sum, item) => sum + toNumber(item.cacl_consumat_to), 0)
  dutyLog.stoc_predare_nisip_to = toNumber(dutyLog.stoc_intrare_nisip_to) + toNumber(dutyLog.intrari_nisip_to) - toNumber(dutyLog.consum_nisip_to)
  dutyLog.stoc_predare_sare_to = toNumber(dutyLog.stoc_intrare_sare_to) + toNumber(dutyLog.intrari_sare_to) - toNumber(dutyLog.consum_sare_to)
  dutyLog.stoc_predare_cacl_to = toNumber(dutyLog.stoc_intrare_cacl_to) + toNumber(dutyLog.intrari_cacl_to) - toNumber(dutyLog.consum_cacl_to)
  dutyLog.updated_at = nowIso()
}

function buildMonthlyReport(snow, seasonId, luna) {
  const month = firstDayOfMonth(luna)
  const dutyLogs = snow.dutyLogs.filter(item => String(item.season_id) === String(seasonId) && sameMonth(item.data, month))
  const dutyLogIds = new Set(dutyLogs.map(item => String(item.id)))
  const routeSheets = snow.vehicleRouteSheets.filter(item => dutyLogIds.has(String(item.duty_log_id)))
  const standbyLogs = snow.standbyLogs.filter(item => dutyLogIds.has(String(item.duty_log_id)))
  return {
    season_id: Number(seasonId),
    luna: month,
    ...calculator.calculeazaRaportLunar(dutyLogs, routeSheets, standbyLogs)
  }
}

function reportHtml(report) {
  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <title>Raport lunar deszapezire</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #111; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 16px; margin-top: 28px; }
    table { border-collapse: collapse; width: 100%; margin-top: 12px; }
    th, td { border: 1px solid #999; padding: 8px; text-align: left; }
    th { background: #f0f0f0; }
  </style>
</head>
<body>
  <h1>Raport lunar deszapezire</h1>
  <p>Luna: ${report.luna || ''}</p>
  <h2>Activitate</h2>
  <table>
    <tr><th>Zile interventie</th><td>${report.zile_interventie || 0}</td></tr>
    <tr><th>Zile dispozitie</th><td>${report.zile_dispozitie || 0}</td></tr>
    <tr><th>Ore interventie active</th><td>${report.ore_interventie_active || 0}</td></tr>
    <tr><th>Ore dispozitie</th><td>${report.ore_dispozitie || 0}</td></tr>
  </table>
  <h2>Materiale</h2>
  <table>
    <tr><th>Nisip total (to)</th><td>${report.nisip_total_to || 0}</td></tr>
    <tr><th>Sare total (to)</th><td>${report.sare_totala_to || 0}</td></tr>
    <tr><th>CaCl total (to)</th><td>${report.cacl_total_to || 0}</td></tr>
  </table>
  <h2>Costuri</h2>
  <table>
    <tr><th>Manopera interventie</th><td>${report.cost_manopera_interventie || 0}</td></tr>
    <tr><th>Manopera dispozitie</th><td>${report.cost_manopera_dispozitie || 0}</td></tr>
    <tr><th>Sporuri</th><td>${report.cost_sporuri || 0}</td></tr>
    <tr><th>Utilaje</th><td>${report.cost_utilaje || 0}</td></tr>
    <tr><th>Materiale</th><td>${report.cost_materiale || 0}</td></tr>
    <tr><th>Total</th><td>${report.cost_total || 0}</td></tr>
  </table>
</body>
</html>`
}

router.get('/snow-removal/seasons', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:view')) return
    const snow = ensureSnowDb(auth.db)
    sendJson(res, 200, snow.seasons)
  } catch (error) {
    next(error)
  }
})

router.post('/snow-removal/seasons', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:config')) return
    const db = readDb()
    const snow = ensureSnowDb(db)
    const defaults = defaultSeasonDates()
    const season = {
      id: nextId(snow.seasons),
      company_id: currentCompanyId(db, auth.user),
      denumire: req.body.denumire || `Sezon ${defaults.data_start.slice(0, 4)}-${defaults.data_sfarsit.slice(0, 4)}`,
      data_start: req.body.data_start || defaults.data_start,
      data_sfarsit: req.body.data_sfarsit || defaults.data_sfarsit,
      factor_corectie_material: toNumber(req.body.factor_corectie_material) ?? 0.625,
      activ: req.body.activ !== false,
      created_at: nowIso()
    }
    snow.seasons.push(season)
    addAudit(db, auth.user, 'snow_season_created', season.denumire)
    writeDb(db)
    sendJson(res, 201, season)
  } catch (error) {
    next(error)
  }
})

router.get('/snow-removal/seasons/:id/street-sectors', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:view')) return
    const snow = ensureSnowDb(auth.db)
    sendJson(res, 200, snow.streetSectors.filter(item => String(item.season_id) === String(req.params.id)))
  } catch (error) {
    next(error)
  }
})

router.post('/snow-removal/seasons/:id/street-sectors', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:config')) return
    const db = readDb()
    const snow = ensureSnowDb(db)
    const sector = {
      id: nextId(snow.streetSectors),
      season_id: Number(req.params.id),
      denumire: req.body.denumire,
      cod: req.body.cod || null,
      tip: req.body.tip || 'strada',
      lungime_ml: req.body.lungime_ml ?? null,
      suprafata_m2: toNumber(req.body.suprafata_m2),
      tip_tratament: req.body.tip_tratament || 'sare',
      prioritate: Number(req.body.prioritate || 2),
      zona: req.body.zona || null,
      utilaj_default_id: req.body.utilaj_default_id || null,
      activ: req.body.activ !== false,
      sort_order: Number(req.body.sort_order || snow.streetSectors.length + 1),
      created_at: nowIso()
    }
    snow.streetSectors.push(sector)
    addAudit(db, auth.user, 'snow_street_sector_created', sector.denumire)
    writeDb(db)
    sendJson(res, 201, sector)
  } catch (error) {
    next(error)
  }
})

router.post('/snow-removal/seasons/:id/street-sectors/import-excel', upload.single('file'), (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:config')) return
    if (!req.file) throwHttp(400, 'Fisier lipsa.')
    const workbook = xlsx.readFile(req.file.path)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    const db = readDb()
    const snow = ensureSnowDb(db)
    const seasonId = Number(req.params.id)
    const erori = []
    const sectors = []
    rows.forEach((row, index) => {
      const denumire = rowText(row[0])
      if (!denumire || /denumire|strada/i.test(denumire)) return
      const suprafata = toNumber(row[1], NaN)
      if (!Number.isFinite(suprafata) || suprafata <= 0) {
        erori.push({ rand: index + 1, motiv: 'Suprafata invalida.' })
        return
      }
      sectors.push({
        id: 0,
        season_id: seasonId,
        denumire,
        cod: null,
        tip: 'strada',
        lungime_ml: null,
        suprafata_m2: suprafata,
        tip_tratament: rowText(row[2]) || 'sare',
        prioritate: Number(row[3] || 2),
        zona: rowText(row[4]) || null,
        utilaj_default_id: null,
        activ: true,
        sort_order: sectors.length + 1,
        created_at: nowIso()
      })
    })
    snow.streetSectors = snow.streetSectors.filter(item => String(item.season_id) !== String(seasonId))
    sectors.forEach(sector => {
      sector.id = nextId(snow.streetSectors)
      snow.streetSectors.push(sector)
    })
    cleanupUpload(req.file)
    addAudit(db, auth.user, 'snow_street_sectors_imported', `${sectors.length} sectoare`)
    writeDb(db)
    sendJson(res, 200, { importate: sectors.length, erori })
  } catch (error) {
    cleanupUpload(req.file)
    next(error)
  }
})

router.get('/snow-removal/seasons/:id/manual-zones', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:view')) return
    const snow = ensureSnowDb(auth.db)
    sendJson(res, 200, snow.manualZones.filter(item => String(item.season_id) === String(req.params.id)))
  } catch (error) {
    next(error)
  }
})

router.post('/snow-removal/seasons/:id/manual-zones', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:config')) return
    const db = readDb()
    const snow = ensureSnowDb(db)
    const zone = {
      id: nextId(snow.manualZones),
      season_id: Number(req.params.id),
      denumire: req.body.denumire,
      tip: req.body.tip || 'trotuar',
      suprafata_m2: toNumber(req.body.suprafata_m2),
      zona: req.body.zona || null,
      activ: req.body.activ !== false,
      created_at: nowIso()
    }
    snow.manualZones.push(zone)
    addAudit(db, auth.user, 'snow_manual_zone_created', zone.denumire)
    writeDb(db)
    sendJson(res, 201, zone)
  } catch (error) {
    next(error)
  }
})

router.get('/snow-removal/recipes', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:view')) return
    const snow = ensureSnowDb(auth.db)
    sendJson(res, 200, req.query.season_id ? snow.recipes.filter(item => String(item.season_id) === String(req.query.season_id)) : snow.recipes)
  } catch (error) {
    next(error)
  }
})

router.post('/snow-removal/recipes', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:config')) return
    const db = readDb()
    const snow = ensureSnowDb(db)
    const recipe = {
      id: nextId(snow.recipes),
      season_id: Number(req.body.season_id),
      denumire: req.body.denumire,
      tip_tratament: req.body.tip_tratament || 'sare',
      doza_sare_kg: toNumber(req.body.doza_sare_kg),
      doza_clorura_l: toNumber(req.body.doza_clorura_l),
      mc_per_cupa: toNumber(req.body.mc_per_cupa, calculator.MC_PER_CUPA),
      densitate: toNumber(req.body.densitate, calculator.DENSITATE_SARE),
      factor_corectie: toNumber(req.body.factor_corectie, calculator.FACTOR_PRACTIC),
      l_per_cupa: req.body.l_per_cupa ?? null,
      capacitate_sararita_mc: req.body.capacitate_sararita_mc ?? null,
      conditie_aplicare: req.body.conditie_aplicare || null,
      activ: req.body.activ !== false,
      aprobat_de: auth.user.id,
      created_at: nowIso()
    }
    snow.recipes.push(recipe)
    addAudit(db, auth.user, 'snow_recipe_created', recipe.denumire)
    writeDb(db)
    sendJson(res, 201, recipe)
  } catch (error) {
    next(error)
  }
})

router.get('/snow-removal/weather', async (req, res, next) => {
  try {
    const meteo = await getMeteo()
    if (!meteo) return res.json({ disponibil: false })
    res.json({ disponibil: true, ...meteo })
  } catch (error) {
    next(error)
  }
})

router.get('/snow-removal/duty-logs', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:view')) return
    const snow = ensureSnowDb(auth.db)
    let rows = snow.dutyLogs
    if (req.query.season_id) rows = rows.filter(item => String(item.season_id) === String(req.query.season_id))
    if (req.query.data) rows = rows.filter(item => String(item.data) === String(req.query.data))
    if (req.query.status) rows = rows.filter(item => item.status === req.query.status)
    sendJson(res, 200, rows)
  } catch (error) {
    next(error)
  }
})

router.post('/snow-removal/duty-logs', async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:duty_log')) return
    const db = readDb()
    const snow = ensureSnowDb(db)
    const seasonId = Number(req.body.season_id)
    if (!seasonId) throwHttp(400, 'Nu exista sezon activ configurat. Creeaza un sezon in Deszapezire > Configurare.')
    const season = snow.seasons.find(item => String(item.id) === String(seasonId))
    if (!season) throwHttp(404, 'Sezonul selectat nu exista.')
    const data = req.body.data || todayDate()
    const existing = snow.dutyLogs.find(item => String(item.season_id) === String(seasonId) && String(item.data) === String(data))
    if (existing) return sendJson(res, 409, { error: 'Exista deja jurnal pentru sezonul si data selectate.', jurnal_existent: existing })
    const meteo = req.body.conditii_meteo_auto ? null : await getMeteo()
    const log = {
      id: nextId(snow.dutyLogs),
      uuid: crypto.randomUUID(),
      season_id: seasonId,
      data,
      ofiter_serviciu_id: req.body.ofiter_serviciu_id || auth.user.id,
      temperatura_start: req.body.temperatura_start ?? meteo?.temperatura ?? null,
      temperatura_min: req.body.temperatura_min ?? null,
      temperatura_max: req.body.temperatura_max ?? null,
      conditii_meteo: req.body.conditii_meteo || meteo?.stare?.label || null,
      strat_zapada_cm: toNumber(req.body.strat_zapada_cm),
      tip_interventie: req.body.tip_interventie || meteo?.recomandare?.tip || 'fara_interventie',
      motiv_neinterventie: req.body.motiv_neinterventie || req.body.motiv_neinteventie || null,
      personal_json: JSON.stringify(req.body.personal || []),
      meteo_json: meteo ? JSON.stringify(meteo) : null,
      stoc_intrare_nisip_to: toNumber(req.body.stoc_intrare_nisip_to),
      stoc_intrare_sare_to: toNumber(req.body.stoc_intrare_sare_to),
      stoc_intrare_cacl_to: toNumber(req.body.stoc_intrare_cacl_to),
      stoc_intrare_sol_cacl_to: toNumber(req.body.stoc_intrare_sol_cacl_to),
      intrari_nisip_to: toNumber(req.body.intrari_nisip_to),
      intrari_sare_to: toNumber(req.body.intrari_sare_to),
      intrari_cacl_to: toNumber(req.body.intrari_cacl_to),
      consum_nisip_to: toNumber(req.body.consum_nisip_to),
      consum_sare_to: toNumber(req.body.consum_sare_to),
      consum_cacl_to: toNumber(req.body.consum_cacl_to),
      consum_sol_cacl_to: toNumber(req.body.consum_sol_cacl_to),
      consum_cacl_saci: Number(req.body.consum_cacl_saci || 0),
      stoc_predare_nisip_to: toNumber(req.body.stoc_predare_nisip_to),
      stoc_predare_sare_to: toNumber(req.body.stoc_predare_sare_to),
      stoc_predare_cacl_to: toNumber(req.body.stoc_predare_cacl_to),
      observatii: req.body.observatii || null,
      status: 'draft',
      creat_de: auth.user.id,
      created_at: nowIso(),
      updated_at: nowIso()
    }
    snow.dutyLogs.push(log)
    applyDutyLogConsumptions(snow, log.id)
    addAudit(db, auth.user, 'snow_duty_log_created', `${log.data}`)
    writeDb(db)
    sendJson(res, 201, log)
  } catch (error) {
    next(error)
  }
})

router.get('/snow-removal/duty-logs/:uuid', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:view')) return
    const snow = ensureSnowDb(auth.db)
    const dutyLog = findDutyLog(snow, req.params.uuid)
    if (!dutyLog) throwHttp(404, 'Jurnalul nu a fost gasit.')
    sendJson(res, 200, {
      duty_log: dutyLog,
      route_sheets: sheetsForDutyLog(snow, dutyLog.id),
      standby_logs: standbyForDutyLog(snow, dutyLog.id)
    })
  } catch (error) {
    next(error)
  }
})

router.patch('/snow-removal/duty-logs/:uuid', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:duty_log')) return
    const db = readDb()
    const snow = ensureSnowDb(db)
    const dutyLog = findDutyLog(snow, req.params.uuid)
    if (!dutyLog) throwHttp(404, 'Jurnalul nu a fost gasit.')
    if (dutyLog.status !== 'draft') throwHttp(409, 'Jurnalul poate fi modificat doar in status draft.')
    const fields = [
      'temperatura_start', 'temperatura_min', 'temperatura_max', 'conditii_meteo',
      'strat_zapada_cm', 'tip_interventie', 'motiv_neinterventie', 'motiv_neinteventie',
      'personal_json', 'observatii', 'stoc_intrare_nisip_to', 'stoc_intrare_sare_to',
      'stoc_intrare_cacl_to', 'stoc_intrare_sol_cacl_to', 'intrari_nisip_to',
      'intrari_sare_to', 'intrari_cacl_to', 'consum_nisip_to', 'consum_sare_to',
      'consum_cacl_to', 'consum_sol_cacl_to', 'consum_cacl_saci',
      'stoc_predare_nisip_to', 'stoc_predare_sare_to', 'stoc_predare_cacl_to'
    ]
    fields.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        const target = field === 'motiv_neinteventie' ? 'motiv_neinterventie' : field
        dutyLog[target] = req.body[field]
      }
    })
    dutyLog.updated_at = nowIso()
    addAudit(db, auth.user, 'snow_duty_log_updated', dutyLog.uuid)
    writeDb(db)
    sendJson(res, 200, dutyLog)
  } catch (error) {
    next(error)
  }
})

router.post('/snow-removal/duty-logs/:uuid/submit', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:duty_log')) return
    const db = readDb()
    const snow = ensureSnowDb(db)
    const dutyLog = findDutyLog(snow, req.params.uuid)
    if (!dutyLog) throwHttp(404, 'Jurnalul nu a fost gasit.')
    if (dutyLog.status !== 'draft') throwHttp(409, 'Jurnalul trebuie sa fie draft.')
    const hasRoutes = snow.vehicleRouteSheets.some(item => String(item.duty_log_id) === String(dutyLog.id))
    const hasStandby = snow.standbyLogs.some(item => String(item.duty_log_id) === String(dutyLog.id))
    if (!hasRoutes && !hasStandby) throwHttp(422, 'Jurnalul trebuie sa contina cel putin o fisa de traseu sau o inregistrare standby.')
    dutyLog.status = 'trimis'
    dutyLog.updated_at = nowIso()
    addAudit(db, auth.user, 'snow_duty_log_submitted', dutyLog.uuid)
    writeDb(db)
    sendJson(res, 200, dutyLog)
  } catch (error) {
    next(error)
  }
})

router.post('/snow-removal/duty-logs/:uuid/approve', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:approve')) return
    const db = readDb()
    const snow = ensureSnowDb(db)
    const dutyLog = findDutyLog(snow, req.params.uuid)
    if (!dutyLog) throwHttp(404, 'Jurnalul nu a fost gasit.')
    if (dutyLog.status !== 'trimis') throwHttp(409, 'Jurnalul trebuie sa fie trimis.')
    dutyLog.status = 'aprobat'
    dutyLog.updated_at = nowIso()
    addAudit(db, auth.user, 'snow_duty_log_approved', dutyLog.uuid)
    writeDb(db)
    maybeNotifyUser(dutyLog.ofiter_serviciu_id, 'snow_duty_log_approved', { uuid: dutyLog.uuid, data: dutyLog.data })
    sendJson(res, 200, dutyLog)
  } catch (error) {
    next(error)
  }
})

router.get('/snow-removal/duty-logs/:uuid/route-sheets', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:view')) return
    const snow = ensureSnowDb(auth.db)
    const dutyLog = findDutyLog(snow, req.params.uuid)
    if (!dutyLog) throwHttp(404, 'Jurnalul nu a fost gasit.')
    sendJson(res, 200, sheetsForDutyLog(snow, dutyLog.id))
  } catch (error) {
    next(error)
  }
})

router.post('/snow-removal/duty-logs/:uuid/route-sheets', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:route_sheet')) return
    const db = readDb()
    const snow = ensureSnowDb(db)
    const dutyLog = findDutyLog(snow, req.params.uuid)
    if (!dutyLog) throwHttp(404, 'Jurnalul nu a fost gasit.')
    if (dutyLog.status !== 'draft') throwHttp(409, 'Fisele se pot adauga doar pe jurnal draft.')
    const recipe = snow.recipes.find(item => String(item.id) === String(req.body.recipe_id)) || null
    const totals = calculator.totalizeazaFisaTraseu(req.body.linii || [], recipe)
    const sheet = {
      id: nextId(snow.vehicleRouteSheets),
      uuid: crypto.randomUUID(),
      duty_log_id: dutyLog.id,
      utilaj_id: req.body.utilaj_id,
      nr_faz: req.body.nr_faz,
      deservent_1_id: req.body.deservent_1_id,
      deservent_2_id: req.body.deservent_2_id || null,
      schimb: req.body.schimb || 'zi',
      ora_start: req.body.ora_start || null,
      ora_sfarsit: req.body.ora_sfarsit || null,
      ore_functionare_motor: toNumber(req.body.ore_functionare_motor),
      ore_stationare_baza: toNumber(req.body.ore_stationare_baza),
      km_parcursi: toNumber(req.body.km_parcursi),
      total_cupe_nisip: totals.total_cupe_nisip,
      total_cupe_sare: totals.total_cupe_sare,
      total_cupe_cacl: totals.total_cupe_cacl,
      total_treceri: totals.total_treceri,
      nisip_consumat_to: totals.nisip_to,
      sare_consumata_to: totals.sare_to,
      cacl_consumat_to: totals.cacl_to,
      status: 'draft',
      created_at: nowIso(),
      updated_at: nowIso()
    }
    snow.vehicleRouteSheets.push(sheet)
    ;(req.body.linii || []).forEach((line, index) => {
      snow.vehicleRouteLines.push({
        id: nextId(snow.vehicleRouteLines),
        route_sheet_id: sheet.id,
        sector_id: line.sector_id,
        nr_crt: Number(line.nr_crt || index + 1),
        ora_plecare: line.ora_plecare || null,
        lama: Boolean(line.lama),
        nr_treceri_lama: Number(line.nr_treceri_lama || 0),
        nr_cupe_material: Number(line.nr_cupe_material || 0),
        tip_material: line.tip_material || null,
        nr_treceri_material: Number(line.nr_treceri_material || 0),
        ora_sosire: line.ora_sosire || null,
        observatii: line.observatii || null,
        created_at: nowIso()
      })
    })
    applyDutyLogConsumptions(snow, dutyLog.id)
    addAudit(db, auth.user, 'snow_route_sheet_created', `${sheet.nr_faz}`)
    writeDb(db)
    sendJson(res, 201, { ...sheet, linii: linesForSheet(snow, sheet.id), totaluri: totals })
  } catch (error) {
    next(error)
  }
})

router.patch('/snow-removal/route-sheets/:uuid', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:gps_import')) return
    const db = readDb()
    const snow = ensureSnowDb(db)
    const sheet = findRouteSheet(snow, req.params.uuid)
    if (!sheet) throwHttp(404, 'Fisa de traseu nu a fost gasita.')
    ;['ore_functionare_motor', 'ore_stationare_baza', 'km_parcursi'].forEach(field => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) sheet[field] = toNumber(req.body[field])
    })
    if (toNumber(sheet.km_parcursi) > 0) sheet.status = 'validat_gps'
    sheet.updated_at = nowIso()
    addAudit(db, auth.user, 'snow_route_sheet_gps_updated', sheet.uuid)
    writeDb(db)
    sendJson(res, 200, sheet)
  } catch (error) {
    next(error)
  }
})

router.post('/snow-removal/route-sheets/:uuid/gps-import', upload.single('file'), (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:gps_import')) return
    if (!req.file) throwHttp(400, 'Fisier lipsa.')
    const db = readDb()
    const snow = ensureSnowDb(db)
    const sheet = findRouteSheet(snow, req.params.uuid)
    if (!sheet) throwHttp(404, 'Fisa de traseu nu a fost gasita.')
    const rows = readUploadRows(req.file)
    const parsed = calculator.parseGpsTrack(rows)
    parsed.tracks.forEach(track => {
      snow.gpsTracks.push({
        id: nextId(snow.gpsTracks),
        intervention_id: null,
        route_sheet_id: sheet.id,
        utilaj_id: sheet.utilaj_id,
        data_ora: track.data_ora.toISOString(),
        gps_lat: track.gps_lat,
        gps_lng: track.gps_lng,
        viteza_kmh: track.viteza_kmh,
        motor_pornit: track.motor_pornit,
        created_at: nowIso()
      })
    })
    sheet.km_parcursi = Number(parsed.km_parcursi.toFixed(2))
    sheet.viteza_medie = Number(parsed.viteza_medie.toFixed(2))
    sheet.timp_stationare_minute = Number(parsed.timp_stationare_minute.toFixed(0))
    sheet.timp_motor_pornit_minute = Number(parsed.timp_motor_pornit_minute.toFixed(0))
    sheet.ore_functionare_motor = Number((parsed.timp_motor_pornit_minute / 60).toFixed(2))
    sheet.ore_stationare_baza = Number((parsed.timp_stationare_minute / 60).toFixed(2))
    sheet.status = 'validat_gps'
    sheet.updated_at = nowIso()
    cleanupUpload(req.file)
    addAudit(db, auth.user, 'snow_route_sheet_gps_imported', sheet.uuid)
    writeDb(db)
    sendJson(res, 200, {
      tracks_importate: parsed.tracks.length,
      km: sheet.km_parcursi,
      ore_motor: sheet.ore_functionare_motor,
      ore_stationare: sheet.ore_stationare_baza
    })
  } catch (error) {
    cleanupUpload(req.file)
    next(error)
  }
})

router.get('/snow-removal/duty-logs/:uuid/standby', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:view')) return
    const snow = ensureSnowDb(auth.db)
    const dutyLog = findDutyLog(snow, req.params.uuid)
    if (!dutyLog) throwHttp(404, 'Jurnalul nu a fost gasit.')
    sendJson(res, 200, standbyForDutyLog(snow, dutyLog.id))
  } catch (error) {
    next(error)
  }
})

router.post('/snow-removal/duty-logs/:uuid/standby', async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:duty_log')) return
    const db = readDb()
    const snow = ensureSnowDb(db)
    const dutyLog = findDutyLog(snow, req.params.uuid)
    if (!dutyLog) throwHttp(404, 'Jurnalul nu a fost gasit.')
    const calc = calculator.calculeazaStandby(req.body)
    const row = {
      id: nextId(snow.standbyLogs),
      duty_log_id: dutyLog.id,
      angajat_id: req.body.angajat_id,
      tip_standby: req.body.tip_standby,
      ora_start: req.body.ora_start,
      ora_sfarsit: req.body.ora_sfarsit,
      ore_totale: calc.ore_platite,
      include_spor_noapte: calc.ore_noapte > 0,
      ore_noapte: calc.ore_noapte,
      spor_noapte: calc.spor_noapte,
      spor_consemn: calc.spor_consemn,
      observatii: req.body.observatii || null,
      created_at: nowIso()
    }
    snow.standbyLogs.push(row)
    await maybeRegisterSnowStandby(row, db)
    addAudit(db, auth.user, 'snow_standby_created', `${row.angajat_id}`)
    writeDb(db)
    sendJson(res, 201, { ...row, calcul: calc })
  } catch (error) {
    next(error)
  }
})

router.get('/snow-removal/reports/monthly', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:report')) return
    const snow = ensureSnowDb(auth.db)
    if (!req.query.season_id || !req.query.luna) throwHttp(400, 'Parametrii season_id si luna sunt obligatorii.')
    sendJson(res, 200, buildMonthlyReport(snow, req.query.season_id, req.query.luna))
  } catch (error) {
    next(error)
  }
})

router.post('/snow-removal/reports/monthly/generate', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:report')) return
    const db = readDb()
    const snow = ensureSnowDb(db)
    const seasonId = req.body.season_id
    const luna = firstDayOfMonth(req.body.luna)
    const raport = buildMonthlyReport(snow, seasonId, luna)
    let row = snow.monthlyReports.find(item => String(item.season_id) === String(seasonId) && firstDayOfMonth(item.luna) === luna)
    if (row) {
      Object.assign(row, raport, { updated_at: nowIso() })
    } else {
      row = {
        id: nextId(snow.monthlyReports),
        uuid: crypto.randomUUID(),
        ...raport,
        status: 'generat',
        document_id: null,
        generat_de: auth.user.id,
        created_at: nowIso(),
        updated_at: nowIso()
      }
      snow.monthlyReports.push(row)
    }
    db.documents = db.documents || {}
    db.documents.documents = Array.isArray(db.documents.documents) ? db.documents.documents : []
    const document = {
      id: nextId(db.documents.documents),
      uuid: crypto.randomUUID(),
      tip_id: 'RAPORT_DESZAP',
      nr_document: `RD-${luna.slice(0, 4)}-${luna.slice(5, 7)}`,
      titlu: `Raport deszapezire ${luna.slice(0, 7)}`,
      date_json: JSON.stringify(row),
      status: 'draft',
      versiune: 1,
      creat_de: auth.user.id,
      dept_initiatoare: auth.user.departmentId || auth.user.department_id || null,
      prioritate: 'normal',
      created_at: nowIso(),
      updated_at: nowIso()
    }
    db.documents.documents.push(document)
    row.document_id = document.id
    addAudit(db, auth.user, 'snow_monthly_report_generated', row.uuid)
    writeDb(db)
    sendJson(res, 201, { raport: row, document_uuid: document.uuid })
  } catch (error) {
    next(error)
  }
})

router.get('/snow-removal/reports/monthly/:uuid/pdf', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:report')) return
    const snow = ensureSnowDb(auth.db)
    const report = snow.monthlyReports.find(item => item.uuid === req.params.uuid)
    if (!report) throwHttp(404, 'Raportul nu a fost gasit.')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(reportHtml(report))
  } catch (error) {
    next(error)
  }
})

router.get('/snow-removal/dashboard', async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'snow_removal:view')) return
    const snow = ensureSnowDb(auth.db)
    const sezon = snow.seasons.find(item => item.activ !== false) || null
    const luna = todayDate().slice(0, 7)
    const report = sezon ? buildMonthlyReport(snow, sezon.id, luna) : {}
    const lastLog = snow.dutyLogs
      .filter(item => !sezon || String(item.season_id) === String(sezon.id))
      .sort((a, b) => String(b.data).localeCompare(String(a.data)))[0] || null
    const activeToday = lastLog
      ? sheetsForDutyLog(snow, lastLog.id).map(sheet => {
          const asset = (auth.db.fleet?.assets || auth.db.fleetAssets || []).find(item => String(item.id) === String(sheet.utilaj_id)) || {}
          return {
            utilaj_denumire: asset.denumire || asset.name || `Utilaj ${sheet.utilaj_id}`,
            nr_inmatriculare: asset.nr_inmatriculare || asset.registration || null,
            deservent: sheet.deservent_1_id,
            schimb: sheet.schimb
          }
        })
      : []
    const daysLeft = sezon ? Math.ceil((new Date(sezon.data_sfarsit) - new Date()) / 86400000) : null
    sendJson(res, 200, {
      sezon: sezon ? { denumire: sezon.denumire, data_start: sezon.data_start, data_sfarsit: sezon.data_sfarsit, zile_ramase: daysLeft } : null,
      luna_curenta: {
        zile_interventie: report.zile_interventie || 0,
        zile_dispozitie: report.zile_dispozitie || 0,
        sare_to: report.sare_totala_to || 0,
        cacl_to: report.cacl_total_to || 0,
        nisip_to: report.nisip_total_to || 0,
        cost_total: report.cost_total || 0
      },
      ultima_interventie: lastLog ? {
        data: lastLog.data,
        tip_interventie: lastLog.tip_interventie,
        nr_utilaje: snow.vehicleRouteSheets.filter(item => String(item.duty_log_id) === String(lastLog.id)).length
      } : null,
      utilaje_active_azi: activeToday,
      meteo_curent: await getMeteo()
    })
  } catch (error) {
    next(error)
  }
})

module.exports = router
