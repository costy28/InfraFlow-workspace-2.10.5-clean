const { Router } = require('express')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { requireAuth } = require('../../core/auth')
const { requirePermission, authHasPermission } = require('../../core/permissions')
const { readDb, writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const kioskAuth = require('../../core/kiosk-sessions')

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
    .filter(trip => String(trip.asset_id) === String(assetIdValue) && trip.status === 'inchisa' && trip.km_sosire != null)
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
      ['deschisa', 'completata'].includes(f.status)
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
      status: 'deschisa',
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
  const activRows = activitati.map(a => `<tr>
    <td>${htmlEscape(a.ziua || '')}</td>
    <td>${htmlEscape(a.ora || '')}:${htmlEscape(a.minut || '00')}</td>
    <td>${htmlEscape(a.loc_plecare || '')}</td>
    <td>${htmlEscape(a.loc_sosire || '')}</td>
    <td>${htmlEscape(a.km_incarcat || 0)}</td>
    <td>${htmlEscape(a.km_gol || 0)}</td>
    <td>${htmlEscape(a.tone || '')}</td>
    <td>${htmlEscape(a.marfa || '')}</td>
  </tr>`).join('')
  const sigHtml = row.semnatura_responsabil_path && fs.existsSync(path.resolve(__dirname, '../../../', row.semnatura_responsabil_path))
    ? `<img src="data:image/png;base64,${fs.readFileSync(path.resolve(__dirname, '../../../', row.semnatura_responsabil_path)).toString('base64')}" style="max-height:60px">`
    : ''
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${htmlEscape(row.nr_foaie)}</title>
<style>
body{font-family:Arial,sans-serif;margin:32px;color:#111}h1{font-size:22px;margin:0 0 16px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px}.box{border:1px solid #333;padding:12px;margin:14px 0}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{border:1px solid #333;padding:7px;text-align:left}.sign{height:70px}.muted{color:#555}
</style></head><body>
<h1>Foaie de parcurs ${htmlEscape(row.nr_foaie)}</h1>
<div class="grid">
<div>Societatea: <b>${htmlEscape(db.settings?.companyName || 'SC PUBLISERV SA')}</b></div>
<div>Data: <b>${htmlEscape(row.data)}</b></div>
<div>Autovehicul: <b>${htmlEscape(assetLabel(asset))}</b></div>
<div>Șofer: <b>${htmlEscape(row.sofer_nume)}</b></div>
<div>Km plecare: <b>${htmlEscape(row.km_plecare)}</b></div>
<div>Km sosire: <b>${htmlEscape(row.km_sosire || '')}</b></div>
<div>Combustibil plecare: <b>${htmlEscape(row.combustibil_sold_initial ?? '')}</b></div>
<div>Combustibil primit / final: <b>${htmlEscape(row.combustibil_primit ?? '')} / ${htmlEscape(row.combustibil_sold_final ?? '')}</b></div>
</div>
${activitati.length ? `<div class="box"><b>XI. Activități</b>
<table><tr><th>Ziua</th><th>Ora</th><th>Loc plecare</th><th>Loc sosire</th><th>Km înc.</th><th>Km gol</th><th>Tone</th><th>Marfă</th></tr>${activRows}</table></div>` : ''}
<div class="box"><b>XII. Index contor</b> Km sosire: ${htmlEscape(row.km_sosire || '')} | Km necontorizați: ${htmlEscape(row.km_necont ?? 0)} | Cat.I: ${htmlEscape(row.km_cat1 ?? 0)} | Cat.II: ${htmlEscape(row.km_cat2 ?? 0)} | Cat.III: ${htmlEscape(row.km_cat3 ?? 0)}</div>
<div class="box"><b>Verso foaie</b><br>Itinerariu: ${htmlEscape(row.itinerariu)}<br>Scop deplasare: ${htmlEscape(row.scop_deplasare)}<br>Observații: ${htmlEscape(row.observatii)}</div>
<table><tr><th>Km parcurși</th><th>Consum normat</th><th>Consum efectiv</th><th>Diferență</th></tr>
<tr><td>${htmlEscape(row.km_parcursi ?? '')}</td><td>${htmlEscape(row.consum_normat ?? '')}</td><td>${htmlEscape(row.consum_efectiv ?? '')}</td><td>${htmlEscape(row.diferenta_consum ?? '')}</td></tr></table>
<table><tr>
  <th class="sign">Șofer</th>
  <th class="sign">Responsabil lucrare${row.semnatura_responsabil_nume ? `<br><small>${htmlEscape(row.semnatura_responsabil_nume)}</small>` : ''}${sigHtml ? `<br>${sigHtml}` : ''}</th>
  <th class="sign">Șef garaj / mecanizare</th>
</tr></table>
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
    if (!['deschisa', 'completata'].includes(trip.status)) {
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

module.exports = router
