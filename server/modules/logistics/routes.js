const { Router } = require('express')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const xlsx = require('xlsx')
const { requireAuth } = require('../../core/auth')
const { requireAnyPermission } = require('../../core/permissions')
const { writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')

const router = Router()
const ROOT = path.resolve(__dirname, '../../..')
const LOGISTICS_STORAGE_DIR = path.join(ROOT, 'storage', 'logistics')
const LOGISTICS_UPLOAD_BYTES = 20 * 1024 * 1024
const LOGISTICS_ALLOWED_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp'])
const logisticsUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LOGISTICS_UPLOAD_BYTES } })
const VIEW_PERMISSIONS = ['logistics:view', 'procurement:view', 'legal:contracts', 'system:view']
const MANAGE_PERMISSIONS = ['logistics:manage', 'procurement_orders:create', 'legal:manage', 'system:admin']
const PRINT_PERMISSIONS = ['logistics:print', ...VIEW_PERMISSIONS]
const DOCUMENT_TYPES = new Set(['aviz', 'cmr', 'bon_transport', 'pod'])
const DOCUMENT_STATUSES = new Set(['draft', 'emis', 'predat', 'livrat', 'anulat'])
const TRIP_STATUSES = new Set(['planificata', 'alocata', 'in_cursa', 'sosita', 'livrata', 'anulata'])
const COST_CURRENCIES = new Set(['RON', 'EUR'])

function nowIso() { return new Date().toISOString() }
function todayIso() { return nowIso().slice(0, 10) }
function clean(value, max = 500) { return String(value ?? '').trim().slice(0, max) }
function money(value) { const parsed = Number(String(value ?? '').trim().replace(',', '.')); return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0 }
function id() { return `trn-${Date.now()}-${crypto.randomBytes(4).toString('hex')}` }
function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function requirePermission(auth, res, permissions) { return requireAnyPermission(auth, res, permissions) }
function ensureLogisticsDb(db) {
  if (!db.logistics || typeof db.logistics !== 'object') db.logistics = {}
  if (!Array.isArray(db.logistics.documents)) db.logistics.documents = []
  if (!Array.isArray(db.logistics.trips)) db.logistics.trips = []
  if (!Array.isArray(db.logistics.attachments)) db.logistics.attachments = []
  return db.logistics
}
function currentUserLabel(user) { return clean(user?.name || user?.fullName || user?.username || user?.id, 160) }
function safeFileName(value) {
  const name = path.basename(String(value || 'dovada-livrare').replace(/\\/g, '/'))
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'dovada-livrare'
}
function ensureStorageDir() { fs.mkdirSync(LOGISTICS_STORAGE_DIR, { recursive: true }) }
function recordTripEvent(trip, type, label, user) {
  if (!Array.isArray(trip.timeline)) trip.timeline = []
  trip.timeline.push({ id: `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, type, label: clean(label, 500), at: nowIso(), user_id: user?.id || null, user_name: currentUserLabel(user) })
}
function typeLabel(type) { return ({ aviz: 'Aviz de însoțire', cmr: 'CMR', bon_transport: 'Bon transport', pod: 'Dovadă de livrare' })[type] || 'Document transport' }
function statusLabel(status) { return ({ draft: 'Draft', emis: 'Emis', predat: 'Predat transportatorului', livrat: 'Livrat', anulat: 'Anulat' })[status] || status }
function tripStatusLabel(status) { return ({ planificata: 'Planificată', alocata: 'Alocată', in_cursa: 'În cursă', sosita: 'Sosită', livrata: 'Livrată', anulata: 'Anulată' })[status] || status }
function nextNumber(documents, type, date = todayIso()) {
  const year = String(date || todayIso()).slice(0, 4)
  const prefix = `${type === 'aviz' ? 'AVZ' : type === 'cmr' ? 'CMR' : type === 'pod' ? 'POD' : 'BTR'}-${year}-`
  const maximum = documents.reduce((current, document) => {
    const match = String(document.numar || '').match(new RegExp(`^${prefix}(\\d+)$`))
    return match ? Math.max(current, Number(match[1])) : current
  }, 0)
  return `${prefix}${String(maximum + 1).padStart(4, '0')}`
}
function nextTripNumber(trips, date = todayIso()) {
  const year = String(date || todayIso()).slice(0, 4)
  const prefix = `CUR-${year}-`
  const maximum = trips.reduce((current, trip) => {
    const match = String(trip.numar || '').match(new RegExp(`^${prefix}(\\d+)$`))
    return match ? Math.max(current, Number(match[1])) : current
  }, 0)
  return `${prefix}${String(maximum + 1).padStart(4, '0')}`
}
function normalizeLines(input) {
  const source = Array.isArray(input) ? input : []
  return source.map((line, index) => ({
    id: clean(line?.id || `linie-${index + 1}`, 100),
    denumire: clean(line?.denumire || line?.description, 240),
    um: clean(line?.um || line?.unit, 30),
    cantitate: Number(line?.cantitate ?? line?.quantity ?? 0) || 0,
    cod_nc: clean(line?.cod_nc || line?.nc_code, 30),
  })).filter(line => line.denumire || line.cantitate)
}
function normalizeInput(body = {}, existing = {}, documents = []) {
  const type = DOCUMENT_TYPES.has(clean(body.tip || body.type, 40)) ? clean(body.tip || body.type, 40) : (existing.tip || 'aviz')
  const data = clean(body.data || body.date, 20) || existing.data || todayIso()
  const status = DOCUMENT_STATUSES.has(clean(body.status, 40)) ? clean(body.status, 40) : (existing.status || 'draft')
  return {
    tip: type,
    numar: clean(body.numar, 80) || existing.numar || nextNumber(documents, type, data),
    data,
    status,
    expeditor: clean(body.expeditor, 240),
    destinatar: clean(body.destinatar, 240),
    adresa_incarcare: clean(body.adresa_incarcare, 400),
    adresa_livrare: clean(body.adresa_livrare, 400),
    transportator: clean(body.transportator, 240),
    vehicul: clean(body.vehicul, 100),
    remorca: clean(body.remorca, 100),
    sofer: clean(body.sofer, 160),
    referinta_externa: clean(body.referinta_externa || body.cmr_reference, 120),
    comanda_id: clean(body.comanda_id || body.procurement_order_id, 120) || null,
    comanda_numar: clean(body.comanda_numar || body.procurement_order_number, 120) || null,
    contract_id: clean(body.contract_id, 120) || null,
    contract_numar: clean(body.contract_numar, 120) || null,
    cursa_id: clean(body.cursa_id || body.trip_id, 120) || null,
    cursa_numar: clean(body.cursa_numar || body.trip_number, 120) || null,
    observatii: clean(body.observatii || body.notes, 2000),
    linii: normalizeLines(body.linii || body.lines || existing.linii),
  }
}
function normalizeTrip(body = {}, existing = {}, trips = []) {
  const data = clean(body.data || body.data_plecare || body.date, 20) || existing.data || todayIso()
  const status = TRIP_STATUSES.has(clean(body.status, 40)) ? clean(body.status, 40) : (existing.status || 'planificata')
  return {
    numar: clean(body.numar, 80) || existing.numar || nextTripNumber(trips, data),
    data,
    status,
    expeditor: clean(body.expeditor, 240),
    destinatar: clean(body.destinatar, 240),
    adresa_incarcare: clean(body.adresa_incarcare, 400),
    adresa_livrare: clean(body.adresa_livrare, 400),
    plecare_planificata: clean(body.plecare_planificata, 30),
    sosire_planificata: clean(body.sosire_planificata, 30),
    transportator: clean(body.transportator, 240),
    vehicul_id: clean(body.vehicul_id, 120) || null,
    vehicul: clean(body.vehicul, 160),
    remorca: clean(body.remorca, 100),
    sofer_id: clean(body.sofer_id, 120) || null,
    sofer: clean(body.sofer, 160),
    comanda_id: clean(body.comanda_id || body.procurement_order_id, 120) || null,
    comanda_numar: clean(body.comanda_numar || body.procurement_order_number, 120) || null,
    contract_id: clean(body.contract_id, 120) || null,
    contract_numar: clean(body.contract_numar, 120) || null,
    cost_moneda: COST_CURRENCIES.has(clean(body.cost_moneda || body.cost_currency, 10).toUpperCase()) ? clean(body.cost_moneda || body.cost_currency, 10).toUpperCase() : (existing.cost_moneda || 'RON'),
    cost_estimat: money(body.cost_estimat ?? body.estimated_cost ?? existing.cost_estimat),
    cost_real: money(body.cost_real ?? body.actual_cost ?? existing.cost_real),
    cost_observatii: clean(body.cost_observatii || body.cost_notes || existing.cost_observatii, 1000),
    plecare_efectiva: clean(body.plecare_efectiva || body.actual_departure_at || existing.plecare_efectiva, 40),
    sosire_efectiva: clean(body.sosire_efectiva || body.actual_arrival_at || existing.sosire_efectiva, 40),
    executie_observatii: clean(body.executie_observatii || body.execution_notes || existing.executie_observatii, 1000),
    observatii: clean(body.observatii || body.notes, 2000),
    linii: normalizeLines(body.linii || body.lines || existing.linii),
  }
}
function timeValue(value) { const timestamp = Date.parse(String(value || '')); return Number.isFinite(timestamp) ? timestamp : null }
function buildPlanningCheck(logistics, payload = {}, currentId = '') {
  const start = timeValue(payload.plecare_planificata)
  const end = timeValue(payload.sosire_planificata)
  const warnings = []
  if (!payload.vehicul_id) warnings.push({ code: 'vehicul_nealocat', message: 'Vehiculul nu este alocat; disponibilitatea nu poate fi verificată pentru parc.' })
  if (!payload.sofer_id) warnings.push({ code: 'sofer_nealocat', message: 'Șoferul nu este alocat; disponibilitatea nu poate fi verificată pentru resursa umană.' })
  if (!start || !end) warnings.push({ code: 'interval_incomplet', message: 'Completează plecarea și sosirea planificate pentru verificarea intervalului.' })
  else if (end <= start) warnings.push({ code: 'interval_invalid', message: 'Sosirea planificată trebuie să fie după plecare.' })
  const conflicts = (!start || !end || end <= start) ? [] : logistics.trips
    .filter(item => String(item.id) !== String(currentId) && item.status !== 'anulata')
    .filter(item => {
      const otherStart = timeValue(item.plecare_planificata); const otherEnd = timeValue(item.sosire_planificata)
      return otherStart && otherEnd && start < otherEnd && otherStart < end
    })
    .map(item => ({ id: item.id, numar: item.numar, status: item.status, plecare_planificata: item.plecare_planificata, sosire_planificata: item.sosire_planificata, vehicul: String(payload.vehicul_id || '') && String(item.vehicul_id || '') === String(payload.vehicul_id), sofer: String(payload.sofer_id || '') && String(item.sofer_id || '') === String(payload.sofer_id) }))
    .filter(item => item.vehicul || item.sofer)
  conflicts.forEach(item => warnings.push({ code: item.vehicul && item.sofer ? 'conflict_vehicul_sofer' : item.vehicul ? 'conflict_vehicul' : 'conflict_sofer', message: `${item.numar} se suprapune (${item.vehicul ? 'vehicul' : 'șofer'}${item.vehicul && item.sofer ? ' și șofer' : ''}).` }))
  return { verified: Boolean(start && end && end > start), verdict: conflicts.length ? 'atentie' : warnings.length ? 'incomplet' : 'ok', warnings, conflicts }
}
function validate(payload, db, currentId = '') {
  if (!payload.numar) return 'Numărul documentului este obligatoriu.'
  if (!payload.data || !/^\d{4}-\d{2}-\d{2}$/.test(payload.data)) return 'Data documentului este obligatorie.'
  if (!payload.expeditor) return 'Expeditorul este obligatoriu.'
  if (!payload.destinatar) return 'Destinatarul este obligatoriu.'
  const duplicate = ensureLogisticsDb(db).documents.find(item => String(item.id) !== String(currentId) && String(item.numar || '').toLowerCase() === payload.numar.toLowerCase() && item.status !== 'anulat')
  if (duplicate) return 'Există deja un document de transport activ cu acest număr.'
  return ''
}
function validateTrip(payload, db, currentId = '') {
  if (!payload.numar) return 'Numărul cursei este obligatoriu.'
  if (!payload.data || !/^\d{4}-\d{2}-\d{2}$/.test(payload.data)) return 'Data cursei este obligatorie.'
  if (!payload.expeditor) return 'Expeditorul este obligatoriu.'
  if (!payload.destinatar) return 'Destinatarul este obligatoriu.'
  if (payload.status === 'in_cursa' && !timeValue(payload.plecare_efectiva)) return 'Folosește acțiunea Plecare pentru a marca o cursă În cursă.'
  if (payload.status === 'sosita' && !timeValue(payload.sosire_efectiva)) return 'Folosește acțiunea Sosire pentru a marca o cursă Sosită.'
  if (timeValue(payload.plecare_efectiva) && timeValue(payload.sosire_efectiva) && timeValue(payload.sosire_efectiva) < timeValue(payload.plecare_efectiva)) return 'Sosirea efectivă trebuie să fie după plecarea efectivă.'
  const duplicate = ensureLogisticsDb(db).trips.find(item => String(item.id) !== String(currentId) && String(item.numar || '').toLowerCase() === payload.numar.toLowerCase() && item.status !== 'anulata')
  if (duplicate) return 'Există deja o cursă activă cu acest număr.'
  return ''
}
function buildOperationalMonitoring(trip, referenceTime = Date.now()) {
  const now = Number(referenceTime) || Date.now()
  const plannedDeparture = timeValue(trip.plecare_planificata)
  const plannedArrival = timeValue(trip.sosire_planificata)
  const actualDeparture = timeValue(trip.plecare_efectiva)
  const actualArrival = timeValue(trip.sosire_efectiva)
  const alerts = []
  if (trip.status !== 'anulata' && trip.status !== 'livrata' && plannedDeparture && !actualDeparture && now > plannedDeparture) {
    alerts.push({ code: 'plecare_intarziata', level: 'atentie', label: 'Plecare efectivă neînregistrată după ora planificată.' })
  }
  if (trip.status !== 'anulata' && trip.status !== 'livrata' && plannedArrival && actualDeparture && !actualArrival && now > plannedArrival) {
    alerts.push({ code: 'sosire_intarziata', level: 'atentie', label: 'Sosire efectivă neînregistrată după ora planificată.' })
  }
  if (trip.status !== 'anulata' && trip.status !== 'livrata' && actualArrival && !trip.delivery_confirmation) {
    alerts.push({ code: 'livrare_neconfirmata', level: 'informare', label: 'Cursa a sosit, dar primirea/livrarea nu este încă confirmată.' })
  }
  return { alerts, has_delay: alerts.some(item => item.level === 'atentie'), pending_delivery_confirmation: alerts.some(item => item.code === 'livrare_neconfirmata') }
}
function decorateTrip(db, trip) {
  const logistics = ensureLogisticsDb(db)
  const documents = logistics.documents.filter(document => String(document.cursa_id) === String(trip.id))
  const attachments = logistics.attachments.filter(attachment => String(attachment.cursa_id) === String(trip.id) && !attachment.cancelled_at)
  const timeline = Array.isArray(trip.timeline) ? trip.timeline : []
  const departureAt = timeValue(trip.plecare_efectiva)
  const arrivalAt = timeValue(trip.sosire_efectiva)
  return {
    ...trip,
    status_label: tripStatusLabel(trip.status),
    documente_count: documents.length,
    documente: documents.map(document => ({ id: document.id, numar: document.numar, tip: document.tip, status: document.status })),
    attachments_count: attachments.length,
    attachments: attachments.map(attachment => ({ ...attachment, download_url: `/api/logistics/trips/${encodeURIComponent(String(trip.id))}/attachments/${encodeURIComponent(String(attachment.id))}/download` })),
    timeline: [...timeline].sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))),
    planning: buildPlanningCheck(logistics, trip, trip.id),
    execution: {
      departed: Boolean(departureAt),
      arrived: Boolean(arrivalAt),
      duration_minutes: departureAt && arrivalAt && arrivalAt >= departureAt ? Math.round((arrivalAt - departureAt) / 60000) : null,
    },
    monitoring: buildOperationalMonitoring(trip),
  }
}
function reportDate(value) {
  const normalized = clean(value, 20)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}
function formatReportCost(value, currency) {
  return `${Number(value || 0).toFixed(2)} ${currency}`
}
function buildOperationalReport(db, filters = {}) {
  const from = reportDate(filters.from)
  const to = reportDate(filters.to)
  const source = ensureLogisticsDb(db).trips
    .filter(trip => !from || String(trip.data || '') >= from)
    .filter(trip => !to || String(trip.data || '') <= to)
    .map(trip => decorateTrip(db, trip))
  const costs = {}
  const statuses = {}
  const rows = source.map(trip => {
    const currency = COST_CURRENCIES.has(trip.cost_moneda) ? trip.cost_moneda : 'RON'
    const estimate = Number(trip.cost_estimat || 0)
    const actual = Number(trip.cost_real || 0)
    if (!costs[currency]) costs[currency] = { moneda: currency, estimat: 0, realizat: 0, diferenta: 0 }
    if (trip.status !== 'anulata') {
      costs[currency].estimat += estimate
      costs[currency].realizat += actual
      costs[currency].diferenta += actual - estimate
    }
    statuses[trip.status] = (statuses[trip.status] || 0) + 1
    return {
      numar: trip.numar,
      data: trip.data,
      status: trip.status_label,
      expeditor: trip.expeditor,
      destinatar: trip.destinatar,
      vehicul: trip.vehicul || '',
      sofer: trip.sofer || '',
      plecare_planificata: trip.plecare_planificata || '',
      sosire_planificata: trip.sosire_planificata || '',
      plecare_efectiva: trip.plecare_efectiva || '',
      sosire_efectiva: trip.sosire_efectiva || '',
      durata_minute: trip.execution.duration_minutes ?? '',
      confirmare_livrare: trip.delivery_confirmation ? 'Confirmată' : '',
      cost_estimat: formatReportCost(estimate, currency),
      cost_realizat: formatReportCost(actual, currency),
      diferenta_cost: formatReportCost(actual - estimate, currency),
      semnalari: (trip.monitoring.alerts || []).map(alert => alert.label).join(' | '),
    }
  })
  return {
    interval: { de_la: from || null, pana_la: to || null },
    summary: {
      total_curse: source.length,
      livrate: source.filter(trip => trip.status === 'livrata').length,
      in_cursa: source.filter(trip => trip.status === 'in_cursa').length,
      intarzieri: source.filter(trip => trip.monitoring.has_delay).length,
      sosiri_neconfirmate: source.filter(trip => trip.monitoring.pending_delivery_confirmation).length,
      statusuri: statuses,
      costuri: Object.values(costs).map(cost => ({
        ...cost,
        estimat: Math.round(cost.estimat * 100) / 100,
        realizat: Math.round(cost.realizat * 100) / 100,
        diferenta: Math.round(cost.diferenta * 100) / 100,
      })),
    },
    rows,
  }
}
function sendOperationalReportWorkbook(res, report) {
  const workbook = xlsx.utils.book_new()
  const summaryRows = [
    ['Raport operațional Logistică'],
    ['Interval de la', report.interval.de_la || 'Toate datele'],
    ['Interval până la', report.interval.pana_la || 'Toate datele'],
    [],
    ['Curse', report.summary.total_curse],
    ['Livrate', report.summary.livrate],
    ['În cursă', report.summary.in_cursa],
    ['Întârzieri', report.summary.intarzieri],
    ['Sosiri fără confirmare', report.summary.sosiri_neconfirmate],
    [],
    ['Monedă', 'Cost estimat', 'Cost realizat', 'Diferență'],
    ...report.summary.costuri.map(cost => [cost.moneda, cost.estimat, cost.realizat, cost.diferenta]),
  ]
  const summarySheet = xlsx.utils.aoa_to_sheet(summaryRows)
  summarySheet['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 18 }]
  const tripsSheet = xlsx.utils.json_to_sheet(report.rows)
  tripsSheet['!cols'] = Object.keys(report.rows[0] || { numar: '' }).map(key => ({ wch: Math.max(14, Math.min(34, key.length + 8)) }))
  xlsx.utils.book_append_sheet(workbook, summarySheet, 'Sinteză')
  xlsx.utils.book_append_sheet(workbook, tripsSheet, 'Curse')
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.attachment(`Raport-logistica-${todayIso()}.xlsx`)
  res.send(buffer)
}
function decorate(db, document) {
  const contracts = db.contractManagement?.contracts || []
  const contract = contracts.find(item => String(item.id) === String(document.contract_id))
  const trip = ensureLogisticsDb(db).trips.find(item => String(item.id) === String(document.cursa_id))
  return {
    ...document,
    tip_label: typeLabel(document.tip),
    status_label: statusLabel(document.status),
    contract: contract ? { id: contract.id, numar: contract.numar, titlu: contract.titlu } : null,
    cursa: trip ? { id: trip.id, numar: trip.numar, status: trip.status } : null,
  }
}
function printHtml(db, document, user) {
  const company = db.settings?.companyName || db.settings?.company_name || 'Organizație InfraFlow'
  const rows = (document.linii || []).map((line, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(line.denumire)}</td><td>${escapeHtml(line.um || '-')}</td><td>${escapeHtml(line.cantitate || '-')}</td><td>${escapeHtml(line.cod_nc || '-')}</td></tr>`).join('') || '<tr><td colspan="5">Nu sunt poziții declarate.</td></tr>'
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>${escapeHtml(document.numar)}</title><style>body{font:14px Arial;color:#172033;margin:30px}h1{margin:0 0 4px;font-size:24px}.muted{color:#58677d}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:24px 0}.box{border:1px solid #cbd5e1;border-radius:6px;padding:12px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #94a3b8;padding:8px;text-align:left}th{background:#eef2f7}.sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:25px;margin-top:55px}.sign div{border-top:1px solid #64748b;padding-top:7px}@media print{body{margin:12mm}}</style></head><body><h1>${escapeHtml(typeLabel(document.tip))} ${escapeHtml(document.numar)}</h1><div class="muted">${escapeHtml(company)} · Data: ${escapeHtml(document.data)} · Status: ${escapeHtml(statusLabel(document.status))}</div><div class="grid"><div class="box"><b>Expeditor</b><br>${escapeHtml(document.expeditor)}<br>${escapeHtml(document.adresa_incarcare || '')}</div><div class="box"><b>Destinatar</b><br>${escapeHtml(document.destinatar)}<br>${escapeHtml(document.adresa_livrare || '')}</div><div class="box"><b>Transport</b><br>Transportator: ${escapeHtml(document.transportator || '-')}<br>Vehicul: ${escapeHtml(document.vehicul || '-')} ${escapeHtml(document.remorca || '')}<br>Șofer: ${escapeHtml(document.sofer || '-')}</div><div class="box"><b>Legături</b><br>Comandă: ${escapeHtml(document.comanda_numar || '-')}<br>Contract: ${escapeHtml(document.contract_numar || '-')}<br>Referință externă: ${escapeHtml(document.referinta_externa || '-')}</div></div><table><thead><tr><th>#</th><th>Denumire</th><th>UM</th><th>Cantitate</th><th>Cod NC (opțional)</th></tr></thead><tbody>${rows}</tbody></table>${document.observatii ? `<p><b>Observații:</b> ${escapeHtml(document.observatii)}</p>` : ''}<div class="sign"><div>Predare / expeditor</div><div>Transportator</div><div>Primire / destinatar</div></div><p class="muted">Generat de ${escapeHtml(currentUserLabel(user))} la ${escapeHtml(nowIso())}. Document intern; obligațiile fiscale și declarative se verifică separat pentru jurisdicția aplicabilă.</p></body></html>`
}

router.get('/logistics/documents', (req, res) => {
  const auth = requireAuth(req, res); if (!auth || !requirePermission(auth, res, VIEW_PERMISSIONS)) return
  const filters = req.query || {}
  const documents = ensureLogisticsDb(auth.db).documents.map(item => decorate(auth.db, item))
    .filter(item => !filters.tip || item.tip === filters.tip)
    .filter(item => !filters.status || item.status === filters.status)
    .filter(item => !filters.q || `${item.numar} ${item.expeditor} ${item.destinatar} ${item.comanda_numar} ${item.contract_numar}`.toLowerCase().includes(String(filters.q).toLowerCase()))
    .sort((a, b) => `${b.data} ${b.created_at}`.localeCompare(`${a.data} ${a.created_at}`))
  res.json({ documents })
})

router.get('/logistics/trips', (req, res) => {
  const auth = requireAuth(req, res); if (!auth || !requirePermission(auth, res, VIEW_PERMISSIONS)) return
  const filters = req.query || {}
  const trips = ensureLogisticsDb(auth.db).trips.map(item => decorateTrip(auth.db, item))
    .filter(item => !filters.status || item.status === filters.status)
    .filter(item => !filters.q || `${item.numar} ${item.expeditor} ${item.destinatar} ${item.vehicul} ${item.sofer} ${item.comanda_numar} ${item.contract_numar}`.toLowerCase().includes(String(filters.q).toLowerCase()))
    .sort((a, b) => `${b.data} ${b.created_at}`.localeCompare(`${a.data} ${a.created_at}`))
  res.json({ trips })
})

router.get('/logistics/reports/operational', (req, res) => {
  const auth = requireAuth(req, res); if (!auth || !requirePermission(auth, res, VIEW_PERMISSIONS)) return
  const report = buildOperationalReport(auth.db, req.query || {})
  if (String(req.query?.format || '').toLowerCase() === 'xlsx') return sendOperationalReportWorkbook(res, report)
  res.json({ report })
})

router.get('/logistics/context', (req, res) => {
  const auth = requireAuth(req, res); if (!auth || !requirePermission(auth, res, VIEW_PERMISSIONS)) return
  const orders = (auth.db.procurementOrders || []).filter(item => !item.cancelled_at && !item.cancelledAt).map(item => ({ id: item.id, numar: item.numar || item.number || item.id, partener: item.furnizor || item.supplier || item.partener || '' }))
  const contracts = (auth.db.contractManagement?.contracts || []).filter(item => !item.cancelled_at && !item.cancelledAt).map(item => ({ id: item.id, numar: item.numar || item.id, titlu: item.titlu || '' }))
  const assets = (auth.db.fleetAssets || auth.db.fleet?.assets || []).filter(item => item.active !== false).map(item => ({ id: item.id, label: item.registration || item.nr_inmatriculare || item.code || item.cod || item.name || item.denumire || item.id }))
  const drivers = (auth.db.hr?.employees || auth.db.employees || []).filter(item => item.active !== false && item.inactive !== true).map(item => ({ id: item.id, label: item.fullName || item.name || [item.firstName, item.lastName].filter(Boolean).join(' ') || item.username || item.id }))
  const trips = ensureLogisticsDb(auth.db).trips.filter(item => item.status !== 'anulata').map(item => ({ id: item.id, numar: item.numar, expeditor: item.expeditor, destinatar: item.destinatar, status: item.status, linii: item.linii || [] }))
  res.json({ orders, contracts, assets, drivers, trips, types: Array.from(DOCUMENT_TYPES), statuses: Array.from(DOCUMENT_STATUSES), trip_statuses: Array.from(TRIP_STATUSES), integration: { etransport: 'neconfigurat', note: 'Nu există transmitere automată către RO e-Transport sau ANAF în acest modul.' } })
})

router.post('/logistics/trips/planning-check', (req, res) => {
  const auth = requireAuth(req, res); if (!auth || !requirePermission(auth, res, MANAGE_PERMISSIONS)) return
  const logistics = ensureLogisticsDb(auth.db)
  const payload = normalizeTrip(req.body || {}, {}, logistics.trips)
  res.json({ planning: buildPlanningCheck(logistics, payload, clean(req.body?.exclude_id || req.body?.id, 120)) })
})

router.post('/logistics/trips', (req, res) => {
  const auth = requireAuth(req, res); if (!auth || !requirePermission(auth, res, MANAGE_PERMISSIONS)) return
  const logistics = ensureLogisticsDb(auth.db); const payload = normalizeTrip(req.body || {}, {}, logistics.trips); const error = validateTrip(payload, auth.db)
  if (error) return res.status(422).json({ error })
  const trip = { id: `cur-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`, uuid: crypto.randomUUID(), ...payload, created_at: nowIso(), created_by: auth.user.id, created_by_name: currentUserLabel(auth.user), updated_at: nowIso(), timeline: [] }
  recordTripEvent(trip, 'created', 'Cursa a fost planificată.', auth.user)
  logistics.trips.push(trip); addAudit(auth.db, auth.user, 'logistics_trip_created', trip.numar); writeDb(auth.db)
  res.status(201).json({ trip: decorateTrip(auth.db, trip) })
})

router.patch('/logistics/trips/:id', (req, res) => {
  const auth = requireAuth(req, res); if (!auth || !requirePermission(auth, res, MANAGE_PERMISSIONS)) return
  const logistics = ensureLogisticsDb(auth.db); const trip = logistics.trips.find(item => String(item.id) === String(req.params.id))
  if (!trip) return res.status(404).json({ error: 'Cursa nu a fost găsită.' })
  const payload = normalizeTrip(req.body || {}, trip, logistics.trips); const error = validateTrip(payload, auth.db, trip.id)
  if (error) return res.status(422).json({ error })
  const previousStatus = trip.status
  Object.assign(trip, payload, { updated_at: nowIso(), updated_by: auth.user.id, updated_by_name: currentUserLabel(auth.user) })
  recordTripEvent(trip, previousStatus !== trip.status ? 'status_changed' : 'updated', previousStatus !== trip.status ? `Status schimbat: ${tripStatusLabel(previousStatus)} → ${tripStatusLabel(trip.status)}.` : 'Datele cursei au fost actualizate.', auth.user)
  addAudit(auth.db, auth.user, 'logistics_trip_updated', trip.numar); writeDb(auth.db)
  res.json({ trip: decorateTrip(auth.db, trip) })
})

router.post('/logistics/trips/:id/cancel', (req, res) => {
  const auth = requireAuth(req, res); if (!auth || !requirePermission(auth, res, MANAGE_PERMISSIONS)) return
  const trip = ensureLogisticsDb(auth.db).trips.find(item => String(item.id) === String(req.params.id))
  if (!trip) return res.status(404).json({ error: 'Cursa nu a fost găsită.' })
  if (trip.status === 'anulata') return res.json({ ok: true, trip: decorateTrip(auth.db, trip) })
  trip.status = 'anulata'; trip.cancelled_at = nowIso(); trip.cancelled_by = auth.user.id; trip.cancelled_reason = clean(req.body?.motiv || req.body?.reason || 'Anulată controlat', 500); recordTripEvent(trip, 'cancelled', `Cursa a fost anulată: ${trip.cancelled_reason}`, auth.user); addAudit(auth.db, auth.user, 'logistics_trip_cancelled', trip.numar); writeDb(auth.db)
  res.json({ ok: true, trip: decorateTrip(auth.db, trip) })
})

router.post('/logistics/trips/:id/execution/start', (req, res) => {
  const auth = requireAuth(req, res); if (!auth || !requirePermission(auth, res, MANAGE_PERMISSIONS)) return
  const trip = ensureLogisticsDb(auth.db).trips.find(item => String(item.id) === String(req.params.id))
  if (!trip) return res.status(404).json({ error: 'Cursa nu a fost găsită.' })
  if (trip.status === 'anulata') return res.status(422).json({ error: 'O cursă anulată nu poate fi pornită.' })
  if (trip.status === 'livrata') return res.status(422).json({ error: 'O cursă livrată nu poate fi pornită din nou.' })
  if (trip.plecare_efectiva) return res.status(422).json({ error: 'Plecare efectivă este deja înregistrată pentru această cursă.' })
  const departedAt = clean(req.body?.plecare_efectiva || req.body?.actual_departure_at, 40) || nowIso()
  if (!timeValue(departedAt)) return res.status(422).json({ error: 'Data și ora plecării efective nu sunt valide.' })
  const note = clean(req.body?.observatii || req.body?.note, 1000)
  trip.plecare_efectiva = departedAt; trip.status = 'in_cursa'; trip.updated_at = nowIso(); trip.updated_by = auth.user.id; trip.updated_by_name = currentUserLabel(auth.user)
  if (note) trip.executie_observatii = note
  recordTripEvent(trip, 'execution_started', `Plecare efectivă înregistrată la ${departedAt}.${note ? ` ${note}` : ''}`, auth.user)
  addAudit(auth.db, auth.user, 'logistics_trip_execution_started', trip.numar); writeDb(auth.db)
  res.json({ ok: true, trip: decorateTrip(auth.db, trip) })
})

router.post('/logistics/trips/:id/execution/arrival', (req, res) => {
  const auth = requireAuth(req, res); if (!auth || !requirePermission(auth, res, MANAGE_PERMISSIONS)) return
  const trip = ensureLogisticsDb(auth.db).trips.find(item => String(item.id) === String(req.params.id))
  if (!trip) return res.status(404).json({ error: 'Cursa nu a fost găsită.' })
  if (trip.status === 'anulata') return res.status(422).json({ error: 'O cursă anulată nu poate primi o sosire efectivă.' })
  if (trip.status === 'livrata') return res.status(422).json({ error: 'Cursa este deja marcată ca livrată.' })
  if (!trip.plecare_efectiva || !timeValue(trip.plecare_efectiva)) return res.status(422).json({ error: 'Înregistrează mai întâi plecarea efectivă.' })
  if (trip.sosire_efectiva) return res.status(422).json({ error: 'Sosirea efectivă este deja înregistrată pentru această cursă.' })
  const arrivedAt = clean(req.body?.sosire_efectiva || req.body?.actual_arrival_at, 40) || nowIso()
  const departureAt = timeValue(trip.plecare_efectiva)
  const arrivalAt = timeValue(arrivedAt)
  if (!arrivalAt || arrivalAt < departureAt) return res.status(422).json({ error: 'Sosirea efectivă trebuie să fie după plecarea efectivă.' })
  const note = clean(req.body?.observatii || req.body?.note, 1000)
  trip.sosire_efectiva = arrivedAt; trip.status = 'sosita'; trip.updated_at = nowIso(); trip.updated_by = auth.user.id; trip.updated_by_name = currentUserLabel(auth.user)
  if (note) trip.executie_observatii = note
  recordTripEvent(trip, 'execution_arrived', `Sosire efectivă înregistrată la ${arrivedAt}.${note ? ` ${note}` : ''}`, auth.user)
  addAudit(auth.db, auth.user, 'logistics_trip_execution_arrived', trip.numar); writeDb(auth.db)
  res.json({ ok: true, trip: decorateTrip(auth.db, trip) })
})

router.post('/logistics/trips/:id/delivery-confirmation', (req, res) => {
  const auth = requireAuth(req, res); if (!auth || !requirePermission(auth, res, MANAGE_PERMISSIONS)) return
  const trip = ensureLogisticsDb(auth.db).trips.find(item => String(item.id) === String(req.params.id))
  if (!trip) return res.status(404).json({ error: 'Cursa nu a fost găsită.' })
  if (trip.status === 'anulata') return res.status(422).json({ error: 'O cursă anulată nu poate primi confirmare de livrare.' })
  const receivedBy = clean(req.body?.primit_de || req.body?.received_by, 160)
  if (!receivedBy) return res.status(422).json({ error: 'Persoana care a confirmat primirea este obligatorie.' })
  const receivedAt = clean(req.body?.primit_la || req.body?.received_at, 40) || nowIso()
  const note = clean(req.body?.observatii || req.body?.note, 1000)
  trip.delivery_confirmation = { received_by: receivedBy, received_at: receivedAt, note, confirmed_by: auth.user.id, confirmed_by_name: currentUserLabel(auth.user), confirmed_at: nowIso() }
  const changed = trip.status !== 'livrata'; trip.status = 'livrata'; trip.updated_at = nowIso(); trip.updated_by = auth.user.id; trip.updated_by_name = currentUserLabel(auth.user)
  recordTripEvent(trip, 'delivery_confirmed', `Livrare confirmată de ${receivedBy}.${note ? ` ${note}` : ''}`, auth.user)
  addAudit(auth.db, auth.user, 'logistics_trip_delivery_confirmed', `${trip.numar}: ${receivedBy}${changed ? ' (status Livrată)' : ''}`); writeDb(auth.db)
  res.json({ ok: true, trip: decorateTrip(auth.db, trip) })
})

router.post('/logistics/trips/:id/attachments', logisticsUpload.single('file'), (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth || !requirePermission(auth, res, MANAGE_PERMISSIONS)) return
    const logistics = ensureLogisticsDb(auth.db); const trip = logistics.trips.find(item => String(item.id) === String(req.params.id))
    if (!trip) return res.status(404).json({ error: 'Cursa nu a fost găsită.' })
    if (trip.status === 'anulata') return res.status(422).json({ error: 'O cursă anulată nu poate primi dovezi de livrare.' })
    if (!req.file?.buffer) return res.status(422).json({ error: 'Fișierul este obligatoriu.' })
    const ext = path.extname(req.file.originalname || '').toLowerCase()
    if (!LOGISTICS_ALLOWED_EXT.has(ext)) return res.status(422).json({ error: 'Sunt acceptate doar PDF și imagini JPG, PNG sau WEBP.' })
    const safeName = safeFileName(req.file.originalname || `dovada${ext}`); const storedName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`
    ensureStorageDir(); fs.writeFileSync(path.join(LOGISTICS_STORAGE_DIR, storedName), req.file.buffer)
    const attachment = { id: `log-file-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`, uuid: crypto.randomUUID(), cursa_id: trip.id, file_path: `storage/logistics/${storedName}`, file_name: safeName, original_name: req.file.originalname || safeName, file_size: req.file.size || req.file.buffer.length, mime_type: req.file.mimetype || 'application/octet-stream', categorie: clean(req.body?.categorie || req.body?.category || 'dovadă livrare', 100), descriere: clean(req.body?.descriere || req.body?.description, 500), sha256: crypto.createHash('sha256').update(req.file.buffer).digest('hex'), uploaded_by: auth.user.id, uploaded_by_name: currentUserLabel(auth.user), uploaded_at: nowIso() }
    logistics.attachments.push(attachment); recordTripEvent(trip, 'attachment_uploaded', `Atașament încărcat: ${attachment.original_name}`, auth.user); addAudit(auth.db, auth.user, 'logistics_trip_attachment_uploaded', `${trip.numar}: ${attachment.original_name}`); writeDb(auth.db)
    res.status(201).json({ attachment: { ...attachment, download_url: `/api/logistics/trips/${encodeURIComponent(String(trip.id))}/attachments/${encodeURIComponent(String(attachment.id))}/download` }, trip: decorateTrip(auth.db, trip) })
  } catch (error) { next(error) }
})

router.get('/logistics/trips/:id/attachments/:attachmentId/download', (req, res) => {
  const auth = requireAuth(req, res); if (!auth || !requirePermission(auth, res, VIEW_PERMISSIONS)) return
  const logistics = ensureLogisticsDb(auth.db); const trip = logistics.trips.find(item => String(item.id) === String(req.params.id))
  if (!trip) return res.status(404).json({ error: 'Cursa nu a fost găsită.' })
  const attachment = logistics.attachments.find(item => String(item.id) === String(req.params.attachmentId) && String(item.cursa_id) === String(trip.id) && !item.cancelled_at)
  if (!attachment) return res.status(404).json({ error: 'Atașamentul nu a fost găsit.' })
  const diskPath = path.resolve(ROOT, String(attachment.file_path || ''))
  if (!diskPath.startsWith(path.resolve(LOGISTICS_STORAGE_DIR)) || !fs.existsSync(diskPath)) return res.status(404).json({ error: 'Fișierul nu mai există pe disc.' })
  res.download(diskPath, attachment.original_name || attachment.file_name || path.basename(diskPath))
})

router.delete('/logistics/trips/:id/attachments/:attachmentId', (req, res) => {
  const auth = requireAuth(req, res); if (!auth || !requirePermission(auth, res, MANAGE_PERMISSIONS)) return
  const logistics = ensureLogisticsDb(auth.db); const trip = logistics.trips.find(item => String(item.id) === String(req.params.id))
  if (!trip) return res.status(404).json({ error: 'Cursa nu a fost găsită.' })
  const attachment = logistics.attachments.find(item => String(item.id) === String(req.params.attachmentId) && String(item.cursa_id) === String(trip.id) && !item.cancelled_at)
  if (!attachment) return res.status(404).json({ error: 'Atașamentul nu a fost găsit.' })
  attachment.cancelled_at = nowIso(); attachment.cancelled_by = auth.user.id; attachment.cancelled_by_name = currentUserLabel(auth.user); attachment.cancelled_reason = clean(req.body?.motiv || req.body?.reason || 'Retras din dovada cursei', 500)
  recordTripEvent(trip, 'attachment_cancelled', `Atașament retras: ${attachment.original_name}`, auth.user); addAudit(auth.db, auth.user, 'logistics_trip_attachment_cancelled', `${trip.numar}: ${attachment.original_name}`); writeDb(auth.db)
  res.json({ ok: true, trip: decorateTrip(auth.db, trip) })
})

router.post('/logistics/documents', (req, res) => {
  const auth = requireAuth(req, res); if (!auth || !requirePermission(auth, res, MANAGE_PERMISSIONS)) return
  const logistics = ensureLogisticsDb(auth.db); const payload = normalizeInput(req.body || {}, {}, logistics.documents); const error = validate(payload, auth.db)
  if (error) return res.status(422).json({ error })
  const document = { id: id(), uuid: crypto.randomUUID(), ...payload, created_at: nowIso(), created_by: auth.user.id, created_by_name: currentUserLabel(auth.user), updated_at: nowIso() }
  logistics.documents.push(document)
  const linkedTrip = logistics.trips.find(item => String(item.id) === String(document.cursa_id))
  if (linkedTrip) recordTripEvent(linkedTrip, 'document_created', `Document creat: ${document.numar} (${typeLabel(document.tip)}).`, auth.user)
  addAudit(auth.db, auth.user, 'logistics_document_created', `${document.numar} / ${document.tip}`); writeDb(auth.db)
  res.status(201).json({ document: decorate(auth.db, document) })
})

router.patch('/logistics/documents/:id', (req, res) => {
  const auth = requireAuth(req, res); if (!auth || !requirePermission(auth, res, MANAGE_PERMISSIONS)) return
  const logistics = ensureLogisticsDb(auth.db); const document = logistics.documents.find(item => String(item.id) === String(req.params.id))
  if (!document) return res.status(404).json({ error: 'Documentul de transport nu a fost găsit.' })
  const payload = normalizeInput(req.body || {}, document, logistics.documents); const error = validate(payload, auth.db, document.id)
  if (error) return res.status(422).json({ error })
  Object.assign(document, payload, { updated_at: nowIso(), updated_by: auth.user.id, updated_by_name: currentUserLabel(auth.user) })
  const linkedTrip = logistics.trips.find(item => String(item.id) === String(document.cursa_id))
  if (linkedTrip) recordTripEvent(linkedTrip, 'document_updated', `Document actualizat: ${document.numar} (${typeLabel(document.tip)}).`, auth.user)
  addAudit(auth.db, auth.user, 'logistics_document_updated', `${document.numar} / ${document.tip}`); writeDb(auth.db)
  res.json({ document: decorate(auth.db, document) })
})

router.post('/logistics/documents/:id/cancel', (req, res) => {
  const auth = requireAuth(req, res); if (!auth || !requirePermission(auth, res, MANAGE_PERMISSIONS)) return
  const logistics = ensureLogisticsDb(auth.db); const document = logistics.documents.find(item => String(item.id) === String(req.params.id))
  if (!document) return res.status(404).json({ error: 'Documentul de transport nu a fost găsit.' })
  document.status = 'anulat'; document.cancelled_at = nowIso(); document.cancelled_by = auth.user.id; document.cancelled_reason = clean(req.body?.motiv || req.body?.reason || 'Anulat controlat', 500)
  const linkedTrip = logistics.trips.find(item => String(item.id) === String(document.cursa_id))
  if (linkedTrip) recordTripEvent(linkedTrip, 'document_cancelled', `Document anulat: ${document.numar} (${typeLabel(document.tip)}).`, auth.user)
  addAudit(auth.db, auth.user, 'logistics_document_cancelled', document.numar); writeDb(auth.db)
  res.json({ ok: true, document: decorate(auth.db, document) })
})

router.get('/logistics/documents/:id/print', (req, res) => {
  const auth = requireAuth(req, res); if (!auth || !requirePermission(auth, res, PRINT_PERMISSIONS)) return
  const document = ensureLogisticsDb(auth.db).documents.find(item => String(item.id) === String(req.params.id))
  if (!document) return res.status(404).json({ error: 'Documentul de transport nu a fost găsit.' })
  res.type('html').send(printHtml(auth.db, document, auth.user))
})

module.exports = router
