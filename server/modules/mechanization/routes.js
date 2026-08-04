const { Router } = require('express')
const crypto = require('crypto')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { readDb, writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')

const router = Router()

// ─── helpers ────────────────────────────────────────────────────────────────

function id(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
}

function nowIso() { return new Date().toISOString() }

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function num(v) { return Number(v) || 0 }

function positiveNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function sendJson(res, status, body) {
  res.status(status).json(body)
}

function throwHttp(code, msg) {
  const err = new Error(msg)
  err.status = code
  throw err
}

// ─── DB init ─────────────────────────────────────────────────────────────────

function ensureDb(db) {
  if (!db.mechanization || typeof db.mechanization !== 'object') db.mechanization = {}
  const m = db.mechanization
  if (!Array.isArray(m.plannings))     m.plannings     = []
  if (!Array.isArray(m.workOrders))    m.workOrders    = []
  if (!Array.isArray(m.interventions)) m.interventions = []
  if (!Array.isArray(m.fuelLogs))      m.fuelLogs      = []
  if (!Array.isArray(m.fazReports))    m.fazReports    = []
  return m
}

function fuelStockSettings(db) {
  if (!db.settings || typeof db.settings !== 'object') db.settings = {}
  const minLiters = positiveNumber(db.settings.fleet_fuel_stock_min_liters, 25)
  const warningPercent = positiveNumber(db.settings.fleet_fuel_stock_warning_percent, 10)
  return {
    min_liters: minLiters,
    warning_percent: Math.min(100, warningPercent),
  }
}

// ─── views ───────────────────────────────────────────────────────────────────

function equipmentList(db) {
  return (db.fleetAssets || []).filter(a => a.active !== false)
}

function assetName(asset) {
  return [asset.name, asset.registration].filter(Boolean).join(' / ')
}

function findAsset(db, assetId) {
  return (db.fleetAssets || []).find(a => String(a.id) === String(assetId))
}

function assetMeterUnit(asset) {
  return asset?.meterUnit === 'hours' || asset?.category === 'equipment' ? 'ore' : 'km'
}

function assetCurrentMeter(asset) {
  return num(asset?.currentMeter ?? asset?.km_curent ?? asset?.ore_motor ?? asset?.initialMeter)
}

function dateInMonth(value, luna) {
  return String(value || '').startsWith(luna)
}

function daysUntilDate(date) {
  if (!date) return null
  return Math.ceil((new Date(date).getTime() - new Date(todayIso()).getTime()) / 86400000)
}

function addMonthsIso(value, months) {
  if (!value || !months) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  d.setMonth(d.getMonth() + num(months))
  return d.toISOString().slice(0, 10)
}

function totalInterventionCost(body) {
  const explicit = num(body.cost_total)
  if (explicit) return round2(explicit)
  const detailed = num(body.cost_piese) + num(body.cost_manopera) + num(body.cost_extern)
  return round2(detailed || num(body.cost))
}

function fuelValue(body) {
  const explicit = num(body.valoare_totala)
  if (explicit) return round2(explicit)
  return round2(num(body.cantitate_litri) * num(body.pret_litru))
}

function assetWorkHours(m, assetId, luna = '') {
  return m.workOrders
    .filter(w => String(w.asset_id) === String(assetId))
    .filter(w => !luna || dateInMonth(w.date, luna))
    .reduce((s, w) => s + num(w.ore_lucrate), 0)
}

function assetFuelCost(m, assetId, luna = '') {
  return m.fuelLogs
    .filter(f => String(f.asset_id) === String(assetId))
    .filter(f => !luna || dateInMonth(f.data, luna))
    .reduce((s, f) => s + num(f.valoare_totala), 0)
}

function assetRepairCost(m, assetId, luna = '') {
  return m.interventions
    .filter(i => String(i.asset_id) === String(assetId))
    .filter(i => !luna || dateInMonth(i.data_intrare, luna))
    .reduce((s, i) => s + num(i.cost_total || i.cost), 0)
}

function costHourRows(db, m, luna) {
  const rows = equipmentList(db).map(asset => {
    const ore_total = round2(assetWorkHours(m, asset.id, luna))
    const cost_carburant = round2(assetFuelCost(m, asset.id, luna))
    const cost_reparatii = round2(assetRepairCost(m, asset.id, luna))
    const cost_total = round2(cost_carburant + cost_reparatii)
    return {
      asset_id: asset.id,
      asset_name: assetName(asset),
      category: asset.category || '',
      ore_total,
      cost_carburant,
      cost_reparatii,
      cost_total,
      cost_ora: ore_total > 0 ? round2(cost_total / ore_total) : 0,
    }
  })

  const totals = rows.reduce((acc, row) => {
    acc.ore_total += row.ore_total
    acc.cost_carburant += row.cost_carburant
    acc.cost_reparatii += row.cost_reparatii
    acc.cost_total += row.cost_total
    return acc
  }, { ore_total: 0, cost_carburant: 0, cost_reparatii: 0, cost_total: 0, cost_ora: 0 })
  totals.cost_ora = totals.ore_total > 0 ? round2(totals.cost_total / totals.ore_total) : 0

  return { rows, totals }
}

function sameDayAssetItems(items, assetId, date, dateField) {
  return items.filter(item => String(item.asset_id) === String(assetId) && String(item[dateField] || '').slice(0, 10) === date)
}

function buildMechanizationFaz(db, m, luna, assetId = '') {
  const workOrders = m.workOrders
    .filter(wo => dateInMonth(wo.date, luna))
    .filter(wo => !assetId || String(wo.asset_id) === String(assetId))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.asset_name || '').localeCompare(String(b.asset_name || '')))

  const rows = workOrders.map((wo, index) => {
    const date = String(wo.date || '').slice(0, 10)
    const fuels = sameDayAssetItems(m.fuelLogs, wo.asset_id, date, 'data')
    const interventions = sameDayAssetItems(m.interventions, wo.asset_id, date, 'data_intrare')
    const alimentari_l = round2(fuels.reduce((sum, fuel) => sum + num(fuel.cantitate_litri), 0))
    const cost_carburant = round2(fuels.reduce((sum, fuel) => sum + num(fuel.valoare_totala), 0))
    const cost_service = round2(interventions.reduce((sum, intervention) => sum + num(intervention.cost_total || intervention.cost), 0))
    const consum_real = round2(num(wo.consum_carburant) || alimentari_l)
    const consum_normat = round2(num(wo.consum_normat))
    const asset = findAsset(db, wo.asset_id)
    return {
      nr: index + 1,
      data: date,
      asset_id: wo.asset_id,
      asset_name: wo.asset_name || (asset ? assetName(asset) : ''),
      operator: wo.operator || '',
      locatie: wo.locatie || '',
      activitate: wo.activitate || '',
      ore_program: round2(num(wo.ore_lucrate)),
      ore_lucru_efectiv: round2(num(wo.ore_lucrate)),
      km_parcursi: round2(num(wo.km_parcursi)),
      motorina_l: consum_real,
      alimentari_l,
      consum_normat,
      diferenta_motorina: round2(consum_real - consum_normat),
      cost_carburant,
      cost_service,
      documente_alimentare: fuels.map(fuel => fuel.nr_document).filter(Boolean).join(', '),
      interventii: interventions.map(intervention => intervention.tip).filter(Boolean).join(', '),
      observatii: wo.observatii || '',
    }
  })

  const totals = rows.reduce((acc, row) => {
    acc.ore_program += row.ore_program
    acc.ore_lucru_efectiv += row.ore_lucru_efectiv
    acc.km_parcursi += row.km_parcursi
    acc.motorina_l += row.motorina_l
    acc.alimentari_l += row.alimentari_l
    acc.consum_normat += row.consum_normat
    acc.diferenta_motorina += row.diferenta_motorina
    acc.cost_carburant += row.cost_carburant
    acc.cost_service += row.cost_service
    return acc
  }, {
    ore_program: 0,
    ore_lucru_efectiv: 0,
    km_parcursi: 0,
    motorina_l: 0,
    alimentari_l: 0,
    consum_normat: 0,
    diferenta_motorina: 0,
    cost_carburant: 0,
    cost_service: 0,
  })
  Object.keys(totals).forEach(key => { totals[key] = round2(totals[key]) })
  totals.cost_total = round2(totals.cost_carburant + totals.cost_service)
  totals.cost_ora = totals.ore_lucru_efectiv > 0 ? round2(totals.cost_total / totals.ore_lucru_efectiv) : 0

  const generated = m.fazReports
    .filter(report => report.luna === luna && String(report.asset_id || '') === String(assetId || ''))
    .sort((a, b) => String(b.generated_at || '').localeCompare(String(a.generated_at || '')))[0] || null

  return { luna, asset_id: assetId || '', rows, totals, generated }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildMechanizationFazHtml(report) {
  const bodyRows = report.rows.map(row => `
    <tr>
      <td>${escapeHtml(row.nr)}</td>
      <td>${escapeHtml(row.data)}</td>
      <td>${escapeHtml(row.asset_name)}</td>
      <td>${escapeHtml(row.operator || '-')}</td>
      <td>${escapeHtml(row.activitate || '-')}</td>
      <td>${escapeHtml(row.locatie || '-')}</td>
      <td class="num">${row.ore_lucru_efectiv.toFixed(2)}</td>
      <td class="num">${row.km_parcursi.toFixed(2)}</td>
      <td class="num">${row.motorina_l.toFixed(2)}</td>
      <td class="num">${row.consum_normat.toFixed(2)}</td>
      <td class="num ${row.diferenta_motorina > 0 ? 'bad' : ''}">${row.diferenta_motorina.toFixed(2)}</td>
      <td>${escapeHtml(row.observatii || '')}</td>
    </tr>
  `).join('')
  const totals = report.totals
  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <title>FAZ Mecanizare ${escapeHtml(report.luna)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    body { font-family: Arial, sans-serif; color: #111827; font-size: 10px; }
    h1 { margin: 0 0 4px; font-size: 18px; text-align: center; }
    .sub { margin: 0 0 10px; color: #475569; text-align: center; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #94a3b8; padding: 4px; vertical-align: top; }
    th { background: #e2e8f0; text-align: center; }
    .num { text-align: right; }
    .bad { color: #b91c1c; font-weight: bold; }
    .total { background: #f1f5f9; font-weight: bold; }
    .signatures { margin-top: 18px; }
    .signatures td { height: 42px; text-align: center; vertical-align: bottom; }
    .no-print { margin-bottom: 10px; }
    @media print { .no-print { display: none; } body { margin: 0; } }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()">Printează</button>
    <button onclick="window.close()">Închide</button>
  </div>
  <h1>FAZ Lunar Mecanizare - ${escapeHtml(report.luna)}</h1>
  <p class="sub">Generat din bonuri de lucru, alimentări carburant și intervenții</p>
  <table>
    <thead>
      <tr>
        <th>Nr.</th><th>Data</th><th>Utilaj</th><th>Operator</th><th>Activitate</th><th>Locație</th>
        <th>Ore LE</th><th>Km</th><th>Motorină reală</th><th>Consum normat</th><th>Dif.</th><th>Observații</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows || '<tr><td colspan="12" style="text-align:center">Nu există bonuri pentru luna selectată.</td></tr>'}
      <tr class="total">
        <td colspan="6">TOTAL</td>
        <td class="num">${totals.ore_lucru_efectiv.toFixed(2)}</td>
        <td class="num">${totals.km_parcursi.toFixed(2)}</td>
        <td class="num">${totals.motorina_l.toFixed(2)}</td>
        <td class="num">${totals.consum_normat.toFixed(2)}</td>
        <td class="num">${totals.diferenta_motorina.toFixed(2)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>
  <table class="signatures">
    <tr><th>Întocmit</th><th>Verificat mecanizare</th><th>Aprobat</th></tr>
    <tr><td>Semnătura</td><td>Semnătura</td><td>Semnătura</td></tr>
  </table>
</body>
</html>`
}

function revisionPredictionForAsset(asset, m) {
  const revisions = m.interventions
    .filter(i => String(i.asset_id) === String(asset.id) && String(i.tip || '').toLowerCase() === 'revizie')
    .sort((a, b) => (b.data_intrare || '').localeCompare(a.data_intrare || ''))
  const last = revisions[0] || null
  const currentMeter = assetCurrentMeter(asset)
  const intervalMeter = num(asset.serviceIntervalMeter || asset.service_interval_meter || asset.interval_revizie)
  const intervalMonths = num(asset.serviceIntervalMonths || asset.service_interval_months || 6)
  const inferredLastMeter = last?.next_service_meter && intervalMeter ? num(last.next_service_meter) - intervalMeter : 0
  const lastMeter = num(last?.km_ore || asset.lastServiceMeter || inferredLastMeter)
  const nextMeter = num(last?.next_service_meter || asset.nextServiceMeter || (lastMeter && intervalMeter ? lastMeter + intervalMeter : 0))
  const nextDate = last?.next_service_date || asset.nextServiceDate || addMonthsIso(last?.data_intrare, intervalMonths)
  const remainingDays = daysUntilDate(nextDate)
  const remainingMeter = nextMeter ? round2(nextMeter - currentMeter) : null
  const overdueByMeter = remainingMeter !== null && remainingMeter <= 0
  const overdueByDate = remainingDays !== null && remainingDays <= 0
  const warningByMeter = remainingMeter !== null && remainingMeter <= Math.max(50, intervalMeter * 0.1)
  const warningByDate = remainingDays !== null && remainingDays <= 30
  const status = overdueByDate || overdueByMeter ? 'scadent' : warningByDate || warningByMeter ? 'curand' : 'ok'

  return {
    asset_id: asset.id,
    asset_name: assetName(asset),
    current_meter: currentMeter,
    meter_unit: assetMeterUnit(asset),
    last_revision_date: last?.data_intrare || asset.lastServiceDate || '',
    last_revision_meter: last?.km_ore || asset.lastServiceMeter || '',
    next_service_date: nextDate || '',
    next_service_meter: nextMeter || '',
    remaining_days: remainingDays,
    remaining_meter: remainingMeter,
    interval_meter: intervalMeter || '',
    interval_months: intervalMonths || '',
    status,
  }
}

function applyInterventionAssetUpdates(asset, intervention) {
  if (!asset) return
  const tip = String(intervention.tip || '').toLowerCase()
  if (intervention.km_ore && num(intervention.km_ore) > assetCurrentMeter(asset)) {
    asset.currentMeter = num(intervention.km_ore)
  }
  if (tip === 'revizie') {
    if (intervention.data_intrare) asset.lastServiceDate = intervention.data_intrare
    if (intervention.km_ore) asset.lastServiceMeter = num(intervention.km_ore)
    if (intervention.next_service_date) asset.nextServiceDate = intervention.next_service_date
    if (intervention.next_service_meter) asset.nextServiceMeter = num(intervention.next_service_meter)
  }
  if (tip === 'iscir') {
    if (intervention.iscir_expira_la) asset.nextIscirDate = intervention.iscir_expira_la
    if (intervention.iscir_expira_la) asset.nextInspectionDate = intervention.iscir_expira_la
  }
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

router.get('/mechanization/dashboard', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'mechanization:view')) return

  const db = auth.db
  const m = ensureDb(db)
  const today = todayIso()
  const luna = today.slice(0, 7)

  const totalUtilaje = equipmentList(db).filter(a => a.category === 'equipment').length
  const totalVehicule = equipmentList(db).filter(a => a.category === 'vehicle').length

  // plannings today
  const planningsToday = m.plannings.filter(p => p.date === today && p.status !== 'anulat')
  const alocateAzi = new Set(planningsToday.map(p => p.asset_id)).size

  // interventions open
  const inService = m.interventions.filter(i => i.status === 'in_lucru').length

  // fleet alerts
  const alerts = buildFleetAlerts(db)

  // recent work orders
  const recentWorkOrders = [...m.workOrders]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 10)

  // pending fleet requests
  const pendingRequests = (db.fleetRequests || [])
    .filter(r => r.status === 'new')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 10)

  const costData = costHourRows(db, m, luna)
  const topCostHour = costData.rows
    .filter(row => row.ore_total > 0 && row.cost_total > 0)
    .sort((a, b) => b.cost_ora - a.cost_ora)
    .slice(0, 5)

  const fuelThisMonth = m.fuelLogs.filter(fuel => dateInMonth(fuel.data, luna))
  const fuelTotalsThisMonth = {
    cantitate_litri: round2(fuelThisMonth.reduce((sum, fuel) => sum + num(fuel.cantitate_litri), 0)),
    valoare_totala: round2(fuelThisMonth.reduce((sum, fuel) => sum + num(fuel.valoare_totala), 0)),
  }
  const workOrdersThisMonth = m.workOrders.filter(wo => dateInMonth(wo.date, luna))
  const consumedThisMonth = round2(workOrdersThisMonth.reduce((sum, wo) => sum + num(wo.consum_carburant), 0))
  const estimatedFuelBalance = round2(fuelTotalsThisMonth.cantitate_litri - consumedThisMonth)
  const fuelSettings = fuelStockSettings(db)
  const warningThreshold = round2(Math.max(fuelSettings.min_liters, consumedThisMonth * (fuelSettings.warning_percent / 100)))
  const fuelStockEstimate = {
    luna,
    intrari_litri: fuelTotalsThisMonth.cantitate_litri,
    consum_litri: consumedThisMonth,
    sold_estimat_litri: estimatedFuelBalance,
    prag_atentie_litri: warningThreshold,
    settings: fuelSettings,
    status: estimatedFuelBalance < 0 ? 'critic' : estimatedFuelBalance <= warningThreshold ? 'atentie' : 'ok',
    message: estimatedFuelBalance < 0
      ? 'Consumul raportat depășește alimentările înregistrate. Verifică alimentările lipsă sau consumurile introduse.'
      : estimatedFuelBalance <= warningThreshold
        ? 'Soldul estimat este mic față de consumul lunii. Verifică dacă trebuie alimentat sau completate intrări.'
        : 'Soldul estimat este în regulă pentru datele introduse.',
    source: 'alimentări introduse/importate minus consum real din bonuri de lucru',
  }
  const fuelByAsset = new Map()
  for (const asset of equipmentList(db)) {
    const tankCapacity = round2(num(asset.tankCapacity ?? asset.tank_capacity_litri ?? asset.capacitate_rezervor))
    fuelByAsset.set(String(asset.id), {
      asset_id: asset.id,
      asset_name: assetName(asset) || asset.cod || asset.id,
      category: asset.category,
      tank_capacity_litri: tankCapacity,
      intrari_litri: 0,
      consum_litri: 0,
      sold_estimat_litri: 0,
      ocupare_rezervor_procent: null,
      alimentari_count: 0,
      bonuri_count: 0,
      status: 'fara_miscare',
      message: 'Fără alimentări sau consum în luna curentă.',
    })
  }
  for (const fuel of fuelThisMonth) {
    const key = String(fuel.asset_id || '')
    if (!key) continue
    if (!fuelByAsset.has(key)) {
      fuelByAsset.set(key, {
        asset_id: key,
        asset_name: fuel.asset_name || key,
        category: '',
        tank_capacity_litri: 0,
        intrari_litri: 0,
        consum_litri: 0,
        sold_estimat_litri: 0,
        ocupare_rezervor_procent: null,
        alimentari_count: 0,
        bonuri_count: 0,
        status: 'fara_miscare',
        message: 'Resursă găsită în alimentări, dar nu mai este în catalog.',
      })
    }
    const row = fuelByAsset.get(key)
    row.intrari_litri = round2(row.intrari_litri + num(fuel.cantitate_litri))
    row.alimentari_count += 1
  }
  for (const wo of workOrdersThisMonth) {
    const key = String(wo.asset_id || '')
    if (!key) continue
    if (!fuelByAsset.has(key)) {
      fuelByAsset.set(key, {
        asset_id: key,
        asset_name: wo.asset_name || key,
        category: '',
        tank_capacity_litri: 0,
        intrari_litri: 0,
        consum_litri: 0,
        sold_estimat_litri: 0,
        ocupare_rezervor_procent: null,
        alimentari_count: 0,
        bonuri_count: 0,
        status: 'fara_miscare',
        message: 'Resursă găsită în bonuri, dar nu mai este în catalog.',
      })
    }
    const row = fuelByAsset.get(key)
    row.consum_litri = round2(row.consum_litri + num(wo.consum_carburant))
    row.bonuri_count += 1
  }
  const fuelStockByAsset = Array.from(fuelByAsset.values()).map(row => {
    const sold = round2(row.intrari_litri - row.consum_litri)
    const tankCapacity = round2(num(row.tank_capacity_litri))
    const fillPercent = tankCapacity > 0 ? round2((sold / tankCapacity) * 100) : null
    let status = 'ok'
    let message = 'Alimentările acoperă consumul raportat.'
    if (row.intrari_litri === 0 && row.consum_litri === 0) {
      status = 'fara_miscare'
      message = 'Fără alimentări sau consum în luna curentă.'
    } else if (row.consum_litri > 0 && row.intrari_litri === 0) {
      status = 'critic'
      message = 'Există consum pe bonuri, dar nu există alimentări înregistrate.'
    } else if (sold < 0) {
      status = 'critic'
      message = 'Consumul depășește alimentările înregistrate pentru resursă.'
    } else if (row.intrari_litri > 0 && row.consum_litri === 0) {
      status = 'atentie'
      message = 'Există alimentări, dar nu există consum/bonuri de lucru.'
    } else if (tankCapacity > 0 && sold > tankCapacity) {
      status = 'atentie'
      message = 'Soldul estimat depășește capacitatea rezervorului. Verifică bonurile lipsă sau alimentările duplicate.'
    } else if (sold <= warningThreshold) {
      status = 'atentie'
      message = 'Soldul estimat pe resursă este aproape de pragul de atenție.'
    }
    return { ...row, tank_capacity_litri: tankCapacity, sold_estimat_litri: sold, ocupare_rezervor_procent: fillPercent, status, message }
  }).sort((a, b) => {
    const weight = { critic: 0, atentie: 1, ok: 2, fara_miscare: 3 }
    return (weight[a.status] ?? 9) - (weight[b.status] ?? 9) || Math.abs(b.sold_estimat_litri) - Math.abs(a.sold_estimat_litri)
  })

  const highConsumption = m.workOrders
    .filter(wo => dateInMonth(wo.date, luna))
    .map(wo => {
      const consum = num(wo.consum_carburant)
      const normat = num(wo.consum_normat)
      const diferenta = round2(consum - normat)
      return {
        ...wo,
        diferenta_consum: diferenta,
        diferenta_procent: normat > 0 ? round2((diferenta / normat) * 100) : 0,
      }
    })
    .filter(wo => wo.diferenta_consum > 0)
    .sort((a, b) => b.diferenta_consum - a.diferenta_consum)
    .slice(0, 5)

  const openInterventions = m.interventions
    .filter(i => i.status === 'in_lucru')
    .sort((a, b) => String(a.data_intrare || '').localeCompare(String(b.data_intrare || '')))
    .slice(0, 6)

  sendJson(res, 200, {
    luna,
    stats: {
      totalUtilaje,
      totalVehicule,
      alocateAzi,
      inService,
      alerteDocumente: alerts.length,
      costLuna: costData.totals.cost_total,
      litriLuna: fuelTotalsThisMonth.cantitate_litri,
      consumLitriLuna: fuelStockEstimate.consum_litri,
      soldCarburantEstimat: fuelStockEstimate.sold_estimat_litri,
    },
    planningsToday,
    recentWorkOrders,
    pendingRequests,
    alerts: alerts.slice(0, 10),
    topCostHour,
    fuelTotalsThisMonth,
    fuelStockEstimate,
    fuelStockByAsset,
    highConsumption,
    openInterventions,
  })
})

router.patch('/mechanization/fuel-stock-settings', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return
    const db = auth.db
    if (!db.settings || typeof db.settings !== 'object') db.settings = {}
    const minLiters = positiveNumber(req.body?.min_liters, 25)
    const warningPercent = Math.min(100, positiveNumber(req.body?.warning_percent, 10))
    db.settings.fleet_fuel_stock_min_liters = round2(minLiters)
    db.settings.fleet_fuel_stock_warning_percent = round2(warningPercent)
    db.settings.fleet_fuel_stock_settings_updated_at = nowIso()
    db.settings.fleet_fuel_stock_settings_updated_by = auth.user.id
    addAudit(auth.db, auth.user, 'setari_carburant_mecanizare', `Prag ${round2(minLiters)} L / ${round2(warningPercent)}%`)
    writeDb(auth.db)
    sendJson(res, 200, { settings: fuelStockSettings(db) })
  } catch (error) {
    next(error)
  }
})

// ─── PLANNINGS ───────────────────────────────────────────────────────────────

router.get('/mechanization/plannings', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'mechanization:view')) return

  const m = ensureDb(auth.db)
  let list = [...m.plannings]

  const { date, asset_id, department, status } = req.query
  if (date)       list = list.filter(p => p.date === date)
  if (asset_id)   list = list.filter(p => String(p.asset_id) === String(asset_id))
  if (department) list = list.filter(p => String(p.department || '').toLowerCase().includes(department.toLowerCase()))
  if (status)     list = list.filter(p => p.status === status)

  list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (a.ora_start || '').localeCompare(b.ora_start || ''))
  sendJson(res, 200, list)
})

router.post('/mechanization/plannings', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return

    const body = req.body || {}
    const m = ensureDb(auth.db)

    const date = String(body.date || todayIso()).slice(0, 10)
    const asset_id = String(body.asset_id || '').trim()
    if (!asset_id) throwHttp(400, 'Alege un utilaj.')

    // find asset name
    const asset = (auth.db.fleetAssets || []).find(a => String(a.id) === asset_id)

    const planning = {
      id: id('plan'),
      date,
      asset_id,
      asset_name: asset ? assetName(asset) : String(body.asset_name || asset_id),
      department: String(body.department || '').trim(),
      job_name: String(body.job_name || '').trim(),
      operator: String(body.operator || '').trim(),
      ora_start: String(body.ora_start || '06:00'),
      ora_sfarsit: String(body.ora_sfarsit || '14:00'),
      status: 'planificat',
      observatii: String(body.observatii || '').trim(),
      created_by: auth.user?.name || '',
      created_at: nowIso(),
    }

    m.plannings.push(planning)
    addAudit(auth.db, auth.user, 'planificare_mecanizare', `${planning.asset_name} → ${planning.department} / ${date}`)
    writeDb(auth.db)
    sendJson(res, 201, planning)
  } catch (err) { next(err) }
})

router.patch('/mechanization/plannings/:planId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return

    const m = ensureDb(auth.db)
    const item = m.plannings.find(p => p.id === req.params.planId)
    if (!item) throwHttp(404, 'Planificare negăsită.')

    const body = req.body || {}
    const allowed = ['date','department','job_name','operator','ora_start','ora_sfarsit','status','observatii']
    allowed.forEach(k => { if (body[k] !== undefined) item[k] = body[k] })
    item.updated_at = nowIso()

    writeDb(auth.db)
    sendJson(res, 200, item)
  } catch (err) { next(err) }
})

router.delete('/mechanization/plannings/:planId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return

    const m = ensureDb(auth.db)
    const idx = m.plannings.findIndex(p => p.id === req.params.planId)
    if (idx === -1) throwHttp(404, 'Planificare negăsită.')
    m.plannings.splice(idx, 1)
    writeDb(auth.db)
    sendJson(res, 200, { ok: true })
  } catch (err) { next(err) }
})

// ─── WORK ORDERS ─────────────────────────────────────────────────────────────

router.get('/mechanization/work-orders', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'mechanization:view')) return

  const m = ensureDb(auth.db)
  let list = [...m.workOrders]

  const { luna, asset_id, status } = req.query
  if (luna)     list = list.filter(w => (w.date || '').startsWith(luna))
  if (asset_id) list = list.filter(w => String(w.asset_id) === String(asset_id))
  if (status)   list = list.filter(w => w.status === status)

  list.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  sendJson(res, 200, list)
})

router.post('/mechanization/work-orders', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return

    const body = req.body || {}
    const m = ensureDb(auth.db)

    const asset_id = String(body.asset_id || '').trim()
    if (!asset_id) throwHttp(400, 'Alege un utilaj.')
    const asset = (auth.db.fleetAssets || []).find(a => String(a.id) === asset_id)

    const wo = {
      id: id('wo'),
      date: String(body.date || todayIso()).slice(0, 10),
      asset_id,
      asset_name: asset ? assetName(asset) : String(body.asset_name || asset_id),
      operator: String(body.operator || '').trim(),
      activitate: String(body.activitate || '').trim(),
      locatie: String(body.locatie || '').trim(),
      ore_lucrate: num(body.ore_lucrate),
      km_parcursi: num(body.km_parcursi),
      consum_carburant: num(body.consum_carburant),
      consum_normat: num(body.consum_normat),
      cost_center_id: String(body.cost_center_id || '').trim(),
      observatii: String(body.observatii || '').trim(),
      status: 'deschis',
      created_by: auth.user?.name || '',
      created_at: nowIso(),
    }

    m.workOrders.push(wo)
    addAudit(auth.db, auth.user, 'bon_lucru_mecanizare', `${wo.asset_name} / ${wo.date}`)
    writeDb(auth.db)
    sendJson(res, 201, wo)
  } catch (err) { next(err) }
})

router.patch('/mechanization/work-orders/:woId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return

    const m = ensureDb(auth.db)
    const item = m.workOrders.find(w => w.id === req.params.woId)
    if (!item) throwHttp(404, 'Bon de lucru negăsit.')

    const body = req.body || {}
    const allowed = ['date','operator','activitate','locatie','ore_lucrate','km_parcursi','consum_carburant','consum_normat','cost_center_id','observatii','status']
    allowed.forEach(k => { if (body[k] !== undefined) item[k] = k.startsWith('ore_')||k.startsWith('km_')||k.startsWith('consum_') ? num(body[k]) : body[k] })
    item.updated_at = nowIso()

    writeDb(auth.db)
    sendJson(res, 200, item)
  } catch (err) { next(err) }
})

router.delete('/mechanization/work-orders/:woId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return

    const m = ensureDb(auth.db)
    const idx = m.workOrders.findIndex(w => w.id === req.params.woId)
    if (idx === -1) throwHttp(404, 'Bon de lucru negăsit.')
    m.workOrders.splice(idx, 1)
    writeDb(auth.db)
    sendJson(res, 200, { ok: true })
  } catch (err) { next(err) }
})

// ─── FUEL LOGS ───────────────────────────────────────────────────────────────

router.get('/mechanization/fuel-logs', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'mechanization:view')) return

  const m = ensureDb(auth.db)
  let list = [...m.fuelLogs]

  const { luna, asset_id } = req.query
  if (luna) list = list.filter(f => dateInMonth(f.data, luna))
  if (asset_id) list = list.filter(f => String(f.asset_id) === String(asset_id))

  list.sort((a, b) => (b.data || '').localeCompare(a.data || ''))
  const totals = list.reduce((acc, item) => {
    acc.cantitate_litri += num(item.cantitate_litri)
    acc.valoare_totala += num(item.valoare_totala)
    return acc
  }, { cantitate_litri: 0, valoare_totala: 0 })
  totals.cantitate_litri = round2(totals.cantitate_litri)
  totals.valoare_totala = round2(totals.valoare_totala)

  sendJson(res, 200, { fuelLogs: list, totals })
})

router.post('/mechanization/fuel-logs', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return

    const body = req.body || {}
    const m = ensureDb(auth.db)
    const asset_id = String(body.asset_id || '').trim()
    if (!asset_id) throwHttp(400, 'Alege utilajul sau vehiculul alimentat.')
    const asset = findAsset(auth.db, asset_id)

    const fuel = {
      id: id('fuel'),
      data: String(body.data || todayIso()).slice(0, 10),
      asset_id,
      asset_name: asset ? assetName(asset) : String(body.asset_name || asset_id),
      nr_document: String(body.nr_document || '').trim(),
      furnizor: String(body.furnizor || '').trim(),
      cantitate_litri: round2(body.cantitate_litri),
      pret_litru: round2(body.pret_litru),
      valoare_totala: fuelValue(body),
      km_ore: num(body.km_ore),
      sofer_operator: String(body.sofer_operator || '').trim(),
      cost_center_id: String(body.cost_center_id || '').trim(),
      observatii: String(body.observatii || '').trim(),
      created_by: auth.user?.name || '',
      created_at: nowIso(),
    }

    if (asset && fuel.km_ore && fuel.km_ore > assetCurrentMeter(asset)) asset.currentMeter = fuel.km_ore

    m.fuelLogs.push(fuel)
    addAudit(auth.db, auth.user, 'alimentare_mecanizare', `${fuel.asset_name} / ${fuel.cantitate_litri} L`)
    writeDb(auth.db)
    sendJson(res, 201, fuel)
  } catch (err) { next(err) }
})

router.patch('/mechanization/fuel-logs/:fuelId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return

    const m = ensureDb(auth.db)
    const item = m.fuelLogs.find(f => f.id === req.params.fuelId)
    if (!item) throwHttp(404, 'Alimentare negăsită.')

    const body = req.body || {}
    const allowed = ['data','nr_document','furnizor','cantitate_litri','pret_litru','valoare_totala','km_ore','sofer_operator','cost_center_id','observatii']
    allowed.forEach(k => {
      if (body[k] === undefined) return
      item[k] = ['cantitate_litri','pret_litru','valoare_totala','km_ore'].includes(k) ? round2(body[k]) : body[k]
    })
    if (body.valoare_totala === undefined) item.valoare_totala = fuelValue(item)
    item.updated_at = nowIso()

    const asset = findAsset(auth.db, item.asset_id)
    if (asset && item.km_ore && num(item.km_ore) > assetCurrentMeter(asset)) asset.currentMeter = num(item.km_ore)

    writeDb(auth.db)
    sendJson(res, 200, item)
  } catch (err) { next(err) }
})

router.delete('/mechanization/fuel-logs/:fuelId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return

    const m = ensureDb(auth.db)
    const idx = m.fuelLogs.findIndex(f => f.id === req.params.fuelId)
    if (idx === -1) throwHttp(404, 'Alimentare negăsită.')
    m.fuelLogs.splice(idx, 1)
    writeDb(auth.db)
    sendJson(res, 200, { ok: true })
  } catch (err) { next(err) }
})

// ─── INTERVENTIONS ────────────────────────────────────────────────────────────

router.get('/mechanization/interventions', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'mechanization:view')) return

  const m = ensureDb(auth.db)
  let list = [...m.interventions]

  const { asset_id, status, tip } = req.query
  if (asset_id) list = list.filter(i => String(i.asset_id) === String(asset_id))
  if (status)   list = list.filter(i => i.status === status)
  if (tip)      list = list.filter(i => i.tip === tip)

  list.sort((a, b) => (b.data_intrare || '').localeCompare(a.data_intrare || ''))
  sendJson(res, 200, list)
})

router.post('/mechanization/interventions', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return

    const body = req.body || {}
    const m = ensureDb(auth.db)

    const asset_id = String(body.asset_id || '').trim()
    if (!asset_id) throwHttp(400, 'Alege un utilaj.')
    const asset = findAsset(auth.db, asset_id)
    const costTotal = totalInterventionCost(body)

    const intervention = {
      id: id('int'),
      asset_id,
      asset_name: asset ? assetName(asset) : String(body.asset_name || asset_id),
      data_intrare: String(body.data_intrare || todayIso()).slice(0, 10),
      data_iesire: String(body.data_iesire || '').slice(0, 10),
      tip: String(body.tip || 'reparatie').trim(),
      descriere: String(body.descriere || '').trim(),
      cost_piese: round2(body.cost_piese),
      cost_manopera: round2(body.cost_manopera),
      cost_extern: round2(body.cost_extern),
      cost_total: costTotal,
      cost: costTotal,
      mecanic: String(body.mecanic || '').trim(),
      furnizor: String(body.furnizor || '').trim(),
      nr_factura: String(body.nr_factura || '').trim(),
      km_ore: num(body.km_ore),
      cost_center_id: String(body.cost_center_id || '').trim(),
      next_service_date: String(body.next_service_date || '').slice(0, 10),
      next_service_meter: num(body.next_service_meter),
      iscir_expira_la: String(body.iscir_expira_la || '').slice(0, 10),
      status: body.data_iesire ? 'finalizat' : 'in_lucru',
      created_by: auth.user?.name || '',
      created_at: nowIso(),
    }

    applyInterventionAssetUpdates(asset, intervention)
    m.interventions.push(intervention)
    addAudit(auth.db, auth.user, 'interventie_mecanizare', `${intervention.asset_name} / ${intervention.tip}`)
    writeDb(auth.db)
    sendJson(res, 201, intervention)
  } catch (err) { next(err) }
})

router.patch('/mechanization/interventions/:intId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return

    const m = ensureDb(auth.db)
    const item = m.interventions.find(i => i.id === req.params.intId)
    if (!item) throwHttp(404, 'Intervenție negăsită.')

    const body = req.body || {}
    const allowed = [
      'data_intrare','data_iesire','tip','descriere','cost','cost_piese','cost_manopera',
      'cost_extern','cost_total','mecanic','furnizor','nr_factura','km_ore',
      'cost_center_id','next_service_date','next_service_meter','iscir_expira_la','status'
    ]
    allowed.forEach(k => {
      if (body[k] === undefined) return
      item[k] = ['cost','cost_piese','cost_manopera','cost_extern','cost_total','km_ore','next_service_meter'].includes(k) ? num(body[k]) : body[k]
    })
    const recalculatedCost = totalInterventionCost(item)
    item.cost_total = recalculatedCost
    item.cost = recalculatedCost
    // auto-close if data_iesire set
    if (item.data_iesire && item.status === 'in_lucru') item.status = 'finalizat'
    item.updated_at = nowIso()

    applyInterventionAssetUpdates(findAsset(auth.db, item.asset_id), item)
    writeDb(auth.db)
    sendJson(res, 200, item)
  } catch (err) { next(err) }
})

router.delete('/mechanization/interventions/:intId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:manage')) return

    const m = ensureDb(auth.db)
    const idx = m.interventions.findIndex(i => i.id === req.params.intId)
    if (idx === -1) throwHttp(404, 'Intervenție negăsită.')
    m.interventions.splice(idx, 1)
    writeDb(auth.db)
    sendJson(res, 200, { ok: true })
  } catch (err) { next(err) }
})

// ─── FLEET REQUESTS (approve/reject for mechanization) ────────────────────────

router.patch('/mechanization/requests/:reqId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'mechanization:approve')) return

    const item = (auth.db.fleetRequests || []).find(r => String(r.id) === req.params.reqId)
    if (!item) throwHttp(404, 'Solicitare negăsită.')

    const { status, observatii, asset_id } = req.body || {}
    if (status) item.status = status
    if (observatii !== undefined) item.observatii_mecanism = observatii
    if (asset_id) {
      const asset = (auth.db.fleetAssets || []).find(a => String(a.id) === String(asset_id))
      if (asset) { item.asset_id = asset.id; item.assetName = assetName(asset) }
    }
    item.updated_at = nowIso()
    item.updated_by = auth.user?.name || ''

    addAudit(auth.db, auth.user, 'actualizare_solicitare_mecanizare', `${item.id} → ${status || 'modificat'}`)
    writeDb(auth.db)
    sendJson(res, 200, item)
  } catch (err) { next(err) }
})

// ─── REVIZII, ALERTE, COST/ORĂ ───────────────────────────────────────────────

router.get('/mechanization/revisions/predictive', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'mechanization:view')) return

  const m = ensureDb(auth.db)
  const rows = equipmentList(auth.db)
    .map(asset => revisionPredictionForAsset(asset, m))
    .sort((a, b) => {
      const tone = { scadent: 0, curand: 1, ok: 2 }
      return (tone[a.status] ?? 3) - (tone[b.status] ?? 3)
        || num(a.remaining_days ?? 99999) - num(b.remaining_days ?? 99999)
    })

  sendJson(res, 200, { revisions: rows })
})

router.get('/mechanization/alerts', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'mechanization:view')) return

  sendJson(res, 200, { alerts: buildFleetAlerts(auth.db) })
})

router.get('/mechanization/cost-hour', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'mechanization:view')) return

  const m = ensureDb(auth.db)
  const luna = String(req.query.luna || todayIso().slice(0, 7))
  sendJson(res, 200, { luna, ...costHourRows(auth.db, m, luna) })
})

router.get('/mechanization/faz-lunar', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'mechanization:view')) return

  const m = ensureDb(auth.db)
  const luna = String(req.query.luna || todayIso().slice(0, 7)).slice(0, 7)
  const assetId = String(req.query.asset_id || '').trim()
  const report = buildMechanizationFaz(auth.db, m, luna, assetId)
  sendJson(res, 200, report)
})

router.post('/mechanization/faz-lunar/generate', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'fleet:faz_generate')) return

    const m = ensureDb(auth.db)
    const luna = String(req.body?.luna || todayIso().slice(0, 7)).slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(luna)) throwHttp(400, 'Luna este obligatorie în format YYYY-MM.')
    const assetId = String(req.body?.asset_id || '').trim()
    const report = buildMechanizationFaz(auth.db, m, luna, assetId)
    const faz = {
      id: id('faz-mec'),
      luna,
      asset_id: assetId,
      rows_count: report.rows.length,
      totals: report.totals,
      generated_by: auth.user?.name || '',
      generated_at: nowIso(),
    }
    m.fazReports.push(faz)
    report.rows.forEach(row => {
      m.workOrders
        .filter(wo => String(wo.asset_id) === String(row.asset_id) && String(wo.date || '').slice(0, 10) === row.data)
        .forEach(wo => { wo.faz_id = faz.id; wo.faz_generated_at = faz.generated_at })
    })
    addAudit(auth.db, auth.user, 'faz_mecanizare_generat', `${luna} / ${report.rows.length} bonuri`)
    writeDb(auth.db)

    const freshReport = { ...report, generated: faz }
    sendJson(res, 200, { ...freshReport, html: buildMechanizationFazHtml(freshReport) })
  } catch (err) { next(err) }
})

// ─── RAPORT LUNAR ─────────────────────────────────────────────────────────────

router.get('/mechanization/raport-lunar', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'mechanization:view')) return

  const m = ensureDb(auth.db)
  const luna = String(req.query.luna || todayIso().slice(0, 7))

  const wosInMonth = m.workOrders.filter(w => (w.date || '').startsWith(luna))

  // group by asset
  const byAsset = new Map()
  wosInMonth.forEach(wo => {
    if (!byAsset.has(wo.asset_id)) {
      byAsset.set(wo.asset_id, {
        asset_id: wo.asset_id,
        asset_name: wo.asset_name,
        ore_total: 0,
        km_total: 0,
        consum_total: 0,
        consum_normat_total: 0,
        zile_lucrate: new Set(),
        bonuri: [],
      })
    }
    const row = byAsset.get(wo.asset_id)
    row.ore_total      += num(wo.ore_lucrate)
    row.km_total       += num(wo.km_parcursi)
    row.consum_total   += num(wo.consum_carburant)
    row.consum_normat_total += num(wo.consum_normat)
    if (wo.date) row.zile_lucrate.add(wo.date)
    row.bonuri.push(wo)
  })

  const rows = [...byAsset.values()].map(row => {
    const cost_carburant = round2(assetFuelCost(m, row.asset_id, luna))
    const cost_service = round2(assetRepairCost(m, row.asset_id, luna))
    const cost_total = round2(cost_carburant + cost_service)
    return {
      ...row,
      zile_lucrate: row.zile_lucrate.size,
      diferenta_consum: round2(row.consum_total - row.consum_normat_total),
      cost_carburant,
      cost_service,
      cost_total,
      cost_ora: row.ore_total > 0 ? round2(cost_total / row.ore_total) : 0,
    }
  })

  // totals
  const totals = rows.reduce((acc, r) => {
    acc.ore_total      += r.ore_total
    acc.km_total       += r.km_total
    acc.consum_total   += r.consum_total
    acc.consum_normat_total += r.consum_normat_total
    acc.zile_lucrate   += r.zile_lucrate
    acc.cost_carburant += r.cost_carburant
    acc.cost_service   += r.cost_service
    acc.cost_total     += r.cost_total
    return acc
  }, { ore_total: 0, km_total: 0, consum_total: 0, consum_normat_total: 0, zile_lucrate: 0, cost_carburant: 0, cost_service: 0, cost_total: 0, cost_ora: 0 })
  totals.diferenta_consum = round2(totals.consum_total - totals.consum_normat_total)
  totals.cost_ora = totals.ore_total > 0 ? round2(totals.cost_total / totals.ore_total) : 0

  // interventions in month
  const interventionsInMonth = m.interventions.filter(i => (i.data_intrare || '').startsWith(luna))
  const costService = interventionsInMonth.reduce((s, i) => s + num(i.cost_total || i.cost), 0)
  const fuelLogsInMonth = m.fuelLogs.filter(f => (f.data || '').startsWith(luna))
  const costFuel = fuelLogsInMonth.reduce((s, f) => s + num(f.valoare_totala), 0)

  sendJson(res, 200, { luna, rows, totals, costService, costFuel, interventionsInMonth, fuelLogsInMonth })
})

// ─── UTILIZATION per asset (for status badge) ─────────────────────────────────

router.get('/mechanization/asset-status', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'mechanization:view')) return

  const m = ensureDb(auth.db)
  const today = todayIso()

  const activeInterventions = new Set(m.interventions.filter(i => i.status === 'in_lucru').map(i => i.asset_id))
  const plannedToday = new Set(m.plannings.filter(p => p.date === today && p.status !== 'anulat').map(p => p.asset_id))

  const statusMap = {}
  equipmentList(auth.db).forEach(asset => {
    if (activeInterventions.has(asset.id)) statusMap[asset.id] = 'service'
    else if (plannedToday.has(asset.id))   statusMap[asset.id] = 'alocat'
    else                                   statusMap[asset.id] = 'liber'
  })

  sendJson(res, 200, statusMap)
})

// ─── utils ───────────────────────────────────────────────────────────────────

function round2(v) { return Math.round(num(v) * 100) / 100 }

function buildFleetAlerts(db) {
  const m = ensureDb(db)
  const alerts = []
  ;(db.fleetAssets || []).filter(a => a.active !== false).forEach(asset => {
    const checks = [
      { label: asset.inspectionType || 'ITP / Inspecție', type: 'document', date: asset.nextInspectionDate || asset.itpExpiresAt || asset.itp_expira_la },
      { label: 'ISCIR', type: 'iscir', date: asset.nextIscirDate || asset.iscir_expira_la || asset.data_expirare_iscir },
      { label: 'Revizie periodică', type: 'service', date: asset.nextServiceDate },
    ]
    checks.forEach(c => {
      if (!c.date) return
      const diff = daysUntilDate(c.date)
      if (diff <= 30) {
        alerts.push({
          asset_id: asset.id,
          asset_name: assetName(asset),
          label: c.label,
          type: c.type,
          date: c.date,
          days: diff,
          severity: diff < 0 ? 'expirat' : diff <= 7 ? 'critic' : 'warning',
        })
      }
    })
    const revision = revisionPredictionForAsset(asset, m)
    if (revision.remaining_meter !== null && revision.remaining_meter <= 100) {
      alerts.push({
        asset_id: asset.id,
        asset_name: assetName(asset),
        label: 'Revizie la contor',
        type: 'service-meter',
        meter: revision.next_service_meter,
        current_meter: revision.current_meter,
        remaining_meter: revision.remaining_meter,
        meter_unit: revision.meter_unit,
        days: revision.remaining_days ?? 9999,
        severity: revision.remaining_meter <= 0 ? 'expirat' : 'warning',
      })
    }
  })
  return alerts.sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999))
}

module.exports = router
