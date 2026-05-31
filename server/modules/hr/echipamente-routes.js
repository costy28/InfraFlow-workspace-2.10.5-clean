const { Router } = require('express')
const crypto = require('crypto')
const xlsx = require('xlsx')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')

const router = Router()
const TYPES = [
  ['Salopeta', 'numeric', 12, range(40, 66, 2)],
  ['Bocanci', 'numeric', 12, range(38, 46)],
  ['Cizme cauciuc', 'numeric', 24, range(38, 46)],
  ['Jacheta', 'numeric', 12, range(40, 66, 2)],
  ['Pantalon', 'numeric', 12, range(40, 66, 2)],
  ['Vesta reflectorizanta', 'text', 12, ['S', 'M', 'L', 'XL']],
]
const DEPARTMENT_CONFIG = [
  ['Mecanizare', 'Bleomarin', 'Ares 82,83'],
  ['Asfalt', 'Portocaliu', '4100217'],
  ['Betoane', 'Bleomarin', '4100217'],
  ['St.Asfalt', 'Portocaliu', '4100217'],
  ['Canalizare', 'Bleomarin', '4100217'],
  ['Salubrizare', 'Kaki', 'Ares 82,83'],
  ['Circulatie', 'Reflectorizant', ''],
]

function range(start, end, step = 1) {
  const result = []
  for (let value = start; value <= end; value += step) result.push(String(value))
  return result
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1
}

function ensureDb(db) {
  db.hr = db.hr || {}
  const hr = db.hr
  hr.echipamenteTipuri = Array.isArray(hr.echipamenteTipuri) ? hr.echipamenteTipuri : []
  hr.echipamenteMarimi = Array.isArray(hr.echipamenteMarimi) ? hr.echipamenteMarimi : []
  hr.echipamenteDepartament = Array.isArray(hr.echipamenteDepartament) ? hr.echipamenteDepartament : []
  hr.angajatEchipamente = Array.isArray(hr.angajatEchipamente) ? hr.angajatEchipamente : []
  hr.echipamenteDotari = Array.isArray(hr.echipamenteDotari) ? hr.echipamenteDotari : []
  hr.employees = Array.isArray(hr.employees) ? hr.employees : []
  if (!hr.echipamenteTipuri.length) {
    TYPES.forEach(([denumire, tip_marimi, durata_luni, marimi]) => {
      const tip = { id: nextId(hr.echipamenteTipuri), denumire, tip_marimi, durata_luni, activ: true }
      hr.echipamenteTipuri.push(tip)
      marimi.forEach((marime, index) => hr.echipamenteMarimi.push({ id: nextId(hr.echipamenteMarimi), tip_id: tip.id, marime, ordine: index + 1 }))
    })
    DEPARTMENT_CONFIG.forEach(([departament, culoare, cod_articol]) => {
      hr.echipamenteTipuri.forEach((tip) => hr.echipamenteDepartament.push({
        id: nextId(hr.echipamenteDepartament), departament, tip_id: tip.id, culoare, cod_articol, obligatoriu: true,
      }))
    })
  }
  return hr
}

function departmentName(db, employee) {
  const id = employee.department_id || employee.dept_id
  const dept = (db.departments || []).find((item) => String(item.id) === String(id))
  return String(employee.department_name || employee.department || dept?.denumire || dept?.name || 'Fara departament')
}

function expiryDate(data, months) {
  const date = new Date(`${String(data).slice(0, 10)}T00:00:00`)
  date.setMonth(date.getMonth() + Number(months || 0))
  return date.toISOString().slice(0, 10)
}

function viewDotare(hr, item) {
  const tip = hr.echipamenteTipuri.find((row) => row.id === item.tip_id)
  return { ...item, tip_denumire: tip?.denumire || '', data_expirare: expiryDate(item.data_dotare, tip?.durata_luni || item.durata_luni) }
}

function employeeEquipment(db, employeeId) {
  const hr = ensureDb(db)
  const employee = hr.employees.find((item) => String(item.id) === String(employeeId))
  if (!employee) return null
  const marimi = hr.echipamenteTipuri.map((tip) => ({
    ...tip,
    marimi_disponibile: hr.echipamenteMarimi.filter((item) => item.tip_id === tip.id).sort((a, b) => a.ordine - b.ordine).map((item) => item.marime),
    marime: hr.angajatEchipamente.find((item) => item.angajat_id === employee.id && item.tip_id === tip.id)?.marime || '',
  }))
  return {
    angajat: { id: employee.id, nume: employee.nume, prenume: employee.prenume, department_name: departmentName(db, employee) },
    marimi,
    dotari: hr.echipamenteDotari.filter((item) => item.angajat_id === employee.id).map((item) => viewDotare(hr, item)).sort((a, b) => String(b.data_dotare).localeCompare(String(a.data_dotare))),
  }
}

function reportRows(db) {
  const hr = ensureDb(db)
  const groups = new Map()
  hr.employees.filter((employee) => employee.activ !== false).forEach((employee) => {
    const departament = departmentName(db, employee)
    hr.angajatEchipamente.filter((item) => item.angajat_id === employee.id && item.marime).forEach((item) => {
      const tip = hr.echipamenteTipuri.find((row) => row.id === item.tip_id)
      const config = hr.echipamenteDepartament.find((row) => row.tip_id === item.tip_id && row.departament === departament) ||
        hr.echipamenteDepartament.find((row) => row.tip_id === item.tip_id && normalize(row.departament) === normalize(departament))
      const key = `${departament}|${item.tip_id}|${item.marime}`
      const group = groups.get(key) || { departament, tip_id: item.tip_id, tip: tip?.denumire || '', marime: item.marime, culoare: config?.culoare || '', cod_articol: config?.cod_articol || '', cantitate: 0 }
      group.cantitate += 1
      groups.set(key, group)
    })
  })
  return [...groups.values()].sort((a, b) => `${a.tip}|${a.marime}|${a.departament}`.localeCompare(`${b.tip}|${b.marime}|${b.departament}`, 'ro'))
}

function supplierRows(db) {
  const rows = reportRows(db)
  const groups = new Map()
  rows.forEach((row) => {
    const cpv_cod = row.tip === 'Salopeta' ? '18114000-1' : '18143000-3'
    const key = `${row.cod_articol || row.tip}|${row.tip}|${row.marime}|${row.culoare}`
    const group = groups.get(key) || { cod_articol: row.cod_articol || '-', tip: row.tip, marime: row.marime, culoare: row.culoare, cpv_cod, cantitate: 0 }
    group.cantitate += row.cantitate
    groups.set(key, group)
  })
  return [...groups.values()]
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

router.get('/hr/echipamente/angajat/:id', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requirePermission(auth, res, 'hr:view')) return
  const data = employeeEquipment(auth.db, req.params.id)
  if (!data) return res.status(404).json({ error: 'Angajatul nu exista.' })
  res.json(data)
})

router.put('/hr/echipamente/angajat/:id/marimi', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requirePermission(auth, res, 'hr:manage')) return
  const hr = ensureDb(auth.db)
  const employee = hr.employees.find((item) => String(item.id) === String(req.params.id))
  if (!employee) return res.status(404).json({ error: 'Angajatul nu exista.' })
  Object.entries(req.body?.marimi || {}).forEach(([tipId, marime]) => {
    let item = hr.angajatEchipamente.find((row) => row.angajat_id === employee.id && String(row.tip_id) === String(tipId))
    if (!item) {
      item = { id: nextId(hr.angajatEchipamente), angajat_id: employee.id, tip_id: Number(tipId) }
      hr.angajatEchipamente.push(item)
    }
    Object.assign(item, { marime: String(marime || ''), updated_at: new Date().toISOString(), updated_by: auth.user.id })
  })
  addAudit(auth.db, auth.user, 'hr_echipamente_marimi_actualizate', String(employee.id))
  writeDb(auth.db)
  res.json(employeeEquipment(auth.db, employee.id))
})

router.post('/hr/echipamente/dotare', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requirePermission(auth, res, 'hr:manage')) return
  const hr = ensureDb(auth.db)
  const tip = hr.echipamenteTipuri.find((item) => String(item.id) === String(req.body?.tip_id))
  if (!tip || !req.body?.angajat_id || !req.body?.data_dotare) return res.status(422).json({ error: 'Angajatul, tipul si data dotarii sunt obligatorii.' })
  const item = { id: nextId(hr.echipamenteDotari), uuid: crypto.randomUUID(), angajat_id: Number(req.body.angajat_id), tip_id: tip.id, marime: String(req.body.marime || ''), data_dotare: String(req.body.data_dotare).slice(0, 10), cantitate: Number(req.body.cantitate || 1), stare: String(req.body.stare || 'predat'), observatii: String(req.body.observatii || ''), inregistrat_de: auth.user.id, created_at: new Date().toISOString() }
  hr.echipamenteDotari.push(item)
  addAudit(auth.db, auth.user, 'hr_echipamente_dotare_adaugata', `${item.angajat_id}/${tip.denumire}`)
  writeDb(auth.db)
  res.status(201).json({ dotare: viewDotare(hr, item) })
})

router.get('/hr/echipamente/raport-necesar', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requirePermission(auth, res, 'hr:view')) return
  res.json({ rows: reportRows(auth.db), comanda: supplierRows(auth.db) })
})

router.get('/hr/echipamente/expirari', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requirePermission(auth, res, 'hr:view')) return
  const hr = ensureDb(auth.db)
  const days = Number(req.query.zile || 90)
  const today = new Date()
  const rows = hr.echipamenteDotari.map((item) => {
    const dotare = viewDotare(hr, item)
    const employee = hr.employees.find((row) => row.id === item.angajat_id)
    dotare.angajat = employee ? `${employee.nume || ''} ${employee.prenume || ''}`.trim() : String(item.angajat_id)
    dotare.zile_ramase = Math.ceil((new Date(`${dotare.data_expirare}T00:00:00`) - today) / 86400000)
    return dotare
  }).filter((item) => item.zile_ramase <= days).sort((a, b) => a.zile_ramase - b.zile_ramase)
  auth.db.notifications = Array.isArray(auth.db.notifications) ? auth.db.notifications : []
  let notificationsAdded = 0
  rows.filter((item) => item.zile_ramase <= 90).forEach((item) => {
    const threshold = item.zile_ramase <= 30 ? 30 : item.zile_ramase <= 60 ? 60 : 90
    const key = `echipamente-expirare-${item.id}-${threshold}`
    if (auth.db.notifications.some((notification) => notification.key === key)) return
    auth.db.notifications.push({
      id: `notification-${crypto.randomUUID()}`,
      key,
      type: item.zile_ramase <= 30 ? 'urgent' : 'warning',
      title: 'Echipament cu expirare apropiata',
      message: `${item.angajat}: ${item.tip_denumire} expira in ${item.zile_ramase} zile.`,
      roles: ['hr', 'manager', 'admin', 'superadmin'],
      createdAt: new Date().toISOString(),
    })
    notificationsAdded += 1
  })
  if (notificationsAdded) {
    addAudit(auth.db, auth.user, 'hr_echipamente_alerte_expirare_generate', String(notificationsAdded))
    writeDb(auth.db)
  }
  res.json({ zile: days, rows })
})

router.get('/hr/echipamente/comanda-excel', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requirePermission(auth, res, 'hr:view')) return
  const workbook = xlsx.utils.book_new()
  const rows = supplierRows(auth.db)
  const sheet = xlsx.utils.json_to_sheet(rows.map((item) => ({ 'Cod articol': item.cod_articol, Echipament: item.tip, Marime: item.marime, Culoare: item.culoare, CPV: item.cpv_cod, Cantitate: item.cantitate })))
  sheet['!cols'] = [18, 24, 12, 18, 16, 12].map((width) => ({ width }))
  xlsx.utils.book_append_sheet(workbook, sheet, 'Comanda furnizor')
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename=Comanda_echipamente_${new Date().toISOString().slice(0, 10)}.xlsx`)
  res.end(xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
})

router.post('/hr/echipamente/creeaza-referat', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requirePermission(auth, res, 'hr:manage')) return
  const rows = supplierRows(auth.db)
  if (!rows.length) return res.status(422).json({ error: 'Nu exista pozitii de echipamente pentru referat.' })
  auth.db.referate = Array.isArray(auth.db.referate) ? auth.db.referate : []
  auth.db.referateFlux = Array.isArray(auth.db.referateFlux) ? auth.db.referateFlux : []
  auth.db.referateCounters = Array.isArray(auth.db.referateCounters) ? auth.db.referateCounters : []
  const year = new Date().getFullYear()
  let counter = auth.db.referateCounters.find((item) => Number(item.an) === year)
  if (!counter) {
    counter = { an: year, last_nr: 0 }
    auth.db.referateCounters.push(counter)
  }
  counter.last_nr = Number(counter.last_nr || 0) + 1
  const referat = {
    id: `ref-${crypto.randomUUID()}`, uuid: crypto.randomUUID(), numar: counter.last_nr, serie: 'RA',
    data_intocmire: new Date().toISOString().slice(0, 10), tip: 'aprovizionare', departament_id: req.body?.departament_id || auth.user.departmentId || null,
    intocmit_de: auth.user.id, intocmit_de_nume: auth.user.name, observatii: 'Generat automat din necesarul de echipamente HR', status: 'draft',
    valoare_referat: 0, valoare_factura: 0, items: rows.map((item, index) => ({ nr_crt: index + 1, denumire: `${item.tip} ${item.culoare}`.trim(), caracteristici: `Marime ${item.marime}; cod articol ${item.cod_articol}`, um: 'buc', cantitate: item.cantitate, pret_unitar: 0, valoare_tva: 0, stoc_magazie: 0, cpv_cod: item.cpv_cod })), created_at: new Date().toISOString(),
  }
  auth.db.referate.push(referat)
  auth.db.referateFlux.push({ id: `flux-${crypto.randomUUID()}`, referat_id: referat.id, pas: 'draft', actiune: 'creat', user_id: auth.user.id, data_actiune: new Date().toISOString(), observatii: referat.observatii })
  addAudit(auth.db, auth.user, 'hr_echipamente_referat_creat', `${referat.serie}/${referat.numar}`)
  writeDb(auth.db)
  res.status(201).json({ referat })
})

module.exports = router
