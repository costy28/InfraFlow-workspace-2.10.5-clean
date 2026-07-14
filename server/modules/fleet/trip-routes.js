const { Router } = require('express')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { requireAuth } = require('../../core/auth')
const { requirePermission, authHasPermission } = require('../../core/permissions')
const { readDb, writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const kioskAuth = require('../../core/kiosk-sessions')
const { ensurePushDb, ensureVapidKeys, sendPushNotification } = require('./push-service')

const router = Router()

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

function ensureFleetTripDb(db) {
  db.fleetTripLogs = Array.isArray(db.fleetTripLogs) ? db.fleetTripLogs : []
  if (!Array.isArray(db.audit)) db.audit = []
  return db.fleetTripLogs
}

function assetList(db) {
  return Array.isArray(db.fleetAssets) ? db.fleetAssets : []
}

function employeesList(db) {
  return db.hr?.employees || db.employees || []
}

function usersList(db) {
  return Array.isArray(db.users) ? db.users : []
}

function employeeUserId(db, employeeId) {
  const employee = employeesList(db).find(item => String(item.id) === String(employeeId))
  return employee?.user_id || usersList(db).find(item => String(item.employee_id || item.employeeId) === String(employeeId))?.id || null
}

function isTripOwner(auth, trip) {
  return String(trip.trimisa_catre || '') === String(auth.user.id)
    || String(trip.sofer_id || '') === String(auth.user.employee_id || auth.user.employeeId || '')
}

function notifyUser(db, userId, type, message, url) {
  if (!userId) return
  db.notifications = Array.isArray(db.notifications) ? db.notifications : []
  db.notifications.push({ id: crypto.randomUUID(), type, user_id: userId, message, url, created_at: nowIso(), read: false })
  sendPushNotification(db, userId, { title: 'InfraFlow', body: message, icon: '/icons/icon-192.png', url }).catch(() => {})
}

function signatureValue(value) {
  const signature = String(value || '')
  if (!/^data:image\/(svg\+xml|png);base64,/.test(signature)) throw Object.assign(new Error('Semnătura este invalidă.'), { status: 422 })
  if (signature.length > 800000) throw Object.assign(new Error('Semnătura este prea mare.'), { status: 422 })
  return signature
}

function createSignToken(trip) {
  trip.sign_token = crypto.randomBytes(32).toString('hex')
  trip.sign_token_exp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  trip.sign_token_used_at = null
  return trip.sign_token
}

function publicSignLink(req, token) {
  return `${req.protocol}://${req.get('host')}/fleet/sign/${token}`
}

function assetId(asset) {
  return String(asset?.id ?? asset?.asset_id ?? '')
}

function findAsset(db, id) {
  return assetList(db).find(asset => assetId(asset) === String(id))
}

function isVehicle(asset = {}) {
  const explicit = String(asset.tip_asset || asset.tipAsset || '').toLowerCase()
  if (explicit === 'autovehicul') return true
  if (explicit === 'utilaj') return false
  if (asset.category === 'vehicle') return true
  return Boolean(asset.nr_inmatriculare || asset.registration)
}

function employeeName(employee) {
  if (!employee) return ''
  return [employee.nume, employee.prenume].filter(Boolean).join(' ') || employee.name || employee.fullName || ''
}

function tripDriverName(db, trip) {
  const employee = employeesList(db).find(item => String(item.id) === String(trip.sofer_id))
  return employeeName(employee) || trip.sofer_text || '-'
}

function assetLabel(asset) {
  if (!asset) return '-'
  return [
    asset.nr_inmatriculare || asset.registration || asset.cod || asset.assetCode,
    [asset.marca || asset.brand, asset.model].filter(Boolean).join(' ')
  ].filter(Boolean).join(' / ') || asset.name || '-'
}

function tripPublic(db, trip) {
  const asset = findAsset(db, trip.asset_id)
  const kmParcursi = trip.km_sosire == null || trip.km_sosire === ''
    ? null
    : Number(trip.km_sosire || 0) - Number(trip.km_plecare || 0)
  const consumEfectiv = trip.combustibil_sold_final == null || trip.combustibil_sold_final === ''
    ? null
    : Number(trip.combustibil_sold_initial || 0) + Number(trip.combustibil_primit || 0) - Number(trip.combustibil_sold_final || 0)
  return {
    ...trip,
    asset,
    asset_label: assetLabel(asset),
    sofer_nume: tripDriverName(db, trip),
    km_parcursi: kmParcursi,
    consum_efectiv: consumEfectiv,
    diferenta_consum: consumEfectiv == null || trip.consum_normat == null ? null : consumEfectiv - Number(trip.consum_normat || 0)
  }
}

function normalizeDate(value, fallback = todayIso()) {
  const text = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback
}

function normalizeDateTime(value) {
  if (!value) return nowIso()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? nowIso() : date.toISOString()
}

function numberValue(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function nextTripNumber(db) {
  const year = new Date().getFullYear()
  const prefix = `FP-${year}-`
  const trips = ensureFleetTripDb(db)
  const last = trips.reduce((max, trip) => {
    const number = String(trip.nr_foaie || '').startsWith(prefix)
      ? Number(String(trip.nr_foaie).slice(prefix.length))
      : 0
    return Number.isFinite(number) ? Math.max(max, number) : max
  }, 0)
  return `${prefix}${String(last + 1).padStart(6, '0')}`
}

function lastClosedTrip(db, assetIdValue) {
  return ensureFleetTripDb(db)
    .filter(trip => String(trip.asset_id) === String(assetIdValue) && ['inchisa', 'aprobata', 'arhivata', 'in_faz'].includes(trip.status) && trip.km_sosire != null)
    .sort((a, b) => String(b.data_sosire || b.data || '').localeCompare(String(a.data_sosire || a.data || '')))[0]
}

function canUseTripLogs(auth, res) {
  if (auth?.user?.role === 'driver') return true
  return requirePermission(auth, res, 'fleet:trip_log_view')
}

router.get('/fleet/trip-logs', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canUseTripLogs(auth, res)) return

    const db = readDb()
    let trips = ensureFleetTripDb(db).map(trip => tripPublic(db, trip))
    if (auth.user.role === 'driver') {
      trips = trips.filter(trip => String(trip.sofer_id) === String(auth.user.employee_id || auth.user.employeeId || ''))
    }
    if (req.query.status) trips = trips.filter(trip => trip.status === req.query.status)
    if (req.query.asset_id) trips = trips.filter(trip => String(trip.asset_id) === String(req.query.asset_id))
    if (req.query.sofer_id) trips = trips.filter(trip => String(trip.sofer_id) === String(req.query.sofer_id))
    if (req.query.data) trips = trips.filter(trip => trip.data === req.query.data)
    if (req.query.luna) trips = trips.filter(trip => String(trip.data || '').startsWith(String(req.query.luna)))
    trips.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || String(b.nr_foaie || '').localeCompare(String(a.nr_foaie || '')))
    sendJson(res, 200, { trip_logs: trips })
  } catch (error) {
    next(error)
  }
})

router.post('/fleet/trip-logs', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'fleet:trip_log_create')) return

    const db = readDb()
    const trips = ensureFleetTripDb(db)
    const body = req.body || {}
    const asset = findAsset(db, body.asset_id)
    if (!asset || !isVehicle(asset)) return sendJson(res, 404, { error: 'Autovehiculul nu există.' })

    // TASK 5 — Verificare foaie activă per vehicul
    const foaieDeschisa = trips.find(f =>
      (String(f.asset_id) === String(body.asset_id) ||
       (f.nr_inmatriculare && body.nr_inmatriculare && f.nr_inmatriculare === body.nr_inmatriculare)) &&
      ['draft', 'deschisa', 'trimisa', 'in_lucru', 'completata', 'semnata_sofer', 'semnata_responsabil'].includes(f.status)
    )
    if (foaieDeschisa) {
      const foaieAsset = findAsset(db, foaieDeschisa.asset_id)
      return sendJson(res, 409, {
        error: 'Foaie activă existentă',
        foaie_activa: {
          id: foaieDeschisa.id,
          uuid: foaieDeschisa.uuid,
          nr_foaie: foaieDeschisa.nr_foaie,
          data: foaieDeschisa.data,
          sofer: foaieDeschisa.sofer_text || '',
          status: foaieDeschisa.status,
          km_plecare: foaieDeschisa.km_plecare,
          asset_label: assetLabel(foaieAsset)
        }
      })
    }

    // TASK 6 — Număr foaie manual sau auto-generat
    let nrFoaie = String(body.nr_foaie || '').trim()
    if (nrFoaie) {
      const currentYear = new Date().getFullYear()
      const duplicate = trips.find(t =>
        t.nr_foaie === nrFoaie &&
        new Date(t.data || t.created_at || '').getFullYear() === currentYear
      )
      if (duplicate) {
        return sendJson(res, 409, { error: `Numărul ${nrFoaie} există deja în ${currentYear}.` })
      }
    } else {
      nrFoaie = nextTripNumber(db)
    }

    const lastTrip = lastClosedTrip(db, body.asset_id)
    const kmPlecare = numberValue(body.km_plecare, 0) || numberValue(lastTrip?.km_sosire, 0)
    const fuelInitial = body.combustibil_sold_initial !== undefined
      ? numberValue(body.combustibil_sold_initial, null)
      : (lastTrip?.combustibil_sold_final ?? null)
    const trip = {
      id: nextId(trips),
      uuid: uuid(),
      asset_id: body.asset_id,
      sofer_id: body.sofer_id || null,
      sofer_text: String(body.sofer_text || '').trim(),
      data: normalizeDate(body.data),
      nr_foaie: nrFoaie,
      serie: String(body.serie || '').trim(),
      data_plecare: normalizeDateTime(body.data_plecare || `${normalizeDate(body.data)}T${new Date().toTimeString().slice(0, 5)}`),
      km_plecare: Math.round(kmPlecare),
      combustibil_sold_initial: fuelInitial,
      data_sosire: null,
      km_sosire: null,
      combustibil_sold_final: null,
      combustibil_primit: null,
      consum_normat: null,
      itinerariu: '',
      scop_deplasare: '',
      sarcini_transport: '',
      loc_parcare: '',
      conditii_speciale: '',
      loc_prezentare: '',
      expeditor: '',
      observatii: '',
      status: 'draft',
      sosit: false,
      autominder_id: null,
      creat_de: auth.user.id,
      created_by_name: auth.user.name,
      created_at: nowIso(),
      updated_at: null
    }
    trips.push(trip)
    addAudit(db, auth.user, 'foaie_parcurs_creata', `${trip.nr_foaie} / ${assetLabel(asset)}`)
    writeDb(db)
    sendJson(res, 201, { trip_log: tripPublic(db, trip) })
  } catch (error) {
    next(error)
  }
})

router.patch('/fleet/trip-logs/:uuid/close', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'fleet:trip_log_close')) return

    const db = readDb()
    const trip = ensureFleetTripDb(db).find(item => item.uuid === req.params.uuid)
    if (!trip) return sendJson(res, 404, { error: 'Foaia de parcurs nu există.' })
    if (trip.status === 'in_faz') return sendJson(res, 409, { error: 'Foaia este deja inclusă în FAZ și nu mai poate fi modificată.' })
    const body = req.body || {}
    const kmSosire = Math.round(numberValue(body.km_sosire, 0))
    if (kmSosire <= Number(trip.km_plecare || 0)) {
      return sendJson(res, 422, { error: 'Km sosire trebuie să fie mai mare decât km plecare.' })
    }

    const asset = findAsset(db, trip.asset_id)
    const kmParcursi = kmSosire - Number(trip.km_plecare || 0)
    const consum100 = numberValue(asset?.consum_normat_100km ?? asset?.standardConsumption ?? asset?.standard_consumption, 0)
    trip.km_sosire = kmSosire
    trip.data_sosire = normalizeDateTime(body.data_sosire)
    trip.combustibil_primit = body.combustibil_primit === undefined ? trip.combustibil_primit : numberValue(body.combustibil_primit, 0)
    trip.combustibil_sold_final = body.combustibil_sold_final === undefined ? trip.combustibil_sold_final : numberValue(body.combustibil_sold_final, 0)
    trip.consum_normat = Math.round((kmParcursi / 100) * consum100 * 100) / 100
    ;['itinerariu', 'scop_deplasare', 'sarcini_transport', 'loc_parcare', 'conditii_speciale', 'loc_prezentare', 'expeditor', 'observatii'].forEach(field => {
      if (body[field] !== undefined) trip[field] = String(body[field] || '').trim()
    })
    trip.status = 'inchisa'
    trip.sosit = true
    trip.modified_de = auth.user.id
    trip.modified_by_name = auth.user.name
    trip.updated_at = nowIso()
    addAudit(db, auth.user, 'foaie_parcurs_inchisa', `${trip.nr_foaie} / ${kmParcursi} km`)
    writeDb(db)
    sendJson(res, 200, { trip_log: tripPublic(db, trip) })
  } catch (error) {
    next(error)
  }
})

router.patch('/fleet/trip-logs/:uuid', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'fleet:trip_log_edit')) return

    const db = readDb()
    const trip = ensureFleetTripDb(db).find(item => item.uuid === req.params.uuid)
    if (!trip) return sendJson(res, 404, { error: 'Foaia de parcurs nu există.' })
    if (trip.status === 'in_faz') return sendJson(res, 409, { error: 'Foaia este deja inclusă în FAZ și nu mai poate fi modificată.' })
    ;['itinerariu', 'scop_deplasare', 'sarcini_transport', 'loc_parcare', 'conditii_speciale', 'loc_prezentare', 'expeditor', 'observatii'].forEach(field => {
      if (req.body?.[field] !== undefined) trip[field] = String(req.body[field] || '').trim()
    })
    trip.modified_de = auth.user.id
    trip.modified_by_name = auth.user.name
    trip.updated_at = nowIso()
    addAudit(db, auth.user, 'foaie_parcurs_editata', trip.nr_foaie)
    writeDb(db)
    sendJson(res, 200, { trip_log: tripPublic(db, trip) })
  } catch (error) {
    next(error)
  }
})

router.post('/fleet/trip-logs/faz-generate', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'fleet:faz_generate')) return
    const luna = String(req.body?.luna || '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(luna)) return sendJson(res, 400, { error: 'Luna este obligatorie în format YYYY-MM.' })
    const db = readDb()
    const selected = ensureFleetTripDb(db).filter(trip => trip.status === 'inchisa' && String(trip.data || '').startsWith(luna))
    selected.forEach(trip => {
      trip.status = 'in_faz'
      trip.modified_de = auth.user.id
      trip.updated_at = nowIso()
    })
    const totalKm = selected.reduce((sum, trip) => sum + Math.max(0, Number(trip.km_sosire || 0) - Number(trip.km_plecare || 0)), 0)
    addAudit(db, auth.user, 'faz_lunar_generat', `${luna} / ${selected.length} foi / ${totalKm} km`)
    writeDb(db)
    sendJson(res, 200, {
      ok: true,
      luna,
      foi: selected.length,
      total_km: totalKm,
      html: buildFazHtml(db, selected, luna)
    })
  } catch (error) {
    next(error)
  }
})

router.get('/fleet/trip-logs/:uuid/pdf', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'fleet:trip_log_view')) return
    const db = readDb()
    const trip = ensureFleetTripDb(db).find(item => item.uuid === req.params.uuid)
    if (!trip) return sendJson(res, 404, { error: 'Foaia de parcurs nu există.' })
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(buildTripHtml(db, trip))
  } catch (error) {
    next(error)
  }
})

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildTripHtml(db, trip) {
  const row = tripPublic(db, trip)
  const asset = row.asset || {}
  const activitati = Array.isArray(row.activitati_verso) ? row.activitati_verso : []
  const activRows = activitati.map((a, index) => `<tr>
    <td>${index + 1}</td>
    <td>${htmlEscape(a.ora_plecare || a.ora || '')}</td>
    <td>${htmlEscape(a.ora_sosire || '')}</td>
    <td>${htmlEscape(a.destinatie || [a.loc_plecare, a.loc_sosire].filter(Boolean).join(' - '))}</td>
    <td>${htmlEscape(a.km_parcursi ?? Number(a.km_incarcat || 0) + Number(a.km_gol || 0))}</td>
    <td>${htmlEscape(a.activitate || a.marfa || '')}</td>
  </tr>`).join('')
  const sigLegacy = row.semnatura_responsabil_path && fs.existsSync(path.resolve(__dirname, '../../../', row.semnatura_responsabil_path))
    ? `<img src="data:image/png;base64,${fs.readFileSync(path.resolve(__dirname, '../../../', row.semnatura_responsabil_path)).toString('base64')}" style="max-height:60px">`
    : ''
  const driverSig = row.semnat_sofer_svg ? `<img src="${htmlEscape(row.semnat_sofer_svg)}" style="max-height:58px">` : ''
  const respSig = row.semnat_resp_svg ? `<img src="${htmlEscape(row.semnat_resp_svg)}" style="max-height:58px">` : sigLegacy
  const verifyUrl = `${db.settings?.publicUrl || 'https://infraflow.local'}/fleet/verify/${row.uuid}`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(verifyUrl)}`
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${htmlEscape(row.nr_foaie)}</title>
<style>
@page{size:A4 portrait;margin:14mm}body{font-family:Arial,sans-serif;margin:0;color:#111;font-size:9pt}h1{font-size:20px;margin:0 0 16px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px}.box{border:1px solid #333;padding:12px;margin:14px 0}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{border:1px solid #333;padding:7px;text-align:left}.sign{height:78px}.muted{color:#555}.qr{display:flex;gap:10px;justify-content:flex-end;align-items:center;margin-top:12px;text-align:right;font-size:8pt}@media print{button{display:none}}
</style></head><body>
<h1>Foaie de parcurs ${htmlEscape(row.nr_foaie)}</h1>
<div class="grid">
<div>Societatea: <b>${htmlEscape(db.settings?.companyName || 'Organizație Demo')}</b></div>
<div>Data: <b>${htmlEscape(row.data)}</b></div>
<div>Autovehicul: <b>${htmlEscape(assetLabel(asset))}</b></div>
<div>Șofer: <b>${htmlEscape(row.sofer_nume)}</b></div>
<div>Km plecare: <b>${htmlEscape(row.km_plecare)}</b></div>
<div>Km sosire: <b>${htmlEscape(row.km_sosire || '')}</b></div>
<div>Combustibil plecare: <b>${htmlEscape(row.combustibil_sold_initial ?? '')}</b></div>
<div>Combustibil primit / final: <b>${htmlEscape(row.combustibil_primit ?? '')} / ${htmlEscape(row.combustibil_sold_final ?? '')}</b></div>
</div>
${activitati.length ? `<div class="box"><b>VERSO - Activități</b>
<table><tr><th>Nr.</th><th>Ora pl.</th><th>Ora sos.</th><th>Destinație</th><th>Km</th><th>Activitate</th></tr>${activRows}</table></div>` : ''}
<div class="box"><b>XII. Index contor</b> Km sosire: ${htmlEscape(row.km_sosire || '')} | Km necontorizați: ${htmlEscape(row.km_necont ?? 0)} | Cat.I: ${htmlEscape(row.km_cat1 ?? 0)} | Cat.II: ${htmlEscape(row.km_cat2 ?? 0)} | Cat.III: ${htmlEscape(row.km_cat3 ?? 0)}</div>
<div class="box"><b>Verso foaie</b><br>Itinerariu: ${htmlEscape(row.itinerariu)}<br>Scop deplasare: ${htmlEscape(row.scop_deplasare)}<br>Observații: ${htmlEscape(row.observatii)}</div>
<table><tr><th>Km parcurși</th><th>Consum normat</th><th>Consum efectiv</th><th>Diferență</th></tr>
<tr><td>${htmlEscape(row.km_parcursi ?? '')}</td><td>${htmlEscape(row.consum_normat ?? '')}</td><td>${htmlEscape(row.consum_efectiv ?? '')}</td><td>${htmlEscape(row.diferenta_consum ?? '')}</td></tr></table>
<table><tr>
  <th class="sign">Șofer<br>${driverSig}<br><small>${htmlEscape(row.sofer_nume)} ${htmlEscape(row.semnat_sofer_la || '')}</small></th>
  <th class="sign">Responsabil lucrare<br>${respSig}<br><small>${htmlEscape(row.semnatura_responsabil_nume || '')} ${htmlEscape(row.responsabil_functie || '')} ${htmlEscape(row.semnat_resp_la || '')}</small></th>
  <th class="sign">Șef garaj / mecanizare</th>
</tr></table>
<div class="qr"><span>Scanează pentru a verifica autenticitatea<br>${htmlEscape(verifyUrl)}</span><img src="${qrUrl}" width="92" height="92"></div>
<p class="muted">Generat din InfraFlow la ${htmlEscape(new Date().toLocaleString('ro-RO'))}</p>
</body></html>`
}

function buildFazHtml(db, trips, luna) {
  const rows = trips.map(tripPublic.bind(null, db))
  const totalKm = rows.reduce((sum, trip) => sum + Number(trip.km_parcursi || 0), 0)
  const totalNormat = rows.reduce((sum, trip) => sum + Number(trip.consum_normat || 0), 0)
  const totalReal = rows.reduce((sum, trip) => sum + Number(trip.consum_efectiv || 0), 0)
  return `<!doctype html><html><head><meta charset="utf-8"><title>FAZ ${htmlEscape(luna)}</title></head><body>
<h1>FAZ lunar autovehicule - ${htmlEscape(luna)}</h1>
<p>Total foi: ${rows.length} | Km total: ${totalKm} | Consum normat: ${totalNormat.toFixed(2)} | Consum real: ${totalReal.toFixed(2)}</p>
</body></html>`
}

// ── TASK 4 — Completare VERSO + Semnătură din Kiosk ─────────────────────────

router.patch('/fleet/trip-logs/:uuid/verso-kiosk', (req, res, next) => {
  try {
    // Acceptă atât auth kiosk cât și auth regular (cu permisiune fleet:trip_log_edit)
    const kioskSession = kioskAuth.getSession(kioskAuth.tokenFromRequest(req))
    if (!kioskSession) {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'fleet:trip_log_edit')) return
    }

    const body = req.body || {}
    const db = readDb()
    const trip = ensureFleetTripDb(db).find(t => t.uuid === req.params.uuid)
    if (!trip) return sendJson(res, 404, { error: 'Foaia de parcurs nu există.' })
    if (!['deschisa', 'trimisa', 'in_lucru', 'completata'].includes(trip.status)) {
      return sendJson(res, 409, { error: 'Foaia nu mai poate fi completată (status: ' + trip.status + ').' })
    }

    // Salvează semnătura pe disc (dacă există)
    if (body.semnatura_responsabil) {
      try {
        const sigDir = path.resolve(__dirname, '../../../storage/foi-parcurs')
        fs.mkdirSync(sigDir, { recursive: true })
        const sigFile = path.join(sigDir, `${trip.uuid}_semnatura.png`)
        const base64Data = String(body.semnatura_responsabil).replace(/^data:image\/png;base64,/, '')
        fs.writeFileSync(sigFile, Buffer.from(base64Data, 'base64'))
        trip.semnatura_responsabil_path = `storage/foi-parcurs/${trip.uuid}_semnatura.png`
      } catch (sigErr) {
        console.warn('Nu s-a putut salva semnătura:', sigErr.message)
      }
    }

    // Actualizează câmpurile verso
    trip.activitati_verso = Array.isArray(body.activitati) ? body.activitati : (trip.activitati_verso || [])
    if (body.km_sosire !== undefined) trip.km_sosire = Number(body.km_sosire) || trip.km_sosire
    trip.km_necont = Number(body.km_necont) || 0
    trip.km_cat1 = Number(body.km_cat1) || 0
    trip.km_cat2 = Number(body.km_cat2) || 0
    trip.km_cat3 = Number(body.km_cat3) || 0
    if (body.semnatura_responsabil_nume !== undefined) trip.semnatura_responsabil_nume = String(body.semnatura_responsabil_nume || '').trim()
    if (body.observatii !== undefined) trip.observatii = String(body.observatii || '').trim()
    trip.status = 'completata'
    trip.completat_la = new Date().toISOString()
    trip.completat_de = kioskSession ? 'kiosk' : 'app'
    trip.updated_at = new Date().toISOString()

    // Notificare Mecanizare (prin audit entry)
    try {
      const hrDb = readDb()
      const users = hrDb.users || []
      const mechUsers = users.filter(u => u.active && (u.role === 'mechanization' || (u.roles || []).includes('mechanization')))
      if (!Array.isArray(hrDb.notifications)) hrDb.notifications = []
      const msg = `Foaia ${trip.nr_foaie} (${trip.nr_inmatriculare || trip.asset_id || ''}) a fost completată de ${trip.sofer_text || 'șofer'} prin Kiosk.`
      mechUsers.forEach(u => {
        hrDb.notifications.push({
          id: crypto.randomUUID(),
          type: 'foaie_completata',
          user_id: u.id,
          message: msg,
          foaie_uuid: trip.uuid,
          created_at: new Date().toISOString(),
          read: false
        })
      })
      writeDb(hrDb)
    } catch (_) { /* notificarea nu e critică */ }

    writeDb(db)
    return sendJson(res, 200, { ok: true, trip_log: tripPublic(db, trip) })
  } catch (err) {
    next(err)
  }
})

// ── TASK 4 — Închide foaia (Mecanizare confirmă, setează status 'inchisa') ───

router.patch('/fleet/trip-logs/:uuid/close-mecanizare', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'fleet:trip_log_close')) return

    const db = readDb()
    const trip = ensureFleetTripDb(db).find(t => t.uuid === req.params.uuid)
    if (!trip) return sendJson(res, 404, { error: 'Foaia de parcurs nu există.' })
    if (trip.status !== 'completata') {
      return sendJson(res, 409, { error: 'Foaia poate fi închisă doar după ce a fost completată de șofer.' })
    }
    const body = req.body || {}
    if (body.km_sosire !== undefined) trip.km_sosire = Number(body.km_sosire) || trip.km_sosire
    trip.status = 'inchisa'
    trip.inchis_la = new Date().toISOString()
    trip.inchis_de = auth.user.id
    trip.inchis_de_name = auth.user.name
    trip.updated_at = new Date().toISOString()
    addAudit(db, auth.user, 'foaie_parcurs_inchisa', `${trip.nr_foaie} / confirmat mecanizare`)
    writeDb(db)
    return sendJson(res, 200, { ok: true, trip_log: tripPublic(db, trip) })
  } catch (err) {
    next(err)
  }
})

// ── Servire imagine semnătură (autentificat) ──────────────────────────────────

router.get('/fleet/trip-logs/:uuid/semnatura', (req, res, next) => {
  try {
    // Acceptă atât auth kiosk cât și auth aplicație
    const kioskSession = kioskAuth.getSession(kioskAuth.tokenFromRequest(req))
    if (!kioskSession) {
      const auth = requireAuth(req, res)
      if (!auth) return
    }

    const db = readDb()
    const trip = ensureFleetTripDb(db).find(t => t.uuid === req.params.uuid)
    if (!trip || !trip.semnatura_responsabil_path) {
      return sendJson(res, 404, { error: 'Semnătura nu există.' })
    }
    const sigPath = path.resolve(__dirname, '../../../', trip.semnatura_responsabil_path)
    if (!fs.existsSync(sigPath)) {
      return sendJson(res, 404, { error: 'Fișierul semnăturii nu există.' })
    }
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'private, max-age=3600')
    fs.createReadStream(sigPath).pipe(res)
  } catch (err) {
    next(err)
  }
})

// Flux digital foi de parcurs
router.get('/fleet/push/vapid-public', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    const db = readDb()
    const keys = ensureVapidKeys(db)
    if (keys) writeDb(db)
    sendJson(res, 200, { publicKey: keys?.publicKey || '', enabled: Boolean(keys) })
  } catch (error) { next(error) }
})

router.post('/fleet/push/subscribe', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    const subscription = req.body?.subscription || req.body || {}
    if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return sendJson(res, 422, { error: 'Subscription push invalid.' })
    }
    const db = readDb()
    const items = ensurePushDb(db)
    const existing = items.find(item => item.endpoint === subscription.endpoint)
    const row = existing || { id: nextId(items), created_at: nowIso() }
    Object.assign(row, { user_id: auth.user.id, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, device_name: String(req.body?.device_name || '').slice(0, 100) })
    if (!existing) items.push(row)
    addAudit(db, auth.user, 'push_subscription_salvata', row.device_name || 'browser')
    writeDb(db)
    sendJson(res, 201, { ok: true })
  } catch (error) { next(error) }
})

router.post('/fleet/trip-logs/:uuid/trimite', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return
    const db = readDb()
    const trip = ensureFleetTripDb(db).find(item => item.uuid === req.params.uuid)
    if (!trip) return sendJson(res, 404, { error: 'Foaia de parcurs nu există.' })
    if (!['draft', 'deschisa'].includes(trip.status)) return sendJson(res, 409, { error: 'Foaia a fost deja trimisă.' })
    const driverUserId = req.body?.sofer_user_id || trip.trimisa_catre || employeeUserId(db, req.body?.sofer_id || trip.sofer_id)
    if (!driverUserId) return sendJson(res, 422, { error: 'Șoferul nu are utilizator asociat în HR.' })
    trip.trimisa_catre = driverUserId
    trip.trimisa_la = nowIso()
    trip.status = 'trimisa'
    trip.updated_at = nowIso()
    notifyUser(db, driverUserId, 'foaie_parcurs', 'Ai o foaie de parcurs nouă!', `/sofer?foaie=${trip.uuid}`)
    addAudit(db, auth.user, 'foaie_parcurs_trimisa', `${trip.nr_foaie} / ${tripDriverName(db, trip)}`)
    writeDb(db)
    sendJson(res, 200, { ok: true, trip_log: tripPublic(db, trip) })
  } catch (error) { next(error) }
})

router.post('/fleet/trip-logs/:uuid/incepe', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    const db = readDb()
    const trip = ensureFleetTripDb(db).find(item => item.uuid === req.params.uuid)
    if (!trip) return sendJson(res, 404, { error: 'Foaia de parcurs nu există.' })
    if (!isTripOwner(auth, trip) && !authHasPermission(auth, 'mechanization:manage')) return sendJson(res, 403, { error: 'Foaia este alocată altui șofer.' })
    if (trip.status !== 'trimisa') return sendJson(res, 409, { error: 'Foaia nu este în starea trimisă.' })
    if (req.body?.km_start !== undefined) trip.km_plecare = numberValue(req.body.km_start)
    trip.status = 'in_lucru'
    trip.updated_at = nowIso()
    addAudit(db, auth.user, 'foaie_parcurs_inceputa', trip.nr_foaie)
    writeDb(db)
    sendJson(res, 200, { ok: true, trip_log: tripPublic(db, trip) })
  } catch (error) { next(error) }
})

router.patch('/fleet/trip-logs/:uuid/verso', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    const db = readDb()
    const trip = ensureFleetTripDb(db).find(item => item.uuid === req.params.uuid)
    if (!trip) return sendJson(res, 404, { error: 'Foaia de parcurs nu există.' })
    if (!isTripOwner(auth, trip) && !authHasPermission(auth, 'mechanization:manage')) return sendJson(res, 403, { error: 'Foaia este alocată altui șofer.' })
    if (!['in_lucru', 'trimisa', 'deschisa', 'completata'].includes(trip.status)) return sendJson(res, 409, { error: 'Foaia nu mai poate fi completată.' })
    const body = req.body || {}
    if (body.km_sfarsit !== undefined || body.km_sosire !== undefined) trip.km_sosire = numberValue(body.km_sfarsit ?? body.km_sosire)
    trip.combustibil_primit = numberValue(body.combustibil_primit, trip.combustibil_primit || 0)
    trip.combustibil_sold_final = numberValue(body.combustibil_sfarsit ?? body.combustibil_sold_final, trip.combustibil_sold_final || 0)
    trip.activitati_verso = Array.isArray(body.activitati) ? body.activitati : (trip.activitati_verso || [])
    trip.observatii = String(body.observatii || trip.observatii || '').trim()
    const asset = findAsset(db, trip.asset_id)
    const kmTotal = Number(trip.km_sosire || 0) - Number(trip.km_plecare || 0)
    if (kmTotal < 0) return sendJson(res, 422, { error: 'Km la sosire trebuie să fie mai mare decât km la plecare.' })
    trip.consum_normat = Math.round(kmTotal * numberValue(asset?.consum_normat_100km ?? asset?.standardConsumption, 0)) / 100
    trip.completata_la = nowIso()
    trip.status = 'completata'
    trip.updated_at = nowIso()
    addAudit(db, auth.user, 'foaie_parcurs_verso_completat', `${trip.nr_foaie} / ${kmTotal} km`)
    writeDb(db)
    sendJson(res, 200, { ok: true, trip_log: tripPublic(db, trip) })
  } catch (error) { next(error) }
})

router.post('/fleet/trip-logs/:uuid/semneaza-sofer', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    const db = readDb()
    const trip = ensureFleetTripDb(db).find(item => item.uuid === req.params.uuid)
    if (!trip) return sendJson(res, 404, { error: 'Foaia de parcurs nu există.' })
    if (!isTripOwner(auth, trip) && !authHasPermission(auth, 'mechanization:manage')) return sendJson(res, 403, { error: 'Foaia este alocată altui șofer.' })
    if (trip.status !== 'completata') return sendJson(res, 409, { error: 'Completează verso înainte de semnare.' })
    trip.semnat_sofer_svg = signatureValue(req.body?.signature_svg)
    trip.semnat_sofer_la = nowIso()
    trip.status = 'semnata_sofer'
    const token = createSignToken(trip)
    if (trip.responsabil_id) notifyUser(db, trip.responsabil_id, 'foaie_parcurs_semnare', `Șoferul ${tripDriverName(db, trip)} a completat foaia ${trip.nr_foaie}. Apasă să semnezi.`, `/fleet/sign/${token}`)
    addAudit(db, auth.user, 'foaie_parcurs_semnata_sofer', trip.nr_foaie)
    writeDb(db)
    sendJson(res, 200, { ok: true, sign_token: token })
  } catch (error) { next(error) }
})

router.post('/fleet/trip-logs/:uuid/sign-link', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return
    const db = readDb()
    const trip = ensureFleetTripDb(db).find(item => item.uuid === req.params.uuid)
    if (!trip) return sendJson(res, 404, { error: 'Foaia de parcurs nu există.' })
    if (!['semnata_sofer', 'semnata_responsabil'].includes(trip.status)) return sendJson(res, 409, { error: 'Șoferul trebuie să semneze mai întâi.' })
    if (req.body?.responsabil_id) trip.responsabil_id = req.body.responsabil_id
    const token = !trip.sign_token || trip.sign_token_used_at || new Date(trip.sign_token_exp) < new Date() ? createSignToken(trip) : trip.sign_token
    const link = publicSignLink(req, token)
    if (trip.responsabil_id) notifyUser(db, trip.responsabil_id, 'foaie_parcurs_semnare', `Foaia ${trip.nr_foaie} așteaptă semnătura responsabilului.`, `/fleet/sign/${token}`)
    addAudit(db, auth.user, 'link_semnare_foaie_generat', trip.nr_foaie)
    writeDb(db)
    sendJson(res, 200, { ok: true, link, sign_token: token })
  } catch (error) { next(error) }
})

router.get('/fleet/sign/:token', (req, res) => {
  const db = readDb()
  const trip = ensureFleetTripDb(db).find(item => item.sign_token === req.params.token)
  if (!trip || trip.sign_token_used_at || new Date(trip.sign_token_exp) < new Date()) return sendJson(res, 404, { error: 'Link expirat sau invalid' })
  sendJson(res, 200, { foaie: tripPublic(db, trip), activitati: trip.activitati_verso || [], sofer: { nume: tripDriverName(db, trip), utilaj: assetLabel(findAsset(db, trip.asset_id)) } })
})

router.post('/fleet/sign/:token', (req, res, next) => {
  try {
    const db = readDb()
    const trip = ensureFleetTripDb(db).find(item => item.sign_token === req.params.token)
    if (!trip || trip.sign_token_used_at || new Date(trip.sign_token_exp) < new Date()) return sendJson(res, 404, { error: 'Link expirat sau invalid' })
    trip.semnat_resp_svg = signatureValue(req.body?.signature_svg)
    trip.semnat_resp_la = nowIso()
    trip.semnatura_responsabil_nume = String(req.body?.responsabil_nume || '').trim()
    trip.responsabil_functie = String(req.body?.responsabil_functie || '').trim()
    trip.sign_token_used_at = nowIso()
    trip.status = 'semnata_responsabil'
    const outputDir = path.resolve(__dirname, '../../../storage/foi-parcurs')
    fs.mkdirSync(outputDir, { recursive: true })
    trip.pdf_final_path = `storage/foi-parcurs/${trip.uuid}.html`
    fs.writeFileSync(path.resolve(__dirname, '../../../', trip.pdf_final_path), buildTripHtml(db, trip), 'utf8')
    usersList(db).filter(user => authHasPermission({ user, db }, 'mechanization:approve')).forEach(user => notifyUser(db, user.id, 'foaie_parcurs_aprobare', `Foaia ${trip.nr_foaie} - ${tripDriverName(db, trip)} a fost semnată. Aprobă în InfraFlow.`, '/foi-parcurs'))
    addAudit(db, { id: 'extern', name: trip.semnatura_responsabil_nume || 'Responsabil extern' }, 'foaie_parcurs_semnata_responsabil', trip.nr_foaie)
    writeDb(db)
    sendJson(res, 200, { ok: true, mesaj: 'Semnătură înregistrată! Mulțumim.' })
  } catch (error) { next(error) }
})

router.post('/fleet/trip-logs/:uuid/aproba', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:approve')) return
    const db = readDb()
    const trip = ensureFleetTripDb(db).find(item => item.uuid === req.params.uuid)
    if (!trip) return sendJson(res, 404, { error: 'Foaia de parcurs nu există.' })
    if (trip.status !== 'semnata_responsabil') return sendJson(res, 409, { error: 'Lipsește semnătura responsabilului.' })
    trip.status = 'aprobata'
    trip.aprobat_de = auth.user.id
    trip.aprobat_la = nowIso()
    notifyUser(db, trip.trimisa_catre || employeeUserId(db, trip.sofer_id), 'foaie_parcurs_aprobata', `Foaia ${trip.nr_foaie} a fost aprobată.`, '/sofer')
    addAudit(db, auth.user, 'foaie_parcurs_aprobata', trip.nr_foaie)
    writeDb(db)
    sendJson(res, 200, { ok: true, trip_log: tripPublic(db, trip) })
  } catch (error) { next(error) }
})

router.get('/fleet/verify/:uuid', (req, res) => {
  const db = readDb()
  const trip = ensureFleetTripDb(db).find(item => item.uuid === req.params.uuid)
  if (!trip) return sendJson(res, 404, { error: 'Foaia de parcurs nu există.' })
  sendJson(res, 200, { valida: Boolean(trip.semnat_sofer_la && trip.semnat_resp_la), foaie: tripPublic(db, trip) })
})

module.exports = router
