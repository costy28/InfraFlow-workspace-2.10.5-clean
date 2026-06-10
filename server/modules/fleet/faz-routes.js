const { Router } = require('express')
const crypto = require('crypto')
const sql = require('mssql')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { readDb, writeDb, runMssqlScalar, DB_MODE, MSSQL_RELATIONAL_MODE } = require('../../core/db')
const { addAudit } = require('../../core/audit')

const router = Router()
const STATUSES = new Set(['draft', 'completat', 'semnat', 'aprobat'])

function sendJson(res, status, data) {
  res.status(status).json(data)
}

function nowIso() {
  return new Date().toISOString()
}

function todayIso() {
  return nowIso().slice(0, 10)
}

function uuid() {
  return crypto.randomUUID()
}

function isMssqlMode() {
  return MSSQL_RELATIONAL_MODE && (DB_MODE === 'mssql' || DB_MODE === 'sqlserver')
}

function mssqlJson(query, params = {}) {
  const result = runMssqlScalar(`DECLARE @p nvarchar(max) = @json;\n${query}`, { jsonInput: JSON.stringify(params) })
  return String(result || '').trim() ? JSON.parse(result) : null
}

function mssqlArray(query, params = {}) {
  return mssqlJson(query, params) || []
}

function mssqlObject(query, params = {}) {
  return mssqlArray(query, params)[0] || null
}

function ensureFazDb(db) {
  db.fazLogs = Array.isArray(db.fazLogs) ? db.fazLogs : []
  db.fazNomenclator = Array.isArray(db.fazNomenclator) ? db.fazNomenclator : []
  if (!db.fleet || typeof db.fleet !== 'object') db.fleet = {}
  db.fleet.fazLogs = db.fazLogs
  db.fleet.fazNomenclator = db.fazNomenclator
  if (!Array.isArray(db.audit)) db.audit = []
  return db.fazLogs
}

function numberValue(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function nullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function normalizeDate(value, fallback = todayIso()) {
  const text = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback
}

function monthFrom(value) {
  const text = String(value || '').slice(0, 7)
  return /^\d{4}-\d{2}$/.test(text) ? text : todayIso().slice(0, 7)
}

function nextId(rows) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id || 0)), 0) + 1
}

function assetList(db) {
  return Array.isArray(db.fleetAssets) ? db.fleetAssets : (db.fleet?.assets || [])
}

function assetId(asset) {
  return String(asset?.id ?? asset?.asset_id ?? '')
}

function findAsset(db, id) {
  return assetList(db).find(asset => assetId(asset) === String(id))
}

function assetLabel(asset) {
  if (!asset) return '-'
  return [
    asset.cod || asset.nr_inmatriculare || asset.registration || asset.assetCode || asset.nr_inventar,
    [asset.marca || asset.brand, asset.model].filter(Boolean).join(' ')
  ].filter(Boolean).join(' / ') || asset.name || `#${asset.id}`
}

function assetHourlyConsumption(asset = {}) {
  return numberValue(
    asset.consum_orar_normat ??
    asset.consumOrarNormat ??
    asset.consum_orar ??
    asset.consumUtilaj ??
    asset.ConsumUtilaj ??
    asset.standardConsumptionHour,
    0
  )
}

function nomenclatorList(db) {
  ensureFazDb(db)
  return db.fazNomenclator.filter(item => item.activ !== false && item.activ !== 0)
}

function findActivity(db, id) {
  return nomenclatorList(db).find(item => String(item.id) === String(id))
}

function activityLabel(activity) {
  return activity ? [activity.cod, activity.denumire].filter(Boolean).join(' - ') : '-'
}

function calculations(row) {
  const oreZi = row.index_stop !== null && row.index_start !== null ? round2(numberValue(row.index_stop) - numberValue(row.index_start)) : null
  const normat = row.ore_lucrate !== null && row.consum_orar_normat !== null ? round2(numberValue(row.ore_lucrate) * numberValue(row.consum_orar_normat)) : null
  const diferenta = row.consum_efectiv !== null && normat !== null ? round2(numberValue(row.consum_efectiv) - normat) : null
  const procent = normat && row.consum_efectiv !== null ? round2((numberValue(row.consum_efectiv) / normat) * 100) : null
  const abatere = normat && diferenta !== null ? Math.abs(diferenta) / normat : 0
  const semafor = !normat || abatere <= 0.1 ? 'verde' : abatere <= 0.25 ? 'galben' : 'rosu'
  return { ore_zi: oreZi, consum_normat: normat, diferenta_consum: diferenta, procent_consum: procent, semafor }
}

function normalizeFaz(db, row = {}) {
  const asset = findAsset(db, row.utilaj_id)
  const activity = findActivity(db, row.tip_activitate_id)
  const calc = calculations(row)
  return {
    ...row,
    ...calc,
    utilaj: asset,
    utilaj_label: assetLabel(asset),
    activitate: activity,
    activitate_label: activityLabel(activity)
  }
}

function bodyToFazFields(target, body, db) {
  if (body.utilaj_id !== undefined) target.utilaj_id = body.utilaj_id
  if (body.asset_id !== undefined) target.utilaj_id = body.asset_id
  if (body.operator_name !== undefined) target.operator_name = String(body.operator_name || '').trim()
  if (body.data !== undefined) target.data = normalizeDate(body.data)
  if (body.locatie !== undefined) target.locatie = String(body.locatie || '').trim()
  if (body.tip_activitate_id !== undefined) target.tip_activitate_id = body.tip_activitate_id || null
  for (const field of ['index_start', 'index_stop', 'ore_lucrate', 'carburant_primit', 'consum_orar_normat', 'consum_efectiv']) {
    if (body[field] !== undefined) target[field] = nullableNumber(body[field])
  }
  if (body.observatii !== undefined) target.observatii = String(body.observatii || '').trim()
  if (body.scan_path !== undefined) target.scan_path = String(body.scan_path || '').trim()
  const asset = findAsset(db, target.utilaj_id)
  if ((target.consum_orar_normat === null || target.consum_orar_normat === undefined) && assetHourlyConsumption(asset)) {
    target.consum_orar_normat = assetHourlyConsumption(asset)
  }
}

function validateFaz(db, row) {
  if (!findAsset(db, row.utilaj_id)) return 'Utilajul este obligatoriu si trebuie sa existe in parc.'
  if (!normalizeDate(row.data, '')) return 'Data FAZ este obligatorie.'
  if (!String(row.locatie || '').trim()) return 'Locatia este obligatorie. In Autominder, Activitate inseamna locatia.'
  if (row.index_start !== null && row.index_stop !== null && numberValue(row.index_stop) < numberValue(row.index_start)) return 'Index stop nu poate fi mai mic decat index start.'
  if (row.status && !STATUSES.has(row.status)) return 'Status FAZ invalid.'
  return null
}

function userHasAny(auth, permissions) {
  const user = auth?.user || {}
  if (['superadmin', 'admin'].includes(user.role)) return true
  const granted = Array.isArray(user.permissions) ? user.permissions : []
  return permissions.some(permission => granted.includes(permission))
}

function requireAnyPermission(auth, res, permissions) {
  if (userHasAny(auth, permissions)) return true
  return requirePermission(auth, res, permissions[0])
}

function canReadFaz(auth, res) {
  return requireAnyPermission(auth, res, ['fleet:faz_view', 'fleet:fc_view'])
}

function canCreateFaz(auth, res) {
  return requireAnyPermission(auth, res, ['fleet:faz_create', 'fleet:fc_create'])
}

function canEditFaz(auth, res) {
  return requireAnyPermission(auth, res, ['fleet:faz_edit', 'fleet:fc_edit'])
}

function canApproveFaz(auth, res) {
  return requireAnyPermission(auth, res, ['fleet:faz_approve', 'fleet:fc_complete'])
}

function filterRows(rows, query) {
  let filtered = rows.filter(row => !row.cancelled_at && !row.cancelledAt)
  if (query.utilaj_id) filtered = filtered.filter(row => String(row.utilaj_id) === String(query.utilaj_id))
  if (query.asset_id) filtered = filtered.filter(row => String(row.utilaj_id) === String(query.asset_id))
  if (query.status) filtered = filtered.filter(row => row.status === query.status)
  if (query.data_de) filtered = filtered.filter(row => String(row.data || '') >= String(query.data_de).slice(0, 10))
  if (query.data_pana) filtered = filtered.filter(row => String(row.data || '') <= String(query.data_pana).slice(0, 10))
  if (query.luna) filtered = filtered.filter(row => String(row.data || '').startsWith(String(query.luna).slice(0, 7)))
  return filtered
}

function mssqlSelectRows(query = {}) {
  return mssqlArray(`
    SELECT l.*, a.denumire AS activitate_denumire, a.cod AS activitate_cod
    FROM dbo.fleet_faz_logs l
    LEFT JOIN dbo.fleet_faz_nomenclator a ON a.id = l.tip_activitate_id
    WHERE l.cancelled_at IS NULL
      AND (NULLIF(JSON_VALUE(@p, '$.utilaj_id'), '') IS NULL OR l.utilaj_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.utilaj_id')))
      AND (NULLIF(JSON_VALUE(@p, '$.asset_id'), '') IS NULL OR l.utilaj_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.asset_id')))
      AND (NULLIF(JSON_VALUE(@p, '$.status'), '') IS NULL OR l.status = JSON_VALUE(@p, '$.status'))
      AND (NULLIF(JSON_VALUE(@p, '$.data_de'), '') IS NULL OR l.data >= TRY_CONVERT(date, JSON_VALUE(@p, '$.data_de')))
      AND (NULLIF(JSON_VALUE(@p, '$.data_pana'), '') IS NULL OR l.data <= TRY_CONVERT(date, JSON_VALUE(@p, '$.data_pana')))
      AND (NULLIF(JSON_VALUE(@p, '$.luna'), '') IS NULL OR CONVERT(nvarchar(7), l.data, 120) = LEFT(JSON_VALUE(@p, '$.luna'), 7))
    ORDER BY l.data DESC, l.id DESC
    FOR JSON PATH;
  `, query)
}

function mssqlFind(uuidValue) {
  return mssqlObject(`
    SELECT TOP 1 * FROM dbo.fleet_faz_logs WHERE uuid = JSON_VALUE(@p, '$.uuid') AND cancelled_at IS NULL FOR JSON PATH;
  `, { uuid: uuidValue })
}

function mssqlInsert(body, userId) {
  return mssqlObject(`
    INSERT INTO dbo.fleet_faz_logs
      (uuid, utilaj_id, operator_name, data, locatie, tip_activitate_id, index_start, index_stop, ore_lucrate, carburant_primit, consum_orar_normat, consum_efectiv, observatii, scan_path, status, autominder_id)
    VALUES
      (JSON_VALUE(@p, '$.uuid'), TRY_CONVERT(int, JSON_VALUE(@p, '$.utilaj_id')), NULLIF(JSON_VALUE(@p, '$.operator_name'), ''),
       TRY_CONVERT(date, JSON_VALUE(@p, '$.data')), NULLIF(JSON_VALUE(@p, '$.locatie'), ''), TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.tip_activitate_id'), '')),
       TRY_CONVERT(decimal(10,2), NULLIF(JSON_VALUE(@p, '$.index_start'), '')), TRY_CONVERT(decimal(10,2), NULLIF(JSON_VALUE(@p, '$.index_stop'), '')),
       TRY_CONVERT(decimal(4,2), NULLIF(JSON_VALUE(@p, '$.ore_lucrate'), '')), TRY_CONVERT(decimal(8,2), NULLIF(JSON_VALUE(@p, '$.carburant_primit'), '')),
       TRY_CONVERT(decimal(6,2), NULLIF(JSON_VALUE(@p, '$.consum_orar_normat'), '')), TRY_CONVERT(decimal(8,2), NULLIF(JSON_VALUE(@p, '$.consum_efectiv'), '')),
       NULLIF(JSON_VALUE(@p, '$.observatii'), ''), NULLIF(JSON_VALUE(@p, '$.scan_path'), ''), N'draft', TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.autominder_id'), '')));
    SELECT TOP 1 * FROM dbo.fleet_faz_logs WHERE uuid = JSON_VALUE(@p, '$.uuid') FOR JSON PATH;
  `, { ...body, uuid: body.uuid || uuid(), userId })
}

function mssqlPatch(uuidValue, body) {
  return mssqlObject(`
    UPDATE dbo.fleet_faz_logs SET
      utilaj_id = COALESCE(TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.utilaj_id'), '')), utilaj_id),
      operator_name = COALESCE(NULLIF(JSON_VALUE(@p, '$.operator_name'), ''), operator_name),
      data = COALESCE(TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.data'), '')), data),
      locatie = COALESCE(NULLIF(JSON_VALUE(@p, '$.locatie'), ''), locatie),
      tip_activitate_id = COALESCE(TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.tip_activitate_id'), '')), tip_activitate_id),
      index_start = COALESCE(TRY_CONVERT(decimal(10,2), NULLIF(JSON_VALUE(@p, '$.index_start'), '')), index_start),
      index_stop = COALESCE(TRY_CONVERT(decimal(10,2), NULLIF(JSON_VALUE(@p, '$.index_stop'), '')), index_stop),
      ore_lucrate = COALESCE(TRY_CONVERT(decimal(4,2), NULLIF(JSON_VALUE(@p, '$.ore_lucrate'), '')), ore_lucrate),
      carburant_primit = COALESCE(TRY_CONVERT(decimal(8,2), NULLIF(JSON_VALUE(@p, '$.carburant_primit'), '')), carburant_primit),
      consum_orar_normat = COALESCE(TRY_CONVERT(decimal(6,2), NULLIF(JSON_VALUE(@p, '$.consum_orar_normat'), '')), consum_orar_normat),
      consum_efectiv = COALESCE(TRY_CONVERT(decimal(8,2), NULLIF(JSON_VALUE(@p, '$.consum_efectiv'), '')), consum_efectiv),
      observatii = COALESCE(NULLIF(JSON_VALUE(@p, '$.observatii'), ''), observatii),
      scan_path = COALESCE(NULLIF(JSON_VALUE(@p, '$.scan_path'), ''), scan_path),
      updated_at = SYSDATETIME()
    WHERE uuid = JSON_VALUE(@p, '$.uuid') AND status = N'draft';
    SELECT TOP 1 * FROM dbo.fleet_faz_logs WHERE uuid = JSON_VALUE(@p, '$.uuid') FOR JSON PATH;
  `, { ...body, uuid: uuidValue })
}

function csvEscape(value) {
  const text = String(value ?? '')
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvForRows(rows) {
  const headers = ['Data', 'Utilaj', 'Operator', 'Locatie', 'Ore lucrate', 'Carburant primit', 'Consum normat', 'Consum efectiv', 'Diferenta', 'Procent', 'Status']
  const lines = rows.map(row => [
    row.data,
    row.utilaj_label,
    row.operator_name,
    row.locatie,
    row.ore_lucrate,
    row.carburant_primit,
    row.consum_normat,
    row.consum_efectiv,
    row.diferenta_consum,
    row.procent_consum,
    row.status
  ].map(csvEscape).join(';'))
  return [headers.join(';'), ...lines].join('\r\n')
}

router.get('/fleet/faz/nomenclator', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canReadFaz(auth, res)) return
    if (isMssqlMode()) return sendJson(res, 200, { activities: mssqlArray('SELECT id, cod, denumire, activ FROM dbo.fleet_faz_nomenclator WHERE activ = 1 ORDER BY id FOR JSON PATH;') })
    const db = readDb()
    sendJson(res, 200, { activities: nomenclatorList(db) })
  } catch (error) {
    next(error)
  }
})

router.get('/fleet/faz/raport-lunar', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canReadFaz(auth, res)) return
    const db = readDb()
    const luna = monthFrom(req.query.luna)
    const rows = (isMssqlMode() ? mssqlSelectRows({ ...req.query, luna }) : filterRows(ensureFazDb(db), { ...req.query, luna }))
      .map(row => normalizeFaz(db, row))
    const total = rows.reduce((sum, row) => ({
      total_ore: round2(sum.total_ore + numberValue(row.ore_lucrate)),
      total_combustibil: round2(sum.total_combustibil + numberValue(row.consum_efectiv)),
      total_normat: round2(sum.total_normat + numberValue(row.consum_normat)),
      diferenta_consum: round2(sum.diferenta_consum + numberValue(row.diferenta_consum))
    }), { total_ore: 0, total_combustibil: 0, total_normat: 0, diferenta_consum: 0 })
    const days = new Set(rows.map(row => row.data).filter(Boolean))
    sendJson(res, 200, { luna, utilaj_id: req.query.utilaj_id || req.query.asset_id || null, zile_lucrate: days.size, ...total, rows })
  } catch (error) {
    next(error)
  }
})

router.get('/fleet/faz/export-csv', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canReadFaz(auth, res)) return
    const db = readDb()
    const rows = (isMssqlMode() ? mssqlSelectRows(req.query) : filterRows(ensureFazDb(db), req.query)).map(row => normalizeFaz(db, row))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="FAZ_${monthFrom(req.query.luna || todayIso())}.csv"`)
    res.send(csvForRows(rows))
  } catch (error) {
    next(error)
  }
})

router.get('/fleet/faz', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canReadFaz(auth, res)) return
    const db = readDb()
    const rows = (isMssqlMode() ? mssqlSelectRows(req.query) : filterRows(ensureFazDb(db), req.query))
      .map(row => normalizeFaz(db, row))
      .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || Number(b.id || 0) - Number(a.id || 0))
    sendJson(res, 200, { faz_logs: rows })
  } catch (error) {
    next(error)
  }
})

router.post('/fleet/faz', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canCreateFaz(auth, res)) return
    const db = readDb()
    const body = req.body || {}
    const rows = ensureFazDb(db)
    const faz = {
      id: nextId(rows),
      uuid: uuid(),
      utilaj_id: body.utilaj_id || body.asset_id || '',
      operator_name: '',
      data: todayIso(),
      locatie: '',
      tip_activitate_id: null,
      index_start: null,
      index_stop: null,
      ore_lucrate: null,
      carburant_primit: null,
      consum_orar_normat: null,
      consum_efectiv: null,
      observatii: '',
      scan_path: '',
      status: 'draft',
      semnat_operator_la: null,
      aprobat_de: null,
      aprobat_la: null,
      autominder_id: body.autominder_id || null,
      cancelled_at: null,
      cancelled_by: null,
      cancelled_reason: null,
      created_by: auth.user.id,
      created_at: nowIso(),
      updated_at: nowIso()
    }
    bodyToFazFields(faz, body, db)
    const error = validateFaz(db, faz)
    if (error) return sendJson(res, 422, { error })
    if (isMssqlMode()) {
      const created = mssqlInsert(faz, auth.user.id)
      addAudit(db, auth.user, 'faz_utilaj_creata', `${assetLabel(findAsset(db, faz.utilaj_id))} / ${faz.data}`)
      writeDb(db)
      return sendJson(res, 201, { faz_log: normalizeFaz(db, created) })
    }
    rows.push(faz)
    addAudit(db, auth.user, 'faz_utilaj_creata', `${assetLabel(findAsset(db, faz.utilaj_id))} / ${faz.data}`)
    writeDb(db)
    sendJson(res, 201, { faz_log: normalizeFaz(db, faz) })
  } catch (error) {
    next(error)
  }
})

router.get('/fleet/faz/:uuid', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canReadFaz(auth, res)) return
    const db = readDb()
    const row = isMssqlMode() ? mssqlFind(req.params.uuid) : ensureFazDb(db).find(item => item.uuid === req.params.uuid)
    if (!row) return sendJson(res, 404, { error: 'FAZ nu exista.' })
    sendJson(res, 200, { faz_log: normalizeFaz(db, row) })
  } catch (error) {
    next(error)
  }
})

router.patch('/fleet/faz/:uuid', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canEditFaz(auth, res)) return
    const db = readDb()
    const rows = ensureFazDb(db)
    const row = isMssqlMode() ? mssqlFind(req.params.uuid) : rows.find(item => item.uuid === req.params.uuid)
    if (!row) return sendJson(res, 404, { error: 'FAZ nu exista.' })
    if (row.status !== 'draft') return sendJson(res, 409, { error: 'FAZ poate fi modificat doar cat este draft.' })
    bodyToFazFields(row, req.body || {}, db)
    row.updated_at = nowIso()
    const error = validateFaz(db, row)
    if (error) return sendJson(res, 422, { error })
    if (isMssqlMode()) {
      const updated = mssqlPatch(req.params.uuid, row)
      addAudit(db, auth.user, 'faz_utilaj_editata', `${row.uuid} / ${row.data}`)
      writeDb(db)
      return sendJson(res, 200, { faz_log: normalizeFaz(db, updated) })
    }
    addAudit(db, auth.user, 'faz_utilaj_editata', `${row.uuid} / ${row.data}`)
    writeDb(db)
    sendJson(res, 200, { faz_log: normalizeFaz(db, row) })
  } catch (error) {
    next(error)
  }
})

router.post('/fleet/faz/:uuid/sign', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canEditFaz(auth, res)) return
    const db = readDb()
    const row = isMssqlMode() ? mssqlFind(req.params.uuid) : ensureFazDb(db).find(item => item.uuid === req.params.uuid)
    if (!row) return sendJson(res, 404, { error: 'FAZ nu exista.' })
    if (!['draft', 'completat'].includes(row.status)) return sendJson(res, 409, { error: 'FAZ nu mai poate fi semnat in statusul curent.' })
    if (isMssqlMode()) {
      const updated = mssqlObject(`UPDATE dbo.fleet_faz_logs SET status=N'semnat', semnat_operator_la=SYSDATETIME(), updated_at=SYSDATETIME() WHERE uuid=JSON_VALUE(@p,'$.uuid'); SELECT TOP 1 * FROM dbo.fleet_faz_logs WHERE uuid=JSON_VALUE(@p,'$.uuid') FOR JSON PATH;`, req.params)
      addAudit(db, auth.user, 'faz_utilaj_semnata', req.params.uuid)
      writeDb(db)
      return sendJson(res, 200, { faz_log: normalizeFaz(db, updated) })
    }
    row.status = 'semnat'
    row.semnat_operator_la = nowIso()
    row.updated_at = nowIso()
    addAudit(db, auth.user, 'faz_utilaj_semnata', row.uuid)
    writeDb(db)
    sendJson(res, 200, { faz_log: normalizeFaz(db, row) })
  } catch (error) {
    next(error)
  }
})

router.post('/fleet/faz/:uuid/approve', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canApproveFaz(auth, res)) return
    const db = readDb()
    const row = isMssqlMode() ? mssqlFind(req.params.uuid) : ensureFazDb(db).find(item => item.uuid === req.params.uuid)
    if (!row) return sendJson(res, 404, { error: 'FAZ nu exista.' })
    if (!['semnat', 'completat'].includes(row.status)) return sendJson(res, 409, { error: 'Doar FAZ semnat sau completat poate fi aprobat.' })
    if (isMssqlMode()) {
      const updated = mssqlObject(`UPDATE dbo.fleet_faz_logs SET status=N'aprobat', aprobat_de=JSON_VALUE(@p,'$.userId'), aprobat_la=SYSDATETIME(), updated_at=SYSDATETIME() WHERE uuid=JSON_VALUE(@p,'$.uuid'); SELECT TOP 1 * FROM dbo.fleet_faz_logs WHERE uuid=JSON_VALUE(@p,'$.uuid') FOR JSON PATH;`, { uuid: req.params.uuid, userId: auth.user.id })
      addAudit(db, auth.user, 'faz_utilaj_aprobata', req.params.uuid)
      writeDb(db)
      return sendJson(res, 200, { faz_log: normalizeFaz(db, updated) })
    }
    row.status = 'aprobat'
    row.aprobat_de = auth.user.id
    row.aprobat_la = nowIso()
    row.updated_at = nowIso()
    addAudit(db, auth.user, 'faz_utilaj_aprobata', row.uuid)
    writeDb(db)
    sendJson(res, 200, { faz_log: normalizeFaz(db, row) })
  } catch (error) {
    next(error)
  }
})

router.delete('/fleet/faz/:uuid', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canEditFaz(auth, res)) return
    const db = readDb()
    const rows = ensureFazDb(db)
    const row = isMssqlMode() ? mssqlFind(req.params.uuid) : rows.find(item => item.uuid === req.params.uuid)
    if (!row) return sendJson(res, 404, { error: 'FAZ nu exista.' })
    if (row.status !== 'draft') return sendJson(res, 409, { error: 'Doar FAZ draft poate fi sters.' })
    if (isMssqlMode()) {
      mssqlObject(`UPDATE dbo.fleet_faz_logs SET cancelled_at=SYSDATETIME(), cancelled_by=JSON_VALUE(@p,'$.userId'), cancelled_reason=N'Anulat din interfata FAZ', updated_at=SYSDATETIME() WHERE uuid=JSON_VALUE(@p,'$.uuid') AND status=N'draft'; SELECT 1 AS ok FOR JSON PATH;`, { uuid: req.params.uuid, userId: auth.user.id })
      addAudit(db, auth.user, 'faz_utilaj_stearsa', req.params.uuid)
      writeDb(db)
      return res.status(204).end()
    }
    row.cancelled_at = nowIso()
    row.cancelled_by = auth.user.id
    row.cancelled_reason = 'Anulat din interfata FAZ'
    row.updated_at = nowIso()
    addAudit(db, auth.user, 'faz_utilaj_stearsa', row.uuid)
    writeDb(db)
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

router.post('/fleet/faz/import-autominder', async (req, res, next) => {
  let pool
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canCreateFaz(auth, res)) return
    const db = readDb()
    const connectionString = req.body?.connection_string || db.settings?.autominderConnectionString || db.integration?.autominder?.connectionString
    if (!connectionString) return sendJson(res, 422, { error: 'Lipseste connection_string pentru baza Autominder.' })
    const dataDe = normalizeDate(req.body?.data_de, todayIso())
    const dataPana = normalizeDate(req.body?.data_pana, dataDe)
    const utilajIds = Array.isArray(req.body?.utilaj_ids) ? req.body.utilaj_ids.map(String) : []
    pool = await new sql.ConnectionPool(connectionString).connect()
    const request = pool.request()
    request.input('dataDe', sql.Date, dataDe)
    request.input('dataPana', sql.Date, dataPana)
    const result = await request.query(`
      SELECT ActivitateID, CodUtilaj, Data, Activitate, Operator, OreLucrate, ConsumUtilaj, Motorina, IndexStart, IndexStop
      FROM Utilaje_FAZ
      WHERE Data >= @dataDe AND Data <= @dataPana
      ORDER BY Data, CodUtilaj
    `)
    const rows = ensureFazDb(db)
    let imported = 0
    let skipped = 0
    for (const item of result.recordset || []) {
      if (rows.some(row => String(row.autominder_id || '') === String(item.ActivitateID || ''))) {
        skipped += 1
        continue
      }
      const asset = assetList(db).find(row => String(row.cod || row.assetCode || row.nr_inventar || row.id) === String(item.CodUtilaj))
      if (!asset || (utilajIds.length && !utilajIds.includes(String(asset.id)))) {
        skipped += 1
        continue
      }
      const faz = {
        id: nextId(rows),
        uuid: uuid(),
        utilaj_id: asset.id,
        operator_name: String(item.Operator || ''),
        data: normalizeDate(item.Data),
        locatie: String(item.Activitate || '').trim(),
        tip_activitate_id: null,
        index_start: nullableNumber(item.IndexStart),
        index_stop: nullableNumber(item.IndexStop),
        ore_lucrate: nullableNumber(item.OreLucrate),
        carburant_primit: null,
        consum_orar_normat: nullableNumber(item.ConsumUtilaj) || assetHourlyConsumption(asset) || null,
        consum_efectiv: nullableNumber(item.Motorina),
        observatii: 'Import Autominder Utilaje_FAZ',
        scan_path: '',
        status: 'completat',
        semnat_operator_la: null,
        aprobat_de: null,
        aprobat_la: null,
        autominder_id: item.ActivitateID,
        created_by: auth.user.id,
        created_at: nowIso(),
        updated_at: nowIso()
      }
      rows.push(faz)
      imported += 1
    }
    addAudit(db, auth.user, 'faz_import_autominder', `${dataDe} - ${dataPana}: ${imported} importate, ${skipped} sarite`)
    writeDb(db)
    sendJson(res, 200, { imported, skipped })
  } catch (error) {
    next(error)
  } finally {
    if (pool) await pool.close().catch(() => {})
  }
})

module.exports = router
