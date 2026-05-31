const { Router } = require('express')
const crypto = require('crypto')
const path = require('path')
const xlsx = require('xlsx')
const { requireAuth } = require('../../core/auth')
const { requireAnyPermission } = require('../../core/permissions')
const { writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const { findCpv } = require('../nomenclator/service')

const router = Router()
const TEMPLATE = path.resolve(__dirname, '../../../db/templates/paap_sablon.xlsx')

function ensurePaap(db) {
  db.paap = Array.isArray(db.paap) ? db.paap : []
  db.paapExecutie = Array.isArray(db.paapExecutie) ? db.paapExecutie : []
  db.notifications = Array.isArray(db.notifications) ? db.notifications : []
}

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits))
}

function procedureFor(value) {
  const amount = Number(value || 0)
  if (amount < 135060) return 'Achizitie directa'
  if (amount <= 668280) return 'Procedura simplificata'
  return 'Licitatie deschisa'
}

function stringValue(value, fallback = '') {
  return String(value ?? fallback ?? '').trim()
}

function dateExportValue(value) {
  const raw = String(value || '').slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : raw
}

function executionValue(db, item) {
  const entries = db.paapExecutie.filter(entry => String(entry.paap_id) === String(item.id))
  if (entries.length) return round(entries.reduce((sum, entry) => sum + Number(entry.valoare || 0), 0))
  return round(item.valoare_executata)
}

function paapView(db, item) {
  const valoareExecutata = executionValue(db, item)
  const valoareEstimata = round(item.valoare_estimata)
  return {
    ...item,
    valoare_estimata: valoareEstimata,
    valoare_executata: valoareExecutata,
    valoare_ramasa: round(valoareEstimata - valoareExecutata),
    procent: valoareEstimata > 0 ? round(valoareExecutata / valoareEstimata * 100) : 0,
  }
}

function notifyThreshold(db, item) {
  const view = paapView(db, item)
  if (view.procent <= 90) return
  const urgent = view.procent > 100
  const key = `paap-${item.id}-${urgent ? '100' : '90'}`
  if (db.notifications.some(notification => notification.key === key)) return
  db.notifications.push({
    id: `notification-${crypto.randomUUID()}`,
    key,
    type: urgent ? 'urgent' : 'warning',
    title: urgent ? 'PAAP depasit' : 'PAAP aproape epuizat',
    message: `${item.cpv_cod} / ${item.material}: ${view.procent}% executat.`,
    roles: ['procurement', 'manager', 'admin', 'superadmin'],
    createdAt: new Date().toISOString(),
  })
}

function normalizeItem(db, input, current = {}) {
  const cpvCod = String(input.cpv_cod ?? current.cpv_cod ?? '').trim()
  const cpv = findCpv(db, cpvCod)
  if (!cpv) throwHttp(422, 'Selecteaza un cod CPV valid.')
  const value = round(input.valoare_estimata ?? current.valoare_estimata)
  const quarter = Number(input.trimestru ?? current.trimestru ?? 1)
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) throwHttp(422, 'Trimestrul trebuie sa fie intre 1 si 4.')
  return {
    ...current,
    an: Number(input.an ?? current.an ?? new Date().getFullYear()),
    cpv_cod: cpv.cod,
    cpv_denumire: cpv.denumire_ro,
    material: String(input.material ?? current.material ?? '').trim(),
    um: String(input.um ?? current.um ?? '').trim(),
    cantitate: round(input.cantitate ?? current.cantitate, 3),
    valoare_estimata: value,
    procedura: String(input.procedura || procedureFor(value)).trim(),
    trimestru: quarter,
    valoare_executata: round(input.valoare_executata ?? current.valoare_executata),
    sursa: String(input.sursa ?? current.sursa ?? 'manual').trim(),
    responsabil_achizitie: stringValue(input.responsabil_achizitie, current.responsabil_achizitie),
    curs_bnr_eur: round(input.curs_bnr_eur ?? current.curs_bnr_eur ?? db.settings?.curs_bnr_eur ?? 5),
    data_estimata_incepere: stringValue(input.data_estimata_incepere, current.data_estimata_incepere),
    data_estimata_finalizare: stringValue(input.data_estimata_finalizare, current.data_estimata_finalizare),
    modalitate_finantare: stringValue(input.modalitate_finantare, current.modalitate_finantare || 'Alte fonduri'),
    obiectiv_strategie_locala: stringValue(input.obiectiv_strategie_locala, current.obiectiv_strategie_locala),
    modalitate_desfasurare: stringValue(input.modalitate_desfasurare, current.modalitate_desfasurare || 'Online'),
    unitate_responsabila: stringValue(input.unitate_responsabila, current.unitate_responsabila),
  }
}

function orderLines(order) {
  if (Array.isArray(order.lines) && order.lines.length) return order.lines
  return [{ material_id: order.materialId, materialName: order.materialName, unit: order.unit, cantitate: order.amount, pret: order.unitPrice }]
}

function generateFromHistory(db, year, user) {
  const sourceYear = Number(year) - 1
  const groups = new Map()
  for (const order of db.procurementOrders || []) {
    if (Number(String(order.date || order.createdAt || '').slice(0, 4)) !== sourceYear) continue
    for (const line of orderLines(order)) {
      const material = (db.materials || []).find(item => String(item.id) === String(line.material_id || line.materialId))
      const cpvCod = String(line.cpv_cod || material?.cpv_cod || material?.cod_cpv || '').trim()
      const cpv = findCpv(db, cpvCod)
      if (!cpv) continue
      const materialName = String(line.materialName || material?.name || material?.denumire || 'Material').trim()
      const key = `${cpv.cod}|${materialName}`
      const group = groups.get(key) || { cpv, material: materialName, um: line.unit || material?.unit || material?.um || '', cantitate: 0, valoare: 0 }
      group.cantitate += Number(line.cantitate || line.amount || 0)
      group.valoare += Number(line.cantitate || line.amount || 0) * Number(line.pret || line.unitPrice || 0)
      groups.set(key, group)
    }
  }
  const rows = [...groups.values()].map(group => normalizeItem(db, {
    an: year,
    cpv_cod: group.cpv.cod,
    material: group.material,
    um: group.um,
    cantitate: round(group.cantitate * 1.05, 3),
    valoare_estimata: round(group.valoare * 1.05),
    sursa: `istoric ${sourceYear} + 5%`,
  }))
  rows.forEach(row => db.paap.push({ id: `paap-${crypto.randomUUID()}`, ...row, created_at: new Date().toISOString(), created_by: user.id }))
  return rows
}

function exportWorkbook(db, year, user = {}) {
  const workbook = xlsx.readFile(TEMPLATE, { cellStyles: true })
  const sheetName = workbook.SheetNames[0]
  const sourceSheet = workbook.Sheets[sheetName]
  const sheet = xlsx.utils.aoa_to_sheet([])
  const rows = db.paap.filter(item => !item.cancelled_at && Number(item.an) === Number(year)).map(item => paapView(db, item))
  const headerStyles = Array.from({ length: 14 }, (_, col) => sourceSheet[xlsx.utils.encode_cell({ r: 3, c: col })]?.s)
  const modelStyles = Array.from({ length: 14 }, (_, col) => sourceSheet[xlsx.utils.encode_cell({ r: 4, c: col })]?.s)
  const headers = [
    'Obiectul contractului', 'Cod si denumire CPV principal', 'Tip procedura', 'Tipul contractului',
    'Responsabil achizitie', 'Valoarea estimata RON (fara TVA)', 'Valoarea estimata RON (cu TVA)',
    'Valoarea estimata EUR (fara TVA)', 'Data estimata de incepere', 'Data estimata de finalizare',
    'Modalitatea de finantare', 'Obiectivul din strategia locala', 'Modalitatea de desfasurare',
    'Unitatea responsabila',
  ]
  sheet['!cols'] = sourceSheet['!cols']
  sheet['!rows'] = []
  sheet['!rows'][1] = { ...(sourceSheet['!rows']?.[3] || {}), hpt: 42 }
  sheet.H1 = { t: 'n', v: Number(year) }
  headers.forEach((value, col) => {
    sheet[xlsx.utils.encode_cell({ r: 1, c: col })] = { t: 's', v: value, s: headerStyles[col] }
  })
  rows.forEach((item, index) => {
    const row = index + 3
    const exchangeRate = Number(item.curs_bnr_eur || db.settings?.curs_bnr_eur || 5)
    const values = [
      item.material,
      `${item.cpv_cod} ${item.cpv_denumire || ''}`.trim(),
      item.procedura,
      'Contract de achizitii publice',
      item.responsabil_achizitie || user.name || user.fullName || '',
      item.valoare_estimata,
      round(item.valoare_estimata * 1.21),
      exchangeRate > 0 ? round(item.valoare_estimata / exchangeRate) : '',
      dateExportValue(item.data_estimata_incepere),
      dateExportValue(item.data_estimata_finalizare),
      item.modalitate_finantare || 'Alte fonduri',
      item.obiectiv_strategie_locala || '',
      item.modalitate_desfasurare || 'Online',
      item.unitate_responsabila || '',
    ]
    values.forEach((value, col) => { sheet[xlsx.utils.encode_cell({ r: row - 1, c: col })] = { t: typeof value === 'number' ? 'n' : 's', v: value, s: modelStyles[col] } })
  })
  sheet['!ref'] = `A1:N${Math.max(3, rows.length + 2)}`
  workbook.Sheets[sheetName] = sheet
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

router.get('/paap', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requireAnyPermission(auth, res, ['procurement_orders:view', 'procurement:view'])) return
  ensurePaap(auth.db)
  const year = Number(req.query.an || new Date().getFullYear())
  res.json({ an: year, paap: auth.db.paap.filter(item => !item.cancelled_at && Number(item.an) === year).map(item => paapView(auth.db, item)) })
})

router.post('/paap', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requireAnyPermission(auth, res, ['procurement_orders:create', 'procurement:receive'])) return
    ensurePaap(auth.db)
    const item = { id: `paap-${crypto.randomUUID()}`, ...normalizeItem(auth.db, req.body || {}), created_at: new Date().toISOString(), created_by: auth.user.id }
    if (!item.material) throwHttp(422, 'Materialul sau obiectul achizitiei este obligatoriu.')
    auth.db.paap.push(item)
    notifyThreshold(auth.db, item)
    addAudit(auth.db, auth.user, 'paap_adaugat', `${item.an} / ${item.cpv_cod} / ${item.material}`)
    writeDb(auth.db)
    res.status(201).json({ item: paapView(auth.db, item) })
  } catch (error) { next(error) }
})

router.post('/paap/genereaza-din-istoric', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requireAnyPermission(auth, res, ['procurement_orders:create', 'procurement:receive'])) return
    ensurePaap(auth.db)
    const year = Number(req.body?.an || new Date().getFullYear() + 1)
    const rows = generateFromHistory(auth.db, year, auth.user)
    addAudit(auth.db, auth.user, 'paap_generat_istoric', `${year} / ${rows.length} pozitii`)
    writeDb(auth.db)
    res.status(201).json({ an: year, paap: rows.map(item => paapView(auth.db, item)) })
  } catch (error) { next(error) }
})

router.put('/paap/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requireAnyPermission(auth, res, ['procurement_orders:create', 'procurement:receive'])) return
    ensurePaap(auth.db)
    const index = auth.db.paap.findIndex(item => String(item.id) === String(req.params.id) && !item.cancelled_at)
    if (index < 0) throwHttp(404, 'Pozitia PAAP nu exista.')
    auth.db.paap[index] = { ...normalizeItem(auth.db, req.body || {}, auth.db.paap[index]), updated_at: new Date().toISOString(), updated_by: auth.user.id }
    notifyThreshold(auth.db, auth.db.paap[index])
    addAudit(auth.db, auth.user, 'paap_modificat', `${auth.db.paap[index].an} / ${auth.db.paap[index].cpv_cod}`)
    writeDb(auth.db)
    res.json({ item: paapView(auth.db, auth.db.paap[index]) })
  } catch (error) { next(error) }
})

router.delete('/paap/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requireAnyPermission(auth, res, ['procurement_orders:create', 'procurement:receive'])) return
    ensurePaap(auth.db)
    const item = auth.db.paap.find(row => String(row.id) === String(req.params.id) && !row.cancelled_at)
    if (!item) throwHttp(404, 'Pozitia PAAP nu exista.')
    if (executionValue(auth.db, item) !== 0) throwHttp(409, 'Pozitia PAAP nu poate fi anulata deoarece are executie inregistrata.')
    item.cancelled_at = new Date().toISOString()
    item.cancelled_by = auth.user.id
    item.cancelled_reason = String(req.body?.reason || 'Anulare din Plan anual').trim()
    addAudit(auth.db, auth.user, 'paap_anulat', `${item.an} / ${item.cpv_cod}`)
    writeDb(auth.db)
    res.status(204).end()
  } catch (error) { next(error) }
})

router.get('/paap/raport', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requireAnyPermission(auth, res, ['procurement_orders:view', 'procurement:view'])) return
  ensurePaap(auth.db)
  const year = Number(req.query.an || new Date().getFullYear())
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename=PAAP_${year}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  res.end(exportWorkbook(auth.db, year, auth.user))
})

function throwHttp(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

module.exports = router
