const { Router } = require('express')
const crypto = require('crypto')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { readDb, writeDb, runMssqlScalar, DB_MODE } = require('../../core/db')
const { addAudit } = require('../../core/audit')

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

function ensureTrafficDb(db) {
  db.trafficSafety = db.trafficSafety || {}
  db.trafficSafety.signs = Array.isArray(db.trafficSafety.signs) ? db.trafficSafety.signs : []
  db.trafficSafety.markings = Array.isArray(db.trafficSafety.markings) ? db.trafficSafety.markings : []
  db.trafficSafety.furniture = Array.isArray(db.trafficSafety.furniture) ? db.trafficSafety.furniture : []
  db.trafficSafety.workOrders = Array.isArray(db.trafficSafety.workOrders) ? db.trafficSafety.workOrders : []
  db.trafficSafety.inspections = Array.isArray(db.trafficSafety.inspections) ? db.trafficSafety.inspections : []
  return db.trafficSafety
}

function filterActive(items) {
  return items.filter((item) => item.activ !== false && item.activ !== 0)
}

function badState(value) {
  return !['buna', 'bun', 'ok'].includes(String(value || '').toLowerCase())
}

function entityArray(traffic, type) {
  if (type === 'sign') return traffic.signs
  if (type === 'marking') return traffic.markings
  if (type === 'furniture') return traffic.furniture
  return []
}

function entityTable(type) {
  if (type === 'sign') return 'traffic_safety.signs'
  if (type === 'marking') return 'traffic_safety.markings'
  if (type === 'furniture') return 'traffic_safety.furniture'
  return null
}

function insertSqlFor(table, fields) {
  const columns = fields.join(', ')
  const values = fields.map((field) => {
    if (['lat', 'lng'].includes(field)) return `TRY_CONVERT(decimal(10,7), NULLIF(JSON_VALUE(@p, '$.${field}'), ''))`
    if (['suprafata_mp', 'lungime_ml'].includes(field)) return `TRY_CONVERT(decimal(12,2), NULLIF(JSON_VALUE(@p, '$.${field}'), ''))`
    if (field === 'santier_id') return `TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.${field}'), ''))`
    if (['data_montaj', 'data_executie', 'ultima_inspectie', 'termen_limita'].includes(field)) return `TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.${field}'), ''))`
    return `NULLIF(JSON_VALUE(@p, '$.${field}'), '')`
  }).join(', ')
  return `INSERT INTO ${table} (${columns}) VALUES (${values}); SELECT TOP 1 * FROM ${table} WHERE id = SCOPE_IDENTITY() FOR JSON PATH;`
}

function listJson(db, collection, filters = {}) {
  let rows = filterActive(collection)
  Object.entries(filters).forEach(([key, value]) => {
    if (value) rows = rows.filter((item) => String(item[key] || '').toLowerCase().includes(String(value).toLowerCase()))
  })
  return rows
}

router.get('/traffic-safety/signs', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'traffic_safety:view')) return
    if (isMssqlMode()) {
      return sendJson(res, 200, mssqlArray(`
SELECT * FROM traffic_safety.signs
WHERE activ = 1
AND (NULLIF(JSON_VALUE(@p, '$.stare'), '') IS NULL OR stare = JSON_VALUE(@p, '$.stare'))
AND (NULLIF(JSON_VALUE(@p, '$.localitate'), '') IS NULL OR locatie LIKE N'%' + JSON_VALUE(@p, '$.localitate') + N'%')
AND (NULLIF(JSON_VALUE(@p, '$.tip'), '') IS NULL OR tip = JSON_VALUE(@p, '$.tip'))
ORDER BY locatie, tip
FOR JSON PATH;
`, req.query))
    }
    const traffic = ensureTrafficDb(readDb())
    sendJson(res, 200, listJson(null, traffic.signs, { stare: req.query.stare, locatie: req.query.localitate, tip: req.query.tip }))
  } catch (error) {
    next(error)
  }
})

router.post('/traffic-safety/signs', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'traffic_safety:manage')) return
    const body = { ...req.body, uuid: crypto.randomUUID() }
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(insertSqlFor('traffic_safety.signs', ['uuid', 'cod', 'tip', 'denumire', 'locatie', 'lat', 'lng', 'stare', 'data_montaj', 'ultima_inspectie', 'department_id']), body)
      addAudit(db, auth.user, 'traffic_sign_created', item?.uuid)
      writeDb(db)
      return sendJson(res, 201, item)
    }
    const traffic = ensureTrafficDb(db)
    const item = { id: nextId(traffic.signs), ...body, stare: body.stare || 'buna', activ: true, created_at: nowIso(), updated_at: null }
    traffic.signs.push(item)
    addAudit(db, auth.user, 'traffic_sign_created', item.uuid)
    writeDb(db)
    sendJson(res, 201, item)
  } catch (error) {
    next(error)
  }
})

router.get('/traffic-safety/markings', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'traffic_safety:view')) return
    if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`SELECT * FROM traffic_safety.markings WHERE activ = 1 ORDER BY tronson, tip FOR JSON PATH;`))
    sendJson(res, 200, filterActive(ensureTrafficDb(readDb()).markings))
  } catch (error) {
    next(error)
  }
})

router.post('/traffic-safety/markings', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'traffic_safety:manage')) return
    const body = { ...req.body, uuid: crypto.randomUUID() }
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(insertSqlFor('traffic_safety.markings', ['uuid', 'tronson', 'tip', 'suprafata_mp', 'lungime_ml', 'material', 'data_executie', 'stare', 'santier_id']), body)
      addAudit(db, auth.user, 'traffic_marking_created', item?.uuid)
      writeDb(db)
      return sendJson(res, 201, item)
    }
    const traffic = ensureTrafficDb(db)
    const item = { id: nextId(traffic.markings), ...body, stare: body.stare || 'buna', activ: true, created_at: nowIso(), updated_at: null }
    traffic.markings.push(item)
    addAudit(db, auth.user, 'traffic_marking_created', item.uuid)
    writeDb(db)
    sendJson(res, 201, item)
  } catch (error) {
    next(error)
  }
})

router.get('/traffic-safety/furniture', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'traffic_safety:view')) return
    if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`SELECT * FROM traffic_safety.furniture WHERE activ = 1 ORDER BY locatie, tip FOR JSON PATH;`))
    sendJson(res, 200, filterActive(ensureTrafficDb(readDb()).furniture))
  } catch (error) {
    next(error)
  }
})

router.post('/traffic-safety/furniture', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'traffic_safety:manage')) return
    const body = { ...req.body, uuid: crypto.randomUUID() }
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(insertSqlFor('traffic_safety.furniture', ['uuid', 'tip', 'denumire', 'locatie', 'lat', 'lng', 'stare', 'data_montaj', 'ultima_inspectie']), body)
      addAudit(db, auth.user, 'traffic_furniture_created', item?.uuid)
      writeDb(db)
      return sendJson(res, 201, item)
    }
    const traffic = ensureTrafficDb(db)
    const item = { id: nextId(traffic.furniture), ...body, stare: body.stare || 'buna', activ: true, created_at: nowIso(), updated_at: null }
    traffic.furniture.push(item)
    addAudit(db, auth.user, 'traffic_furniture_created', item.uuid)
    writeDb(db)
    sendJson(res, 201, item)
  } catch (error) {
    next(error)
  }
})

router.get('/traffic-safety/work-orders', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'traffic_safety:view')) return
    if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`SELECT * FROM traffic_safety.work_orders ORDER BY created_at DESC FOR JSON PATH;`))
    sendJson(res, 200, ensureTrafficDb(readDb()).workOrders)
  } catch (error) {
    next(error)
  }
})

router.post('/traffic-safety/work-orders', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'traffic_safety:work_order')) return
    const body = { ...req.body, uuid: crypto.randomUUID(), status: req.body.status || 'planificat', creat_de: auth.user.id }
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(`
INSERT INTO traffic_safety.work_orders (uuid, tip, obiect_tip, obiect_id, titlu, descriere, prioritate, status, asignat_la, termen_limita, creat_de)
VALUES (
  JSON_VALUE(@p, '$.uuid'), JSON_VALUE(@p, '$.tip'), NULLIF(JSON_VALUE(@p, '$.obiect_tip'), ''),
  TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.obiect_id'), '')), JSON_VALUE(@p, '$.titlu'),
  NULLIF(JSON_VALUE(@p, '$.descriere'), ''), COALESCE(NULLIF(JSON_VALUE(@p, '$.prioritate'), ''), N'normala'),
  JSON_VALUE(@p, '$.status'), NULLIF(JSON_VALUE(@p, '$.asignat_la'), ''),
  TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.termen_limita'), '')), JSON_VALUE(@p, '$.creat_de')
);
SELECT TOP 1 * FROM traffic_safety.work_orders WHERE id = SCOPE_IDENTITY() FOR JSON PATH;
`, body)
      addAudit(db, auth.user, 'traffic_work_order_created', item?.uuid)
      writeDb(db)
      return sendJson(res, 201, item)
    }
    const traffic = ensureTrafficDb(db)
    const item = { id: nextId(traffic.workOrders), ...body, created_at: nowIso(), updated_at: null }
    traffic.workOrders.push(item)
    addAudit(db, auth.user, 'traffic_work_order_created', item.uuid)
    writeDb(db)
    sendJson(res, 201, item)
  } catch (error) {
    next(error)
  }
})

router.post('/traffic-safety/work-orders/:uuid/complete', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'traffic_safety:work_order')) return
    const dataExecutie = req.body.data_executie || todayIso()
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(`
UPDATE traffic_safety.work_orders
SET status = N'finalizat',
    data_executie = TRY_CONVERT(date, JSON_VALUE(@p, '$.data_executie')),
    materiale_json = JSON_QUERY(@p, '$.materiale_json'),
    descriere = COALESCE(NULLIF(JSON_VALUE(@p, '$.observatii'), ''), descriere),
    finalizat_la = sysdatetime(),
    updated_at = sysdatetime()
WHERE uuid = JSON_VALUE(@p, '$.uuid');
SELECT TOP 1 * FROM traffic_safety.work_orders WHERE uuid = JSON_VALUE(@p, '$.uuid') FOR JSON PATH;
`, { ...req.body, uuid: req.params.uuid, data_executie: dataExecutie, materiale_json: req.body.materiale_json || null })
      if (!item) return sendJson(res, 404, { error: 'Ordinul de lucru nu a fost gasit.' })
      const table = entityTable(item.obiect_tip)
      if (table && item.obiect_tip === 'marking') {
        runMssqlScalar(`
UPDATE ${table}
SET stare = N'buna', data_executie = TRY_CONVERT(date, JSON_VALUE(@json, '$.data_executie')), updated_at = sysdatetime()
WHERE id = TRY_CONVERT(int, JSON_VALUE(@json, '$.obiect_id'));
SELECT 1;
`, { jsonInput: JSON.stringify({ data_executie: dataExecutie, obiect_id: item.obiect_id }) })
      } else if (table) {
        runMssqlScalar(`
UPDATE ${table}
SET stare = N'buna', ultima_inspectie = TRY_CONVERT(date, JSON_VALUE(@json, '$.data_executie')), updated_at = sysdatetime()
WHERE id = TRY_CONVERT(int, JSON_VALUE(@json, '$.obiect_id'));
SELECT 1;
`, { jsonInput: JSON.stringify({ data_executie: dataExecutie, obiect_id: item.obiect_id }) })
      }
      addAudit(db, auth.user, 'traffic_work_order_completed', req.params.uuid)
      writeDb(db)
      return sendJson(res, 200, item)
    }
    const traffic = ensureTrafficDb(db)
    const item = traffic.workOrders.find((order) => order.uuid === req.params.uuid)
    if (!item) return sendJson(res, 404, { error: 'Ordinul de lucru nu a fost gasit.' })
    Object.assign(item, { status: 'finalizat', data_executie: dataExecutie, materiale_json: req.body.materiale_json || null, observatii: req.body.observatii || item.observatii, finalizat_la: nowIso(), updated_at: nowIso() })
    const linked = entityArray(traffic, item.obiect_tip).find((entity) => String(entity.id) === String(item.obiect_id))
    if (linked) Object.assign(linked, { stare: 'buna', ultima_inspectie: dataExecutie, updated_at: nowIso() })
    addAudit(db, auth.user, 'traffic_work_order_completed', item.uuid)
    writeDb(db)
    sendJson(res, 200, item)
  } catch (error) {
    next(error)
  }
})

router.get('/traffic-safety/inspections', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'traffic_safety:view')) return
    if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`SELECT * FROM traffic_safety.inspections ORDER BY data DESC, created_at DESC FOR JSON PATH;`))
    sendJson(res, 200, ensureTrafficDb(readDb()).inspections)
  } catch (error) {
    next(error)
  }
})

router.post('/traffic-safety/inspections', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'traffic_safety:inspect')) return
    const body = req.body || {}
    const stareConstatata = body.stare_constatata || body.stare || 'buna'
    const necesita = body.necesita_interventie === true || body.necesita_interventie === 1 || badState(stareConstatata)
    const db = readDb()

    if (isMssqlMode()) {
      let workOrderId = null
      if (necesita) {
        const order = mssqlObject(`
INSERT INTO traffic_safety.work_orders (uuid, tip, obiect_tip, obiect_id, titlu, descriere, prioritate, status, creat_de)
VALUES (
  JSON_VALUE(@p, '$.uuid'), N'inspectie', JSON_VALUE(@p, '$.obiect_tip'),
  TRY_CONVERT(int, JSON_VALUE(@p, '$.obiect_id')), JSON_VALUE(@p, '$.titlu'),
  NULLIF(JSON_VALUE(@p, '$.descriere'), ''), N'normal', N'planificat', JSON_VALUE(@p, '$.user_id')
);
SELECT TOP 1 * FROM traffic_safety.work_orders WHERE uuid = JSON_VALUE(@p, '$.uuid') FOR JSON PATH;
`, { uuid: crypto.randomUUID(), obiect_tip: body.obiect_tip, obiect_id: body.obiect_id, titlu: `Interventie ${body.obiect_tip} #${body.obiect_id}`, descriere: body.constatari || body.actiuni_recomandate, user_id: auth.user.id })
        workOrderId = order?.id || null
      }
      const item = mssqlObject(`
INSERT INTO traffic_safety.inspections (uuid, obiect_tip, obiect_id, data, stare, stare_constatata, necesita_interventie, work_order_id, constatari, actiuni_recomandate, inspector_id)
VALUES (
  JSON_VALUE(@p, '$.uuid'), JSON_VALUE(@p, '$.obiect_tip'), TRY_CONVERT(int, JSON_VALUE(@p, '$.obiect_id')),
  TRY_CONVERT(date, JSON_VALUE(@p, '$.data')), JSON_VALUE(@p, '$.stare'), JSON_VALUE(@p, '$.stare_constatata'),
  TRY_CONVERT(bit, JSON_VALUE(@p, '$.necesita_interventie')), TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.work_order_id'), '')),
  NULLIF(JSON_VALUE(@p, '$.constatari'), ''), NULLIF(JSON_VALUE(@p, '$.actiuni_recomandate'), ''), JSON_VALUE(@p, '$.inspector_id')
);
SELECT TOP 1 * FROM traffic_safety.inspections WHERE id = SCOPE_IDENTITY() FOR JSON PATH;
`, { ...body, uuid: crypto.randomUUID(), data: body.data || todayIso(), stare: necesita ? 'necesita_interventie' : 'buna', stare_constatata: stareConstatata, necesita_interventie: necesita ? 1 : 0, work_order_id: workOrderId, inspector_id: auth.user.id })
      addAudit(db, auth.user, 'traffic_inspection_created', item?.uuid)
      writeDb(db)
      return sendJson(res, 201, item)
    }

    const traffic = ensureTrafficDb(db)
    let workOrderId = null
    if (necesita) {
      const order = { id: nextId(traffic.workOrders), uuid: crypto.randomUUID(), tip: 'inspectie', obiect_tip: body.obiect_tip, obiect_id: body.obiect_id, titlu: `Interventie ${body.obiect_tip} #${body.obiect_id}`, descriere: body.constatari || body.actiuni_recomandate || null, prioritate: 'normal', status: 'planificat', creat_de: auth.user.id, created_at: nowIso(), updated_at: null }
      traffic.workOrders.push(order)
      workOrderId = order.id
    }
    const item = { id: nextId(traffic.inspections), uuid: crypto.randomUUID(), ...body, data: body.data || todayIso(), stare: necesita ? 'necesita_interventie' : 'buna', stare_constatata: stareConstatata, necesita_interventie: necesita, work_order_id: workOrderId, inspector_id: auth.user.id, created_at: nowIso() }
    traffic.inspections.push(item)
    addAudit(db, auth.user, 'traffic_inspection_created', item.uuid)
    writeDb(db)
    sendJson(res, 201, item)
  } catch (error) {
    next(error)
  }
})

router.get('/traffic-safety/map-data', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'traffic_safety:view')) return
    if (isMssqlMode()) {
      return sendJson(res, 200, {
        signs: mssqlArray(`SELECT id, tip, stare, lat AS gps_lat, lng AS gps_lng, ultima_inspectie FROM traffic_safety.signs WHERE activ = 1 FOR JSON PATH;`),
        markings: mssqlArray(`SELECT id, tip, stare, tronson AS strada FROM traffic_safety.markings WHERE activ = 1 FOR JSON PATH;`),
        furniture: mssqlArray(`SELECT id, tip, stare, lat AS gps_lat, lng AS gps_lng FROM traffic_safety.furniture WHERE activ = 1 FOR JSON PATH;`)
      })
    }
    const traffic = ensureTrafficDb(readDb())
    sendJson(res, 200, {
      signs: filterActive(traffic.signs).map((item) => ({ id: item.id, tip: item.tip, stare: item.stare, gps_lat: item.lat || item.gps_lat, gps_lng: item.lng || item.gps_lng, ultima_inspectie: item.ultima_inspectie })),
      markings: filterActive(traffic.markings).map((item) => ({ id: item.id, tip: item.tip, stare: item.stare, strada: item.tronson || item.strada })),
      furniture: filterActive(traffic.furniture).map((item) => ({ id: item.id, tip: item.tip, stare: item.stare, gps_lat: item.lat || item.gps_lat, gps_lng: item.lng || item.gps_lng }))
    })
  } catch (error) {
    next(error)
  }
})

module.exports = router
