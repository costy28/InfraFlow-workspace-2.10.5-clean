const { Router } = require('express')
const crypto = require('crypto')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { readDb, writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')

const router = Router()

const FAZ_ACTIVITIES = [
  { id: 1, denumire: 'DESZAPEZIRE', detalii: null, grup: 'deszapezire', activ: 1 },
  { id: 2, denumire: 'BALASTARE STRADA TARNEI', detalii: null, grup: 'terasamente', activ: 1 },
  { id: 3, denumire: 'FREZAT', detalii: 'ASFALT', grup: 'lucrari_asfalt', activ: 1 },
  { id: 4, denumire: 'DESCARCARE', detalii: 'PAVELE', grup: 'transport', activ: 1 },
  { id: 5, denumire: 'INCARCARE', detalii: 'BALAST, PAMANT', grup: 'transport', activ: 1 },
  { id: 6, denumire: 'INCARCARE', detalii: 'REFUZ FREZA', grup: 'transport', activ: 1 },
  { id: 7, denumire: 'MATURARE', detalii: 'MATURAT SUPRAFATA LUCRU', grup: 'salubrizare', activ: 1 },
  { id: 8, denumire: 'INCARCARE', detalii: 'PAVELE', grup: 'transport', activ: 1 },
  { id: 9, denumire: 'REPARATII', detalii: 'DEFECT', grup: 'diverse', activ: 1 },
  { id: 10, denumire: 'MUTAT AGREGATE', detalii: null, grup: 'transport', activ: 1 },
  { id: 11, denumire: 'INCARCAT BETON', detalii: 'FORMATIA BETOANE', grup: 'betoane', activ: 1 },
  { id: 12, denumire: 'ALIMENTARE STATIE ASFALT', detalii: null, grup: 'diverse', activ: 1 },
  { id: 13, denumire: 'PICONAT', detalii: null, grup: 'terasamente', activ: 1 },
  { id: 14, denumire: 'PICONAT SI INCARCAT', detalii: null, grup: 'terasamente', activ: 1 },
  { id: 15, denumire: 'ESCAVAT', detalii: null, grup: 'terasamente', activ: 1 },
  { id: 16, denumire: 'COMPACTAT ASFALT', detalii: 'COMPACTAT ASFALT', grup: 'lucrari_asfalt', activ: 1 },
  { id: 17, denumire: 'TERASAT', detalii: 'TERASAT', grup: 'terasamente', activ: 1 },
  { id: 18, denumire: 'ASTERNERE ASFALT', detalii: 'ASTERNERE ASFALT', grup: 'lucrari_asfalt', activ: 1 },
  { id: 19, denumire: 'SCHIMBARE PUNCT DE LUCRU', detalii: 'MUTAT FINISOR', grup: 'diverse', activ: 1 },
  { id: 20, denumire: 'ALIMENTARE', detalii: 'ALIMENTARE CU CARBURANT', grup: 'diverse', activ: 1 },
  { id: 21, denumire: 'FREZAT', detalii: 'FREZAT ASFALT', grup: 'lucrari_asfalt', activ: 1 },
  { id: 22, denumire: 'PICONAT', detalii: 'PICONAT', grup: 'terasamente', activ: 1 },
  { id: 23, denumire: 'TAIAT ASFALT', detalii: 'TAIAT ASFALT', grup: 'lucrari_asfalt', activ: 1 },
  { id: 24, denumire: 'IMPRASTIAT EMULSIE BITUMINOASA', detalii: null, grup: 'lucrari_asfalt', activ: 1 },
  { id: 25, denumire: 'SPALAT UTILAJE', detalii: 'SPALAT UTILAJE', grup: 'salubrizare', activ: 1 },
  { id: 26, denumire: 'TRANSPORT APA', detalii: null, grup: 'transport', activ: 1 },
  { id: 27, denumire: 'MATURAT', detalii: null, grup: 'salubrizare', activ: 1 },
  { id: 28, denumire: 'TRANSPORT APA SI MATURAT', detalii: null, grup: 'salubrizare', activ: 1 },
  { id: 29, denumire: 'SUDURA', detalii: 'SUDURA', grup: 'diverse', activ: 1 },
  { id: 30, denumire: 'MARCAJ RUTIER', detalii: 'MARCAJ RUTIER', grup: 'siguranta_circ', activ: 1 },
  { id: 31, denumire: 'TRACTAT MASINA MARCAJ', detalii: null, grup: 'siguranta_circ', activ: 1 },
  { id: 32, denumire: 'CAMINE', detalii: 'SCHIMBARE PLANSEE', grup: 'canalizare', activ: 1 },
  { id: 33, denumire: 'BORDURI', detalii: 'SCHIMBAT/SPART BORDURA', grup: 'siguranta_circ', activ: 1 },
  { id: 34, denumire: 'SPATII JOACA', detalii: null, grup: 'diverse', activ: 1 },
  { id: 35, denumire: 'PROFILAT DRUM', detalii: 'PROFILAT', grup: 'terasamente', activ: 1 },
  { id: 36, denumire: 'TERASAT', detalii: null, grup: 'terasamente', activ: 1 },
  { id: 37, denumire: 'TAIAT BETON', detalii: 'TAIAT BETON', grup: 'betoane', activ: 1 },
  { id: 38, denumire: 'COMPACTAT SI TERASAT', detalii: null, grup: 'terasamente', activ: 1 },
  { id: 39, denumire: 'PICONAT', detalii: null, grup: 'terasamente', activ: 1 },
  { id: 40, denumire: 'TAIAT', detalii: null, grup: 'lucrari_asfalt', activ: 1 },
  { id: 41, denumire: 'ASTERNERE ASFALT', detalii: null, grup: 'lucrari_asfalt', activ: 1 },
  { id: 42, denumire: 'STAT LA DISPOZITIE', detalii: 'STAT LA DISPOZITIE', grup: 'diverse', activ: 1 },
  { id: 43, denumire: 'INTRETINERE', detalii: 'INTRETINERE', grup: 'diverse', activ: 1 },
  { id: 44, denumire: 'STATIE ASFALT', detalii: null, grup: 'lucrari_asfalt', activ: 1 }
]

const HOUR_FIELDS = [
  'ore_lucru_efectiv',
  'ore_deplasare',
  'ore_asteptare',
  'ore_imobilizare',
  'ore_reparatii',
  'ore_standby',
  'ore_defect',
  'ore_ll',
  'ore_sll',
  'ore_lm',
  'ore_lc',
  'ore_ac'
]

const NUMERIC_FIELDS = [
  'ore_program',
  ...HOUR_FIELDS,
  'motorina_l',
  'benzina_l',
  'ulei_motor_l',
  'ulei_hidraulic_l',
  'ulei_transmisie_l',
  'vaselina_kg'
]

function sendJson(res, status, data) {
  res.status(status).json(data)
}

function nowIso() {
  return new Date().toISOString()
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function uuid() {
  return crypto.randomUUID()
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1
}

function ensureFleetFcDb(db) {
  db.fleetFcLogs = Array.isArray(db.fleetFcLogs) ? db.fleetFcLogs : []
  db.fleetFazActivities = Array.isArray(db.fleetFazActivities) ? db.fleetFazActivities : []
  if (db.fleetFazActivities.length < FAZ_ACTIVITIES.length) {
    const existing = new Set(db.fleetFazActivities.map(item => Number(item.id)))
    for (const activity of FAZ_ACTIVITIES) {
      if (!existing.has(activity.id)) db.fleetFazActivities.push({ ...activity })
    }
  }
  if (!Array.isArray(db.audit)) db.audit = []
  return db.fleetFcLogs
}

function activitiesList(db) {
  ensureFleetFcDb(db)
  return db.fleetFazActivities
}

function assetList(db) {
  return Array.isArray(db.fleetAssets) ? db.fleetAssets : []
}

function employeesList(db) {
  return db.hr?.employees || db.employees || []
}

function assetId(asset) {
  return String(asset?.id ?? asset?.asset_id ?? '')
}

function findAsset(db, id) {
  return assetList(db).find(asset => assetId(asset) === String(id))
}

function isEquipment(asset = {}) {
  const explicit = String(asset.tip_asset || asset.tipAsset || '').toLowerCase()
  if (explicit === 'utilaj') return true
  if (explicit === 'autovehicul') return false
  if (asset.category === 'equipment') return true
  return !asset.nr_inmatriculare && !asset.registration
}

function employeeName(employee) {
  if (!employee) return ''
  return [employee.nume, employee.prenume].filter(Boolean).join(' ') || employee.name || employee.fullName || ''
}

function fcOperatorName(db, fc) {
  const employee = employeesList(db).find(item => String(item.id) === String(fc.operator_id))
  return employeeName(employee) || fc.operator_text || '-'
}

function assetLabel(asset) {
  if (!asset) return '-'
  return [
    asset.cod || asset.nr_inmatriculare || asset.registration || asset.assetCode || asset.nr_inventar,
    [asset.marca || asset.brand, asset.model].filter(Boolean).join(' ')
  ].filter(Boolean).join(' / ') || asset.name || '-'
}

function activityLabel(activity) {
  if (!activity) return '-'
  return [activity.denumire, activity.detalii].filter(Boolean).join(' - ')
}

function findActivity(db, id) {
  return activitiesList(db).find(item => String(item.id) === String(id))
}

function normalizeDate(value, fallback = todayIso()) {
  const text = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback
}

function monthStart(value) {
  const date = normalizeDate(value)
  return `${date.slice(0, 7)}-01`
}

function numberValue(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function totalHours(fc) {
  return round2(HOUR_FIELDS.reduce((sum, field) => sum + numberValue(fc[field], 0), 0))
}

function normalizedFc(db, fc) {
  const asset = findAsset(db, fc.asset_id)
  const activity = findActivity(db, fc.tip_activitate_id)
  const consumNormat = fc.consum_orar_normat == null
    ? null
    : round2(numberValue(fc.ore_lucru_efectiv, 0) * numberValue(fc.consum_orar_normat, 0))
  const diferenta = consumNormat == null ? null : round2(numberValue(fc.motorina_l, 0) - consumNormat)
  return {
    ...fc,
    asset,
    asset_label: assetLabel(asset),
    operator_nume: fcOperatorName(db, fc),
    activitate_label: activityLabel(activity),
    ore_total: totalHours(fc),
    consum_normat: consumNormat,
    diferenta_motorina: diferenta
  }
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

function nextMonthlyNumber(items, luna) {
  return items
    .filter(item => item.luna === luna)
    .reduce((max, item) => Math.max(max, Number(item.numar || 0)), 0) + 1
}

function applyFcFields(target, body) {
  if (body.asset_id !== undefined) target.asset_id = body.asset_id
  if (body.operator_id !== undefined) target.operator_id = body.operator_id || null
  if (body.operator_text !== undefined) target.operator_text = String(body.operator_text || '').trim()
  if (body.data !== undefined) {
    target.data = normalizeDate(body.data)
    target.luna = monthStart(target.data)
  }
  if (body.locatie !== undefined) target.locatie = String(body.locatie || '').trim()
  if (body.tip_activitate_id !== undefined) target.tip_activitate_id = body.tip_activitate_id || null
  if (body.activitati_text !== undefined) target.activitati_text = String(body.activitati_text || '').trim()
  for (const field of NUMERIC_FIELDS) {
    if (body[field] !== undefined) target[field] = numberValue(body[field], 0)
  }
}

function validateHours(fc) {
  const diff = Math.abs(totalHours(fc) - numberValue(fc.ore_program, 0))
  if (diff > 0.5) {
    return `Totalul orelor (${totalHours(fc).toFixed(2)}) trebuie să fie aproape egal cu ore program (${numberValue(fc.ore_program, 0).toFixed(2)}), toleranță ±0.5h.`
  }
  return null
}

function canReadFc(auth, res) {
  if (auth?.user?.role === 'operator') return true
  return requirePermission(auth, res, 'fleet:fc_view')
}

function canCreateFc(auth, res) {
  if (auth?.user?.role === 'operator') return true
  return requirePermission(auth, res, 'fleet:fc_create')
}

function canEditFc(auth, res) {
  if (auth?.user?.role === 'operator') return true
  return requirePermission(auth, res, 'fleet:fc_edit')
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildFcHtml(db, fc) {
  const row = normalizedFc(db, fc)
  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <title>FC Utilaj ${escapeHtml(row.numar || row.uuid)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; padding: 28px; }
    h1 { margin: 0 0 4px; font-size: 24px; }
    h2 { margin-top: 26px; font-size: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #cbd5e1; padding: 7px; text-align: left; }
    th { background: #f1f5f9; }
    .muted { color: #64748b; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .box { border: 1px solid #cbd5e1; padding: 12px; min-height: 80px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>Fișă Consum Utilaj</h1>
  <div class="muted">InfraFlow / FAZ utilaje / ${escapeHtml(row.data)}</div>
  <div class="grid">
    <div class="box">
      <strong>Utilaj:</strong> ${escapeHtml(row.asset_label)}<br>
      <strong>Operator:</strong> ${escapeHtml(row.operator_nume)}<br>
      <strong>Locație:</strong> ${escapeHtml(row.locatie || '-')}
    </div>
    <div class="box">
      <strong>Număr FC:</strong> ${escapeHtml(row.numar || '-')}<br>
      <strong>Luna:</strong> ${escapeHtml(row.luna)}<br>
      <strong>Status:</strong> ${escapeHtml(row.status)}
    </div>
  </div>
  <h2>Activitate</h2>
  <table>
    <tr><th>Activitate</th><td>${escapeHtml(row.activitate_label)}</td></tr>
    <tr><th>Descriere</th><td>${escapeHtml(row.activitati_text || '-')}</td></tr>
  </table>
  <h2>Ore</h2>
  <table>
    <tr><th>OP</th><th>LE</th><th>Deplasare</th><th>AT</th><th>IZ</th><th>RP</th><th>SE</th><th>Defect</th><th>Total</th></tr>
    <tr>
      <td>${row.ore_program}</td><td>${row.ore_lucru_efectiv}</td><td>${row.ore_deplasare}</td>
      <td>${row.ore_asteptare}</td><td>${row.ore_imobilizare}</td><td>${row.ore_reparatii}</td>
      <td>${row.ore_standby}</td><td>${row.ore_defect}</td><td>${row.ore_total}</td>
    </tr>
  </table>
  <h2>Combustibil și lubrifiante</h2>
  <table>
    <tr><th>Motorină reală</th><th>Consum normat</th><th>Diferență</th><th>Benzină</th><th>Ulei motor</th><th>Ulei hidraulic</th><th>Ulei transmisie</th><th>Vaselină</th></tr>
    <tr>
      <td>${row.motorina_l} l</td><td>${row.consum_normat ?? '-'} l</td><td>${row.diferenta_motorina ?? '-'} l</td>
      <td>${row.benzina_l} l</td><td>${row.ulei_motor_l} l</td><td>${row.ulei_hidraulic_l} l</td>
      <td>${row.ulei_transmisie_l} l</td><td>${row.vaselina_kg} kg</td>
    </tr>
  </table>
  <br><br>
  <table>
    <tr><th>Mecanic deservent</th><th>Responsabil lucrare</th><th>Șef mecanizare</th></tr>
    <tr><td style="height:50px"></td><td></td><td></td></tr>
  </table>
</body>
</html>`
}

function buildFazHtml(db, rows, luna) {
  const publicRows = rows.map(row => normalizedFc(db, row))
  const totals = publicRows.reduce((sum, row) => ({
    ore: sum.ore + Number(row.ore_total || 0),
    motorina: sum.motorina + Number(row.motorina_l || 0),
    normat: sum.normat + Number(row.consum_normat || 0),
    diferenta: sum.diferenta + Number(row.diferenta_motorina || 0)
  }), { ore: 0, motorina: 0, normat: 0, diferenta: 0 })
  const bodyRows = publicRows.map(row => `
    <tr>
      <td>${escapeHtml(row.data)}</td>
      <td>${escapeHtml(row.asset_label)}</td>
      <td>${escapeHtml(row.operator_nume)}</td>
      <td>${escapeHtml(row.activitate_label)}</td>
      <td>${row.ore_total.toFixed(2)}</td>
      <td>${Number(row.motorina_l || 0).toFixed(2)}</td>
      <td>${Number(row.consum_normat || 0).toFixed(2)}</td>
      <td>${Number(row.diferenta_motorina || 0).toFixed(2)}</td>
    </tr>
  `).join('')
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>FAZ Utilaje ${escapeHtml(luna)}</title>
  <style>body{font-family:Arial,sans-serif;padding:28px;color:#111827}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left}th{background:#f1f5f9}.total{font-weight:bold;background:#ecfdf5}</style></head>
  <body><h1>FAZ Lunar Utilaje - ${escapeHtml(luna)}</h1>
  <table><thead><tr><th>Data</th><th>Utilaj</th><th>Operator</th><th>Activitate</th><th>Ore</th><th>Motorină</th><th>Normat</th><th>Dif.</th></tr></thead>
  <tbody>${bodyRows}<tr class="total"><td colspan="4">Total</td><td>${totals.ore.toFixed(2)}</td><td>${totals.motorina.toFixed(2)}</td><td>${totals.normat.toFixed(2)}</td><td>${totals.diferenta.toFixed(2)}</td></tr></tbody></table></body></html>`
}

router.get('/fleet/faz-activities', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canReadFc(auth, res)) return
    const db = readDb()
    sendJson(res, 200, { activities: activitiesList(db).filter(item => item.activ !== 0) })
  } catch (error) {
    next(error)
  }
})

router.get('/fleet/fc-logs', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canReadFc(auth, res)) return
    const db = readDb()
    let rows = ensureFleetFcDb(db).map(row => normalizedFc(db, row))
    if (auth.user.role === 'operator') {
      rows = rows.filter(row => String(row.operator_id) === String(auth.user.employee_id || auth.user.employeeId || ''))
    }
    if (req.query.asset_id) rows = rows.filter(row => String(row.asset_id) === String(req.query.asset_id))
    if (req.query.luna) rows = rows.filter(row => String(row.luna || row.data || '').startsWith(String(req.query.luna)))
    if (req.query.status) rows = rows.filter(row => row.status === req.query.status)
    rows.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || Number(b.numar || 0) - Number(a.numar || 0))
    sendJson(res, 200, { fc_logs: rows })
  } catch (error) {
    next(error)
  }
})

router.post('/fleet/fc-logs', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canCreateFc(auth, res)) return
    const db = readDb()
    const rows = ensureFleetFcDb(db)
    const body = req.body || {}
    const asset = findAsset(db, body.asset_id)
    if (!asset || !isEquipment(asset)) return sendJson(res, 404, { error: 'Utilajul nu există.' })

    const data = normalizeDate(body.data)
    const luna = monthStart(data)
    const fc = {
      id: nextId(rows),
      uuid: uuid(),
      asset_id: body.asset_id,
      operator_id: body.operator_id || null,
      operator_text: String(body.operator_text || '').trim(),
      data,
      numar: nextMonthlyNumber(rows, luna),
      luna,
      locatie: '',
      tip_activitate_id: null,
      activitati_text: '',
      status: 'draft',
      autominder_id: null,
      consum_orar_normat: assetHourlyConsumption(asset) || null,
      creat_de: auth.user.id,
      created_by_name: auth.user.name,
      created_at: nowIso()
    }
    for (const field of NUMERIC_FIELDS) fc[field] = 0
    applyFcFields(fc, body)
    fc.consum_orar_normat = assetHourlyConsumption(asset) || fc.consum_orar_normat
    const hourError = validateHours(fc)
    if (hourError) return sendJson(res, 422, { error: hourError })

    rows.push(fc)
    addAudit(db, auth.user, 'fc_utilaj_creata', `${assetLabel(asset)} / ${fc.data}`)
    writeDb(db)
    sendJson(res, 201, { fc_log: normalizedFc(db, fc) })
  } catch (error) {
    next(error)
  }
})

router.post('/fleet/fc-logs/faz-generate', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'fleet:faz_generate')) return
    const db = readDb()
    const luna = String(req.body?.luna || '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(luna)) return sendJson(res, 400, { error: 'Luna este obligatorie în format YYYY-MM.' })
    const rows = ensureFleetFcDb(db).filter(row => row.status === 'completat' && String(row.luna || row.data || '').startsWith(luna))
    const filteredRows = req.body?.asset_id ? rows.filter(row => String(row.asset_id) === String(req.body.asset_id)) : rows
    filteredRows.forEach(row => {
      row.status = 'in_faz'
      row.updated_at = nowIso()
    })
    const publicRows = filteredRows.map(row => normalizedFc(db, row))
    const totals = publicRows.reduce((sum, row) => ({
      ore_total: round2(sum.ore_total + Number(row.ore_total || 0)),
      motorina_l: round2(sum.motorina_l + Number(row.motorina_l || 0)),
      consum_normat: round2(sum.consum_normat + Number(row.consum_normat || 0)),
      diferenta_motorina: round2(sum.diferenta_motorina + Number(row.diferenta_motorina || 0))
    }), { ore_total: 0, motorina_l: 0, consum_normat: 0, diferenta_motorina: 0 })
    addAudit(db, auth.user, 'faz_utilaje_generat', `${luna} / ${filteredRows.length} FC`)
    writeDb(db)
    sendJson(res, 200, {
      fc: filteredRows.length,
      luna,
      total_ore: totals.ore_total,
      total_motorina: totals.motorina_l,
      total_normat: totals.consum_normat,
      diferenta: totals.diferenta_motorina,
      html: buildFazHtml(db, filteredRows, luna)
    })
  } catch (error) {
    next(error)
  }
})

router.patch('/fleet/fc-logs/:uuid/complete', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'fleet:fc_complete')) return
    const db = readDb()
    const fc = ensureFleetFcDb(db).find(item => item.uuid === req.params.uuid)
    if (!fc) return sendJson(res, 404, { error: 'Fișa de consum nu există.' })
    if (fc.status !== 'draft') return sendJson(res, 409, { error: 'Doar fișele draft pot fi completate.' })
    const hourError = validateHours(fc)
    if (hourError) return sendJson(res, 422, { error: hourError })
    fc.status = 'completat'
    fc.completed_by = auth.user.id
    fc.completed_at = nowIso()
    addAudit(db, auth.user, 'fc_utilaj_completata', `${fc.numar || fc.uuid} / ${fc.data}`)
    writeDb(db)
    sendJson(res, 200, { fc_log: normalizedFc(db, fc) })
  } catch (error) {
    next(error)
  }
})

router.patch('/fleet/fc-logs/:uuid', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canEditFc(auth, res)) return
    const db = readDb()
    const fc = ensureFleetFcDb(db).find(item => item.uuid === req.params.uuid)
    if (!fc) return sendJson(res, 404, { error: 'Fișa de consum nu există.' })
    if (fc.status !== 'draft') return sendJson(res, 409, { error: 'Fișa poate fi modificată doar cât este draft.' })
    const oldLuna = fc.luna
    applyFcFields(fc, req.body || {})
    if (fc.luna !== oldLuna) fc.numar = nextMonthlyNumber(ensureFleetFcDb(db), fc.luna)
    const asset = findAsset(db, fc.asset_id)
    if (asset) fc.consum_orar_normat = assetHourlyConsumption(asset) || fc.consum_orar_normat
    const hourError = validateHours(fc)
    if (hourError) return sendJson(res, 422, { error: hourError })
    fc.modified_de = auth.user.id
    fc.updated_at = nowIso()
    addAudit(db, auth.user, 'fc_utilaj_editata', `${fc.numar || fc.uuid} / ${fc.data}`)
    writeDb(db)
    sendJson(res, 200, { fc_log: normalizedFc(db, fc) })
  } catch (error) {
    next(error)
  }
})

router.get('/fleet/fc-logs/:uuid/pdf', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canReadFc(auth, res)) return
    const db = readDb()
    const fc = ensureFleetFcDb(db).find(item => item.uuid === req.params.uuid)
    if (!fc) return sendJson(res, 404, { error: 'Fișa de consum nu există.' })
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(buildFcHtml(db, fc))
  } catch (error) {
    next(error)
  }
})

module.exports = router
