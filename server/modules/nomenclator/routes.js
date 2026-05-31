const { Router } = require('express')
const crypto = require('crypto')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const { CPV_PATTERN, ensureCpvCodes, findCpv, searchCpv } = require('./service')

const router = Router()

router.get('/cpv/search', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requirePermission(auth, res, 'procurement_orders:view')) return
  res.json({ results: searchCpv(auth.db, req.query.q, req.query.lang) })
})

router.get('/cpv/:cod', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requirePermission(auth, res, 'procurement_orders:view')) return
  const cpv = findCpv(auth.db, req.params.cod)
  if (!cpv) return res.status(404).json({ error: 'Cod CPV inexistent.' })
  res.json({ cpv })
})

router.post('/cpv', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requirePermission(auth, res, 'procurement_orders:create')) return
  const body = req.body || {}
  const cod = String(body.cod || '').trim()
  if (!CPV_PATTERN.test(cod)) return res.status(422).json({ error: 'Codul CPV trebuie sa respecte formatul 12345678-9.' })
  if (findCpv(auth.db, cod)) return res.status(409).json({ error: `Codul CPV ${cod} exista deja.` })
  const cpv = {
    id: `cpv-manual-${crypto.randomUUID()}`,
    cod,
    denumire_ro: String(body.denumire_ro || '').trim(),
    denumire_en: String(body.denumire_en || '').trim(),
    activ: true,
    created_at: new Date().toISOString(),
    created_by: auth.user.id,
  }
  if (!cpv.denumire_ro) return res.status(422).json({ error: 'Denumirea in limba romana este obligatorie.' })
  ensureCpvCodes(auth.db).push(cpv)
  addAudit(auth.db, auth.user, 'cpv_adaugat', `${cpv.cod} / ${cpv.denumire_ro}`)
  writeDb(auth.db)
  res.status(201).json({ cpv })
})

router.put('/cpv/:cod', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requirePermission(auth, res, 'procurement_orders:create')) return
  const existing = findCpv(auth.db, req.params.cod)
  if (!existing) return res.status(404).json({ error: 'Cod CPV inexistent.' })
  const stored = ensureCpvCodes(auth.db)
  let cpv = stored.find(item => item.cod === existing.cod)
  if (!cpv) {
    cpv = { ...existing, id: `cpv-edit-${crypto.randomUUID()}`, created_by: auth.user.id }
    stored.push(cpv)
  }
  if (req.body?.denumire_ro !== undefined) cpv.denumire_ro = String(req.body.denumire_ro || '').trim()
  if (req.body?.denumire_en !== undefined) cpv.denumire_en = String(req.body.denumire_en || '').trim()
  if (!cpv.denumire_ro) return res.status(422).json({ error: 'Denumirea in limba romana este obligatorie.' })
  cpv.updated_at = new Date().toISOString()
  addAudit(auth.db, auth.user, 'cpv_modificat', `${cpv.cod} / ${cpv.denumire_ro}`)
  writeDb(auth.db)
  res.json({ cpv })
})

module.exports = router

