/**
 * InfraFlow — Modul Asternere Asfalt
 * Gestiunea lucrărilor de asfaltare, rapoarte zilnice, progres,
 * și legătura cu Producție Asfalt + Mecanizare.
 *
 * §67 AGENTS.md
 */

'use strict'

const { Router } = require('express')
const crypto = require('crypto')
const { requireAuth } = require('../../core/auth')
const { requireAnyPermission, requirePermission } = require('../../core/permissions')
const { readDb, writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')

const router = Router()

// ─── helpers ──────────────────────────────────────────────────────────────────

function uid(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
}

function nowIso() { return new Date().toISOString() }

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function num(v) { return Math.round(Number(v || 0) * 1000) / 1000 }
function round2(v) { return Math.round(num(v) * 100) / 100 }

function sendJson(res, status, body) { res.status(status).json(body) }

function throwHttp(code, msg) {
  const err = new Error(msg); err.status = code; throw err
}

function currentMonth() { return todayIso().slice(0, 7) }

// ─── DB init ──────────────────────────────────────────────────────────────────

function ensureDb(db) {
  if (!db.asternere || typeof db.asternere !== 'object') db.asternere = {}
  const a = db.asternere
  if (!Array.isArray(a.lucrari))   a.lucrari   = []
  if (!Array.isArray(a.rapoarte))  a.rapoarte  = []
  return a
}

// ─── calcule progres ──────────────────────────────────────────────────────────

function calcLucrareProgres(lucrare, rapoarte) {
  const r = rapoarte.filter(x => x.lucrare_id === lucrare.id && x.status !== 'sters')
  const mp_realizat  = round2(r.reduce((s, x) => s + num(x.suprafata_mp), 0))
  const tone_total   = round2(r.reduce((s, x) => s + num(x.cantitate_tone), 0))
  const mp_plan      = num(lucrare.mp_planificati) || 0
  const procent      = mp_plan > 0 ? Math.min(100, round2(mp_realizat / mp_plan * 100)) : 0

  const per_strat = { fundatie: 0, legatura: 0, uzura: 0 }
  r.forEach(x => {
    const s = x.strat?.toLowerCase() || 'fundatie'
    if (s === 'fundatie')  per_strat.fundatie  = round2(per_strat.fundatie  + num(x.suprafata_mp))
    else if (s === 'legatura') per_strat.legatura = round2(per_strat.legatura + num(x.suprafata_mp))
    else if (s === 'uzura')    per_strat.uzura    = round2(per_strat.uzura    + num(x.suprafata_mp))
  })

  return { mp_realizat, tone_total, procent, per_strat, rapoarte: r }
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

router.get('/asternere/dashboard', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return
    const db = readDb()
    const a  = ensureDb(db)
    const luna = currentMonth()

    const lucrari_active = a.lucrari.filter(l => l.status === 'activa' || !l.status)

    // mp și tone luna curentă
    const rapoarte_luna = a.rapoarte.filter(r =>
      r.status !== 'sters' && (r.data || '').startsWith(luna)
    )
    const total_mp_realizat_luna  = round2(rapoarte_luna.reduce((s, r) => s + num(r.suprafata_mp), 0))
    const total_tone_luna         = round2(rapoarte_luna.reduce((s, r) => s + num(r.cantitate_tone), 0))

    const progres_lucrari = lucrari_active.map(l => {
      const p = calcLucrareProgres(l, a.rapoarte)
      return {
        lucrare: l.denumire,
        lucrare_id: l.id,
        beneficiar: l.beneficiar || '',
        mp_plan:      num(l.mp_planificati),
        mp_realizat:  p.mp_realizat,
        tone_total:   p.tone_total,
        procent:      p.procent,
        status:       l.status || 'activa',
      }
    })

    const progres_mediu = progres_lucrari.length
      ? round2(progres_lucrari.reduce((s, p) => s + p.procent, 0) / progres_lucrari.length)
      : 0

    sendJson(res, 200, {
      lucrari_active: lucrari_active.length,
      total_mp_realizat_luna,
      total_tone_luna,
      progres_mediu,
      progres_lucrari,
      luna,
    })
  } catch (e) { next(e) }
})

// ─── LUCRĂRI — CRUD ───────────────────────────────────────────────────────────

router.get('/asternere/lucrari', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return
    const db = readDb()
    const a  = ensureDb(db)
    sendJson(res, 200, { lucrari: a.lucrari })
  } catch (e) { next(e) }
})

router.post('/asternere/lucrari', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return
    const { denumire, contract_nr, beneficiar, data_start,
            data_sfarsit_estimata, km_planificati, mp_planificati,
            centru_cost_id } = req.body || {}
    if (!denumire) throwHttp(400, 'Denumirea lucrării este obligatorie')

    const db = readDb()
    const a  = ensureDb(db)

    const lucrare = {
      id: uid('luc'),
      denumire: String(denumire).trim(),
      contract_nr: contract_nr || '',
      beneficiar: beneficiar || '',
      data_start: data_start || todayIso(),
      data_sfarsit_estimata: data_sfarsit_estimata || '',
      km_planificati: num(km_planificati),
      mp_planificati: num(mp_planificati),
      centru_cost_id: centru_cost_id || '',
      status: 'activa',
      createdBy: auth.username || auth.user || 'system',
      createdAt: nowIso(),
    }
    a.lucrari.push(lucrare)
    writeDb(db)
    addAudit(db, { action: 'create', module: 'asternere', entity: 'lucrare', id: lucrare.id, user: auth.username, data: { denumire } })
    sendJson(res, 201, { lucrare })
  } catch (e) { next(e) }
})

router.patch('/asternere/lucrari/:lid', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return
    const db = readDb()
    const a  = ensureDb(db)
    const lucrare = a.lucrari.find(l => l.id === req.params.lid)
    if (!lucrare) throwHttp(404, 'Lucrarea nu a fost găsită')

    const allowed = ['denumire', 'contract_nr', 'beneficiar', 'data_start',
                     'data_sfarsit_estimata', 'km_planificati', 'mp_planificati',
                     'centru_cost_id', 'status']
    allowed.forEach(k => {
      if (req.body[k] !== undefined) {
        lucrare[k] = ['km_planificati', 'mp_planificati'].includes(k)
          ? num(req.body[k]) : req.body[k]
      }
    })
    lucrare.updatedAt = nowIso()
    writeDb(db)
    sendJson(res, 200, { lucrare })
  } catch (e) { next(e) }
})

router.delete('/asternere/lucrari/:lid', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return
    const db = readDb()
    const a  = ensureDb(db)
    const lucrare = a.lucrari.find(l => l.id === req.params.lid)
    if (!lucrare) throwHttp(404, 'Lucrarea nu a fost găsită')
    lucrare.status = 'anulata'
    lucrare.updatedAt = nowIso()
    writeDb(db)
    sendJson(res, 200, { ok: true })
  } catch (e) { next(e) }
})

// ─── RAPOARTE ZILNICE — CRUD ───────────────────────────────────────────────────

router.get('/asternere/rapoarte-zilnice', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return
    const db = readDb()
    const a  = ensureDb(db)
    let list = a.rapoarte.filter(r => r.status !== 'sters')

    if (req.query.lucrare_id) {
      list = list.filter(r => r.lucrare_id === req.query.lucrare_id)
    }
    if (req.query.luna) {
      // luna format YYYY-MM
      list = list.filter(r => (r.data || '').startsWith(req.query.luna))
    }
    if (req.query.data) {
      list = list.filter(r => r.data === req.query.data)
    }
    // Enrich cu denumire lucrare
    list = list.map(r => {
      const l = a.lucrari.find(x => x.id === r.lucrare_id)
      return { ...r, lucrare_denumire: l?.denumire || r.lucrare_id }
    })
    sendJson(res, 200, { rapoarte: list })
  } catch (e) { next(e) }
})

router.post('/asternere/rapoarte-zilnice', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return
    const { lucrare_id, data, sector, strat, grosime_cm,
            suprafata_mp, cantitate_tone, temperatura_mix,
            utilaje, sofer_finisor, observatii } = req.body || {}
    if (!lucrare_id) throwHttp(400, 'lucrare_id este obligatoriu')
    if (!data) throwHttp(400, 'data este obligatorie')

    const db = readDb()
    const a  = ensureDb(db)
    const lucrare = a.lucrari.find(l => l.id === lucrare_id)
    if (!lucrare) throwHttp(404, 'Lucrarea nu a fost găsită')

    const raport = {
      id: uid('rap'),
      lucrare_id,
      data,
      sector: sector || '',
      strat: strat || 'uzura',
      grosime_cm: num(grosime_cm),
      suprafata_mp: num(suprafata_mp),
      cantitate_tone: num(cantitate_tone),
      temperatura_mix: num(temperatura_mix),
      utilaje: Array.isArray(utilaje) ? utilaje : [],
      sofer_finisor: sofer_finisor || '',
      observatii: observatii || '',
      status: 'activ',
      createdBy: auth.username || auth.user || 'system',
      createdAt: nowIso(),
    }
    a.rapoarte.push(raport)
    writeDb(db)
    addAudit(db, { action: 'create', module: 'asternere', entity: 'raport', id: raport.id, user: auth.username })
    sendJson(res, 201, { raport })
  } catch (e) { next(e) }
})

router.patch('/asternere/rapoarte-zilnice/:rid', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return
    const db = readDb()
    const a  = ensureDb(db)
    const raport = a.rapoarte.find(r => r.id === req.params.rid)
    if (!raport) throwHttp(404, 'Raportul nu a fost găsit')

    const allowed = ['data', 'sector', 'strat', 'grosime_cm', 'suprafata_mp',
                     'cantitate_tone', 'temperatura_mix', 'utilaje',
                     'sofer_finisor', 'observatii', 'status']
    allowed.forEach(k => {
      if (req.body[k] !== undefined) {
        raport[k] = ['grosime_cm', 'suprafata_mp', 'cantitate_tone', 'temperatura_mix'].includes(k)
          ? num(req.body[k]) : req.body[k]
      }
    })
    raport.updatedAt = nowIso()
    writeDb(db)
    sendJson(res, 200, { raport })
  } catch (e) { next(e) }
})

router.delete('/asternere/rapoarte-zilnice/:rid', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return
    const db = readDb()
    const a  = ensureDb(db)
    const raport = a.rapoarte.find(r => r.id === req.params.rid)
    if (!raport) throwHttp(404, 'Raportul nu a fost găsit')
    raport.status = 'sters'
    raport.updatedAt = nowIso()
    writeDb(db)
    sendJson(res, 200, { ok: true })
  } catch (e) { next(e) }
})

// ─── PROGRES LUCRARE ──────────────────────────────────────────────────────────

router.get('/asternere/lucrari/:lid/progres', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return
    const db = readDb()
    const a  = ensureDb(db)
    const lucrare = a.lucrari.find(l => l.id === req.params.lid)
    if (!lucrare) throwHttp(404, 'Lucrarea nu a fost găsită')

    const p = calcLucrareProgres(lucrare, a.rapoarte)

    // Evolutie pe zile (pentru grafic)
    const evolutie_zile = {}
    p.rapoarte.forEach(r => {
      const z = r.data || 'necunoscut'
      if (!evolutie_zile[z]) evolutie_zile[z] = { mp: 0, tone: 0, data: z }
      evolutie_zile[z].mp   = round2(evolutie_zile[z].mp   + num(r.suprafata_mp))
      evolutie_zile[z].tone = round2(evolutie_zile[z].tone + num(r.cantitate_tone))
    })
    const zile = Object.values(evolutie_zile).sort((a, b) => a.data.localeCompare(b.data))

    sendJson(res, 200, {
      lucrare,
      total_mp_planificati:  num(lucrare.mp_planificati),
      total_mp_realizati:    p.mp_realizat,
      total_tone_consumate:  p.tone_total,
      procent_finalizare:    p.procent,
      consum_per_strat:      p.per_strat,
      rapoarte:              p.rapoarte,
      evolutie_zile:         zile,
    })
  } catch (e) { next(e) }
})

// ─── CONSUM ASFALT — legătură cu Producție ───────────────────────────────────

/**
 * Returnează lista de consumuri din rapoartele de asternere cu posibilitate
 * de a le corela cu producțiile livrate. Opțional filtrare pe lucrare/luna.
 */
router.get('/asternere/consum-asfalt', (req, res, next) => {
  try {
    const auth = requireAuth(req, res); if (!auth) return
    const db = readDb()
    const a  = ensureDb(db)

    let rapoarte = a.rapoarte.filter(r => r.status !== 'sters')

    if (req.query.lucrare_id) {
      rapoarte = rapoarte.filter(r => r.lucrare_id === req.query.lucrare_id)
    }
    if (req.query.luna) {
      rapoarte = rapoarte.filter(r => (r.data || '').startsWith(req.query.luna))
    }

    // Calcul total per lucrare
    const per_lucrare = {}
    rapoarte.forEach(r => {
      const l = a.lucrari.find(x => x.id === r.lucrare_id)
      const key = r.lucrare_id
      if (!per_lucrare[key]) {
        per_lucrare[key] = {
          lucrare_id: key,
          lucrare_denumire: l?.denumire || key,
          tone_total: 0,
          mp_total: 0,
          nr_rapoarte: 0,
        }
      }
      per_lucrare[key].tone_total = round2(per_lucrare[key].tone_total + num(r.cantitate_tone))
      per_lucrare[key].mp_total   = round2(per_lucrare[key].mp_total   + num(r.suprafata_mp))
      per_lucrare[key].nr_rapoarte++
    })

    // Încercăm corelarea cu producțiile livrate (dacă modulul production există)
    let productii_livrate = []
    try {
      const prod = db.production || db.productie || {}
      const consumptions = prod.consumptions || prod.consumuri || []
      productii_livrate = consumptions
        .filter(c => c.lucrare_id || c.destination)
        .map(c => ({
          id: c.id,
          data: c.data || c.date || '',
          tone: num(c.totalTons || c.total_tone || 0),
          reteta: c.recipe || c.reteta || '',
          lucrare_id: c.lucrare_id || '',
          destination: c.destination || '',
        }))
    } catch (_) { /* producție indisponibilă */ }

    sendJson(res, 200, {
      rapoarte: rapoarte.map(r => {
        const l = a.lucrari.find(x => x.id === r.lucrare_id)
        return { ...r, lucrare_denumire: l?.denumire || r.lucrare_id }
      }),
      per_lucrare: Object.values(per_lucrare),
      productii_livrate,
    })
  } catch (e) { next(e) }
})

module.exports = router
