const { Router } = require('express')
const crypto = require('crypto')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { readDb, writeDb, runMssqlScalar, DB_MODE, MSSQL_RELATIONAL_MODE } = require('../../core/db')
const { addAudit } = require('../../core/audit')

const router = Router()

function isMssqlMode() { return MSSQL_RELATIONAL_MODE && (DB_MODE === 'mssql' || DB_MODE === 'sqlserver') }
function sendJson(res, status, data) { res.status(status).json(data) }
function nowIso() { return new Date().toISOString() }
function todayIso() { return new Date().toISOString().slice(0, 10) }
function nextId(items) { return items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1 }
function num(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback }
function daysUntil(date) { return date ? Math.ceil((new Date(date).getTime() - Date.now()) / 86400000) : null }
function mssqlJson(sql, params = {}) {
  const result = runMssqlScalar(`DECLARE @p nvarchar(max) = @json;\n${sql}`, { jsonInput: JSON.stringify(params) })
  return String(result || '').trim() ? JSON.parse(result) : null
}
function mssqlArray(sql, params = {}) { return mssqlJson(sql, params) || [] }
function mssqlObject(sql, params = {}) { return mssqlArray(sql, params)[0] || null }
function ensureDb(db) {
  db.environment = db.environment || {}
  for (const key of ['permits', 'wasteManifests', 'monitoring', 'incidents']) db.environment[key] = Array.isArray(db.environment[key]) ? db.environment[key] : []
  db.tickets = db.tickets || {}; db.tickets.tickets = Array.isArray(db.tickets.tickets) ? db.tickets.tickets : []
  return db.environment
}
function permitView(item) { const zile = daysUntil(item.data_expirare); return { ...item, zile_pana_expirare: zile } }

router.get('/environment/permits', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return
    if (!requirePermission(auth, res, 'environment:view')) return
    if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`
SELECT *, DATEDIFF(day, GETDATE(), data_expirare) AS zile_pana_expirare
FROM environment.permits
WHERE (NULLIF(JSON_VALUE(@p,'$.status'),'') IS NULL OR status = JSON_VALUE(@p,'$.status'))
AND (NULLIF(JSON_VALUE(@p,'$.tip'),'') IS NULL OR tip = JSON_VALUE(@p,'$.tip'))
ORDER BY data_expirare ASC FOR JSON PATH;`, req.query))
    const env = ensureDb(readDb())
    let rows = env.permits
    if (req.query.status) rows = rows.filter(x => x.status === req.query.status)
    if (req.query.tip) rows = rows.filter(x => x.tip === req.query.tip)
    sendJson(res, 200, rows.map(permitView))
  } catch (error) { next(error) }
})

router.post('/environment/permits', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return
    if (!requirePermission(auth, res, 'environment:manage')) return
    const db = readDb(); const body = { ...req.body, uuid: crypto.randomUUID() }
    if (isMssqlMode()) {
      const item = mssqlObject(`INSERT INTO environment.permits (uuid, tip, numar_document, emitent, data_emitere, data_expirare, status, responsabil_id, fisier_path, observatii)
VALUES (JSON_VALUE(@p,'$.uuid'), JSON_VALUE(@p,'$.tip'), JSON_VALUE(@p,'$.numar_document'), NULLIF(JSON_VALUE(@p,'$.emitent'),''), TRY_CONVERT(date,NULLIF(JSON_VALUE(@p,'$.data_emitere'),'')), TRY_CONVERT(date,NULLIF(JSON_VALUE(@p,'$.data_expirare'),'')), COALESCE(NULLIF(JSON_VALUE(@p,'$.status'),''),N'valida'), NULLIF(JSON_VALUE(@p,'$.responsabil_id'),''), NULLIF(JSON_VALUE(@p,'$.fisier_path'),''), NULLIF(JSON_VALUE(@p,'$.observatii'),''));
SELECT TOP 1 * FROM environment.permits WHERE id=SCOPE_IDENTITY() FOR JSON PATH;`, body)
      addAudit(db, auth.user, 'environment_permit_created', item?.numar_document); writeDb(db); return sendJson(res, 201, item)
    }
    const env = ensureDb(db); const item = { id: nextId(env.permits), ...body, status: body.status || 'valida', created_at: nowIso(), updated_at: null }
    env.permits.push(item); addAudit(db, auth.user, 'environment_permit_created', item.numar_document); writeDb(db); sendJson(res, 201, item)
  } catch (error) { next(error) }
})

router.post('/environment/permits/:id/renew', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return
    if (!requirePermission(auth, res, 'environment:manage')) return
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(`UPDATE environment.permits SET data_expirare=TRY_CONVERT(date,JSON_VALUE(@p,'$.data_expirare_noua')), numar_document=JSON_VALUE(@p,'$.nr_document_nou'), status=N'valida', updated_at=sysdatetime() WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')); SELECT TOP 1 * FROM environment.permits WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')) FOR JSON PATH;`, { ...req.body, id: req.params.id })
      addAudit(db, auth.user, 'environment_permit_renewed', req.params.id); writeDb(db); return sendJson(res, 200, item)
    }
    const env = ensureDb(db); const item = env.permits.find(x => String(x.id) === String(req.params.id)); if (!item) return sendJson(res, 404, { error: 'Autorizația nu a fost găsită.' })
    Object.assign(item, { data_expirare: req.body.data_expirare_noua, numar_document: req.body.nr_document_nou, status: 'valida', updated_at: nowIso() })
    addAudit(db, auth.user, 'environment_permit_renewed', item.id); writeDb(db); sendJson(res, 200, item)
  } catch (error) { next(error) }
})

router.get('/environment/waste-manifests', (req, res, next) => {
  try { const auth = requireAuth(req, res); if (!auth) return; if (!requirePermission(auth, res, 'environment:view')) return; if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`SELECT * FROM environment.waste_manifests ORDER BY data DESC FOR JSON PATH;`)); sendJson(res, 200, ensureDb(readDb()).wasteManifests) } catch (error) { next(error) }
})
router.post('/environment/waste-manifests', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return; if (!requirePermission(auth, res, 'environment:manage')) return
    const db = readDb(); const year = new Date().getFullYear()
    if (isMssqlMode()) {
      const item = mssqlObject(`DECLARE @nr int=(SELECT COUNT(*)+1 FROM environment.waste_manifests WHERE YEAR(created_at)=YEAR(GETDATE())); INSERT INTO environment.waste_manifests (uuid,nr_formular,data,tip_deseu,cantitate_kg,transportator,destinatar,status) VALUES (JSON_VALUE(@p,'$.uuid'),COALESCE(NULLIF(JSON_VALUE(@p,'$.nr_formular'),''),CONCAT(N'FM-',YEAR(GETDATE()),N'-',@nr)),TRY_CONVERT(date,JSON_VALUE(@p,'$.data')),NULLIF(JSON_VALUE(@p,'$.tip_deseu'),''),TRY_CONVERT(decimal(15,3),NULLIF(JSON_VALUE(@p,'$.cantitate_kg'),'')),NULLIF(JSON_VALUE(@p,'$.transportator'),''),NULLIF(JSON_VALUE(@p,'$.destinatar'),''),COALESCE(NULLIF(JSON_VALUE(@p,'$.status'),''),N'inregistrat')); SELECT TOP 1 * FROM environment.waste_manifests WHERE id=SCOPE_IDENTITY() FOR JSON PATH;`, { ...req.body, uuid: crypto.randomUUID() })
      addAudit(db, auth.user, 'environment_waste_manifest_created', item?.nr_formular); writeDb(db); return sendJson(res, 201, item)
    }
    const env = ensureDb(db); const item = { id: nextId(env.wasteManifests), uuid: crypto.randomUUID(), nr_formular: req.body.nr_formular || `FM-${year}-${env.wasteManifests.filter(x => String(x.created_at || '').startsWith(String(year))).length + 1}`, ...req.body, created_at: nowIso() }
    env.wasteManifests.push(item); addAudit(db, auth.user, 'environment_waste_manifest_created', item.nr_formular); writeDb(db); sendJson(res, 201, item)
  } catch (error) { next(error) }
})

router.get('/environment/monitoring', (req, res, next) => {
  try { const auth = requireAuth(req, res); if (!auth) return; if (!requirePermission(auth, res, 'environment:view')) return; if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`SELECT * FROM environment.monitoring ORDER BY data DESC FOR JSON PATH;`)); sendJson(res, 200, ensureDb(readDb()).monitoring) } catch (error) { next(error) }
})
router.post('/environment/monitoring', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return; if (!requirePermission(auth, res, 'environment:manage')) return
    const db = readDb(); const body = { ...req.body, uuid: crypto.randomUUID(), raportat_de: auth.user.id }
    if (isMssqlMode()) {
      const item = mssqlObject(`INSERT INTO environment.monitoring (uuid,tip,data,locatie,valoare,limita_legala,limite_depasit,observatii,raportat_de) VALUES (JSON_VALUE(@p,'$.uuid'),JSON_VALUE(@p,'$.tip'),COALESCE(TRY_CONVERT(datetime2,JSON_VALUE(@p,'$.data')),sysdatetime()),NULLIF(JSON_VALUE(@p,'$.locatie'),''),TRY_CONVERT(decimal(15,4),NULLIF(JSON_VALUE(@p,'$.valoare'),'')),TRY_CONVERT(decimal(15,4),NULLIF(JSON_VALUE(@p,'$.limita_legala'),'')),COALESCE(TRY_CONVERT(bit,JSON_VALUE(@p,'$.limite_depasit')),0),NULLIF(JSON_VALUE(@p,'$.observatii'),''),JSON_VALUE(@p,'$.raportat_de')); SELECT TOP 1 * FROM environment.monitoring WHERE id=SCOPE_IDENTITY() FOR JSON PATH;`, body)
      if (body.limite_depasit) runMssqlScalar(`INSERT INTO tickets.tickets (uuid,tip,prioritate,status,titlu,descriere,creat_de,created_at,updated_at) VALUES (CONVERT(char(36),NEWID()),N'sesizare',N'urgenta',N'deschis',CONCAT(N'Depășire limite monitorizare ',JSON_VALUE(@json,'$.tip')),NULLIF(JSON_VALUE(@json,'$.observatii'),''),JSON_VALUE(@json,'$.user_id'),sysdatetime(),sysdatetime()); SELECT 1;`, { jsonInput: JSON.stringify({ ...body, user_id: auth.user.id }) })
      addAudit(db, auth.user, 'environment_monitoring_created', item?.tip); writeDb(db); return sendJson(res, 201, item)
    }
    const env = ensureDb(db); const item = { id: nextId(env.monitoring), ...body, created_at: nowIso() }; env.monitoring.push(item)
    if (body.limite_depasit) db.tickets.tickets.push({ id: nextId(db.tickets.tickets), uuid: crypto.randomUUID(), tip: 'sesizare', prioritate: 'urgenta', status: 'deschis', titlu: `Depășire limite monitorizare ${body.tip}`, descriere: body.observatii || '', creat_de: auth.user.id, created_at: nowIso(), updated_at: nowIso() })
    addAudit(db, auth.user, 'environment_monitoring_created', item.tip); writeDb(db); sendJson(res, 201, item)
  } catch (error) { next(error) }
})

router.get('/environment/incidents', (req, res, next) => {
  try { const auth = requireAuth(req, res); if (!auth) return; if (!requirePermission(auth, res, 'environment:view')) return; if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`SELECT * FROM environment.incidents ORDER BY data DESC FOR JSON PATH;`)); sendJson(res, 200, ensureDb(readDb()).incidents) } catch (error) { next(error) }
})
router.post('/environment/incidents', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return; if (!requirePermission(auth, res, 'environment:manage')) return
    const db = readDb(); const body = { ...req.body, uuid: crypto.randomUUID(), raportat_de: auth.user.id }
    if (isMssqlMode()) {
      const item = mssqlObject(`INSERT INTO environment.incidents (uuid,tip,data,locatie,descriere,severitate,status,raportat_de) VALUES (JSON_VALUE(@p,'$.uuid'),JSON_VALUE(@p,'$.tip'),COALESCE(TRY_CONVERT(datetime2,JSON_VALUE(@p,'$.data')),sysdatetime()),NULLIF(JSON_VALUE(@p,'$.locatie'),''),NULLIF(JSON_VALUE(@p,'$.descriere'),''),NULLIF(JSON_VALUE(@p,'$.severitate'),''),COALESCE(NULLIF(JSON_VALUE(@p,'$.status'),''),N'deschis'),JSON_VALUE(@p,'$.raportat_de')); SELECT TOP 1 * FROM environment.incidents WHERE id=SCOPE_IDENTITY() FOR JSON PATH;`, body)
      addAudit(db, auth.user, 'environment_incident_created', item?.uuid); writeDb(db); return sendJson(res, 201, item)
    }
    const env = ensureDb(db); const item = { id: nextId(env.incidents), ...body, status: body.status || 'deschis', created_at: nowIso() }; env.incidents.push(item); addAudit(db, auth.user, 'environment_incident_created', item.uuid); writeDb(db); sendJson(res, 201, item)
  } catch (error) { next(error) }
})

router.get('/environment/alerts', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return
    if (!requirePermission(auth, res, 'environment:view')) return
    if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`SELECT *, DATEDIFF(day, GETDATE(), data_expirare) AS zile_pana_expirare FROM environment.permits WHERE DATEDIFF(day, GETDATE(), data_expirare) <= 60 AND status = N'valida' ORDER BY data_expirare ASC FOR JSON PATH;`))
    sendJson(res, 200, ensureDb(readDb()).permits.map(permitView).filter(x => x.status === 'valida' && x.zile_pana_expirare <= 60).sort((a, b) => String(a.data_expirare).localeCompare(String(b.data_expirare))))
  } catch (error) { next(error) }
})

module.exports = router
