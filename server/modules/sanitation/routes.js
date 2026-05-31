const { Router } = require('express')
const crypto = require('crypto')
const xlsx = require('xlsx')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { readDb, writeDb, runMssqlScalar, DB_MODE } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const { insertCostEntry } = require('../controlling/auto-register')

const router = Router()

function isMssqlMode() {
  return DB_MODE === 'mssql' || DB_MODE === 'sqlserver'
}

function sendJson(res, status, data) {
  res.status(status).json(data)
}

function nowIso() {
  return new Date().toISOString()
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1
}

function mssqlJson(sql, params = {}) {
  const result = runMssqlScalar(`DECLARE @p nvarchar(max) = @json;\n${sql}`, { jsonInput: JSON.stringify(params) })
  if (!String(result || '').trim()) return null
  return JSON.parse(result)
}

function mssqlArray(sql, params = {}) {
  return mssqlJson(sql, params) || []
}

function mssqlObject(sql, params = {}) {
  return mssqlArray(sql, params)[0] || null
}

function ensureSanitationDb(db) {
  db.sanitation = db.sanitation || {}
  db.sanitation.zones = Array.isArray(db.sanitation.zones) ? db.sanitation.zones : []
  db.sanitation.routes = Array.isArray(db.sanitation.routes) ? db.sanitation.routes : []
  db.sanitation.routeStops = Array.isArray(db.sanitation.routeStops) ? db.sanitation.routeStops : []
  db.sanitation.collections = Array.isArray(db.sanitation.collections) ? db.sanitation.collections : []
  db.sanitation.wasteRecords = Array.isArray(db.sanitation.wasteRecords) ? db.sanitation.wasteRecords : []
  db.sanitation.monthlyReports = Array.isArray(db.sanitation.monthlyReports) ? db.sanitation.monthlyReports : []
  return db.sanitation
}

function ensureDocumentsDb(db) {
  db.documents = db.documents || {}
  db.documents.documentTypes = Array.isArray(db.documents.documentTypes) ? db.documents.documentTypes : []
  db.documents.documents = Array.isArray(db.documents.documents) ? db.documents.documents : []
  return db.documents
}

function userName(db, id) {
  const user = (db.users || db.core?.users || []).find((item) => String(item.id) === String(id))
  return [user?.firstName || user?.prenume, user?.lastName || user?.nume].filter(Boolean).join(' ') || user?.name || ''
}

function routeName(sanitation, id) {
  return sanitation.routes.find((item) => String(item.id) === String(id))?.denumire || ''
}

function zoneName(sanitation, id) {
  return sanitation.zones.find((item) => String(item.id) === String(id))?.denumire || ''
}

function sanitationCostCenter(db) {
  const centers = db.controlling?.costCenters || []
  return centers.find((item) => String(item.cod || '').toUpperCase().includes('SALUB')) || null
}

function monthBounds(month) {
  const luna = String(month || todayIso().slice(0, 7)).slice(0, 7)
  return { luna, start: `${luna}-01`, end: `${luna}-${String(new Date(Number(luna.slice(0, 4)), Number(luna.slice(5, 7)), 0).getDate()).padStart(2, '0')}` }
}

async function registerCollectionCost(collection, db, value) {
  const center = isMssqlMode()
    ? mssqlObject(`
SELECT TOP 1 id
FROM controlling.cost_centers
WHERE cod LIKE N'%SALUB%'
AND activ = 1
FOR JSON PATH;
`)
    : sanitationCostCenter(db)
  if (!center) return
  await insertCostEntry({
    company_id: collection.company_id || 1,
    cost_center_id: center.id,
    data: collection.data || todayIso(),
    categorie: 'alte_cheltuieli',
    valoare: numberValue(value),
    sursa: 'manual',
    sursa_ref_id: String(collection.id || collection.uuid),
    descriere: `Colectare salubrizare ${collection.uuid || ''}`.trim(),
    inregistrat_de: collection.raportat_de
  }, db)
}

router.get('/sanitation/zones', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'sanitation:view')) return
    if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`SELECT * FROM sanitation.zones WHERE activ = 1 ORDER BY denumire FOR JSON PATH;`))
    sendJson(res, 200, ensureSanitationDb(readDb()).zones.filter((item) => item.activ !== false && item.activ !== 0))
  } catch (error) {
    next(error)
  }
})

router.post('/sanitation/zones', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'sanitation:manage')) return
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(`
INSERT INTO sanitation.zones (cod, denumire, descriere, geojson)
VALUES (JSON_VALUE(@p, '$.cod'), JSON_VALUE(@p, '$.denumire'), NULLIF(JSON_VALUE(@p, '$.descriere'), ''), NULLIF(JSON_VALUE(@p, '$.geojson'), ''));
SELECT TOP 1 * FROM sanitation.zones WHERE id = SCOPE_IDENTITY() FOR JSON PATH;
`, req.body)
      addAudit(db, auth.user, 'sanitation_zone_created', item?.denumire)
      writeDb(db)
      return sendJson(res, 201, item)
    }
    const sanitation = ensureSanitationDb(db)
    const item = { id: nextId(sanitation.zones), ...req.body, activ: true, created_at: nowIso(), updated_at: null }
    sanitation.zones.push(item)
    addAudit(db, auth.user, 'sanitation_zone_created', item.denumire)
    writeDb(db)
    sendJson(res, 201, item)
  } catch (error) {
    next(error)
  }
})

router.get('/sanitation/routes', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'sanitation:view')) return
    if (isMssqlMode()) {
      return sendJson(res, 200, mssqlArray(`
SELECT r.*, z.denumire AS zona_denumire
FROM sanitation.routes r
LEFT JOIN sanitation.zones z ON z.id = r.zone_id
WHERE r.activ = 1
ORDER BY r.denumire
FOR JSON PATH;
`))
    }
    const db = readDb()
    const sanitation = ensureSanitationDb(db)
    sendJson(res, 200, sanitation.routes.filter((item) => item.activ !== false && item.activ !== 0).map((item) => ({ ...item, zona_denumire: zoneName(sanitation, item.zone_id) })))
  } catch (error) {
    next(error)
  }
})

router.post('/sanitation/routes', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'sanitation:manage')) return
    const body = req.body || {}
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(`
INSERT INTO sanitation.routes (uuid, zone_id, cod, denumire, frecventa, zi_programata, vehicul_id, responsabil_id)
VALUES (
  JSON_VALUE(@p, '$.uuid'),
  TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.zone_id'), '')),
  JSON_VALUE(@p, '$.cod'),
  JSON_VALUE(@p, '$.denumire'),
  NULLIF(JSON_VALUE(@p, '$.frecventa'), ''),
  NULLIF(JSON_VALUE(@p, '$.zi_programata'), ''),
  TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.vehicul_id'), '')),
  NULLIF(JSON_VALUE(@p, '$.responsabil_id'), '')
);
SELECT TOP 1 * FROM sanitation.routes WHERE id = SCOPE_IDENTITY() FOR JSON PATH;
`, { ...body, uuid: crypto.randomUUID() })
      addAudit(db, auth.user, 'sanitation_route_created', item?.denumire)
      writeDb(db)
      return sendJson(res, 201, item)
    }
    const sanitation = ensureSanitationDb(db)
    const item = { id: nextId(sanitation.routes), uuid: crypto.randomUUID(), ...body, activ: true, created_at: nowIso(), updated_at: null }
    sanitation.routes.push(item)
    addAudit(db, auth.user, 'sanitation_route_created', item.denumire)
    writeDb(db)
    sendJson(res, 201, item)
  } catch (error) {
    next(error)
  }
})

router.get('/sanitation/routes/:id/stops', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'sanitation:view')) return
    if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`SELECT * FROM sanitation.route_stops WHERE route_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id')) AND activ = 1 ORDER BY ordine FOR JSON PATH;`, req.params))
    const sanitation = ensureSanitationDb(readDb())
    sendJson(res, 200, sanitation.routeStops.filter((item) => String(item.route_id) === String(req.params.id) && item.activ !== false).sort((a, b) => numberValue(a.ordine) - numberValue(b.ordine)))
  } catch (error) {
    next(error)
  }
})

router.post('/sanitation/routes/:id/stops', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'sanitation:manage')) return
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(`
DECLARE @ordine int = COALESCE((SELECT MAX(ordine) + 1 FROM sanitation.route_stops WHERE route_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.route_id'))), 1);
INSERT INTO sanitation.route_stops (route_id, denumire, adresa, lat, lng, ordine, tip)
VALUES (
  TRY_CONVERT(int, JSON_VALUE(@p, '$.route_id')),
  JSON_VALUE(@p, '$.denumire'),
  NULLIF(JSON_VALUE(@p, '$.adresa'), ''),
  TRY_CONVERT(decimal(10,7), NULLIF(JSON_VALUE(@p, '$.lat'), '')),
  TRY_CONVERT(decimal(10,7), NULLIF(JSON_VALUE(@p, '$.lng'), '')),
  @ordine,
  NULLIF(JSON_VALUE(@p, '$.tip'), '')
);
SELECT TOP 1 * FROM sanitation.route_stops WHERE id = SCOPE_IDENTITY() FOR JSON PATH;
`, { ...req.body, route_id: req.params.id })
      addAudit(db, auth.user, 'sanitation_route_stop_created', item?.denumire)
      writeDb(db)
      return sendJson(res, 201, item)
    }
    const sanitation = ensureSanitationDb(db)
    const routeStops = sanitation.routeStops.filter((item) => String(item.route_id) === String(req.params.id))
    const item = { id: nextId(sanitation.routeStops), route_id: Number(req.params.id), ...req.body, ordine: routeStops.reduce((max, stop) => Math.max(max, numberValue(stop.ordine)), 0) + 1, activ: true, created_at: nowIso(), updated_at: null }
    sanitation.routeStops.push(item)
    addAudit(db, auth.user, 'sanitation_route_stop_created', item.denumire)
    writeDb(db)
    sendJson(res, 201, item)
  } catch (error) {
    next(error)
  }
})

router.get('/sanitation/collections', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'sanitation:view')) return
    if (isMssqlMode()) {
      return sendJson(res, 200, mssqlArray(`
SELECT c.*, r.denumire AS route_denumire, u.nume AS sef_santier_nume
FROM sanitation.collections c
JOIN sanitation.routes r ON r.id = c.route_id
LEFT JOIN core.users u ON u.id = c.raportat_de
WHERE (NULLIF(JSON_VALUE(@p, '$.data'), '') IS NULL OR c.data = TRY_CONVERT(date, JSON_VALUE(@p, '$.data')))
AND (NULLIF(JSON_VALUE(@p, '$.route_id'), '') IS NULL OR c.route_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.route_id')))
AND (NULLIF(JSON_VALUE(@p, '$.status'), '') IS NULL OR c.status = JSON_VALUE(@p, '$.status'))
ORDER BY c.data DESC, c.created_at DESC
FOR JSON PATH;
`, req.query))
    }
    const db = readDb()
    const sanitation = ensureSanitationDb(db)
    let rows = sanitation.collections
    if (req.query.data) rows = rows.filter((item) => item.data === req.query.data)
    if (req.query.route_id) rows = rows.filter((item) => String(item.route_id) === String(req.query.route_id))
    if (req.query.status) rows = rows.filter((item) => item.status === req.query.status)
    sendJson(res, 200, rows.map((item) => ({ ...item, route_denumire: routeName(sanitation, item.route_id), sef_santier_nume: userName(db, item.raportat_de) })))
  } catch (error) {
    next(error)
  }
})

router.post('/sanitation/collections', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'sanitation:collect')) return
    const body = req.body || {}
    const status = body.ora_start ? 'in_executie' : 'planificat'
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(`
INSERT INTO sanitation.collections (uuid, route_id, zone_id, vehicul_id, echipaj, data, ora_start, status, observatii, raportat_de)
VALUES (
  JSON_VALUE(@p, '$.uuid'),
  TRY_CONVERT(int, JSON_VALUE(@p, '$.route_id')),
  TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.zone_id'), '')),
  TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.vehicul_id'), '')),
  NULLIF(JSON_VALUE(@p, '$.echipaj'), ''),
  TRY_CONVERT(date, JSON_VALUE(@p, '$.data')),
  TRY_CONVERT(time, NULLIF(JSON_VALUE(@p, '$.ora_start'), '')),
  JSON_VALUE(@p, '$.status'),
  NULLIF(JSON_VALUE(@p, '$.observatii'), ''),
  JSON_VALUE(@p, '$.raportat_de')
);
SELECT TOP 1 * FROM sanitation.collections WHERE id = SCOPE_IDENTITY() FOR JSON PATH;
`, { ...body, uuid: crypto.randomUUID(), status, raportat_de: auth.user.id })
      addAudit(db, auth.user, 'sanitation_collection_created', item?.uuid)
      writeDb(db)
      return sendJson(res, 201, item)
    }
    const sanitation = ensureSanitationDb(db)
    const item = { id: nextId(sanitation.collections), uuid: crypto.randomUUID(), ...body, status, raportat_de: auth.user.id, created_at: nowIso(), updated_at: null }
    sanitation.collections.push(item)
    addAudit(db, auth.user, 'sanitation_collection_created', item.uuid)
    writeDb(db)
    sendJson(res, 201, item)
  } catch (error) {
    next(error)
  }
})

router.post('/sanitation/collections/:uuid/complete', async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'sanitation:collect')) return
    const records = Array.isArray(req.body?.waste_records) ? req.body.waste_records : []
    const db = readDb()

    if (isMssqlMode()) {
      const collection = mssqlObject(`
UPDATE sanitation.collections
SET status = N'finalizat',
    ora_sfarsit = TRY_CONVERT(time, NULLIF(JSON_VALUE(@p, '$.ora_sfarsit'), '')),
    km_efectuati = TRY_CONVERT(decimal(10,2), NULLIF(JSON_VALUE(@p, '$.km_efectuati'), '')),
    updated_at = sysdatetime()
WHERE uuid = JSON_VALUE(@p, '$.uuid');
SELECT TOP 1 * FROM sanitation.collections WHERE uuid = JSON_VALUE(@p, '$.uuid') FOR JSON PATH;
`, { ...req.body, uuid: req.params.uuid })
      if (!collection) return sendJson(res, 404, { error: 'Colectarea nu a fost gasita.' })
      records.forEach((record) => {
        runMssqlScalar(`
DECLARE @collectionId int = TRY_CONVERT(int, JSON_VALUE(@json, '$.collection_id'));
INSERT INTO sanitation.waste_records (collection_id, waste_type, cantitate_kg, destinatie)
VALUES (
  @collectionId,
  JSON_VALUE(@json, '$.tip_deseu'),
  TRY_CONVERT(decimal(12,3), JSON_VALUE(@json, '$.cantitate_kg')),
  NULLIF(JSON_VALUE(@json, '$.destinatie'), '')
);
SELECT 1;
`, { jsonInput: JSON.stringify({ ...record, collection_id: collection.id }) })
      })
      await registerCollectionCost({ ...collection, raportat_de: auth.user.id }, db, req.body.cost_total || req.body.valoare || 0)
      addAudit(db, auth.user, 'sanitation_collection_completed', req.params.uuid)
      writeDb(db)
      return sendJson(res, 200, collection)
    }

    const sanitation = ensureSanitationDb(db)
    const collection = sanitation.collections.find((item) => item.uuid === req.params.uuid)
    if (!collection) return sendJson(res, 404, { error: 'Colectarea nu a fost gasita.' })
    Object.assign(collection, { status: 'finalizat', ora_sfarsit: req.body.ora_sfarsit || null, km_efectuati: numberValue(req.body.km_efectuati), updated_at: nowIso() })
    records.forEach((record) => sanitation.wasteRecords.push({ id: nextId(sanitation.wasteRecords), collection_id: collection.id, waste_type: record.tip_deseu, cantitate_kg: numberValue(record.cantitate_kg), destinatie: record.destinatie || null, created_at: nowIso() }))
    await registerCollectionCost({ ...collection, raportat_de: auth.user.id }, db, req.body.cost_total || req.body.valoare || 0)
    addAudit(db, auth.user, 'sanitation_collection_completed', req.params.uuid)
    writeDb(db)
    sendJson(res, 200, collection)
  } catch (error) {
    next(error)
  }
})

router.get('/sanitation/reports/monthly', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'sanitation:report')) return
    const bounds = monthBounds(req.query.luna)
    if (isMssqlMode()) {
      const summary = mssqlObject(`
SELECT COUNT(*) AS total_colectari, COALESCE(SUM(km_efectuati), 0) AS total_km
FROM sanitation.collections
WHERE data BETWEEN TRY_CONVERT(date, JSON_VALUE(@p, '$.start')) AND TRY_CONVERT(date, JSON_VALUE(@p, '$.end'))
AND (NULLIF(JSON_VALUE(@p, '$.zona_id'), '') IS NULL OR zone_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.zona_id')))
FOR JSON PATH;
`, { ...bounds, zona_id: req.query.zona_id }) || { total_colectari: 0, total_km: 0 }
      const waste = mssqlArray(`
SELECT wr.waste_type AS tip_deseu, SUM(wr.cantitate_kg) AS total_kg
FROM sanitation.waste_records wr
JOIN sanitation.collections c ON c.id = wr.collection_id
WHERE c.data BETWEEN TRY_CONVERT(date, JSON_VALUE(@p, '$.start')) AND TRY_CONVERT(date, JSON_VALUE(@p, '$.end'))
AND (NULLIF(JSON_VALUE(@p, '$.zona_id'), '') IS NULL OR c.zone_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.zona_id')))
GROUP BY wr.waste_type
FOR JSON PATH;
`, { ...bounds, zona_id: req.query.zona_id })
      return sendJson(res, 200, { luna: bounds.luna, ...summary, pe_tip_deseu: waste })
    }
    const sanitation = ensureSanitationDb(readDb())
    const collections = sanitation.collections.filter((item) => item.data >= bounds.start && item.data <= bounds.end && (!req.query.zona_id || String(item.zone_id) === String(req.query.zona_id)))
    const ids = new Set(collections.map((item) => String(item.id)))
    const wasteMap = new Map()
    sanitation.wasteRecords.filter((record) => ids.has(String(record.collection_id))).forEach((record) => wasteMap.set(record.waste_type, numberValue(wasteMap.get(record.waste_type)) + numberValue(record.cantitate_kg)))
    sendJson(res, 200, {
      luna: bounds.luna,
      total_colectari: collections.length,
      total_km: collections.reduce((sum, item) => sum + numberValue(item.km_efectuati), 0),
      pe_tip_deseu: [...wasteMap.entries()].map(([tip_deseu, total_kg]) => ({ tip_deseu, total_kg }))
    })
  } catch (error) {
    next(error)
  }
})

router.post('/sanitation/reports/generate', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'sanitation:report')) return
    const db = readDb()
    const bounds = monthBounds(req.body?.luna)
    const report = { luna: bounds.luna, zona_id: req.body?.zona_id || null, generated_at: nowIso() }

    if (isMssqlMode()) {
      mssqlObject(`
IF EXISTS (SELECT 1 FROM documents.document_types WHERE id = N'RAPORT_SAL')
BEGIN
  INSERT INTO documents.documents (uuid, tip_id, nr_document, titlu, date_json, status, creat_de, dept_initiatoare)
  VALUES (
    JSON_VALUE(@p, '$.uuid'),
    N'RAPORT_SAL',
    JSON_VALUE(@p, '$.nr_document'),
    JSON_VALUE(@p, '$.titlu'),
    JSON_QUERY(@p, '$.date_json'),
    N'draft',
    JSON_VALUE(@p, '$.user_id'),
    JSON_VALUE(@p, '$.department_id')
  );
END;
SELECT 1 AS ok FOR JSON PATH;
`, { uuid: crypto.randomUUID(), nr_document: `RAPORT-SAL-${bounds.luna}`, titlu: `Raport salubrizare ${bounds.luna}`, date_json: report, user_id: auth.user.id, department_id: auth.user.departmentId || auth.user.department_id })
    } else {
      const docs = ensureDocumentsDb(db)
      if (docs.documentTypes.some((type) => type.id === 'RAPORT_SAL')) {
        docs.documents.push({ id: nextId(docs.documents), uuid: crypto.randomUUID(), tip_id: 'RAPORT_SAL', nr_document: `RAPORT-SAL-${bounds.luna}`, titlu: `Raport salubrizare ${bounds.luna}`, date_json: JSON.stringify(report), status: 'draft', creat_de: auth.user.id, dept_initiatoare: auth.user.departmentId || auth.user.department_id, created_at: nowIso(), updated_at: null })
      }
    }

    const workbook = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([report]), 'Raport ADI')
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    addAudit(db, auth.user, 'sanitation_monthly_report_generated', bounds.luna)
    writeDb(db)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename=raport_salubrizare_${bounds.luna}.xlsx`)
    res.send(buffer)
  } catch (error) {
    next(error)
  }
})

module.exports = router
