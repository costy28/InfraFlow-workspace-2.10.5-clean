const { Router } = require('express')
const crypto = require('crypto')
const xlsx = require('xlsx')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { readDb, writeDb, runMssqlScalar, DB_MODE } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const autoRegister = require('./auto-register')

const router = Router()

const nexusAccounts = {
  manopera: '641',
  materiale: '602',
  combustibil: '6022',
  amortizare: '6811',
  reparatii: '611',
  chirii: '612'
}

function sendJson(res, status, data) {
  res.status(status).json(data)
}

function throwHttp(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

function isMssqlMode() {
  return DB_MODE === 'mssql' || DB_MODE === 'sqlserver'
}

function nowIso() {
  return new Date().toISOString()
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function currentMonth() {
  return `${todayIso().slice(0, 7)}-01`
}

function normalizeMonth(value) {
  const raw = String(value || todayIso().slice(0, 7)).slice(0, 7)
  return `${raw}-01`
}

function firstDayOfMonth(value) {
  return normalizeMonth(String(value || todayIso()).slice(0, 7))
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

function ensureControllingDb(db) {
  db.controlling = db.controlling || {}
  db.controlling.costCenters = Array.isArray(db.controlling.costCenters) ? db.controlling.costCenters : []
  db.controlling.costEntries = Array.isArray(db.controlling.costEntries) ? db.controlling.costEntries : []
  db.controlling.budgets = Array.isArray(db.controlling.budgets) ? db.controlling.budgets : []
  db.controlling.allocationRules = Array.isArray(db.controlling.allocationRules) ? db.controlling.allocationRules : []
  db.controlling.allocationTargets = Array.isArray(db.controlling.allocationTargets) ? db.controlling.allocationTargets : []
  db.controlling.costCenterObjects = Array.isArray(db.controlling.costCenterObjects) ? db.controlling.costCenterObjects : []
  return db.controlling
}

function buildCostCenterTree(centers, objects = []) {
  const byId = new Map()
  const roots = []
  centers.forEach((item) => {
    const total = numberValue(item.total_cheltuieli_luna || item.total_cheltuieli_luna_curenta)
    const budget = numberValue(item.buget_lunar)
    const nodeObjects = objects.filter(object => String(object.cost_center_id) === String(item.id) && object.activ !== false)
    byId.set(String(item.id), {
      id: item.id,
      cod: item.cod,
      denumire: item.denumire,
      name: item.denumire,
      tip: item.tip,
      parinte_id: item.parinte_id || null,
      activ: item.activ !== false && item.activ !== 0,
      culoare: item.culoare || item.color || '#3B82F6',
      nivel: item.nivel,
      buget_lunar: numberValue(item.buget_lunar),
      buget_anual: numberValue(item.buget_anual),
      total_cheltuieli_luna: total,
      total_cheltuieli_luna_curenta: total,
      procent_buget: budget > 0 ? Number(((total / budget) * 100).toFixed(2)) : 0,
      procent_buget_consumat: budget > 0 ? Number(((total / budget) * 100).toFixed(2)) : 0,
      obiecte: nodeObjects,
      subcentre: []
    })
  })
  centers.forEach((item) => {
    const node = byId.get(String(item.id))
    const parent = item.parinte_id ? byId.get(String(item.parinte_id)) : null
    if (parent) parent.subcentre.push(node)
    else roots.push(node)
  })
  return roots
}

function monthlyTotalsByCenter(entries, luna) {
  const totals = new Map()
  entries.filter((entry) => String(entry.luna || '').slice(0, 10) === luna).forEach((entry) => {
    const key = String(entry.cost_center_id)
    totals.set(key, numberValue(totals.get(key)) + numberValue(entry.valoare))
  })
  return totals
}

function budgetFor(budgets, costCenterId, an, luna, categorie) {
  const exact = budgets.find((item) =>
    String(item.cost_center_id) === String(costCenterId) &&
    Number(item.an) === Number(an) &&
    (item.luna == null || Number(item.luna) === Number(luna)) &&
    String(item.categorie || '') === String(categorie || '')
  )
  return numberValue(exact?.valoare)
}

function reportStatus(percent) {
  if (percent > 100) return 'depasit'
  if (percent >= 85) return 'atentie'
  return 'ok'
}

function userCompanyId(user) {
  return user.company_id || user.companyId || 1
}

function departmentCode(db, deptId) {
  const departments = db.departments || db.core?.departments || []
  const dept = departments.find((item) => String(item.id) === String(deptId))
  return dept?.cod || dept?.code || 'GEN'
}

function costCenterName(db, id) {
  const controlling = ensureControllingDb(db)
  return controlling.costCenters.find((item) => String(item.id) === String(id))?.denumire || ''
}

function costCenterCode(db, id) {
  const controlling = ensureControllingDb(db)
  return controlling.costCenters.find((item) => String(item.id) === String(id))?.cod || ''
}

function flatCostCenters(db) {
  return ensureControllingDb(db).costCenters.filter(item => item.activ !== false && item.activ !== 0)
}

function findCostCenterForAsset(db, assetId, explicitCostCenterId = '') {
  const controlling = ensureControllingDb(db)
  if (explicitCostCenterId) {
    const explicit = controlling.costCenters.find(item => String(item.id) === String(explicitCostCenterId) && item.activ !== false)
    if (explicit) return explicit
  }
  const asset = (db.fleetAssets || []).find(item => String(item.id) === String(assetId))
  if (asset?.cost_center_id) {
    const direct = controlling.costCenters.find(item => String(item.id) === String(asset.cost_center_id) && item.activ !== false)
    if (direct) return direct
  }
  const object = controlling.costCenterObjects.find(item =>
    String(item.object_id) === String(assetId) &&
    ['vehicle', 'equipment', 'utilaj', 'vehicul'].includes(String(item.object_type || '').toLowerCase()) &&
    item.activ !== false
  )
  if (!object) return null
  return controlling.costCenters.find(item => String(item.id) === String(object.cost_center_id) && item.activ !== false) || null
}

function objectName(db, objectId, objectType) {
  if (['vehicle', 'equipment', 'utilaj', 'vehicul'].includes(String(objectType || '').toLowerCase())) {
    const asset = (db.fleetAssets || []).find(item => String(item.id) === String(objectId))
    return [asset?.name, asset?.registration].filter(Boolean).join(' / ') || asset?.cod || String(objectId)
  }
  const project = (db.projects || db.work?.projects || []).find(item => String(item.id) === String(objectId))
  return project?.name || project?.denumire || project?.titlu || String(objectId)
}

function projectRevenue(db, santierId) {
  const imports = db.integration?.situationImports || []
  return imports
    .filter((item) => String(item.project_id || item.santier_id) === String(santierId) && item.status === 'aprobat')
    .reduce((sum, item) => sum + numberValue(item.total_fara_tva || item.total_cu_tva), 0)
}

router.get('/controlling/cost-centers', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'controlling:view')) return

    const luna = currentMonth()
    if (isMssqlMode()) {
      const centers = mssqlArray(`
SELECT
  cc.*,
  COALESCE(SUM(CASE WHEN ce.luna = TRY_CONVERT(date, JSON_VALUE(@p, '$.luna')) THEN ce.valoare ELSE 0 END), 0) AS total_cheltuieli_luna
FROM controlling.cost_centers cc
LEFT JOIN controlling.cost_entries ce ON ce.cost_center_id = cc.id
WHERE cc.activ = 1
GROUP BY cc.id, cc.company_id, cc.cod, cc.denumire, cc.tip, cc.dept_id, cc.parinte_id,
  cc.nivel, cc.tip_resursa, cc.resursa_ref_id, cc.buget_lunar, cc.buget_anual,
  cc.responsabil_id, cc.activ, cc.sort_order, cc.created_at, cc.updated_at
ORDER BY cc.nivel, cc.sort_order, cc.denumire
FOR JSON PATH;
`, { luna })
      return sendJson(res, 200, buildCostCenterTree(centers))
    }

    const db = readDb()
    const controlling = ensureControllingDb(db)
    const totals = monthlyTotalsByCenter(controlling.costEntries, luna)
    const centers = controlling.costCenters
      .filter((item) => item.activ !== false && item.activ !== 0)
      .map((item) => ({ ...item, total_cheltuieli_luna: numberValue(totals.get(String(item.id))) }))
    sendJson(res, 200, buildCostCenterTree(centers, controlling.costCenterObjects))
  } catch (error) {
    next(error)
  }
})

router.post('/controlling/cost-centers', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'controlling:cost_centers')) return

    const body = req.body || {}
    const denumire = String(body.denumire || body.name || '').trim()
    if (!denumire) return sendJson(res, 400, { error: 'Denumirea centrului de cost este obligatorie.' })

    const db = readDb()
    const deptCod = body.dept_cod || departmentCode(db, body.dept_id)
    const generatedCode = `CC-${deptCod}-${Date.now().toString(36).toUpperCase()}`

    if (isMssqlMode()) {
      const created = mssqlObject(`
DECLARE @parentNivel int = NULL;
IF NULLIF(JSON_VALUE(@p, '$.parinte_id'), '') IS NOT NULL
BEGIN
  SELECT @parentNivel = nivel
  FROM controlling.cost_centers
  WHERE id = TRY_CONVERT(int, JSON_VALUE(@p, '$.parinte_id'));
END;

INSERT INTO controlling.cost_centers (
  company_id, cod, denumire, tip, dept_id, parinte_id, nivel,
  tip_resursa, resursa_ref_id, buget_lunar, buget_anual, responsabil_id
)
VALUES (
  TRY_CONVERT(int, JSON_VALUE(@p, '$.company_id')),
  COALESCE(NULLIF(JSON_VALUE(@p, '$.cod'), ''), JSON_VALUE(@p, '$.generatedCode')),
  JSON_VALUE(@p, '$.denumire'),
  COALESCE(NULLIF(JSON_VALUE(@p, '$.tip'), ''), N'departament'),
  NULLIF(JSON_VALUE(@p, '$.dept_id'), ''),
  TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.parinte_id'), '')),
  COALESCE(@parentNivel + 1, TRY_CONVERT(int, JSON_VALUE(@p, '$.nivel')), 1),
  NULLIF(JSON_VALUE(@p, '$.tip_resursa'), ''),
  TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.resursa_ref_id'), '')),
  TRY_CONVERT(decimal(15,2), NULLIF(JSON_VALUE(@p, '$.buget_lunar'), '')),
  TRY_CONVERT(decimal(15,2), NULLIF(JSON_VALUE(@p, '$.buget_anual'), '')),
  NULLIF(JSON_VALUE(@p, '$.responsabil_id'), '')
);

SELECT TOP 1 *
FROM controlling.cost_centers
WHERE id = SCOPE_IDENTITY()
FOR JSON PATH;
`, { ...body, company_id: body.company_id || userCompanyId(auth.user), generatedCode })
      addAudit(db, auth.user, 'controlling_cost_center_created', created?.denumire || body.denumire)
      writeDb(db)
      return sendJson(res, 201, created)
    }

    const controlling = ensureControllingDb(db)
    const parent = body.parinte_id ? controlling.costCenters.find((item) => String(item.id) === String(body.parinte_id)) : null
    const item = {
      id: nextId(controlling.costCenters),
      company_id: body.company_id || userCompanyId(auth.user),
      cod: body.cod || generatedCode,
      denumire,
      tip: body.tip || 'departament',
      dept_id: body.dept_id || null,
      parinte_id: body.parinte_id || null,
      nivel: parent ? numberValue(parent.nivel, 1) + 1 : numberValue(body.nivel, 1),
      culoare: body.culoare || body.color || '#3B82F6',
      tip_resursa: body.tip_resursa || null,
      resursa_ref_id: body.resursa_ref_id || null,
      buget_lunar: numberValue(body.buget_lunar),
      buget_anual: numberValue(body.buget_anual),
      responsabil_id: body.responsabil_id || null,
      activ: true,
      sort_order: numberValue(body.sort_order),
      created_at: nowIso(),
      updated_at: null
    }
    controlling.costCenters.push(item)
    addAudit(db, auth.user, 'controlling_cost_center_created', item.denumire)
    writeDb(db)
    sendJson(res, 201, item)
  } catch (error) {
    next(error)
  }
})

router.put('/controlling/cost-centers/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'controlling:cost_centers')) return

    const db = readDb()
    const controlling = ensureControllingDb(db)
    const item = controlling.costCenters.find(center => String(center.id) === String(req.params.id))
    if (!item) return sendJson(res, 404, { error: 'Centrul de cost nu a fost găsit.' })

    const body = req.body || {}
    const allowed = ['cod', 'denumire', 'name', 'tip', 'parinte_id', 'culoare', 'color', 'activ', 'buget_lunar', 'buget_anual', 'responsabil_id']
    allowed.forEach(key => {
      if (body[key] === undefined) return
      if (key === 'name') item.denumire = String(body[key] || '').trim()
      else if (key === 'color') item.culoare = body[key] || '#3B82F6'
      else if (['buget_lunar', 'buget_anual'].includes(key)) item[key] = numberValue(body[key])
      else item[key] = body[key]
    })
    if (!String(item.denumire || '').trim()) return sendJson(res, 400, { error: 'Denumirea centrului de cost este obligatorie.' })
    const parent = item.parinte_id ? controlling.costCenters.find(center => String(center.id) === String(item.parinte_id)) : null
    item.nivel = parent ? numberValue(parent.nivel, 1) + 1 : 1
    item.updated_at = nowIso()

    addAudit(db, auth.user, 'controlling_cost_center_updated', item.denumire)
    writeDb(db)
    sendJson(res, 200, item)
  } catch (error) {
    next(error)
  }
})

router.delete('/controlling/cost-centers/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'controlling:cost_centers')) return

    const db = readDb()
    const controlling = ensureControllingDb(db)
    const item = controlling.costCenters.find(center => String(center.id) === String(req.params.id))
    if (!item) return sendJson(res, 404, { error: 'Centrul de cost nu a fost găsit.' })
    const children = controlling.costCenters.filter(center => String(center.parinte_id || '') === String(item.id) && center.activ !== false && center.activ !== 0)
    if (children.length) {
      return sendJson(res, 409, {
        error: 'Centrul are subcentre active. Dezactivează mai întâi subcentrele.',
        subcentre: children.map(child => ({ id: child.id, denumire: child.denumire }))
      })
    }

    item.activ = false
    item.updated_at = nowIso()
    addAudit(db, auth.user, 'controlling_cost_center_disabled', item.denumire)
    writeDb(db)
    sendJson(res, 200, item)
  } catch (error) {
    next(error)
  }
})

router.post('/controlling/cost-centers/:id/assign-asset', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'controlling:cost_centers')) return

    const db = readDb()
    const controlling = ensureControllingDb(db)
    const center = controlling.costCenters.find(item => String(item.id) === String(req.params.id) && item.activ !== false)
    if (!center) return sendJson(res, 404, { error: 'Centrul de cost nu a fost găsit.' })

    const body = req.body || {}
    const objectId = String(body.asset_id || body.object_id || '').trim()
    const objectType = String(body.asset_type || body.object_type || 'equipment').trim()
    if (!objectId) return sendJson(res, 400, { error: 'Alege obiectul de asociat.' })

    controlling.costCenterObjects.forEach(object => {
      if (String(object.object_id) === objectId && String(object.object_type) === objectType) object.activ = false
    })
    const object = {
      id: nextId(controlling.costCenterObjects),
      cost_center_id: center.id,
      object_id: objectId,
      object_type: objectType,
      object_name: body.object_name || objectName(db, objectId, objectType),
      activ: true,
      created_by: auth.user?.id || auth.user?.name || '',
      created_at: nowIso()
    }
    controlling.costCenterObjects.push(object)

    if (['vehicle', 'equipment', 'utilaj', 'vehicul'].includes(objectType.toLowerCase())) {
      const asset = (db.fleetAssets || []).find(item => String(item.id) === objectId)
      if (asset) asset.cost_center_id = center.id
    }

    addAudit(db, auth.user, 'controlling_cost_center_object_assigned', `${center.denumire} / ${object.object_name}`)
    writeDb(db)
    sendJson(res, 201, object)
  } catch (error) {
    next(error)
  }
})

router.get('/controlling/entries', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'controlling:view')) return

    const db = readDb()
    const controlling = ensureControllingDb(db)
    let entries = [...controlling.costEntries]
    if (req.query.luna) entries = entries.filter(entry => String(entry.luna || '').startsWith(String(req.query.luna).slice(0, 7)))
    if (req.query.centru_id) entries = entries.filter(entry => String(entry.cost_center_id) === String(req.query.centru_id))
    if (req.query.categorie) entries = entries.filter(entry => String(entry.categorie) === String(req.query.categorie))
    entries.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))
    sendJson(res, 200, { entries })
  } catch (error) {
    next(error)
  }
})

router.post('/controlling/entries', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'controlling:entry_create')) return

    const body = req.body || {}
    if (!body.cost_center_id || !body.data || !body.categorie || body.valoare == null) {
      return sendJson(res, 400, { error: 'Date incomplete pentru inregistrarea cheltuielii.' })
    }

    const payload = {
      uuid: crypto.randomUUID(),
      company_id: body.company_id || userCompanyId(auth.user),
      cost_center_id: body.cost_center_id,
      subcentru_id: body.subcentru_id || null,
      santier_id: body.santier_id || null,
      data: String(body.data).slice(0, 10),
      luna: firstDayOfMonth(body.data),
      categorie: body.categorie,
      subcategorie: body.subcategorie || null,
      descriere: body.descriere || null,
      valoare: numberValue(body.valoare),
      tva: numberValue(body.tva),
      moneda: body.moneda || 'RON',
      sursa: 'manual',
      sursa_ref_id: body.sursa_ref_id || null,
      nr_document: body.nr_document || null,
      furnizor: body.furnizor || null,
      validat: false,
      inregistrat_de: auth.user.id,
      observatii: body.observatii || null
    }

    const db = readDb()
    if (isMssqlMode()) {
      const created = mssqlObject(`
INSERT INTO controlling.cost_entries (
  uuid, company_id, cost_center_id, subcentru_id, santier_id, data, luna,
  categorie, subcategorie, descriere, valoare, tva, moneda, sursa,
  sursa_ref_id, nr_document, furnizor, inregistrat_de, observatii
)
SELECT
  JSON_VALUE(@p, '$.uuid'),
  TRY_CONVERT(int, JSON_VALUE(@p, '$.company_id')),
  TRY_CONVERT(int, JSON_VALUE(@p, '$.cost_center_id')),
  TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.subcentru_id'), '')),
  TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.santier_id'), '')),
  TRY_CONVERT(date, JSON_VALUE(@p, '$.data')),
  TRY_CONVERT(date, JSON_VALUE(@p, '$.luna')),
  JSON_VALUE(@p, '$.categorie'),
  NULLIF(JSON_VALUE(@p, '$.subcategorie'), ''),
  NULLIF(JSON_VALUE(@p, '$.descriere'), ''),
  TRY_CONVERT(decimal(15,2), JSON_VALUE(@p, '$.valoare')),
  TRY_CONVERT(decimal(15,2), JSON_VALUE(@p, '$.tva')),
  JSON_VALUE(@p, '$.moneda'),
  N'manual',
  NULLIF(JSON_VALUE(@p, '$.sursa_ref_id'), ''),
  NULLIF(JSON_VALUE(@p, '$.nr_document'), ''),
  NULLIF(JSON_VALUE(@p, '$.furnizor'), ''),
  JSON_VALUE(@p, '$.inregistrat_de'),
  NULLIF(JSON_VALUE(@p, '$.observatii'), '');

SELECT TOP 1 *
FROM controlling.cost_entries
WHERE uuid = JSON_VALUE(@p, '$.uuid')
FOR JSON PATH;
`, payload)
      addAudit(db, auth.user, 'controlling_entry_created', payload.descriere || payload.categorie)
      writeDb(db)
      return sendJson(res, 201, created)
    }

    const controlling = ensureControllingDb(db)
    const item = { id: nextId(controlling.costEntries), ...payload, created_at: nowIso() }
    controlling.costEntries.push(item)
    addAudit(db, auth.user, 'controlling_entry_created', item.descriere || item.categorie)
    writeDb(db)
    sendJson(res, 201, item)
  } catch (error) {
    next(error)
  }
})

router.post('/controlling/entries/:uuid/validate', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'controlling:entry_validate')) return

    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(`
UPDATE controlling.cost_entries
SET validat = 1,
    validat_de = JSON_VALUE(@p, '$.userId'),
    validat_la = sysdatetime()
WHERE uuid = JSON_VALUE(@p, '$.uuid');

SELECT TOP 1 *
FROM controlling.cost_entries
WHERE uuid = JSON_VALUE(@p, '$.uuid')
FOR JSON PATH;
`, { uuid: req.params.uuid, userId: auth.user.id })
      if (!item) return sendJson(res, 404, { error: 'Cheltuiala nu a fost gasita.' })
      addAudit(db, auth.user, 'controlling_entry_validated', req.params.uuid)
      writeDb(db)
      return sendJson(res, 200, item)
    }

    const controlling = ensureControllingDb(db)
    const item = controlling.costEntries.find((entry) => entry.uuid === req.params.uuid)
    if (!item) return sendJson(res, 404, { error: 'Cheltuiala nu a fost gasita.' })
    item.validat = true
    item.validat_de = auth.user.id
    item.validat_la = nowIso()
    addAudit(db, auth.user, 'controlling_entry_validated', req.params.uuid)
    writeDb(db)
    sendJson(res, 200, item)
  } catch (error) {
    next(error)
  }
})

router.get('/controlling/reports/buget-vs-real', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'controlling:reports')) return

    const lunaDate = normalizeMonth(req.query.luna)
    const year = Number(lunaDate.slice(0, 4))
    const month = Number(lunaDate.slice(5, 7))
    const centruId = req.query.centru_id || null

    if (isMssqlMode()) {
      const rows = mssqlArray(`
WITH real_costs AS (
  SELECT cost_center_id, categorie, SUM(valoare) AS real
  FROM controlling.cost_entries
  WHERE luna = TRY_CONVERT(date, JSON_VALUE(@p, '$.lunaDate'))
  AND (NULLIF(JSON_VALUE(@p, '$.centruId'), '') IS NULL OR cost_center_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.centruId')))
  GROUP BY cost_center_id, categorie
),
budget_rows AS (
  SELECT cost_center_id, categorie, SUM(valoare) AS buget
  FROM controlling.budgets
  WHERE an = TRY_CONVERT(int, JSON_VALUE(@p, '$.year'))
  AND (luna IS NULL OR luna = TRY_CONVERT(int, JSON_VALUE(@p, '$.month')))
  AND (NULLIF(JSON_VALUE(@p, '$.centruId'), '') IS NULL OR cost_center_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.centruId')))
  GROUP BY cost_center_id, categorie
)
SELECT
  cc.id AS centru_id,
  cc.denumire,
  COALESCE(r.categorie, b.categorie, N'total') AS categorie,
  COALESCE(b.buget, cc.buget_lunar, 0) AS buget,
  COALESCE(r.real, 0) AS real,
  COALESCE(b.buget, cc.buget_lunar, 0) - COALESCE(r.real, 0) AS diferenta,
  CASE WHEN COALESCE(b.buget, cc.buget_lunar, 0) > 0
    THEN ROUND(COALESCE(r.real, 0) / COALESCE(b.buget, cc.buget_lunar, 0) * 100, 2)
    ELSE 0 END AS procent_realizat
FROM controlling.cost_centers cc
LEFT JOIN real_costs r ON r.cost_center_id = cc.id
LEFT JOIN budget_rows b ON b.cost_center_id = cc.id AND ISNULL(b.categorie, N'') = ISNULL(r.categorie, N'')
WHERE cc.activ = 1
AND (NULLIF(JSON_VALUE(@p, '$.centruId'), '') IS NULL OR cc.id = TRY_CONVERT(int, JSON_VALUE(@p, '$.centruId')))
FOR JSON PATH;
`, { lunaDate, year, month, centruId })
      return sendJson(res, 200, rows.map((row) => ({ ...row, status: reportStatus(numberValue(row.procent_realizat)) })))
    }

    const db = readDb()
    const controlling = ensureControllingDb(db)
    const entries = controlling.costEntries.filter((entry) =>
      String(entry.luna).slice(0, 10) === lunaDate &&
      (!centruId || String(entry.cost_center_id) === String(centruId))
    )
    const groups = new Map()
    entries.forEach((entry) => {
      const key = `${entry.cost_center_id}|${entry.categorie}`
      groups.set(key, numberValue(groups.get(key)) + numberValue(entry.valoare))
    })
    const rows = []
    groups.forEach((real, key) => {
      const [costCenterId, categorie] = key.split('|')
      const center = controlling.costCenters.find((item) => String(item.id) === String(costCenterId)) || {}
      const buget = budgetFor(controlling.budgets, costCenterId, year, month, categorie) || numberValue(center.buget_lunar)
      const procent = buget > 0 ? Number(((real / buget) * 100).toFixed(2)) : 0
      rows.push({
        centru_id: Number(costCenterId),
        denumire: center.denumire,
        categorie,
        buget,
        real,
        diferenta: buget - real,
        procent_realizat: procent,
        status: reportStatus(procent)
      })
    })
    sendJson(res, 200, rows)
  } catch (error) {
    next(error)
  }
})

router.get('/controlling/reports/per-utilaj', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'controlling:reports')) return
    if (!req.query.utilaj_id) return sendJson(res, 400, { error: 'Parametrul utilaj_id este obligatoriu.' })

    if (isMssqlMode()) {
      const rows = mssqlArray(`
WITH costs AS (
  SELECT ce.luna, ce.categorie, SUM(ce.valoare) AS total_cheltuieli
  FROM controlling.cost_entries ce
  JOIN controlling.cost_centers sc ON sc.id = ce.subcentru_id
  WHERE sc.resursa_ref_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.utilajId'))
  AND sc.tip_resursa IN (N'utilaj', N'vehicul')
  GROUP BY ce.luna, ce.categorie
),
hours AS (
  SELECT DATEFROMPARTS(YEAR(data), MONTH(data), 1) AS luna, SUM(COALESCE(ore_efectuate, ore_motor, ore_lucrate, 0)) AS total_ore
  FROM fleet.work_logs
  WHERE asset_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.utilajId'))
  GROUP BY DATEFROMPARTS(YEAR(data), MONTH(data), 1)
)
SELECT
  c.luna,
  c.categorie,
  c.total_cheltuieli,
  COALESCE(h.total_ore, 0) AS total_ore,
  CASE WHEN COALESCE(h.total_ore, 0) > 0 THEN ROUND(c.total_cheltuieli / h.total_ore, 2) ELSE 0 END AS cost_per_ora
FROM costs c
LEFT JOIN hours h ON h.luna = c.luna
ORDER BY c.luna DESC, c.categorie
FOR JSON PATH;
`, { utilajId: req.query.utilaj_id })
      return sendJson(res, 200, rows)
    }

    const db = readDb()
    const controlling = ensureControllingDb(db)
    const subcenters = controlling.costCenters
      .filter((item) => String(item.resursa_ref_id) === String(req.query.utilaj_id) && ['utilaj', 'vehicul'].includes(String(item.tip_resursa)))
      .map((item) => String(item.id))
    const logs = db.fleet?.workLogs || db.fleetWorkLogs || []
    const hoursByMonth = new Map()
    logs.filter((log) => String(log.asset_id || log.utilaj_id) === String(req.query.utilaj_id)).forEach((log) => {
      const month = firstDayOfMonth(log.data)
      hoursByMonth.set(month, numberValue(hoursByMonth.get(month)) + numberValue(log.ore_efectuate || log.ore_motor || log.ore_lucrate))
    })
    const groups = new Map()
    controlling.costEntries.filter((entry) => subcenters.includes(String(entry.subcentru_id))).forEach((entry) => {
      const key = `${entry.luna}|${entry.categorie}`
      groups.set(key, numberValue(groups.get(key)) + numberValue(entry.valoare))
    })
    const rows = []
    groups.forEach((total, key) => {
      const [luna, categorie] = key.split('|')
      const totalOre = numberValue(hoursByMonth.get(luna))
      rows.push({ luna, categorie, total_cheltuieli: total, total_ore: totalOre, cost_per_ora: totalOre > 0 ? Number((total / totalOre).toFixed(2)) : 0 })
    })
    sendJson(res, 200, rows)
  } catch (error) {
    next(error)
  }
})

router.get('/controlling/reports/per-santier', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'controlling:reports')) return
    if (!req.query.santier_id) return sendJson(res, 400, { error: 'Parametrul santier_id este obligatoriu.' })

    if (isMssqlMode()) {
      const rows = mssqlArray(`
SELECT
  ce.cost_center_id,
  cc.denumire,
  ce.categorie,
  SUM(ce.valoare) AS cost_total
FROM controlling.cost_entries ce
JOIN controlling.cost_centers cc ON cc.id = ce.cost_center_id
WHERE ce.santier_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.santierId'))
GROUP BY ce.cost_center_id, cc.denumire, ce.categorie
FOR JSON PATH;
`, { santierId: req.query.santier_id })
      const revenueRow = mssqlObject(`
SELECT COALESCE(SUM(total_fara_tva), 0) AS venit
FROM integration.situation_imports
WHERE project_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.santierId'))
AND status = N'aprobat'
FOR JSON PATH;
`, { santierId: req.query.santier_id })
      const costTotal = rows.reduce((sum, row) => sum + numberValue(row.cost_total), 0)
      const venit = numberValue(revenueRow?.venit)
      return sendJson(res, 200, { venit, cost_total: costTotal, marja: venit - costTotal, detalii: rows })
    }

    const db = readDb()
    const controlling = ensureControllingDb(db)
    const groups = new Map()
    controlling.costEntries.filter((entry) => String(entry.santier_id) === String(req.query.santier_id)).forEach((entry) => {
      const key = `${entry.cost_center_id}|${entry.categorie}`
      groups.set(key, numberValue(groups.get(key)) + numberValue(entry.valoare))
    })
    const detalii = []
    groups.forEach((cost, key) => {
      const [costCenterId, categorie] = key.split('|')
      detalii.push({ cost_center_id: Number(costCenterId), denumire: costCenterName(db, costCenterId), categorie, cost_total: cost })
    })
    const costTotal = detalii.reduce((sum, item) => sum + numberValue(item.cost_total), 0)
    const venit = projectRevenue(db, req.query.santier_id)
    sendJson(res, 200, { venit, cost_total: costTotal, marja: venit - costTotal, detalii })
  } catch (error) {
    next(error)
  }
})

router.get('/controlling/reports/automatic-costs', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'controlling:reports')) return

    const db = readDb()
    const luna = String(req.query.luna || todayIso().slice(0, 7)).slice(0, 7)
    const m = db.mechanization || {}
    const workOrders = Array.isArray(m.workOrders) ? m.workOrders : []
    const fuelLogs = Array.isArray(m.fuelLogs) ? m.fuelLogs : []
    const interventions = Array.isArray(m.interventions) ? m.interventions : []

    const assetIds = new Set()
    workOrders.filter(item => String(item.date || '').startsWith(luna)).forEach(item => assetIds.add(String(item.asset_id)))
    fuelLogs.filter(item => String(item.data || '').startsWith(luna)).forEach(item => assetIds.add(String(item.asset_id)))
    interventions.filter(item => String(item.data_intrare || '').startsWith(luna)).forEach(item => assetIds.add(String(item.asset_id)))

    const rows = [...assetIds].filter(Boolean).map(assetId => {
      const asset = (db.fleetAssets || []).find(item => String(item.id) === assetId)
      const assetWorkOrders = workOrders.filter(item => String(item.asset_id) === assetId && String(item.date || '').startsWith(luna))
      const assetFuelLogs = fuelLogs.filter(item => String(item.asset_id) === assetId && String(item.data || '').startsWith(luna))
      const assetInterventions = interventions.filter(item => String(item.asset_id) === assetId && String(item.data_intrare || '').startsWith(luna))
      const explicitCostCenterId = assetWorkOrders.find(item => item.cost_center_id)?.cost_center_id
        || assetFuelLogs.find(item => item.cost_center_id)?.cost_center_id
        || assetInterventions.find(item => item.cost_center_id)?.cost_center_id
        || ''
      const center = findCostCenterForAsset(db, assetId, explicitCostCenterId)
      const ore_total = assetWorkOrders.reduce((sum, item) => sum + numberValue(item.ore_lucrate), 0)
      const km_total = assetWorkOrders.reduce((sum, item) => sum + numberValue(item.km_parcursi), 0)
      const consum_real = assetWorkOrders.reduce((sum, item) => sum + numberValue(item.consum_carburant), 0)
      const consum_normat = assetWorkOrders.reduce((sum, item) => sum + numberValue(item.consum_normat), 0)
      const cost_carburant = assetFuelLogs.reduce((sum, item) => sum + numberValue(item.valoare_totala), 0)
      const cost_reparatii = assetInterventions.reduce((sum, item) => sum + numberValue(item.cost_total || item.cost), 0)
      const cost_total = cost_carburant + cost_reparatii
      return {
        asset_id: assetId,
        asset_name: [asset?.name, asset?.registration].filter(Boolean).join(' / ') || assetWorkOrders[0]?.asset_name || assetFuelLogs[0]?.asset_name || assetInterventions[0]?.asset_name || assetId,
        cost_center_id: center?.id || null,
        cost_center_name: center?.denumire || 'Nealocat',
        ore_total: Number(ore_total.toFixed(2)),
        km_total: Number(km_total.toFixed(2)),
        consum_real: Number(consum_real.toFixed(2)),
        consum_normat: Number(consum_normat.toFixed(2)),
        diferenta_consum: Number((consum_real - consum_normat).toFixed(2)),
        cost_carburant: Number(cost_carburant.toFixed(2)),
        cost_reparatii: Number(cost_reparatii.toFixed(2)),
        cost_total: Number(cost_total.toFixed(2)),
        cost_ora: ore_total > 0 ? Number((cost_total / ore_total).toFixed(2)) : 0
      }
    }).sort((a, b) => b.cost_total - a.cost_total)

    const summaryMap = new Map()
    rows.forEach(row => {
      const key = String(row.cost_center_id || 'nealocat')
      const current = summaryMap.get(key) || {
        cost_center_id: row.cost_center_id,
        cost_center_name: row.cost_center_name,
        ore_total: 0,
        cost_carburant: 0,
        cost_reparatii: 0,
        cost_total: 0
      }
      current.ore_total += row.ore_total
      current.cost_carburant += row.cost_carburant
      current.cost_reparatii += row.cost_reparatii
      current.cost_total += row.cost_total
      summaryMap.set(key, current)
    })
    const summary = [...summaryMap.values()].map(item => ({
      ...item,
      ore_total: Number(item.ore_total.toFixed(2)),
      cost_carburant: Number(item.cost_carburant.toFixed(2)),
      cost_reparatii: Number(item.cost_reparatii.toFixed(2)),
      cost_total: Number(item.cost_total.toFixed(2)),
      cost_ora: item.ore_total > 0 ? Number((item.cost_total / item.ore_total).toFixed(2)) : 0
    })).sort((a, b) => b.cost_total - a.cost_total)

    sendJson(res, 200, {
      luna,
      rows,
      summary,
      totals: {
        ore_total: Number(rows.reduce((sum, row) => sum + row.ore_total, 0).toFixed(2)),
        cost_carburant: Number(rows.reduce((sum, row) => sum + row.cost_carburant, 0).toFixed(2)),
        cost_reparatii: Number(rows.reduce((sum, row) => sum + row.cost_reparatii, 0).toFixed(2)),
        cost_total: Number(rows.reduce((sum, row) => sum + row.cost_total, 0).toFixed(2))
      }
    })
  } catch (error) {
    next(error)
  }
})

router.get('/controlling/dashboard', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'controlling:view_all')) return

    const luna = currentMonth()
    if (isMssqlMode()) {
      const summary = mssqlObject(`
SELECT
  COALESCE((SELECT SUM(valoare) FROM controlling.budgets WHERE an = YEAR(GETDATE()) AND (luna IS NULL OR luna = MONTH(GETDATE()))), 0) AS total_buget,
  COALESCE((SELECT SUM(valoare) FROM controlling.cost_entries WHERE luna = TRY_CONVERT(date, JSON_VALUE(@p, '$.luna'))), 0) AS total_real
FOR JSON PATH;
`, { luna }) || { total_buget: 0, total_real: 0 }
      const centers = mssqlArray(`
SELECT
  cc.id,
  cc.denumire,
  COALESCE(cc.buget_lunar, 0) AS buget,
  COALESCE(SUM(ce.valoare), 0) AS real
FROM controlling.cost_centers cc
LEFT JOIN controlling.cost_entries ce ON ce.cost_center_id = cc.id AND ce.luna = TRY_CONVERT(date, JSON_VALUE(@p, '$.luna'))
WHERE cc.activ = 1
GROUP BY cc.id, cc.denumire, cc.buget_lunar
FOR JSON PATH;
`, { luna })
      const top5 = mssqlArray(`
SELECT TOP 5 ce.descriere, ce.valoare, cc.denumire AS centru
FROM controlling.cost_entries ce
JOIN controlling.cost_centers cc ON cc.id = ce.cost_center_id
WHERE ce.luna = TRY_CONVERT(date, JSON_VALUE(@p, '$.luna'))
ORDER BY ce.valoare DESC
FOR JSON PATH;
`, { luna })
      const evolution = mssqlArray(`
SELECT luna, SUM(valoare) AS valoare
FROM controlling.cost_entries
WHERE luna >= DATEADD(month, -5, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
GROUP BY luna
ORDER BY luna
FOR JSON PATH;
`)
      const totalBuget = numberValue(summary.total_buget)
      const totalReal = numberValue(summary.total_real)
      return sendJson(res, 200, {
        total_buget: totalBuget,
        total_real: totalReal,
        procent_global: totalBuget > 0 ? Number(((totalReal / totalBuget) * 100).toFixed(2)) : 0,
        centre_depasit: centers.filter((item) => numberValue(item.buget) > 0 && numberValue(item.real) > numberValue(item.buget)),
        centre_atentie: centers.filter((item) => {
          const percent = numberValue(item.buget) > 0 ? numberValue(item.real) / numberValue(item.buget) * 100 : 0
          return percent >= 85 && percent <= 100
        }),
        top5_cheltuieli: top5,
        evolutie_6_luni: evolution
      })
    }

    const db = readDb()
    const controlling = ensureControllingDb(db)
    const monthEntries = controlling.costEntries.filter((entry) => String(entry.luna).slice(0, 10) === luna)
    const totalReal = monthEntries.reduce((sum, entry) => sum + numberValue(entry.valoare), 0)
    const totalBuget = controlling.costCenters.reduce((sum, item) => sum + numberValue(item.buget_lunar), 0)
    const totals = monthlyTotalsByCenter(controlling.costEntries, luna)
    const centerRows = controlling.costCenters.map((center) => ({ id: center.id, centru: center.denumire, buget: numberValue(center.buget_lunar), real: numberValue(totals.get(String(center.id))) }))
    const top5 = [...monthEntries].sort((a, b) => numberValue(b.valoare) - numberValue(a.valoare)).slice(0, 5).map((entry) => ({ descriere: entry.descriere, valoare: entry.valoare, centru: costCenterName(db, entry.cost_center_id) }))
    const evolutionMap = new Map()
    controlling.costEntries.forEach((entry) => {
      evolutionMap.set(entry.luna, numberValue(evolutionMap.get(entry.luna)) + numberValue(entry.valoare))
    })
    const evolution = [...evolutionMap.entries()].sort().slice(-6).map(([itemLuna, valoare]) => ({ luna: itemLuna, valoare }))
    sendJson(res, 200, {
      total_buget: totalBuget,
      total_real: totalReal,
      procent_global: totalBuget > 0 ? Number(((totalReal / totalBuget) * 100).toFixed(2)) : 0,
      centre_depasit: centerRows.filter((item) => item.buget > 0 && item.real > item.buget),
      centre_atentie: centerRows.filter((item) => item.buget > 0 && item.real / item.buget * 100 >= 85 && item.real <= item.buget),
      top5_cheltuieli: top5,
      evolutie_6_luni: evolution
    })
  } catch (error) {
    next(error)
  }
})

router.post('/controlling/reports/nexus-export', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'controlling:nexus_export')) return

    const luna = normalizeMonth(req.body?.luna || req.query.luna)
    let rows
    if (isMssqlMode()) {
      rows = mssqlArray(`
SELECT
  ce.categorie,
  ce.descriere,
  ce.valoare,
  cc.cod AS centru_cod
FROM controlling.cost_entries ce
JOIN controlling.cost_centers cc ON cc.id = ce.cost_center_id
WHERE ce.luna = TRY_CONVERT(date, JSON_VALUE(@p, '$.luna'))
AND ce.validat = 1
ORDER BY ce.created_at
FOR JSON PATH;
`, { luna })
    } else {
      const db = readDb()
      const controlling = ensureControllingDb(db)
      rows = controlling.costEntries
        .filter((entry) => String(entry.luna).slice(0, 10) === luna && (entry.validat === true || entry.validat === 1))
        .map((entry) => ({ ...entry, centru_cod: costCenterCode(db, entry.cost_center_id) }))
    }

    const data = rows.map((entry) => ({
      'Cont contabil': nexusAccounts[entry.categorie] || '6588',
      Descriere: entry.descriere || entry.categorie,
      'Valoare debit': numberValue(entry.valoare),
      'Valoare credit': 0,
      'Centru de cost': entry.centru_cod || ''
    }))
    const workbook = xlsx.utils.book_new()
    const sheet = xlsx.utils.json_to_sheet(data)
    xlsx.utils.book_append_sheet(workbook, sheet, 'Nexus')
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename=controlling_nexus_export.xlsx')
    res.send(buffer)
  } catch (error) {
    next(error)
  }
})

router.get('/controlling/budgets', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'controlling:view')) return

    const an = Number(req.query.an || new Date().getFullYear())
    if (isMssqlMode()) {
      const rows = mssqlArray(`
SELECT b.*, cc.cod, cc.denumire
FROM controlling.budgets b
JOIN controlling.cost_centers cc ON cc.id = b.cost_center_id
WHERE b.an = TRY_CONVERT(int, JSON_VALUE(@p, '$.an'))
ORDER BY cc.denumire, b.luna, b.categorie
FOR JSON PATH;
`, { an })
      return sendJson(res, 200, rows)
    }

    const db = readDb()
    const controlling = ensureControllingDb(db)
    sendJson(res, 200, controlling.budgets.filter((item) => Number(item.an) === an))
  } catch (error) {
    next(error)
  }
})

router.post('/controlling/budgets', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'controlling:budget_manage')) return

    const body = req.body || {}
    if (!body.cost_center_id || !body.an || body.valoare == null) {
      return sendJson(res, 400, { error: 'Date incomplete pentru buget.' })
    }

    const db = readDb()
    if (isMssqlMode()) {
      const row = mssqlObject(`
DECLARE @existing int;
SELECT @existing = id
FROM controlling.budgets
WHERE cost_center_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.cost_center_id'))
AND an = TRY_CONVERT(int, JSON_VALUE(@p, '$.an'))
AND ISNULL(luna, -1) = ISNULL(TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.luna'), '')), -1)
AND ISNULL(categorie, N'') = ISNULL(NULLIF(JSON_VALUE(@p, '$.categorie'), ''), N'');

IF @existing IS NULL
BEGIN
  INSERT INTO controlling.budgets (cost_center_id, an, luna, categorie, valoare, aprobat_de, aprobat_la)
  VALUES (
    TRY_CONVERT(int, JSON_VALUE(@p, '$.cost_center_id')),
    TRY_CONVERT(int, JSON_VALUE(@p, '$.an')),
    TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.luna'), '')),
    NULLIF(JSON_VALUE(@p, '$.categorie'), ''),
    TRY_CONVERT(decimal(15,2), JSON_VALUE(@p, '$.valoare')),
    JSON_VALUE(@p, '$.userId'),
    sysdatetime()
  );
  SET @existing = SCOPE_IDENTITY();
END
ELSE
BEGIN
  UPDATE controlling.budgets
  SET valoare = TRY_CONVERT(decimal(15,2), JSON_VALUE(@p, '$.valoare')),
      aprobat_de = JSON_VALUE(@p, '$.userId'),
      aprobat_la = sysdatetime()
  WHERE id = @existing;
END;

SELECT TOP 1 *
FROM controlling.budgets
WHERE id = @existing
FOR JSON PATH;
`, { ...body, userId: auth.user.id })
      addAudit(db, auth.user, 'controlling_budget_upserted', `${body.cost_center_id}/${body.an}`)
      writeDb(db)
      return sendJson(res, 200, row)
    }

    const controlling = ensureControllingDb(db)
    let item = controlling.budgets.find((budget) =>
      String(budget.cost_center_id) === String(body.cost_center_id) &&
      Number(budget.an) === Number(body.an) &&
      String(budget.luna || '') === String(body.luna || '') &&
      String(budget.categorie || '') === String(body.categorie || '')
    )
    if (!item) {
      item = {
        id: nextId(controlling.budgets),
        cost_center_id: body.cost_center_id,
        an: Number(body.an),
        luna: body.luna || null,
        categorie: body.categorie || null,
        created_at: nowIso()
      }
      controlling.budgets.push(item)
    }
    item.valoare = numberValue(body.valoare)
    item.aprobat_de = auth.user.id
    item.aprobat_la = nowIso()
    addAudit(db, auth.user, 'controlling_budget_upserted', `${body.cost_center_id}/${body.an}`)
    writeDb(db)
    sendJson(res, 200, item)
  } catch (error) {
    next(error)
  }
})

module.exports = router
