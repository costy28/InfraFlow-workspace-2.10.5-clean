const { Router } = require('express')
const crypto = require('crypto')
const { requireAuth } = require('../../core/auth')
const { requirePermission, requireAnyPermission, authHasPermission } = require('../../core/permissions')
const { readDb, writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')

const router = Router()

// ─── helpers ─────────────────────────────────────────────────────────────────

function id(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
}

function nowIso() { return new Date().toISOString() }

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function currentMonth() { return todayIso().slice(0, 7) }

function num(v) { return Math.round(Number(v || 0) * 1000) / 1000 }
function round2(v) { return Math.round(num(v) * 100) / 100 }

function sendJson(res, status, body) { res.status(status).json(body) }

function throwHttp(code, msg) {
  const err = new Error(msg); err.status = code; throw err
}

function matName(m) { return m?.name || m?.denumire || m?.materialName || m?.id || 'Material' }
function matUnit(m) { return m?.unit || m?.um || '' }
function matStock(m) { return num(m?.stock ?? m?.stoc_curent ?? m?.currentStock ?? 0) }
function setMatStock(m, v) { m.stock = num(v); m.stoc_curent = num(v); m.currentStock = num(v) }

function findContract(db, contractId) {
  if (!contractId) return null
  const contracts = db.contractManagement?.contracts || []
  return contracts.find(item => String(item.id) === String(contractId) && !item.cancelled_at && !item.cancelledAt) || null
}

function applyContractLink(db, document, body = {}) {
  const contractId = body.contract_id ?? body.contractId ?? ''
  if (contractId === undefined) return
  if (!contractId) {
    document.contract_id = null
    document.contractId = null
    document.contract_numar = ''
    document.contract_title = ''
    return
  }
  const contract = findContract(db, contractId)
  if (!contract) throwHttp(404, 'Contractul selectat nu există.')
  document.contract_id = contract.id
  document.contractId = contract.id
  document.contract_numar = contract.numar || ''
  document.contract_title = contract.titlu || ''
}

// ─── DB init ─────────────────────────────────────────────────────────────────

function ensureDb(db) {
  if (!db.gestiune || typeof db.gestiune !== 'object') db.gestiune = {}
  const g = db.gestiune
  if (!Array.isArray(g.furnizori))     g.furnizori     = []
  if (!Array.isArray(g.nir))           g.nir           = []
  if (!Array.isArray(g.bonuri_consum)) g.bonuri_consum = []
  if (!Array.isArray(g.inventare))     g.inventare     = []
  if (!g.counters || typeof g.counters !== 'object') g.counters = { nir: 0, bc: 0, inv: 0 }
  return g
}

function nextNr(g, key, prefix) {
  g.counters[key] = (g.counters[key] || 0) + 1
  return `${prefix}-${new Date().getFullYear()}-${String(g.counters[key]).padStart(4, '0')}`
}

function addStockMovement(db, payload) {
  db.stockMovements = Array.isArray(db.stockMovements) ? db.stockMovements : []
  db.stockMovements.push({
    id: id('mov'),
    date: payload.date || todayIso(),
    materialId: payload.materialId,
    materialName: payload.materialName,
    amount: num(payload.amount),
    unit: payload.unit || '',
    type: payload.type || 'manual',
    reason: payload.reason || '',
    docNr: payload.docNr || '',
    createdBy: payload.createdBy || 'system',
    createdAt: nowIso(),
  })
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

router.get('/gestiune/dashboard', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requireAnyPermission(auth, res, ['materials:view', 'stock_operations:view'])) return

  const db = auth.db
  const g = ensureDb(db)
  const luna = currentMonth()

  // valoare stoc central (qty × pret_achizitie)
  let valoareTotal = 0
  const alerteStoc = []
  ;(db.materials || []).forEach(m => {
    const stoc = matStock(m)
    const pret = num(m.pret_achizitie || m.price || m.pret || 0)
    valoareTotal += stoc * pret
    const min = num(m.alert || m.stoc_minim || m.stockMin || 0)
    if (min > 0 && stoc <= min) alerteStoc.push({ id: m.id, name: matName(m), stoc, min, unit: matUnit(m) })
  })

  // NIR luna curentă
  const nirLuna = g.nir.filter(n => (n.data || '').startsWith(luna) && n.status === 'confirmat')
  const valoareIntrari = nirLuna.reduce((s, n) => s + num(n.valoare_totala), 0)

  // BC luna curentă
  const bcLuna = g.bonuri_consum.filter(b => (b.data || '').startsWith(luna) && b.status === 'aprobat')
  const valoareIesiri = bcLuna.reduce((s, b) =>
    s + (b.linii || []).reduce((ls, l) => ls + num(l.cantitate) * num(l.pret_unitar || 0), 0), 0)

  // pending BC
  const bcPending = g.bonuri_consum.filter(b => b.status === 'draft').length

  // recent NIR
  const recentNir = [...g.nir].sort((a, b) => (b.data || '').localeCompare(a.data || '')).slice(0, 5)

  sendJson(res, 200, {
    stats: {
      totalMateriale: (db.materials || []).length,
      valoareTotal: round2(valoareTotal),
      valoareIntrari: round2(valoareIntrari),
      valoareIesiri: round2(valoareIesiri),
      alerteStoc: alerteStoc.length,
      bcPending,
    },
    alerteStoc: alerteStoc.slice(0, 10),
    recentNir,
  })
})

// ─── MATERIALS (PATCH + DELETE — completare) ─────────────────────────────────

router.patch('/materials/:matId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'materials:edit')) return

    const m = (auth.db.materials || []).find(x => String(x.id) === req.params.matId)
    if (!m) throwHttp(404, 'Material inexistent.')

    const body = req.body || {}
    const allowed = ['name', 'denumire', 'unit', 'um', 'alert', 'stoc_minim',
      'pret_achizitie', 'categorie', 'cod_intern', 'furnizor_preferat',
      'locatie_depozit', 'descriere', 'recipeMaterial']
    allowed.forEach(k => { if (body[k] !== undefined) m[k] = body[k] })
    // sync stoc_minim aliases
    if (body.alert !== undefined)      m.stoc_minim = num(body.alert)
    if (body.stoc_minim !== undefined) m.alert      = num(body.stoc_minim)
    if (body.pret_achizitie !== undefined) m.pret_achizitie = num(body.pret_achizitie)
    m.updated_at = nowIso()

    addAudit(auth.db, auth.user, 'material_modificat', matName(m))
    writeDb(auth.db)
    sendJson(res, 200, { material: m })
  } catch (err) { next(err) }
})

router.delete('/materials/:matId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'materials:edit')) return

    const idx = (auth.db.materials || []).findIndex(x => String(x.id) === req.params.matId)
    if (idx === -1) throwHttp(404, 'Material inexistent.')
    const name = matName(auth.db.materials[idx])
    auth.db.materials.splice(idx, 1)
    addAudit(auth.db, auth.user, 'material_sters', name)
    writeDb(auth.db)
    sendJson(res, 200, { ok: true })
  } catch (err) { next(err) }
})

// ─── FURNIZORI ───────────────────────────────────────────────────────────────

router.get('/gestiune/furnizori', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requireAnyPermission(auth, res, ['materials:view', 'procurement_orders:view', 'stock_operations:view'])) return
  const g = ensureDb(auth.db)
  const search = String(req.query.search || '').toLowerCase()
  let list = g.furnizori
  if (search) list = list.filter(f => [f.nume, f.cui, f.email].join(' ').toLowerCase().includes(search))
  sendJson(res, 200, list.sort((a, b) => (a.nume || '').localeCompare(b.nume || '')))
})

router.post('/gestiune/furnizori', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireAnyPermission(auth, res, ['materials:edit', 'procurement_orders:create'])) return

    const body = req.body || {}
    const g = ensureDb(auth.db)
    if (!String(body.nume || '').trim()) throwHttp(400, 'Numele furnizorului este obligatoriu.')

    const furnizor = {
      id: id('fur'),
      nume: String(body.nume || '').trim(),
      cui: String(body.cui || '').trim(),
      nr_reg_com: String(body.nr_reg_com || '').trim(),
      adresa: String(body.adresa || '').trim(),
      telefon: String(body.telefon || '').trim(),
      email: String(body.email || '').trim(),
      iban: String(body.iban || '').trim(),
      banca: String(body.banca || '').trim(),
      pers_contact: String(body.pers_contact || '').trim(),
      observatii: String(body.observatii || '').trim(),
      activ: true,
      created_by: auth.user?.name || '',
      created_at: nowIso(),
    }
    g.furnizori.push(furnizor)
    addAudit(auth.db, auth.user, 'furnizor_adaugat', furnizor.nume)
    writeDb(auth.db)
    sendJson(res, 201, furnizor)
  } catch (err) { next(err) }
})

router.patch('/gestiune/furnizori/:furId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireAnyPermission(auth, res, ['materials:edit', 'procurement_orders:create'])) return

    const g = ensureDb(auth.db)
    const item = g.furnizori.find(f => f.id === req.params.furId)
    if (!item) throwHttp(404, 'Furnizor inexistent.')

    const body = req.body || {}
    const allowed = ['nume','cui','nr_reg_com','adresa','telefon','email','iban','banca','pers_contact','observatii','activ']
    allowed.forEach(k => { if (body[k] !== undefined) item[k] = body[k] })
    item.updated_at = nowIso()
    writeDb(auth.db)
    sendJson(res, 200, item)
  } catch (err) { next(err) }
})

router.delete('/gestiune/furnizori/:furId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'materials:edit')) return

    const g = ensureDb(auth.db)
    const idx = g.furnizori.findIndex(f => f.id === req.params.furId)
    if (idx === -1) throwHttp(404, 'Furnizor inexistent.')
    g.furnizori.splice(idx, 1)
    writeDb(auth.db)
    sendJson(res, 200, { ok: true })
  } catch (err) { next(err) }
})

// ─── NIR (Notă Intrare Recepție) ─────────────────────────────────────────────

router.get('/gestiune/nir', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requireAnyPermission(auth, res, ['materials:view', 'stock_operations:view', 'procurement_orders:view'])) return

  const g = ensureDb(auth.db)
  let list = [...g.nir]

  const { luna, status, furnizor_id } = req.query
  if (luna)        list = list.filter(n => (n.data || '').startsWith(luna))
  if (status)      list = list.filter(n => n.status === status)
  if (furnizor_id) list = list.filter(n => n.furnizor_id === furnizor_id)

  list.sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.numar || '').localeCompare(a.numar || ''))
  sendJson(res, 200, list)
})

router.post('/gestiune/nir', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireAnyPermission(auth, res, ['stock_operations:create', 'procurement_orders:receive'])) return

    const body = req.body || {}
    const g = ensureDb(auth.db)

    const linii = Array.isArray(body.linii) ? body.linii : []
    if (!linii.length) throwHttp(400, 'NIR-ul trebuie să conțină cel puțin o linie.')

    // validate lines
    const liniiNormalized = linii.map((l, idx) => {
      const mat = (auth.db.materials || []).find(m => String(m.id) === String(l.material_id))
      if (!mat) throwHttp(404, `Material inexistent pe linia ${idx + 1}.`)
      const cantitate = num(l.cantitate)
      if (cantitate <= 0) throwHttp(400, `Cantitate invalidă pe linia ${idx + 1}.`)
      const pret_unitar = num(l.pret_unitar || 0)
      return {
        material_id: mat.id,
        materialName: matName(mat),
        unit: matUnit(mat),
        cantitate,
        pret_unitar,
        valoare: round2(cantitate * pret_unitar),
      }
    })

    const valoare_totala = round2(liniiNormalized.reduce((s, l) => s + l.valoare, 0))
    const furnizor = g.furnizori.find(f => f.id === body.furnizor_id)

    const nir = {
      id: id('nir'),
      numar: nextNr(g, 'nir', 'NIR'),
      data: String(body.data || todayIso()).slice(0, 10),
      furnizor_id: body.furnizor_id || '',
      furnizor_name: furnizor?.nume || String(body.furnizor_name || '').trim(),
      nr_factura: String(body.nr_factura || '').trim(),
      data_factura: String(body.data_factura || '').slice(0, 10),
      nr_aviz: String(body.nr_aviz || '').trim(),
      linii: liniiNormalized,
      valoare_totala,
      observatii: String(body.observatii || '').trim(),
      status: 'draft',
      created_by: auth.user?.name || '',
      created_at: nowIso(),
    }
    applyContractLink(auth.db, nir, body)

    g.nir.push(nir)
    addAudit(auth.db, auth.user, 'nir_creat', `${nir.numar} / ${nir.furnizor_name} / ${nir.valoare_totala} RON`)
    writeDb(auth.db)
    sendJson(res, 201, nir)
  } catch (err) { next(err) }
})

router.patch('/gestiune/nir/:nirId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireAnyPermission(auth, res, ['stock_operations:create', 'procurement_orders:receive'])) return

    const g = ensureDb(auth.db)
    const nir = g.nir.find(n => n.id === req.params.nirId)
    if (!nir) throwHttp(404, 'NIR inexistent.')

    const body = req.body || {}

    // confirm NIR → update stock
    if (body.status === 'confirmat' && nir.status === 'draft') {
      nir.status = 'confirmat'
      nir.confirmat_de = auth.user?.name || ''
      nir.confirmat_la = nowIso()

      ;(nir.linii || []).forEach(l => {
        const mat = (auth.db.materials || []).find(m => String(m.id) === String(l.material_id))
        if (!mat) return
        setMatStock(mat, matStock(mat) + l.cantitate)
        if (l.pret_unitar > 0) mat.pret_achizitie = l.pret_unitar
        mat.updated_at = nowIso()
        addStockMovement(auth.db, {
          materialId: mat.id, materialName: matName(mat),
          amount: l.cantitate, unit: l.unit,
          type: 'nir', reason: `NIR ${nir.numar} / ${nir.furnizor_name}`,
          docNr: nir.numar, createdBy: auth.user?.id || '',
        })
      })

      addAudit(auth.db, auth.user, 'nir_confirmat', `${nir.numar} / ${nir.valoare_totala} RON`)
      writeDb(auth.db)
      sendJson(res, 200, nir)
      return
    }

    // cancel NIR — reverse stock if was confirmed
    if (body.status === 'anulat' && nir.status === 'confirmat') {
      ;(nir.linii || []).forEach(l => {
        const mat = (auth.db.materials || []).find(m => String(m.id) === String(l.material_id))
        if (!mat) return
        setMatStock(mat, Math.max(0, matStock(mat) - l.cantitate))
        mat.updated_at = nowIso()
        addStockMovement(auth.db, {
          materialId: mat.id, materialName: matName(mat),
          amount: -l.cantitate, unit: l.unit,
          type: 'nir_anulat', reason: `Anulare NIR ${nir.numar}`,
          docNr: nir.numar, createdBy: auth.user?.id || '',
        })
      })
    }

    const allowed = ['data','furnizor_id','furnizor_name','nr_factura','data_factura','nr_aviz','observatii','status']
    allowed.forEach(k => { if (body[k] !== undefined) nir[k] = body[k] })
    if (body.contract_id !== undefined || body.contractId !== undefined) applyContractLink(auth.db, nir, body)
    nir.updated_at = nowIso()

    addAudit(auth.db, auth.user, 'nir_modificat', nir.numar)
    writeDb(auth.db)
    sendJson(res, 200, nir)
  } catch (err) { next(err) }
})

// ─── BONURI CONSUM ────────────────────────────────────────────────────────────

router.get('/gestiune/bonuri-consum', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requireAnyPermission(auth, res, ['stock_operations:view', 'materials:view'])) return

  const g = ensureDb(auth.db)
  let list = [...g.bonuri_consum]

  const { luna, status, department } = req.query
  if (luna)       list = list.filter(b => (b.data || '').startsWith(luna))
  if (status)     list = list.filter(b => b.status === status)
  if (department) list = list.filter(b => String(b.department || '').toLowerCase().includes(department.toLowerCase()))

  list.sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.numar || '').localeCompare(a.numar || ''))
  sendJson(res, 200, list)
})

router.post('/gestiune/bonuri-consum', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireAnyPermission(auth, res, ['stock_operations:create', 'consumptions:create'])) return

    const body = req.body || {}
    const g = ensureDb(auth.db)

    const linii = Array.isArray(body.linii) ? body.linii : []
    if (!linii.length) throwHttp(400, 'Bonul de consum trebuie să conțină cel puțin o linie.')

    const liniiNormalized = linii.map((l, idx) => {
      const mat = (auth.db.materials || []).find(m => String(m.id) === String(l.material_id))
      if (!mat) throwHttp(404, `Material inexistent pe linia ${idx + 1}.`)
      const cantitate = num(l.cantitate)
      if (cantitate <= 0) throwHttp(400, `Cantitate invalidă pe linia ${idx + 1}.`)
      return {
        material_id: mat.id,
        materialName: matName(mat),
        unit: matUnit(mat),
        cantitate,
        pret_unitar: num(mat.pret_achizitie || mat.price || 0),
      }
    })

    const bc = {
      id: id('bc'),
      numar: nextNr(g, 'bc', 'BC'),
      data: String(body.data || todayIso()).slice(0, 10),
      department: String(body.department || '').trim(),
      lucrare: String(body.lucrare || '').trim(),
      linii: liniiNormalized,
      observatii: String(body.observatii || '').trim(),
      status: 'draft',
      created_by: auth.user?.name || '',
      created_at: nowIso(),
    }

    g.bonuri_consum.push(bc)
    addAudit(auth.db, auth.user, 'bc_creat', `${bc.numar} / ${bc.department}`)
    writeDb(auth.db)
    sendJson(res, 201, bc)
  } catch (err) { next(err) }
})

router.patch('/gestiune/bonuri-consum/:bcId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireAnyPermission(auth, res, ['stock_operations:create', 'consumptions:create'])) return

    const g = ensureDb(auth.db)
    const bc = g.bonuri_consum.find(b => b.id === req.params.bcId)
    if (!bc) throwHttp(404, 'Bon de consum inexistent.')

    const body = req.body || {}

    // approve → decrement stock
    if (body.status === 'aprobat' && bc.status === 'draft') {
      // check availability
      const errors = []
      ;(bc.linii || []).forEach(l => {
        const mat = (auth.db.materials || []).find(m => String(m.id) === String(l.material_id))
        if (!mat) { errors.push(`Material ${l.materialName} negăsit.`); return }
        if (matStock(mat) < l.cantitate) errors.push(`Stoc insuficient pentru ${matName(mat)}: disponibil ${matStock(mat)}, necesar ${l.cantitate} ${l.unit}.`)
      })
      if (errors.length) throwHttp(409, errors.join(' | '))

      ;(bc.linii || []).forEach(l => {
        const mat = (auth.db.materials || []).find(m => String(m.id) === String(l.material_id))
        if (!mat) return
        setMatStock(mat, matStock(mat) - l.cantitate)
        mat.updated_at = nowIso()
        addStockMovement(auth.db, {
          materialId: mat.id, materialName: matName(mat),
          amount: -l.cantitate, unit: l.unit,
          type: 'bon_consum', reason: `BC ${bc.numar} / ${bc.department}${bc.lucrare ? ' / ' + bc.lucrare : ''}`,
          docNr: bc.numar, createdBy: auth.user?.id || '',
        })
      })

      bc.status = 'aprobat'
      bc.aprobat_de = auth.user?.name || ''
      bc.aprobat_la = nowIso()
      addAudit(auth.db, auth.user, 'bc_aprobat', bc.numar)
      writeDb(auth.db)
      sendJson(res, 200, bc)
      return
    }

    // reject
    if (body.status === 'respins') {
      bc.status = 'respins'
      bc.respins_de = auth.user?.name || ''
      bc.respins_la = nowIso()
      bc.motiv_respingere = String(body.motiv_respingere || '').trim()
      writeDb(auth.db)
      sendJson(res, 200, bc)
      return
    }

    const allowed = ['data','department','lucrare','observatii']
    allowed.forEach(k => { if (body[k] !== undefined) bc[k] = body[k] })
    bc.updated_at = nowIso()
    writeDb(auth.db)
    sendJson(res, 200, bc)
  } catch (err) { next(err) }
})

router.delete('/gestiune/bonuri-consum/:bcId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireAnyPermission(auth, res, ['stock_operations:cancel', 'consumptions:cancel'])) return

    const g = ensureDb(auth.db)
    const idx = g.bonuri_consum.findIndex(b => b.id === req.params.bcId)
    if (idx === -1) throwHttp(404, 'Bon de consum inexistent.')
    if (g.bonuri_consum[idx].status === 'aprobat') throwHttp(409, 'Nu poți șterge un bon deja aprobat.')
    g.bonuri_consum.splice(idx, 1)
    writeDb(auth.db)
    sendJson(res, 200, { ok: true })
  } catch (err) { next(err) }
})

// ─── INVENTAR ─────────────────────────────────────────────────────────────────

router.get('/gestiune/inventare', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requireAnyPermission(auth, res, ['materials:view', 'stock_operations:view'])) return

  const g = ensureDb(auth.db)
  sendJson(res, 200, [...g.inventare].sort((a, b) => (b.data || '').localeCompare(a.data || '')))
})

router.post('/gestiune/inventare', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'stock_operations:create')) return

    const body = req.body || {}
    const g = ensureDb(auth.db)

    // build lines from current stock if not provided
    let linii = Array.isArray(body.linii) ? body.linii : []
    if (!linii.length) {
      linii = (auth.db.materials || []).map(m => ({
        material_id: m.id,
        materialName: matName(m),
        unit: matUnit(m),
        stoc_scriptic: matStock(m),
        stoc_faptic: matStock(m),
        diferenta: 0,
        observatii: '',
      }))
    } else {
      linii = linii.map(l => {
        const mat = (auth.db.materials || []).find(m => String(m.id) === String(l.material_id))
        const scriptic = mat ? matStock(mat) : num(l.stoc_scriptic)
        const faptic = num(l.stoc_faptic !== undefined ? l.stoc_faptic : scriptic)
        return {
          material_id: l.material_id || '',
          materialName: mat ? matName(mat) : (l.materialName || ''),
          unit: mat ? matUnit(mat) : (l.unit || ''),
          stoc_scriptic: scriptic,
          stoc_faptic: faptic,
          diferenta: round2(faptic - scriptic),
          observatii: String(l.observatii || ''),
        }
      })
    }

    const inventar = {
      id: id('inv'),
      numar: nextNr(g, 'inv', 'INV'),
      data: String(body.data || todayIso()).slice(0, 10),
      linii,
      status: 'in_curs',
      observatii: String(body.observatii || '').trim(),
      created_by: auth.user?.name || '',
      created_at: nowIso(),
    }

    g.inventare.push(inventar)
    addAudit(auth.db, auth.user, 'inventar_creat', `${inventar.numar} / ${inventar.data}`)
    writeDb(auth.db)
    sendJson(res, 201, inventar)
  } catch (err) { next(err) }
})

router.patch('/gestiune/inventare/:invId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'stock_operations:create')) return

    const g = ensureDb(auth.db)
    const inventar = g.inventare.find(i => i.id === req.params.invId)
    if (!inventar) throwHttp(404, 'Inventar inexistent.')
    if (inventar.status === 'finalizat') throwHttp(409, 'Inventarul este deja finalizat.')

    const body = req.body || {}

    // update lines if provided
    if (Array.isArray(body.linii)) {
      body.linii.forEach(l => {
        const line = inventar.linii.find(x => String(x.material_id) === String(l.material_id))
        if (!line) return
        if (l.stoc_faptic !== undefined) {
          line.stoc_faptic = num(l.stoc_faptic)
          line.diferenta = round2(line.stoc_faptic - line.stoc_scriptic)
        }
        if (l.observatii !== undefined) line.observatii = l.observatii
      })
    }

    // finalize → apply differences to stock
    if (body.status === 'finalizat' && inventar.status === 'in_curs') {
      ;(inventar.linii || []).forEach(l => {
        if (l.diferenta === 0) return
        const mat = (auth.db.materials || []).find(m => String(m.id) === String(l.material_id))
        if (!mat) return
        setMatStock(mat, Math.max(0, matStock(mat) + l.diferenta))
        mat.updated_at = nowIso()
        addStockMovement(auth.db, {
          materialId: mat.id, materialName: matName(mat),
          amount: l.diferenta, unit: l.unit,
          type: l.diferenta > 0 ? 'inventar_plus' : 'inventar_minus',
          reason: `Inventar ${inventar.numar}`,
          docNr: inventar.numar, createdBy: auth.user?.id || '',
        })
      })
      inventar.status = 'finalizat'
      inventar.finalizat_de = auth.user?.name || ''
      inventar.finalizat_la = nowIso()
      addAudit(auth.db, auth.user, 'inventar_finalizat', inventar.numar)
    }

    if (body.observatii !== undefined) inventar.observatii = body.observatii
    inventar.updated_at = nowIso()
    writeDb(auth.db)
    sendJson(res, 200, inventar)
  } catch (err) { next(err) }
})

// ─── RAPORT VALORIC ──────────────────────────────────────────────────────────

router.get('/gestiune/raport-valoric', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requireAnyPermission(auth, res, ['materials:view', 'stock_operations:view', 'cost_accounting:view'])) return

  const db = auth.db
  const { categorie } = req.query

  let mats = db.materials || []
  if (categorie) mats = mats.filter(m => String(m.categorie || m.category || '').toLowerCase() === categorie.toLowerCase())

  const rows = mats.map(m => {
    const stoc = matStock(m)
    const pret = num(m.pret_achizitie || m.price || m.pret || 0)
    const valoare = round2(stoc * pret)
    const status = (() => {
      const min = num(m.alert || m.stoc_minim || 0)
      if (min > 0 && stoc === 0) return 'epuizat'
      if (min > 0 && stoc < min) return 'critic'
      if (min > 0 && stoc < min * 1.5) return 'atentie'
      return 'ok'
    })()
    return {
      id: m.id,
      cod_intern: m.cod_intern || '',
      name: matName(m),
      unit: matUnit(m),
      categorie: m.categorie || m.category || 'general',
      stoc,
      stoc_minim: num(m.alert || m.stoc_minim || 0),
      pret_achizitie: pret,
      valoare,
      status,
      locatie: m.locatie_depozit || '',
    }
  }).sort((a, b) => (a.categorie || '').localeCompare(b.categorie || '') || (a.name || '').localeCompare(b.name || ''))

  const totalValoare = round2(rows.reduce((s, r) => s + r.valoare, 0))
  const categorii = [...new Set((db.materials || []).map(m => m.categorie || m.category || 'general').filter(Boolean))]

  sendJson(res, 200, { rows, totalValoare, categorii })
})

// ─── utils ───────────────────────────────────────────────────────────────────

module.exports = router
