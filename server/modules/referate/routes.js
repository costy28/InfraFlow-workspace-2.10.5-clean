const { Router } = require('express')
const crypto = require('crypto')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')

const router = Router()
const FLOW = [
  'draft', 'inregistrat', 'la_achizitii', 'la_gestionar', 'cfp',
  'contabil_sef', 'dir_adjunct', 'secretariat_2', 'dir_general',
  'secretariat_final', 'achizitii_final', 'aprobat',
]
const STEP_PERMISSIONS = {
  draft: 'referate:create',
  inregistrat: 'referate:secretariat',
  la_achizitii: 'referate:achizitii',
  la_gestionar: 'referate:gestionar',
  cfp: 'referate:cfp',
  contabil_sef: 'referate:contabil_sef',
  dir_adjunct: 'referate:dir_adjunct',
  secretariat_2: 'referate:secretariat',
  dir_general: 'referate:dir_general',
  secretariat_final: 'referate:secretariat',
  achizitii_final: 'referate:achizitii',
}

function ensureReferate(db) {
  db.referate = Array.isArray(db.referate) ? db.referate : []
  db.referateFlux = Array.isArray(db.referateFlux) ? db.referateFlux : []
  db.referateCounters = Array.isArray(db.referateCounters) ? db.referateCounters : []
  db.procurementOrders = Array.isArray(db.procurementOrders) ? db.procurementOrders : []
  db.notifications = Array.isArray(db.notifications) ? db.notifications : []
}

function materialLabel(material) {
  return material?.name || material?.denumire || material?.materialName || 'Material'
}

function materialUnit(material) {
  return material?.unit || material?.um || ''
}

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits))
}

function stockForMaterial(db, material) {
  if (!material) return 0
  const movements = (db.stockMovements || []).filter(item => String(item.materialId || item.material_id) === String(material.id))
  if (movements.length) return round(movements.reduce((sum, item) => sum + Number(item.amount ?? item.quantity ?? item.cantitate ?? 0), 0), 3)
  return round(material.stock ?? material.stoc_curent ?? material.currentStock ?? 0, 3)
}

function nextNumber(db, year) {
  let counter = db.referateCounters.find(item => Number(item.an) === Number(year))
  if (!counter) {
    counter = { an: Number(year), last_nr: 0 }
    db.referateCounters.push(counter)
  }
  counter.last_nr = Number(counter.last_nr || 0) + 1
  return counter.last_nr
}

function normalizeItems(db, lines) {
  if (!Array.isArray(lines) || !lines.length) throwHttp(400, 'Adaugati cel putin un produs.')
  return lines.map((input, index) => {
    const material = (db.materials || []).find(item => String(item.id) === String(input.material_id || input.materialId))
    const denumire = String(input.denumire || input.name || materialLabel(material)).trim()
    const cantitate = round(input.cantitate || input.amount, 3)
    const pretUnitar = round(input.pret_unitar || input.unitPrice)
    if (!denumire) throwHttp(400, `Denumirea este obligatorie pe linia ${index + 1}.`)
    if (cantitate <= 0) throwHttp(400, `Cantitatea trebuie sa fie pozitiva pe linia ${index + 1}.`)
    return {
      id: id('ref-item'),
      nr_crt: index + 1,
      denumire,
      caracteristici: String(input.caracteristici || '').trim(),
      um: String(input.um || materialUnit(material)).trim(),
      cantitate,
      pret_unitar: pretUnitar,
      valoare_tva: round(input.valoare_tva),
      stoc_magazie: stockForMaterial(db, material),
      material_id: material?.id || null,
      cpv_cod: String(input.cpv_cod || material?.cod_cpv || '').trim(),
    }
  })
}

function totalFor(items) {
  return round(items.reduce((sum, item) => sum + Number(item.cantitate) * Number(item.pret_unitar) + Number(item.valoare_tva || 0), 0))
}

function differencePercent(referat) {
  const initial = Number(referat.valoare_referat || 0)
  return initial > 0 ? round((Number(referat.valoare_factura || 0) - initial) / initial * 100) : 0
}

function fluxFor(db, referatId) {
  return db.referateFlux.filter(item => item.referat_id === referatId).sort((a, b) => String(a.data_actiune).localeCompare(String(b.data_actiune)))
}

function referatView(db, referat) {
  const department = (db.departments || []).find(item => String(item.id) === String(referat.departament_id))
  return {
    ...referat,
    departament: department?.name || department?.denumire || '',
    diferenta_prc: differencePercent(referat),
    flux: fluxFor(db, referat.id),
  }
}

function addFlux(db, referat, user, pas, actiune, observatii = '') {
  const item = {
    id: id('ref-flux'),
    referat_id: referat.id,
    pas,
    actiune,
    user_id: user.id,
    user_name: user.name,
    data_actiune: new Date().toISOString(),
    observatii: String(observatii || '').trim(),
  }
  db.referateFlux.push(item)
  return item
}

function createOrder(db, user, referat) {
  if (referat.comanda_id) return db.procurementOrders.find(item => item.id === referat.comanda_id)
  const lines = referat.items.map(item => ({
    id: id('po-line'),
    material_id: item.material_id,
    materialId: item.material_id,
    materialName: item.denumire,
    unit: item.um,
    cantitate: item.cantitate,
    amount: item.cantitate,
    pret: item.pret_unitar,
    unitPrice: item.pret_unitar,
    cantitate_receptionata: 0,
    cantitate_ramasa: item.cantitate,
    cpv_cod: item.cpv_cod,
  }))
  const order = {
    id: id('po'),
    uuid: crypto.randomUUID(),
    date: localDate(new Date()),
    orderNo: `REF-${referat.serie}-${String(referat.numar).padStart(4, '0')}`,
    supplier: referat.furnizor_manual || '',
    furnizor: referat.furnizor_manual || '',
    lines,
    materialId: lines[0]?.material_id || null,
    materialName: lines.map(item => item.materialName).join(', '),
    amount: lines.reduce((sum, item) => sum + Number(item.cantitate || 0), 0),
    value: referat.valoare_referat,
    receivedAmount: 0,
    remainingAmount: lines.reduce((sum, item) => sum + Number(item.cantitate || 0), 0),
    unit: lines[0]?.unit || '',
    status: 'emisa',
    note: `Generata automat din referatul ${referat.serie}/${referat.numar}`,
    sourceReferatId: referat.id,
    createdBy: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString(),
  }
  db.procurementOrders.push(order)
  referat.comanda_id = order.id
  referat.comanda_uuid = order.uuid
  return order
}

router.get('/referate/stats', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requirePermission(auth, res, 'referate:view')) return
  ensureReferate(auth.db)
  const active = auth.db.referate.filter(item => !item.cancelled_at)
  sendJson(res, 200, {
    total: active.length,
    draft: active.filter(item => item.status === 'draft').length,
    in_aprobare: active.filter(item => !['draft', 'aprobat', 'respins'].includes(item.status)).length,
    aprobate: active.filter(item => item.status === 'aprobat').length,
    respinse: active.filter(item => item.status === 'respins').length,
  })
})

router.get('/referate', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requirePermission(auth, res, 'referate:view')) return
  ensureReferate(auth.db)
  let rows = auth.db.referate.filter(item => !item.cancelled_at)
  const status = String(req.query.status || '')
  if (status === 'in_aprobare') rows = rows.filter(item => !['draft', 'aprobat', 'respins'].includes(item.status))
  else if (status) rows = rows.filter(item => item.status === status)
  sendJson(res, 200, { referate: rows.map(item => referatView(auth.db, item)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) })
})

router.post('/referate', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'referate:create')) return
    ensureReferate(auth.db)
    const body = req.body || {}
    const data = validDate(body.data_intocmire) ? body.data_intocmire : localDate(new Date())
    const items = normalizeItems(auth.db, body.items)
    const referat = {
      id: id('ref'),
      uuid: crypto.randomUUID(),
      numar: nextNumber(auth.db, data.slice(0, 4)),
      serie: String(body.serie || 'RA').trim().slice(0, 10),
      data_intocmire: data,
      tip: ['aprovizionare', 'servicii'].includes(body.tip) ? body.tip : 'aprovizionare',
      departament_id: body.departament_id || auth.user.departmentId || null,
      intocmit_de: auth.user.id,
      intocmit_de_nume: auth.user.name,
      furnizor_id: body.furnizor_id || null,
      furnizor_manual: String(body.furnizor_manual || '').trim(),
      observatii: String(body.observatii || '').trim(),
      status: 'draft',
      valoare_referat: totalFor(items),
      valoare_factura: 0,
      nr_inregistrare: '',
      data_inregistrare: null,
      items,
      created_at: new Date().toISOString(),
    }
    auth.db.referate.push(referat)
    addFlux(auth.db, referat, auth.user, 'draft', 'creat', referat.observatii)
    addAudit(auth.db, auth.user, 'referat_creat', `${referat.serie}/${referat.numar} / ${referat.tip}`)
    writeDb(auth.db)
    sendJson(res, 201, { referat: referatView(auth.db, referat) })
  } catch (error) {
    next(error)
  }
})

router.get('/referate/:id/pdf', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requirePermission(auth, res, 'referate:view')) return
  ensureReferate(auth.db)
  const referat = findReferat(auth.db, req.params.id)
  if (!referat) return sendJson(res, 404, { error: 'Referatul nu exista.' })
  res.status(200).type('html').send(buildPdfHtml(auth.db, referat))
})

router.get('/referate/:id', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requirePermission(auth, res, 'referate:view')) return
  ensureReferate(auth.db)
  const referat = findReferat(auth.db, req.params.id)
  if (!referat) return sendJson(res, 404, { error: 'Referatul nu exista.' })
  sendJson(res, 200, { referat: referatView(auth.db, referat) })
})

router.post('/referate/:id/inainteaza', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    ensureReferate(auth.db)
    const referat = findReferat(auth.db, req.params.id)
    if (!referat) return sendJson(res, 404, { error: 'Referatul nu exista.' })
    if (['aprobat', 'respins'].includes(referat.status)) return sendJson(res, 409, { error: 'Referatul are deja fluxul inchis.' })
    if (!requirePermission(auth, res, STEP_PERMISSIONS[referat.status] || 'referate:view')) return
    const body = req.body || {}
    const action = body.actiune === 'respinge' ? 'respins' : 'inainteaza'
    if (action === 'respins') {
      referat.status = 'respins'
    } else {
      const index = FLOW.indexOf(referat.status)
      if (index < 0 || index >= FLOW.length - 1) throwHttp(409, 'Pasul curent al fluxului este invalid.')
      if (referat.status === 'draft') {
        referat.nr_inregistrare = String(body.nr_inregistrare || `${referat.serie}-${referat.numar}`).trim()
        referat.data_inregistrare = new Date().toISOString()
      }
      if (referat.status === 'dir_general') createOrder(auth.db, auth.user, referat)
      referat.status = FLOW[index + 1]
    }
    referat.updated_at = new Date().toISOString()
    addFlux(auth.db, referat, auth.user, referat.status, action, body.observatii)
    addAudit(auth.db, auth.user, `referat_${action}`, `${referat.serie}/${referat.numar} -> ${referat.status}`)
    writeDb(auth.db)
    sendJson(res, 200, { referat: referatView(auth.db, referat) })
  } catch (error) {
    next(error)
  }
})

router.post('/referate/:id/receptie', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'referate:receptie')) return
    ensureReferate(auth.db)
    const referat = findReferat(auth.db, req.params.id)
    if (!referat) return sendJson(res, 404, { error: 'Referatul nu exista.' })
    const value = round(req.body?.valoare_factura)
    if (value < 0) throwHttp(400, 'Valoarea facturii nu poate fi negativa.')
    referat.valoare_factura = value
    referat.receptie_observatii = String(req.body?.observatii || '').trim()
    referat.receptionat_la = new Date().toISOString()
    referat.receptionat_de = auth.user.id
    const difference = differencePercent(referat)
    referat.necesita_reaprobare = difference > 5
    addFlux(auth.db, referat, auth.user, difference > 5 ? 'diferenta_factura' : 'receptie', difference > 5 ? 'reaprobare_necesara' : 'receptionat', referat.receptie_observatii)
    if (difference > 5) {
      auth.db.notifications.push({
        id: id('notif'),
        type: 'referat_diferenta_factura',
        severity: 'urgent',
        title: `Diferenta factura ${difference}%`,
        message: `Referatul ${referat.serie}/${referat.numar} necesita reaprobare.`,
        referat_id: referat.id,
        createdAt: new Date().toISOString(),
      })
    }
    addAudit(auth.db, auth.user, 'referat_receptie', `${referat.serie}/${referat.numar} / factura ${value} RON / diferenta ${difference}%`)
    writeDb(auth.db)
    sendJson(res, 200, { referat: referatView(auth.db, referat), necesita_reaprobare: difference > 5 })
  } catch (error) {
    next(error)
  }
})

function findReferat(db, value) {
  return db.referate.find(item => String(item.id) === String(value) || String(item.uuid) === String(value))
}

function buildPdfHtml(db, referat) {
  const view = referatView(db, referat)
  const rows = referat.items.map(item => `<tr><td>${item.nr_crt}</td><td>${html(item.denumire)}</td><td>${html(item.caracteristici)}</td><td>${html(item.um)}</td><td class="num">${item.cantitate}</td><td class="num">${item.stoc_magazie}</td><td class="num">${round(item.cantitate * item.pret_unitar + item.valoare_tva)}</td></tr>`).join('')
  const signatures = ['Intocmit', 'Achizitii', 'Gestionar', 'Economist', 'Contabil Sef', 'Dir. Adj.', 'Dir. General'].map(label => `<td><strong>${label}</strong><br><br><br>Semnatura</td>`).join('')
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Referat ${html(view.serie)}/${view.numar}</title><style>body{font:12px Arial;color:#111;margin:22px}h1{text-align:center;font-size:18px}.meta{display:flex;justify-content:space-between;margin:18px 0}table{width:100%;border-collapse:collapse}th,td{border:1px solid #222;padding:6px;vertical-align:top}.num{text-align:right}.sign td{height:90px;text-align:center;font-size:10px}.actions{margin-bottom:14px}@media print{.actions{display:none}}</style></head><body><div class="actions"><button onclick="window.print()">Tipareste / Salveaza PDF</button></div><h1>REFERAT DE NECESITATE</h1><div class="meta"><div>Nr. ${html(view.serie)}/${view.numar}<br>Data: ${html(view.data_intocmire)}</div><div>Tip: ${html(view.tip)}<br>Departament: ${html(view.departament || '-')}</div></div><p>${html(view.observatii || '')}</p><table><thead><tr><th>Nr.</th><th>Denumire</th><th>Caracteristici</th><th>UM</th><th>Cantitate</th><th>Stoc magazie</th><th>Valoare RON</th></tr></thead><tbody>${rows}<tr><td colspan="6"><strong>Total</strong></td><td class="num"><strong>${view.valoare_referat}</strong></td></tr></tbody></table><table class="sign" style="margin-top:28px"><tr>${signatures}</tr></table></body></html>`
}

function localDate(date) {
  return date.toISOString().slice(0, 10)
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

function html(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
}

function sendJson(res, status, data) {
  res.status(status).json(data)
}

function throwHttp(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

module.exports = router
