const { Router } = require('express')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const xlsx = require('xlsx')
const { requireAuth, hashPassword, verifyPassword } = require('../../core/auth')
const { requirePermission, authHasPermission } = require('../../core/permissions')
const kioskSessions = require('../../core/kiosk-sessions')
const { readDb, writeDb, runMssqlScalar, DB_MODE } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const { valideazaCNP, infoCNP } = require('../../shared/cnp-validator')
const { registerPontaj } = require('../controlling/auto-register')
const { notifyUser, createDepartmentChannel } = require('../messaging/routes')
const { sendEmail } = require('../messaging/email')

const router = Router()
const upload = multer({
  dest: path.join(__dirname, '../../../storage/temp/'),
  limits: { fileSize: 10 * 1024 * 1024 }
})

// Asigură existența directoarelor de storage la pornire
;['storage/angajati', 'storage/temp', 'storage/documente'].forEach(dir => {
  const p = path.join(__dirname, '../../../', dir)
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
})

function sendJson(res, status, data) {
  res.status(status).json(data)
}

function isMssqlMode() {
  return DB_MODE === 'mssql' || DB_MODE === 'sqlserver'
}

function nowIso() {
  return new Date().toISOString()
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function isValidRomanianIban(value) {
  const clean = String(value || '').replace(/\s+/g, '').toUpperCase()
  return !clean || /^RO[0-9A-Z]{22}$/.test(clean)
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1
}

function mssqlJson(sql, params = {}) {
  const result = runMssqlScalar(`DECLARE @p nvarchar(max) = @json;\n${sql}`, { jsonInput: JSON.stringify(params) })
  if (!String(result || '').trim()) return null
  return JSON.parse(result)
}

function mssqlArray(sql, params = {}) {
  return mssqlJson(sql, params) || []
}

function mssqlObject(sql, params = {}) {
  return mssqlArray(sql, params)[0] || null
}

function ensureHrDb(db) {
  db.hr = db.hr || {}
  db.hr.employees = Array.isArray(db.hr.employees) ? db.hr.employees : []
  db.hr.contracts = Array.isArray(db.hr.contracts) ? db.hr.contracts : []
  db.hr.timeSheets = Array.isArray(db.hr.timeSheets) ? db.hr.timeSheets : []
  db.hr.leaveRequests = Array.isArray(db.hr.leaveRequests) ? db.hr.leaveRequests : []
  db.hr.authorizations = Array.isArray(db.hr.authorizations) ? db.hr.authorizations : []
  db.hr.regesExports = Array.isArray(db.hr.regesExports) ? db.hr.regesExports : []
  db.hr.training = Array.isArray(db.hr.training) ? db.hr.training : []
  db.hr.trainingEmployees = Array.isArray(db.hr.trainingEmployees) ? db.hr.trainingEmployees : []
  db.hr.departmentTransfers = Array.isArray(db.hr.departmentTransfers) ? db.hr.departmentTransfers : []
  db.hr.timesheetDepartments = Array.isArray(db.hr.timesheetDepartments) ? db.hr.timesheetDepartments : []
  db.hr.evaluations = Array.isArray(db.hr.evaluations) ? db.hr.evaluations : []
  db.hr.tures = Array.isArray(db.hr.tures) ? db.hr.tures : []
  db.hr.schedules = Array.isArray(db.hr.schedules) ? db.hr.schedules : []
  db.hr.overtimeCompensations = Array.isArray(db.hr.overtimeCompensations) ? db.hr.overtimeCompensations : []
  db.hr.kioskUsers = Array.isArray(db.hr.kioskUsers) ? db.hr.kioskUsers : []
  db.hr.kioskResetCodes = Array.isArray(db.hr.kioskResetCodes) ? db.hr.kioskResetCodes : []
  return db.hr
}

const DEFAULT_TURES = [
  { nume: 'Tura I', ora_start: '06:00', ora_sfarsit: '14:00', ore_normale: 8, culoare: '#F59E0B' },
  { nume: 'Tura II', ora_start: '14:00', ora_sfarsit: '22:00', ore_normale: 8, culoare: '#0EA5E9' },
  { nume: 'Tura III', ora_start: '22:00', ora_sfarsit: '06:00', ore_normale: 8, culoare: '#6366F1' },
  { nume: 'Normal', ora_start: '08:00', ora_sfarsit: '16:00', ore_normale: 8, culoare: '#10B981' },
]

function ensureDefaultTures(hr) {
  if (hr.tures.length) return hr.tures
  DEFAULT_TURES.forEach((item, index) => {
    hr.tures.push({
      id: index + 1,
      uuid: crypto.randomUUID(),
      ...item,
      activ: true,
      created_at: nowIso(),
      updated_at: null,
    })
  })
  return hr.tures
}

function departmentsList(db) {
  return db.departments || db.core?.departments || []
}

function departmentName(db, id) {
  return departmentsList(db).find((dept) => String(dept.id) === String(id))?.denumire ||
    departmentsList(db).find((dept) => String(dept.id) === String(id))?.name ||
    ''
}

function departmentCod(db, value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const dept = departmentsList(db).find((item) => (
    String(item.id) === raw ||
    String(item.cod || '').toLowerCase() === raw.toLowerCase() ||
    String(item.denumire || item.name || '').toLowerCase() === raw.toLowerCase()
  ))
  return String(dept?.cod || dept?.code || raw).toLowerCase()
}

function employeeDepartment(employee, db) {
  return departmentCod(db, employee.department_cod || employee.department || employee.departament || employee.department_id)
}

function userDepartment(auth, db) {
  return departmentCod(db, auth.user?.department_cod || auth.user?.department || auth.user?.departmentId || auth.user?.department_id)
}

function daysBetween(start, end = new Date()) {
  if (!start) return 0
  const startDate = new Date(start)
  if (Number.isNaN(startDate.getTime())) return 0
  return Math.max(0, Math.floor((end.getTime() - startDate.getTime()) / 86400000))
}

function daysInMonth(month) {
  const [year, monthIndex] = String(month).slice(0, 7).split('-').map(Number)
  return new Date(year, monthIndex, 0).getDate()
}

function monthDates(month) {
  const count = daysInMonth(month)
  return Array.from({ length: count }, (_, index) => `${String(month).slice(0, 7)}-${String(index + 1).padStart(2, '0')}`)
}

function firstDayOfMonth(value) {
  return `${String(value || todayIso()).slice(0, 7)}-01`
}

function addDaysIso(date, days) {
  const value = new Date(date)
  value.setDate(value.getDate() + days)
  return value.toISOString().slice(0, 10)
}

function dateRange(start, end) {
  const result = []
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return result
  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    result.push(date.toISOString().slice(0, 10))
  }
  return result
}

function employeeName(employee) {
  return [employee?.nume, employee?.prenume].filter(Boolean).join(' ') || employee?.name || `Angajat ${employee?.id || ''}`.trim()
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function companySettings(db) {
  return db.settings?.company || db.company || db.settings || {}
}

function publicCompanySettings(company = {}) {
  return {
    denumire: company.company_name || company.denumire_firma || company.denumire || '',
    cui: company.company_cui || company.cui || '',
    adresa: company.company_address || company.adresa || company.address || '',
    reprezentant: company.company_representative || company.reprezentant || company.director || 'Director General',
    functie_reprezentant: company.company_role || company.functie_reprezentant || 'Director General',
    nr_inregistrare: company.nr_inregistrare || company.reg_com || '',
  }
}

function identityText(employee = {}) {
  const tip = employee.act_identitate_tip || 'CI'
  const serie = String(employee.act_identitate_serie || '').toUpperCase()
  const numar = employee.act_identitate_numar || ''
  const eliberatDe = employee.act_identitate_eliberat_de || ''
  if (!serie && !numar && !eliberatDe) return ''
  return `posesor/posesoare al/a ${tip} seria ${serie || '____'} nr. ${numar || '__________'}${eliberatDe ? `, eliberat/ă de ${eliberatDe}` : ''}`
}

function publicEmployee(employee, auth, db) {
  const result = {
    ...employee,
    department_name: employee.department_name || departmentName(db, employee.department_id),
    zile_vechime: daysBetween(employee.data_angajare)
  }
  if (!authHasPermission(auth, 'hr:salary_view')) {
    delete result.salariu_baza
  }
  return result
}

function activeContractFor(hr, employeeId) {
  return hr.contracts
    .filter((contract) => String(contract.employee_id) === String(employeeId) && contract.status !== 'incetat')
    .sort((a, b) => String(b.data_start || '').localeCompare(String(a.data_start || '')))[0] || null
}

function employeeWithSalary(hr, employee) {
  const contract = activeContractFor(hr, employee.id)
  return { ...employee, salariu_baza: numberValue(contract?.salariu_baza) }
}

function romanianEaster(year) {
  const a = year % 19
  const b = year % 4
  const c = year % 7
  const d = (19 * a + 16) % 30
  const e = (2 * b + 4 * c + 6 * d) % 7
  const day = d + e + 3
  return day > 30 ? new Date(year, 4, day - 30) : new Date(year, 3, day)
}

function legalHolidays(year) {
  const fixed = [
    `${year}-01-01`, `${year}-01-02`, `${year}-01-24`, `${year}-05-01`,
    `${year}-06-01`, `${year}-08-15`, `${year}-11-30`, `${year}-12-01`,
    `${year}-12-25`, `${year}-12-26`
  ]
  const easter = romanianEaster(year)
  const goodFriday = new Date(easter.getTime() - 2 * 86400000)
  const easterMonday = new Date(easter.getTime() + 86400000)
  const pentecost = new Date(easter.getTime() + 49 * 86400000)
  const pentecostMonday = new Date(easter.getTime() + 50 * 86400000)
  return new Set([...fixed, goodFriday, easter, easterMonday, pentecost, pentecostMonday].map((date) => (
    typeof date === 'string' ? date : date.toISOString().slice(0, 10)
  )))
}

function businessDays(start, end) {
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return 0
  let count = 0
  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    const iso = date.toISOString().slice(0, 10)
    const day = date.getDay()
    if (day !== 0 && day !== 6 && !legalHolidays(date.getFullYear()).has(iso)) count += 1
  }
  return count
}

function canUseKioskSync(auth) {
  return authHasPermission(auth, 'hr:view')
    || authHasPermission(auth, 'hr:manage')
    || authHasPermission(auth, 'hr:view_own')
    || authHasPermission(auth, 'hr:leave_own')
    || authHasPermission(auth, 'hr:timesheet')
}

function canSyncLeaveForEmployee(auth, hr, employeeId) {
  if (authHasPermission(auth, 'hr:view') || authHasPermission(auth, 'hr:manage')) return true
  const ownEmployee = hr.employees.find((employee) => String(employee.user_id) === String(auth.user.id))
  return ownEmployee && String(ownEmployee.id) === String(employeeId)
}

function buildKioskLeave(body, auth, hr, fallbackUuid) {
  const employeeId = body.employee_id
  if (!employeeId) return { error: 'Angajat lipsă pentru cererea de concediu.' }
  if (!canSyncLeaveForEmployee(auth, hr, employeeId)) return { error: 'Nu poți trimite cereri pentru alt angajat.' }
  if (!body.data_start || !body.data_sfarsit) return { error: 'Completează perioada concediului.' }
  const zile = businessDays(body.data_start, body.data_sfarsit)
  if (zile <= 0) return { error: 'Perioada concediului nu este validă.' }
  return {
    item: {
      uuid: body.uuid || fallbackUuid || crypto.randomUUID(),
      employee_id: employeeId,
      tip: body.tip || 'CO',
      data_start: body.data_start,
      data_sfarsit: body.data_sfarsit,
      zile,
      motiv: body.motiv || '',
      status: 'cerut',
      created_at: body.created_at || nowIso(),
      updated_at: null,
      created_by: auth.user.id,
    }
  }
}

function authorizationView(item) {
  const zile = item.data_expirare ? Math.ceil((new Date(item.data_expirare).getTime() - Date.now()) / 86400000) : null
  return {
    ...item,
    zile_pana_expirare: zile,
    alert: zile !== null && zile < 30,
    expirat: zile !== null && zile < 0
  }
}

function regesXml(db, employee, contract) {
  const company = companySettings(db)
  return `<?xml version="1.0" encoding="utf-8"?>
<ReviSal versiune="6">
  <angajator cui="${escapeXml(company.cui || company.company_cui || '')}" denumire="${escapeXml(company.denumire || company.company_name || '')}">
    <salariat>
      <cnp>${escapeXml(employee.cnp)}</cnp>
      <nume>${escapeXml(employee.nume)}</nume>
      <prenume>${escapeXml(employee.prenume)}</prenume>
      <functie>${escapeXml(employee.functia)}</functie>
      <dataAngajare>${escapeXml(employee.data_angajare)}</dataAngajare>
      <tipContract>${escapeXml(contract.tip)}</tipContract>
      <salariu>${escapeXml(contract.salariu_baza)}</salariu>
    </salariat>
  </angajator>
</ReviSal>`
}

function saveRegesFile(uuid, xml) {
  const dir = path.join(__dirname, '../../storage/reges')
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `${uuid}.xml`)
  fs.writeFileSync(filePath, xml, 'utf8')
  return filePath
}

function parseEmployeeImport(filePath, originalName) {
  const name = String(originalName || '').toLowerCase()
  const rows = []
  if (name.endsWith('.csv')) {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean)
    const headers = String(lines.shift() || '').split(',').map((item) => item.trim())
    lines.forEach((line) => {
      const values = line.split(',').map((item) => item.trim())
      const row = {}
      headers.forEach((header, index) => { row[header] = values[index] || '' })
      rows.push(row)
    })
    return rows
  }
  const workbook = xlsx.readFile(filePath)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return xlsx.utils.sheet_to_json(sheet, { defval: '' })
}

function normalizeEmployeeImportRow(row) {
  return {
    cnp: row.CNP || row.cnp || '',
    nume: row.Nume || row.nume || '',
    prenume: row.Prenume || row.prenume || '',
    marca: row['Nr.marca'] || row['Nr. marca'] || row.marca || row.nr_marca || '',
    functia: row.Functia || row['Funcția'] || row.functia || '',
    department_id: row.Departament || row.departament || row.department_id || '',
    data_angajare: row['Data angajarii'] || row['Data angajării'] || row.data_angajare || ''
  }
}

function hrUsers(db) {
  return (db.users || db.core?.users || []).filter((user) => {
    const role = String(user.role || user.rol || '').toLowerCase()
    const dept = String(user.department || user.department_cod || user.departmentName || '').toLowerCase()
    return role === 'hr' || dept === 'hr' || authHasPermission({ user, db }, 'hr:manage')
  })
}

// ─── TURE & PROGRAM ─────────────────────────────────────────────────────────
router.get('/hr/tures', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:view')) return
    if (isMssqlMode()) {
      return sendJson(res, 200, mssqlArray(`SELECT * FROM hr.tures WHERE activ = 1 ORDER BY ora_start, nume FOR JSON PATH;`))
    }
    const db = readDb()
    const hr = ensureHrDb(db)
    const before = hr.tures.length
    const tures = ensureDefaultTures(hr)
    if (!before) writeDb(db)
    sendJson(res, 200, tures.filter((item) => item.activ !== false))
  } catch (error) { next(error) }
})

router.post('/hr/tures', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    const body = req.body || {}
    if (!body.nume) return sendJson(res, 422, { error: 'Numele turei este obligatoriu.' })
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(`
INSERT INTO hr.tures (uuid,nume,ora_start,ora_sfarsit,ore_normale,culoare,activ)
VALUES (JSON_VALUE(@p,'$.uuid'),JSON_VALUE(@p,'$.nume'),NULLIF(JSON_VALUE(@p,'$.ora_start'),''),NULLIF(JSON_VALUE(@p,'$.ora_sfarsit'),''),COALESCE(TRY_CONVERT(decimal(4,2),JSON_VALUE(@p,'$.ore_normale')),8),COALESCE(NULLIF(JSON_VALUE(@p,'$.culoare'),''),N'#3B82F6'),1);
SELECT TOP 1 * FROM hr.tures WHERE id=SCOPE_IDENTITY() FOR JSON PATH;`, { ...body, uuid: crypto.randomUUID() })
      addAudit(db, auth.user, 'hr_tura_created', body.nume)
      writeDb(db)
      return sendJson(res, 201, item)
    }
    const hr = ensureHrDb(db)
    const item = {
      id: nextId(hr.tures),
      uuid: crypto.randomUUID(),
      nume: body.nume,
      ora_start: body.ora_start || '08:00',
      ora_sfarsit: body.ora_sfarsit || '16:00',
      ore_normale: numberValue(body.ore_normale, 8),
      culoare: body.culoare || '#3B82F6',
      activ: true,
      created_at: nowIso(),
      updated_at: null,
    }
    hr.tures.push(item)
    addAudit(db, auth.user, 'hr_tura_created', item.nume)
    writeDb(db)
    sendJson(res, 201, item)
  } catch (error) { next(error) }
})

router.put('/hr/tures/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    const body = req.body || {}
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(`
UPDATE hr.tures SET
  nume=COALESCE(NULLIF(JSON_VALUE(@p,'$.nume'),''),nume),
  ora_start=COALESCE(NULLIF(JSON_VALUE(@p,'$.ora_start'),''),ora_start),
  ora_sfarsit=COALESCE(NULLIF(JSON_VALUE(@p,'$.ora_sfarsit'),''),ora_sfarsit),
  ore_normale=COALESCE(TRY_CONVERT(decimal(4,2),NULLIF(JSON_VALUE(@p,'$.ore_normale'),'')),ore_normale),
  culoare=COALESCE(NULLIF(JSON_VALUE(@p,'$.culoare'),''),culoare),
  activ=COALESCE(TRY_CONVERT(bit,NULLIF(JSON_VALUE(@p,'$.activ'),'')),activ),
  updated_at=sysdatetime()
WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id'));
SELECT TOP 1 * FROM hr.tures WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')) FOR JSON PATH;`, { ...body, id: req.params.id })
      if (!item) return sendJson(res, 404, { error: 'Tura nu a fost gasita.' })
      addAudit(db, auth.user, 'hr_tura_updated', req.params.id)
      writeDb(db)
      return sendJson(res, 200, item)
    }
    const hr = ensureHrDb(db)
    const item = hr.tures.find((tura) => String(tura.id) === String(req.params.id))
    if (!item) return sendJson(res, 404, { error: 'Tura nu a fost gasita.' })
    ;['nume','ora_start','ora_sfarsit','culoare','activ'].forEach((key) => {
      if (body[key] !== undefined) item[key] = body[key]
    })
    if (body.ore_normale !== undefined) item.ore_normale = numberValue(body.ore_normale, 8)
    item.updated_at = nowIso()
    addAudit(db, auth.user, 'hr_tura_updated', item.nume)
    writeDb(db)
    sendJson(res, 200, item)
  } catch (error) { next(error) }
})

router.delete('/hr/tures/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(`UPDATE hr.tures SET activ=0, updated_at=sysdatetime() WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')); SELECT TOP 1 * FROM hr.tures WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')) FOR JSON PATH;`, req.params)
      if (!item) return sendJson(res, 404, { error: 'Tura nu a fost gasita.' })
      addAudit(db, auth.user, 'hr_tura_deleted', req.params.id)
      writeDb(db)
      return sendJson(res, 200, { ok: true })
    }
    const hr = ensureHrDb(db)
    const item = hr.tures.find((tura) => String(tura.id) === String(req.params.id))
    if (!item) return sendJson(res, 404, { error: 'Tura nu a fost gasita.' })
    item.activ = false
    item.updated_at = nowIso()
    addAudit(db, auth.user, 'hr_tura_deleted', item.nume)
    writeDb(db)
    sendJson(res, 200, { ok: true })
  } catch (error) { next(error) }
})

router.get('/hr/schedule', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:view')) return
    const luna = String(req.query.luna || todayIso().slice(0, 7)).slice(0, 7)
    const department = String(req.query.department || req.query.dept_id || '')
    if (isMssqlMode()) {
      const employees = mssqlArray(`
SELECT id,nume,prenume,functia,department_id,department_cod,photo_url
FROM hr.employees
WHERE activ=1 AND (NULLIF(JSON_VALUE(@p,'$.department'),'') IS NULL OR department_id=JSON_VALUE(@p,'$.department') OR department_cod=JSON_VALUE(@p,'$.department'))
ORDER BY nume,prenume FOR JSON PATH;`, { department })
      const rows = mssqlArray(`SELECT employee_id,data,tura_id FROM hr.schedules WHERE FORMAT(data,'yyyy-MM')=JSON_VALUE(@p,'$.luna') FOR JSON PATH;`, { luna })
      const schedule = {}
      rows.forEach((row) => { schedule[`${row.employee_id}:${String(row.data).slice(0, 10)}`] = row.tura_id })
      return sendJson(res, 200, { employees, schedule })
    }
    const db = readDb()
    const hr = ensureHrDb(db)
    let employees = hr.employees.filter((employee) => employee.activ !== false)
    if (department) employees = employees.filter((employee) => (
      String(employee.department_id || '') === department ||
      String(employee.department_cod || '') === department ||
      String(employee.department_name || '') === department
    ))
    const employeeIds = new Set(employees.map((employee) => String(employee.id)))
    const schedule = {}
    hr.schedules
      .filter((item) => employeeIds.has(String(item.employee_id)) && String(item.data || '').startsWith(luna))
      .forEach((item) => { schedule[`${item.employee_id}:${item.data}`] = item.tura_id })
    sendJson(res, 200, { employees: employees.map((employee) => publicEmployee(employee, auth, db)), schedule })
  } catch (error) { next(error) }
})

router.post('/hr/schedule', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:timesheet')) return
    const body = req.body || {}
    if (!body.employee_id || !body.data) return sendJson(res, 422, { error: 'Angajatul si data sunt obligatorii.' })
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(`
DECLARE @id int;
SELECT @id=id FROM hr.schedules WHERE employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')) AND data=TRY_CONVERT(date,JSON_VALUE(@p,'$.data'));
IF @id IS NULL
BEGIN
  INSERT INTO hr.schedules (uuid,employee_id,data,tura_id,department)
  VALUES (JSON_VALUE(@p,'$.uuid'),TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')),TRY_CONVERT(date,JSON_VALUE(@p,'$.data')),TRY_CONVERT(int,NULLIF(JSON_VALUE(@p,'$.tura_id'),'')),NULLIF(JSON_VALUE(@p,'$.department'),''));
  SET @id=SCOPE_IDENTITY();
END
ELSE
  UPDATE hr.schedules SET tura_id=TRY_CONVERT(int,NULLIF(JSON_VALUE(@p,'$.tura_id'),'')), department=NULLIF(JSON_VALUE(@p,'$.department'),''), updated_at=sysdatetime() WHERE id=@id;
SELECT TOP 1 * FROM hr.schedules WHERE id=@id FOR JSON PATH;`, { ...body, uuid: crypto.randomUUID() })
      addAudit(db, auth.user, 'hr_schedule_set', `${body.employee_id}/${body.data}`)
      writeDb(db)
      return sendJson(res, 200, item)
    }
    const hr = ensureHrDb(db)
    const employee = hr.employees.find((item) => String(item.id) === String(body.employee_id))
    if (!employee) return sendJson(res, 404, { error: 'Angajatul nu a fost gasit.' })
    let item = hr.schedules.find((row) => String(row.employee_id) === String(body.employee_id) && row.data === body.data)
    if (!item) {
      item = { id: nextId(hr.schedules), uuid: crypto.randomUUID(), employee_id: body.employee_id, data: body.data, created_at: nowIso(), updated_at: null }
      hr.schedules.push(item)
    }
    item.tura_id = body.tura_id || null
    item.department = body.department || employee.department_id || employee.department_cod || null
    item.updated_at = nowIso()
    addAudit(db, auth.user, 'hr_schedule_set', `${body.employee_id}/${body.data}`)
    writeDb(db)
    sendJson(res, 200, item)
  } catch (error) { next(error) }
})

router.post('/hr/schedule/bulk', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:timesheet')) return
    const body = req.body || {}
    const dates = dateRange(body.data_start, body.data_sfarsit)
    if (!body.employee_id || !dates.length) return sendJson(res, 422, { error: 'Angajatul si intervalul sunt obligatorii.' })
    const db = readDb()
    if (isMssqlMode()) {
      dates.forEach((data) => {
        mssqlObject(`
DECLARE @id int;
SELECT @id=id FROM hr.schedules WHERE employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')) AND data=TRY_CONVERT(date,JSON_VALUE(@p,'$.data'));
IF @id IS NULL INSERT INTO hr.schedules (uuid,employee_id,data,tura_id,department) VALUES (JSON_VALUE(@p,'$.uuid'),TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')),TRY_CONVERT(date,JSON_VALUE(@p,'$.data')),TRY_CONVERT(int,NULLIF(JSON_VALUE(@p,'$.tura_id'),'')),NULLIF(JSON_VALUE(@p,'$.department'),''));
ELSE UPDATE hr.schedules SET tura_id=TRY_CONVERT(int,NULLIF(JSON_VALUE(@p,'$.tura_id'),'')), updated_at=sysdatetime() WHERE id=@id;
SELECT TOP 1 id FROM hr.schedules WHERE employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')) AND data=TRY_CONVERT(date,JSON_VALUE(@p,'$.data')) FOR JSON PATH;`, { ...body, data, uuid: crypto.randomUUID() })
      })
      addAudit(db, auth.user, 'hr_schedule_bulk_set', `${body.employee_id}/${body.data_start}-${body.data_sfarsit}`)
      writeDb(db)
      return sendJson(res, 200, { ok: true, count: dates.length })
    }
    const hr = ensureHrDb(db)
    const employee = hr.employees.find((item) => String(item.id) === String(body.employee_id))
    if (!employee) return sendJson(res, 404, { error: 'Angajatul nu a fost gasit.' })
    dates.forEach((data) => {
      let item = hr.schedules.find((row) => String(row.employee_id) === String(body.employee_id) && row.data === data)
      if (!item) {
        item = { id: nextId(hr.schedules), uuid: crypto.randomUUID(), employee_id: body.employee_id, data, created_at: nowIso(), updated_at: null }
        hr.schedules.push(item)
      }
      item.tura_id = body.tura_id || null
      item.department = body.department || employee.department_id || employee.department_cod || null
      item.updated_at = nowIso()
    })
    addAudit(db, auth.user, 'hr_schedule_bulk_set', `${body.employee_id}/${body.data_start}-${body.data_sfarsit}`)
    writeDb(db)
    sendJson(res, 200, { ok: true, count: dates.length })
  } catch (error) { next(error) }
})


// ─── TICHETE DE MASĂ ────────────────────────────────────────────────────────
function mealTicketRows(db, luna, department = '') {
  const hr = ensureHrDb(db)
  const value = numberValue(db.settings?.valoare_tichet_masa, 40)
  const employees = hr.employees.filter((employee) => {
    if (employee.activ === false || employee.activ === 0) return false
    if (!department) return true
    return String(employee.department_id || '') === String(department) ||
      String(employee.department_cod || '') === String(department) ||
      String(employee.department_name || '') === String(department)
  })
  return employees.map((employee) => {
    const worked = new Set(hr.timeSheets
      .filter((item) => String(item.employee_id) === String(employee.id) && String(item.data || '').startsWith(luna))
      .filter((item) => String(item.tip || '').toLowerCase() === 'lucru' && (item.validat === true || item.validat === 1 || item.validat === '1'))
      .map((item) => item.data)).size
    const leaves = hr.leaveRequests.filter((item) => (
      String(item.employee_id) === String(employee.id) &&
      ['aprobata', 'aprobat'].includes(String(item.status || '').toLowerCase()) &&
      String(item.data_start || '').slice(0, 7) <= luna &&
      String(item.data_sfarsit || '').slice(0, 7) >= luna
    ))
    const monthEnd = `${luna}-${String(daysInMonth(luna)).padStart(2, '0')}`
    const clippedDays = (item) => businessDays(
      String(item.data_start || '').slice(0, 7) < luna ? `${luna}-01` : item.data_start,
      String(item.data_sfarsit || '').slice(0, 7) > luna ? monthEnd : item.data_sfarsit
    )
    const zile_co = leaves
      .filter((item) => ['co', 'concediu_odihna', 'concediu'].includes(String(item.tip || '').toLowerCase()))
      .reduce((sum, item) => sum + clippedDays(item), 0)
    const zile_cm = leaves
      .filter((item) => ['cm', 'concediu_medical', 'medical'].includes(String(item.tip || '').toLowerCase()))
      .reduce((sum, item) => sum + clippedDays(item), 0)
    const tichete = Math.max(0, worked - zile_co - zile_cm)
    return {
      employee_id: employee.id,
      nume: employee.nume || '',
      prenume: employee.prenume || '',
      cnp: employee.cnp || '',
      angajat: employeeName(employee),
      department_id: employee.department_id || null,
      department_name: employee.department_name || departmentName(db, employee.department_id),
      zile_lucrate: worked,
      zile_co,
      zile_cm,
      tichete,
      valoare_tichet: value,
      valoare: Math.round(tichete * value * 100) / 100,
    }
  })
}

router.get('/hr/meal-tickets/config', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:view')) return
    const settings = readDb().settings || {}
    sendJson(res, 200, { valoare_tichet: numberValue(settings.valoare_tichet_masa, 40) })
  } catch (error) { next(error) }
})

router.post('/hr/meal-tickets/config', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    const db = readDb()
    db.settings = db.settings || {}
    db.settings.valoare_tichet_masa = numberValue(req.body?.valoare_tichet, 40)
    addAudit(db, auth.user, 'hr_meal_ticket_config_updated', db.settings.valoare_tichet_masa)
    writeDb(db)
    sendJson(res, 200, { valoare_tichet: db.settings.valoare_tichet_masa })
  } catch (error) { next(error) }
})

router.get('/hr/meal-tickets', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:view')) return
    const luna = String(req.query.luna || todayIso().slice(0, 7)).slice(0, 7)
    const department = String(req.query.department || req.query.dept_id || '')
    const db = readDb()
    if (isMssqlMode()) {
      const value = numberValue(db.settings?.valoare_tichet_masa, 40)
      const rows = mssqlArray(`
SELECT
  e.id AS employee_id, e.nume, e.prenume, e.cnp,
  CONCAT(e.nume, N' ', e.prenume) AS angajat,
  e.department_id,
  d.denumire AS department_name,
  COUNT(DISTINCT CASE WHEN ts.tip=N'lucru' AND ts.validat=1 THEN ts.data END) AS zile_lucrate,
  COALESCE((
    SELECT SUM(lr.zile) FROM hr.leave_requests lr
    WHERE lr.employee_id=e.id AND lr.status IN (N'aprobata', N'aprobat')
      AND lr.tip IN (N'CO', N'concediu_odihna')
      AND FORMAT(lr.data_start,'yyyy-MM') <= JSON_VALUE(@p,'$.luna')
      AND FORMAT(lr.data_sfarsit,'yyyy-MM') >= JSON_VALUE(@p,'$.luna')
  ), 0) AS zile_co,
  COALESCE((
    SELECT SUM(lr.zile) FROM hr.leave_requests lr
    WHERE lr.employee_id=e.id AND lr.status IN (N'aprobata', N'aprobat')
      AND lr.tip IN (N'CM', N'concediu_medical')
      AND FORMAT(lr.data_start,'yyyy-MM') <= JSON_VALUE(@p,'$.luna')
      AND FORMAT(lr.data_sfarsit,'yyyy-MM') >= JSON_VALUE(@p,'$.luna')
  ), 0) AS zile_cm
FROM hr.employees e
LEFT JOIN core.departments d ON d.id=e.department_id
LEFT JOIN hr.time_sheets ts ON ts.employee_id=e.id AND FORMAT(ts.data,'yyyy-MM')=JSON_VALUE(@p,'$.luna')
WHERE e.activ=1 AND (NULLIF(JSON_VALUE(@p,'$.department'),'') IS NULL OR e.department_id=JSON_VALUE(@p,'$.department') OR e.department_cod=JSON_VALUE(@p,'$.department'))
GROUP BY e.id,e.nume,e.prenume,e.cnp,e.department_id,d.denumire
ORDER BY e.nume,e.prenume
FOR JSON PATH;`, { luna, department }).map((row) => {
        const tichete = Math.max(0, numberValue(row.zile_lucrate) - numberValue(row.zile_co) - numberValue(row.zile_cm))
        return { ...row, tichete, valoare_tichet: value, valoare: Math.round(tichete * value * 100) / 100 }
      })
      return sendJson(res, 200, { luna, valoare_tichet: value, rows })
    }
    const rows = mealTicketRows(db, luna, department)
    sendJson(res, 200, { luna, valoare_tichet: numberValue(db.settings?.valoare_tichet_masa, 40), rows })
  } catch (error) { next(error) }
})

router.get('/hr/meal-tickets/export', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:view')) return
    const luna = String(req.query.luna || todayIso().slice(0, 7)).slice(0, 7)
    const db = readDb()
    let rows = mealTicketRows(db, luna, String(req.query.department || req.query.dept_id || ''))
    if (isMssqlMode()) {
      const department = String(req.query.department || req.query.dept_id || '')
      const value = numberValue(db.settings?.valoare_tichet_masa, 40)
      rows = mssqlArray(`
SELECT e.id AS employee_id, e.nume, e.prenume, e.cnp,
  COUNT(DISTINCT CASE WHEN ts.tip=N'lucru' AND ts.validat=1 THEN ts.data END) AS zile_lucrate,
  0 AS zile_co, 0 AS zile_cm
FROM hr.employees e
LEFT JOIN hr.time_sheets ts ON ts.employee_id=e.id AND FORMAT(ts.data,'yyyy-MM')=JSON_VALUE(@p,'$.luna')
WHERE e.activ=1 AND (NULLIF(JSON_VALUE(@p,'$.department'),'') IS NULL OR e.department_id=JSON_VALUE(@p,'$.department') OR e.department_cod=JSON_VALUE(@p,'$.department'))
GROUP BY e.id,e.nume,e.prenume,e.cnp
ORDER BY e.nume,e.prenume
FOR JSON PATH;`, { luna, department }).map((row) => {
        const tichete = Math.max(0, numberValue(row.zile_lucrate) - numberValue(row.zile_co) - numberValue(row.zile_cm))
        return { ...row, tichete, valoare: Math.round(tichete * value * 100) / 100 }
      })
    }
    const csvRows = ['nume;prenume;cnp;nr_tichete;valoare_totala']
    rows.forEach((row) => {
      csvRows.push([row.nume, row.prenume, row.cnp, row.tichete, row.valoare].map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';'))
    })
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="tichete-masa-${luna}.csv"`)
    res.send(`\ufeff${csvRows.join('\r\n')}`)
  } catch (error) { next(error) }
})

// ─── BANCĂ DE ORE ───────────────────────────────────────────────────────────
function overtimeBankFor(db, employeeId) {
  const hr = ensureHrDb(db)
  const byMonth = new Map()
  hr.timeSheets
    .filter((item) => String(item.employee_id) === String(employeeId))
    .forEach((item) => {
      const luna = String(item.data || '').slice(0, 7)
      if (!luna) return
      const current = byMonth.get(luna) || { luna, ore_suplimentare: 0, ore_compensate: 0, sold_luna: 0 }
      current.ore_suplimentare += numberValue(item.ore_suplimentare_s1) + numberValue(item.ore_suplimentare_s2) + numberValue(item.ore_suplimentare)
      byMonth.set(luna, current)
    })
  hr.overtimeCompensations
    .filter((item) => String(item.employee_id) === String(employeeId))
    .forEach((item) => {
      const luna = String(item.data || '').slice(0, 7) || todayIso().slice(0, 7)
      const current = byMonth.get(luna) || { luna, ore_suplimentare: 0, ore_compensate: 0, sold_luna: 0 }
      current.ore_compensate += numberValue(item.ore)
      byMonth.set(luna, current)
    })
  let sold = 0
  const istoric = [...byMonth.values()].sort((a, b) => a.luna.localeCompare(b.luna)).map((item) => {
    sold += item.ore_suplimentare - item.ore_compensate
    return { ...item, sold_luna: Math.round(sold * 100) / 100 }
  })
  const ore_acumulate_total = istoric.reduce((sum, item) => sum + numberValue(item.ore_suplimentare), 0)
  const ore_compensate_total = istoric.reduce((sum, item) => sum + numberValue(item.ore_compensate), 0)
  return {
    ore_acumulate_total: Math.round(ore_acumulate_total * 100) / 100,
    ore_compensate_total: Math.round(ore_compensate_total * 100) / 100,
    sold_curent: Math.round((ore_acumulate_total - ore_compensate_total) * 100) / 100,
    istoric: istoric.reverse(),
  }
}

router.get('/hr/overtime-bank', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:timesheet')) return
    if (!req.query.employee_id) return sendJson(res, 422, { error: 'employee_id este obligatoriu.' })
    const db = readDb()
    if (isMssqlMode()) {
      const rows = mssqlArray(`
SELECT FORMAT(data,'yyyy-MM') AS luna,
  COALESCE(SUM(ore_suplimentare_s1 + ore_suplimentare_s2), 0) AS ore_suplimentare,
  0 AS ore_compensate
FROM hr.time_sheets
WHERE employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id'))
GROUP BY FORMAT(data,'yyyy-MM')
ORDER BY luna
FOR JSON PATH;`, req.query)
      const compensations = mssqlArray(`
SELECT FORMAT(data,'yyyy-MM') AS luna, COALESCE(SUM(ore), 0) AS ore_compensate
FROM hr.overtime_compensations
WHERE employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id'))
GROUP BY FORMAT(data,'yyyy-MM')
FOR JSON PATH;`, req.query)
      compensations.forEach((item) => {
        const existing = rows.find((row) => row.luna === item.luna)
        if (existing) existing.ore_compensate = numberValue(item.ore_compensate)
        else rows.push({ luna: item.luna, ore_suplimentare: 0, ore_compensate: numberValue(item.ore_compensate) })
      })
      rows.sort((a, b) => String(a.luna).localeCompare(String(b.luna)))
      let sold = 0
      const istoric = rows.map((row) => {
        sold += numberValue(row.ore_suplimentare) - numberValue(row.ore_compensate)
        return { ...row, sold_luna: Math.round(sold * 100) / 100 }
      }).reverse()
      const ore_acumulate_total = rows.reduce((sum, row) => sum + numberValue(row.ore_suplimentare), 0)
      const ore_compensate_total = rows.reduce((sum, row) => sum + numberValue(row.ore_compensate), 0)
      return sendJson(res, 200, { ore_acumulate_total, ore_compensate_total, sold_curent: ore_acumulate_total - ore_compensate_total, istoric })
    }
    sendJson(res, 200, overtimeBankFor(db, req.query.employee_id))
  } catch (error) { next(error) }
})

router.post('/hr/overtime-bank/compensate', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:timesheet')) return
    const body = req.body || {}
    if (!body.employee_id || !numberValue(body.ore)) return sendJson(res, 422, { error: 'Angajatul si orele sunt obligatorii.' })
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(`
INSERT INTO hr.overtime_compensations (uuid,employee_id,ore,tip,data,created_by)
VALUES (JSON_VALUE(@p,'$.uuid'),TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')),TRY_CONVERT(decimal(6,2),JSON_VALUE(@p,'$.ore')),JSON_VALUE(@p,'$.tip'),TRY_CONVERT(date,JSON_VALUE(@p,'$.data')),JSON_VALUE(@p,'$.created_by'));
SELECT TOP 1 * FROM hr.overtime_compensations WHERE id=SCOPE_IDENTITY() FOR JSON PATH;`, { ...body, uuid: crypto.randomUUID(), data: body.data || todayIso(), tip: body.tip || 'timp_liber', created_by: auth.user.id })
      addAudit(db, auth.user, 'hr_overtime_compensated', `${body.employee_id}/${body.ore}`)
      writeDb(db)
      return sendJson(res, 201, item)
    }
    const hr = ensureHrDb(db)
    const item = {
      id: nextId(hr.overtimeCompensations),
      uuid: crypto.randomUUID(),
      employee_id: body.employee_id,
      ore: numberValue(body.ore),
      tip: body.tip || 'timp_liber',
      data: body.data || todayIso(),
      created_by: auth.user.id,
      created_at: nowIso(),
    }
    hr.overtimeCompensations.push(item)
    addAudit(db, auth.user, 'hr_overtime_compensated', `${body.employee_id}/${item.ore}`)
    writeDb(db)
    sendJson(res, 201, item)
  } catch (error) { next(error) }
})

router.get('/hr/employees', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    const hasFullView = authHasPermission(auth, 'hr:view')
    const hasDeptTimesheet = authHasPermission(auth, 'hr:timesheet_dept')
    const hasOwnView = authHasPermission(auth, 'hr:view_own')
    if (!hasFullView && !hasOwnView && !hasDeptTimesheet) return requirePermission(auth, res, 'hr:view')
    const ownDept = auth.user.departmentId || auth.user.department_id || auth.user.dept_id || auth.user.department || auth.user.departament || ''

    if (isMssqlMode()) {
      const rows = mssqlArray(`
SELECT
  e.*,
  d.denumire AS department_name,
  DATEDIFF(day, e.data_angajare, GETDATE()) AS zile_vechime,
  c.salariu_baza
FROM hr.employees e
LEFT JOIN core.departments d ON d.id = e.department_id
OUTER APPLY (
  SELECT TOP 1 salariu_baza
  FROM hr.contracts c
  WHERE c.employee_id = e.id AND c.status <> N'incetat'
  ORDER BY c.data_start DESC
) c
WHERE (NULLIF(JSON_VALUE(@p, '$.activ'), '') IS NULL OR e.activ = TRY_CONVERT(bit, JSON_VALUE(@p, '$.activ')))
AND (NULLIF(JSON_VALUE(@p, '$.dept_id'), '') IS NULL OR e.department_id = JSON_VALUE(@p, '$.dept_id'))
AND (NULLIF(JSON_VALUE(@p, '$.functia'), '') IS NULL OR e.functia LIKE N'%' + JSON_VALUE(@p, '$.functia') + N'%')
${!hasFullView && hasDeptTimesheet && ownDept ? `AND (e.department_id = JSON_VALUE(@p, '$.ownDept') OR d.denumire = JSON_VALUE(@p, '$.ownDept'))` : ''}
${!hasFullView && !hasDeptTimesheet ? `AND e.user_id = JSON_VALUE(@p, '$.userId')` : ''}
ORDER BY e.nume, e.prenume
FOR JSON PATH;
`, { ...req.query, ownDept, userId: String(auth.user.id) })
      return sendJson(res, 200, rows.map((row) => publicEmployee(row, auth, auth.db)))
    }

    const db = readDb()
    const hr = ensureHrDb(db)
    let employees = hr.employees.map((employee) => employeeWithSalary(hr, employee))
    if (!hasFullView && hasDeptTimesheet && ownDept) {
      employees = employees.filter((emp) => [emp.department_id, emp.dept_id, emp.department_name, emp.department].some(value => String(value || '') === String(ownDept)))
    } else if (!hasFullView) {
      employees = employees.filter((emp) => String(emp.user_id) === String(auth.user.id))
    }
    if (req.query.activ !== undefined) employees = employees.filter((item) => String(item.activ ? 1 : 0) === String(req.query.activ))
    if (req.query.dept_id) employees = employees.filter((item) => String(item.department_id) === String(req.query.dept_id))
    if (req.query.functia) employees = employees.filter((item) => String(item.functia || '').toLowerCase().includes(String(req.query.functia).toLowerCase()))
    sendJson(res, 200, employees.map((employee) => publicEmployee(employee, auth, db)))
  } catch (error) {
    next(error)
  }
})

router.post('/hr/employees', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    const body = req.body || {}
    const cnpInfo = body.cnp ? valideazaCNP(body.cnp) : null
    if (body.cnp && !cnpInfo.valid) return sendJson(res, 422, { error: cnpInfo.eroare || 'CNP invalid.' })
    if (!isValidRomanianIban(body.iban)) return sendJson(res, 422, { error: 'IBAN invalid. Folosește formatul RO urmat de 22 caractere.' })

    const db = readDb()
    if (isMssqlMode()) {
      const duplicate = mssqlObject(`
SELECT TOP 1 id
FROM hr.employees
WHERE cnp = JSON_VALUE(@p, '$.cnp')
OR (NULLIF(JSON_VALUE(@p, '$.marca'), '') IS NOT NULL AND marca = JSON_VALUE(@p, '$.marca'))
FOR JSON PATH;
`, body)
      if (duplicate) return sendJson(res, 409, { error: 'Exista deja un angajat cu acest CNP sau numar de marca.' })
      const created = mssqlObject(`
INSERT INTO hr.employees (
  uuid, user_id, company_id, marca, nume, prenume, cnp, email, telefon,
  functia, department_id, data_angajare, data_plecare, activ,
  sex, data_nasterii, varsta, department_cod, tip_contract,
  adresa, stare_civila, nr_copii_intretinere, casa_sanatate,
  act_identitate_tip, act_identitate_serie, act_identitate_numar,
  act_identitate_eliberat_de, act_identitate_data_eliberare, act_identitate_valabil_pana,
  functie_cor, nivel_studii, norma_ore_zi, iban, deducere_personala,
  data_expirare_contract, data_expirare_permis, data_expirare_iscir,
  permis_conducere_categorii, permis_conducere_expira, apt_medical_expira,
  adeverinta_medicala, acord_gdpr, data_acord_gdpr
)
VALUES (
  JSON_VALUE(@p, '$.uuid'),
  NULLIF(JSON_VALUE(@p, '$.user_id'), ''),
  TRY_CONVERT(int, JSON_VALUE(@p, '$.company_id')),
  NULLIF(JSON_VALUE(@p, '$.marca'), ''),
  JSON_VALUE(@p, '$.nume'),
  JSON_VALUE(@p, '$.prenume'),
  NULLIF(JSON_VALUE(@p, '$.cnp'), ''),
  NULLIF(JSON_VALUE(@p, '$.email'), ''),
  NULLIF(JSON_VALUE(@p, '$.telefon'), ''),
  NULLIF(JSON_VALUE(@p, '$.functia'), ''),
  NULLIF(JSON_VALUE(@p, '$.department_id'), ''),
  TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.data_angajare'), '')),
  TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.data_plecare'), '')),
  COALESCE(TRY_CONVERT(bit, JSON_VALUE(@p, '$.activ')), 1),
  NULLIF(JSON_VALUE(@p, '$.sex'), ''),
  TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.data_nasterii'), '')),
  TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.varsta'), '')),
  NULLIF(JSON_VALUE(@p, '$.department_cod'), ''),
  NULLIF(JSON_VALUE(@p, '$.tip_contract'), ''),
  NULLIF(JSON_VALUE(@p, '$.adresa'), ''),
  NULLIF(JSON_VALUE(@p, '$.stare_civila'), ''),
  COALESCE(TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.nr_copii_intretinere'), '')), 0),
  NULLIF(JSON_VALUE(@p, '$.casa_sanatate'), ''),
  COALESCE(NULLIF(JSON_VALUE(@p, '$.act_identitate_tip'), ''), N'CI'),
  UPPER(LEFT(NULLIF(JSON_VALUE(@p, '$.act_identitate_serie'), ''), 5)),
  LEFT(NULLIF(JSON_VALUE(@p, '$.act_identitate_numar'), ''), 10),
  NULLIF(JSON_VALUE(@p, '$.act_identitate_eliberat_de'), ''),
  TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.act_identitate_data_eliberare'), '')),
  TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.act_identitate_valabil_pana'), '')),
  NULLIF(JSON_VALUE(@p, '$.functie_cor'), ''),
  NULLIF(JSON_VALUE(@p, '$.nivel_studii'), ''),
  COALESCE(TRY_CONVERT(decimal(4,2), NULLIF(JSON_VALUE(@p, '$.norma_ore_zi'), '')), 8),
  NULLIF(JSON_VALUE(@p, '$.iban'), ''),
  TRY_CONVERT(decimal(10,2), NULLIF(JSON_VALUE(@p, '$.deducere_personala'), '')),
  TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.data_expirare_contract'), '')),
  TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.data_expirare_permis'), '')),
  TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.data_expirare_iscir'), '')),
  NULLIF(JSON_VALUE(@p, '$.permis_conducere_categorii'), ''),
  TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.permis_conducere_expira'), '')),
  TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.apt_medical_expira'), '')),
  TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.adeverinta_medicala'), '')),
  COALESCE(TRY_CONVERT(bit, JSON_VALUE(@p, '$.acord_gdpr')), 0),
  TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.data_acord_gdpr'), ''))
);
SELECT TOP 1 * FROM hr.employees WHERE id = SCOPE_IDENTITY() FOR JSON PATH;
`, { ...body, uuid: crypto.randomUUID(), company_id: body.company_id || auth.user.company_id || 1, sex: cnpInfo?.sex || '', data_nasterii: cnpInfo?.data_nasterii || '', varsta: cnpInfo?.varsta ?? '', department_cod: departmentCod(db, body.department_cod || body.departament || body.department_id || body.dept_id) })
      addAudit(db, auth.user, 'hr_employee_created', `${body.nume || ''} ${body.prenume || ''}`.trim())
      writeDb(db)
      return sendJson(res, 201, created)
    }

    const hr = ensureHrDb(db)
    if (body.cnp && hr.employees.some((employee) => String(employee.cnp) === String(body.cnp))) {
      return sendJson(res, 409, { error: 'Exista deja un angajat cu acest CNP.' })
    }
    if (body.marca && hr.employees.some((employee) => String(employee.marca) === String(body.marca))) {
      return sendJson(res, 409, { error: 'Exista deja un angajat cu acest numar de marca.' })
    }
    const employee = {
      id: nextId(hr.employees),
      uuid: crypto.randomUUID(),
      user_id: body.user_id || null,
      company_id: body.company_id || auth.user.company_id || 1,
      marca: body.marca || null,
      nume: body.nume,
      prenume: body.prenume,
      cnp: body.cnp || null,
      email: body.email || null,
      telefon: body.telefon || null,
      functia: body.functia || null,
      department_id: body.department_id || body.dept_id || null,
      department_cod: departmentCod(db, body.department_cod || body.departament || body.department_id || body.dept_id),
      sex: cnpInfo?.sex || body.sex || null,
      data_nasterii: cnpInfo?.data_nasterii || body.data_nasterii || null,
      varsta: cnpInfo?.varsta ?? body.varsta ?? null,
      tip_contract: body.tip_contract || body.tipContract || null,
      data_angajare: body.data_angajare || null,
      data_plecare: body.data_plecare || null,
      activ: body.activ !== false,
      adresa: body.adresa || null,
      stare_civila: body.stare_civila || null,
      nr_copii_intretinere: numberValue(body.nr_copii_intretinere),
      casa_sanatate: body.casa_sanatate || null,
      act_identitate_tip: body.act_identitate_tip || 'CI',
      act_identitate_serie: String(body.act_identitate_serie || '').toUpperCase().slice(0, 5) || null,
      act_identitate_numar: String(body.act_identitate_numar || '').slice(0, 10) || null,
      act_identitate_eliberat_de: body.act_identitate_eliberat_de || null,
      act_identitate_data_eliberare: body.act_identitate_data_eliberare || null,
      act_identitate_valabil_pana: body.act_identitate_valabil_pana || null,
      functie_cor: body.functie_cor || null,
      nivel_studii: body.nivel_studii || null,
      norma_ore_zi: numberValue(body.norma_ore_zi, 8),
      iban: body.iban || null,
      deducere_personala: body.deducere_personala != null ? numberValue(body.deducere_personala) : null,
      data_expirare_contract: body.data_expirare_contract || null,
      data_expirare_permis: body.data_expirare_permis || null,
      data_expirare_iscir: body.data_expirare_iscir || null,
      permis_conducere_categorii: body.permis_conducere_categorii || null,
      permis_conducere_expira: body.permis_conducere_expira || null,
      apt_medical_expira: body.apt_medical_expira || null,
      adeverinta_medicala: body.adeverinta_medicala || null,
      acord_gdpr: body.acord_gdpr === true || body.acord_gdpr === 1,
      data_acord_gdpr: body.data_acord_gdpr || (body.acord_gdpr ? todayIso() : null),
      created_at: nowIso(),
      updated_at: null
    }
    hr.employees.push(employee)
    addAudit(db, auth.user, 'hr_employee_created', `${employee.nume} ${employee.prenume}`)
    writeDb(db)
    sendJson(res, 201, employee)
  } catch (error) {
    next(error)
  }
})

router.get('/hr/employees/template', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    const worksheet = xlsx.utils.aoa_to_sheet([
      ['CNP', 'Nume', 'Prenume', 'Nr.marca', 'Functia', 'Departament', 'Data angajarii'],
      ['1800101221144', 'Popescu', 'Ion', '1001', 'Muncitor calificat', 'Mecanizare', todayIso()]
    ])
    const workbook = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Angajati')
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename=template-angajati.xlsx')
    res.send(buffer)
  } catch (error) {
    next(error)
  }
})

router.post('/hr/employees/import', upload.single('file'), (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    if (!req.file) return sendJson(res, 400, { error: 'Fisierul este obligatoriu.' })
    const db = readDb()
    const rows = parseEmployeeImport(req.file.path, req.file.originalname).map(normalizeEmployeeImportRow)
    const erori = []
    const importati = []
    if (isMssqlMode()) {
      rows.forEach((row, index) => {
        const rand = index + 2
        const cnpInfo = valideazaCNP(row.cnp)
        if (!cnpInfo.valid) return erori.push({ rand, motiv: cnpInfo.eroare || 'CNP invalid' })
        if (!row.nume || !row.prenume || !row.marca) return erori.push({ rand, motiv: 'Nume, prenume si Nr.marca sunt obligatorii' })
        const duplicate = mssqlObject(`SELECT TOP 1 id FROM hr.employees WHERE cnp=JSON_VALUE(@p,'$.cnp') OR marca=JSON_VALUE(@p,'$.marca') FOR JSON PATH;`, row)
        if (duplicate) return erori.push({ rand, motiv: 'CNP sau Nr.marca duplicat' })
        const created = mssqlObject(`INSERT INTO hr.employees (uuid,marca,nume,prenume,cnp,functia,department_id,data_angajare,activ,sex,data_nasterii,varsta,department_cod,tip_contract) VALUES (JSON_VALUE(@p,'$.uuid'),JSON_VALUE(@p,'$.marca'),JSON_VALUE(@p,'$.nume'),JSON_VALUE(@p,'$.prenume'),JSON_VALUE(@p,'$.cnp'),NULLIF(JSON_VALUE(@p,'$.functia'),''),NULLIF(JSON_VALUE(@p,'$.department_id'),''),TRY_CONVERT(date,NULLIF(JSON_VALUE(@p,'$.data_angajare'),'')),1,JSON_VALUE(@p,'$.sex'),TRY_CONVERT(date,JSON_VALUE(@p,'$.data_nasterii')),TRY_CONVERT(int,JSON_VALUE(@p,'$.varsta')),JSON_VALUE(@p,'$.department_cod'),N'CIM_nedeterminat'); SELECT TOP 1 * FROM hr.employees WHERE id=SCOPE_IDENTITY() FOR JSON PATH;`, { ...row, uuid: crypto.randomUUID(), ...cnpInfo, department_cod: departmentCod(db, row.department_id) })
        if (created) importati.push(created)
      })
      fs.unlink(req.file.path, () => {})
      addAudit(db, auth.user, 'hr_employees_imported', `${importati.length} angajati`)
      writeDb(db)
      return sendJson(res, 200, { importati: importati.length, erori })
    }
    const hr = ensureHrDb(db)
    // Normalizare pentru match fără diacritice
    const normStr = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
    // Găsește angajat existent după CNP, marcă sau Nume+Prenume
    function findExisting(row) {
      if (row.cnp) {
        const byCnp = hr.employees.find(e => e.cnp && String(e.cnp) === String(row.cnp))
        if (byCnp) return byCnp
      }
      if (row.marca) {
        const byMarca = hr.employees.find(e => e.marca && String(e.marca) === String(row.marca))
        if (byMarca) return byMarca
      }
      if (row.nume && row.prenume) {
        return hr.employees.find(e =>
          normStr(e.nume) === normStr(row.nume) &&
          normStr(e.prenume) === normStr(row.prenume)
        ) || null
      }
      return null
    }
    const actualizati = []
    rows.forEach((row, index) => {
      const rand = index + 2
      if (!row.nume || !row.prenume) return erori.push({ rand, motiv: 'Nume si prenume obligatorii' })
      const cnpInfo = row.cnp ? valideazaCNP(row.cnp) : { valid: true, sex: null, data_nasterii: null, varsta: null }
      if (row.cnp && !cnpInfo.valid) return erori.push({ rand, motiv: cnpInfo.eroare || 'CNP invalid' })

      const existing = findExisting(row)
      if (existing) {
        // MERGE: completează câmpurile goale, HR importat are prioritate
        const FILL_IF_EMPTY = ['functia', 'department', 'department_id', 'department_cod',
          'data_angajare', 'email', 'telefon', 'iban', 'adresa', 'marca']
        FILL_IF_EMPTY.forEach(f => { if (!existing[f] && row[f]) existing[f] = row[f] })
        if (row.cnp && !existing.cnp) existing.cnp = row.cnp
        if (row.cnp && cnpInfo.sex) {
          existing.sex = existing.sex || cnpInfo.sex
          existing.data_nasterii = existing.data_nasterii || cnpInfo.data_nasterii
          existing.varsta = cnpInfo.varsta // vârsta se actualizează întotdeauna
        }
        existing.sursa = existing.sursa === 'autominder' ? 'autominder+hr' : 'import'
        existing.updated_at = nowIso()
        actualizati.push(existing)
        return
      }

      // Creare angajat nou
      const employee = {
        id: nextId(hr.employees),
        uuid: crypto.randomUUID(),
        ...row,
        department_cod: departmentCod(db, row.department_id),
        sex: cnpInfo.sex,
        data_nasterii: cnpInfo.data_nasterii,
        varsta: cnpInfo.varsta,
        sursa: 'import',
        activ: true,
        created_at: nowIso(),
        updated_at: null
      }
      hr.employees.push(employee)
      importati.push(employee)
    })
    fs.unlink(req.file.path, () => {})
    addAudit(db, auth.user, 'hr_employees_imported', `${importati.length} creati, ${actualizati.length} actualizati`)
    // Canale automate pentru departamentele importate/actualizate
    try {
      const toti = [...importati, ...actualizati]
      const departamente = [...new Set(toti.map(e => e.department || e.departament || '').filter(Boolean))]
      departamente.forEach(deptName => createDepartmentChannel(db, { name: deptName, icon: '👥' }))
    } catch (e) { console.warn('[messaging] Canale import:', e.message) }
    writeDb(db)
    sendJson(res, 200, { importati: importati.length, actualizati: actualizati.length, erori })
  } catch (error) {
    if (req.file?.path) fs.unlink(req.file.path, () => {})
    next(error)
  }
})

router.get('/hr/employees/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:view')) return

    if (isMssqlMode()) {
      const employee = mssqlObject(`SELECT TOP 1 * FROM hr.employees WHERE id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id')) FOR JSON PATH;`, req.params)
      if (!employee) return sendJson(res, 404, { error: 'Angajatul nu a fost gasit.' })
      const contracts = mssqlArray(`SELECT * FROM hr.contracts WHERE employee_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id')) AND status <> N'incetat' ORDER BY data_start DESC FOR JSON PATH;`, req.params)
      const authorizations = mssqlArray(`SELECT * FROM hr.authorizations WHERE employee_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id')) ORDER BY data_expirare FOR JSON PATH;`, req.params)
      const stats = mssqlObject(`
SELECT
  COUNT(*) AS zile_pontate,
  COALESCE(SUM(ore_lucrate), 0) AS ore_total,
  SUM(CASE WHEN validat = 1 THEN 1 ELSE 0 END) AS zile_validate
FROM hr.time_sheets
WHERE employee_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id'))
FOR JSON PATH;
`, req.params) || {}
      return sendJson(res, 200, { ...publicEmployee(employee, auth, auth.db), contracte_active: contracts, autorizatii: authorizations.map(authorizationView), statistici_pontaj: stats })
    }

    const db = readDb()
    const hr = ensureHrDb(db)
    const employee = hr.employees.find((item) => String(item.id) === String(req.params.id))
    if (!employee) return sendJson(res, 404, { error: 'Angajatul nu a fost gasit.' })
    const timeSheets = hr.timeSheets.filter((item) => String(item.employee_id) === String(employee.id))
    sendJson(res, 200, {
      ...publicEmployee(employeeWithSalary(hr, employee), auth, db),
      contracte_active: hr.contracts.filter((item) => String(item.employee_id) === String(employee.id) && item.status !== 'incetat'),
      autorizatii: hr.authorizations.filter((item) => String(item.employee_id) === String(employee.id)).map(authorizationView),
      statistici_pontaj: {
        zile_pontate: timeSheets.length,
        ore_total: timeSheets.reduce((sum, item) => sum + numberValue(item.ore_lucrate), 0),
        zile_validate: timeSheets.filter((item) => item.validat === true || item.validat === 1).length
      }
    })
  } catch (error) {
    next(error)
  }
})

router.patch('/hr/employees/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    const body = req.body || {}
    if (body.iban !== undefined && !isValidRomanianIban(body.iban)) return sendJson(res, 422, { error: 'IBAN invalid. Folosește formatul RO urmat de 22 caractere.' })
    const db = readDb()

    if (isMssqlMode()) {
      const emp = mssqlObject(`SELECT TOP 1 * FROM hr.employees WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')) FOR JSON PATH;`, req.params)
      if (!emp) return sendJson(res, 404, { error: 'Angajatul nu a fost gasit.' })
      mssqlObject(`UPDATE hr.employees SET
        nume=COALESCE(NULLIF(JSON_VALUE(@p,'$.nume'),''),nume),
        prenume=COALESCE(NULLIF(JSON_VALUE(@p,'$.prenume'),''),prenume),
        functia=COALESCE(NULLIF(JSON_VALUE(@p,'$.functia'),''),functia),
        email=COALESCE(NULLIF(JSON_VALUE(@p,'$.email'),''),email),
        telefon=COALESCE(NULLIF(JSON_VALUE(@p,'$.telefon'),''),telefon),
        adresa=COALESCE(NULLIF(JSON_VALUE(@p,'$.adresa'),''),adresa),
        stare_civila=COALESCE(NULLIF(JSON_VALUE(@p,'$.stare_civila'),''),stare_civila),
        nr_copii_intretinere=COALESCE(TRY_CONVERT(int,NULLIF(JSON_VALUE(@p,'$.nr_copii_intretinere'),'')),nr_copii_intretinere),
        casa_sanatate=COALESCE(NULLIF(JSON_VALUE(@p,'$.casa_sanatate'),''),casa_sanatate),
        act_identitate_tip=COALESCE(NULLIF(JSON_VALUE(@p,'$.act_identitate_tip'),''),act_identitate_tip),
        act_identitate_serie=COALESCE(UPPER(LEFT(NULLIF(JSON_VALUE(@p,'$.act_identitate_serie'),''),5)),act_identitate_serie),
        act_identitate_numar=COALESCE(LEFT(NULLIF(JSON_VALUE(@p,'$.act_identitate_numar'),''),10),act_identitate_numar),
        act_identitate_eliberat_de=COALESCE(NULLIF(JSON_VALUE(@p,'$.act_identitate_eliberat_de'),''),act_identitate_eliberat_de),
        act_identitate_data_eliberare=COALESCE(TRY_CONVERT(date,NULLIF(JSON_VALUE(@p,'$.act_identitate_data_eliberare'),'')),act_identitate_data_eliberare),
        act_identitate_valabil_pana=COALESCE(TRY_CONVERT(date,NULLIF(JSON_VALUE(@p,'$.act_identitate_valabil_pana'),'')),act_identitate_valabil_pana),
        functie_cor=COALESCE(NULLIF(JSON_VALUE(@p,'$.functie_cor'),''),functie_cor),
        nivel_studii=COALESCE(NULLIF(JSON_VALUE(@p,'$.nivel_studii'),''),nivel_studii),
        norma_ore_zi=COALESCE(TRY_CONVERT(decimal(4,2),NULLIF(JSON_VALUE(@p,'$.norma_ore_zi'),'')),norma_ore_zi),
        iban=COALESCE(NULLIF(JSON_VALUE(@p,'$.iban'),''),iban),
        deducere_personala=COALESCE(TRY_CONVERT(decimal(10,2),NULLIF(JSON_VALUE(@p,'$.deducere_personala'),'')),deducere_personala),
        data_expirare_contract=COALESCE(TRY_CONVERT(date,NULLIF(JSON_VALUE(@p,'$.data_expirare_contract'),'')),data_expirare_contract),
        data_expirare_permis=COALESCE(TRY_CONVERT(date,NULLIF(JSON_VALUE(@p,'$.data_expirare_permis'),'')),data_expirare_permis),
        data_expirare_iscir=COALESCE(TRY_CONVERT(date,NULLIF(JSON_VALUE(@p,'$.data_expirare_iscir'),'')),data_expirare_iscir),
        permis_conducere_categorii=COALESCE(NULLIF(JSON_VALUE(@p,'$.permis_conducere_categorii'),''),permis_conducere_categorii),
        permis_conducere_expira=COALESCE(TRY_CONVERT(date,NULLIF(JSON_VALUE(@p,'$.permis_conducere_expira'),'')),permis_conducere_expira),
        apt_medical_expira=COALESCE(TRY_CONVERT(date,NULLIF(JSON_VALUE(@p,'$.apt_medical_expira'),'')),apt_medical_expira),
        adeverinta_medicala=COALESCE(TRY_CONVERT(date,NULLIF(JSON_VALUE(@p,'$.adeverinta_medicala'),'')),adeverinta_medicala),
        acord_gdpr=COALESCE(TRY_CONVERT(bit,NULLIF(JSON_VALUE(@p,'$.acord_gdpr'),'')),acord_gdpr),
        data_acord_gdpr=COALESCE(TRY_CONVERT(date,NULLIF(JSON_VALUE(@p,'$.data_acord_gdpr'),'')),data_acord_gdpr),
        zile_co_drept=COALESCE(TRY_CONVERT(int,NULLIF(JSON_VALUE(@p,'$.zile_co_drept'),'')),zile_co_drept),
        salariu_baza=COALESCE(TRY_CONVERT(decimal(15,2),NULLIF(JSON_VALUE(@p,'$.salariu_baza'),'')),salariu_baza),
        activ=COALESCE(TRY_CONVERT(bit,NULLIF(JSON_VALUE(@p,'$.activ'),'')),activ),
        updated_at=sysdatetime()
        WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')) FOR JSON PATH;`, { ...body, id: req.params.id })
      const updated = mssqlObject(`SELECT TOP 1 * FROM hr.employees WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')) FOR JSON PATH;`, req.params)
      addAudit(db, auth.user, 'hr_employee_updated', req.params.id)
      writeDb(db)
      return sendJson(res, 200, publicEmployee(updated, auth, db))
    }

    const hr = ensureHrDb(db)
    const employee = hr.employees.find((item) => String(item.id) === String(req.params.id))
    if (!employee) return sendJson(res, 404, { error: 'Angajatul nu a fost gasit.' })
    const allowed = ['nume','prenume','functia','email','telefon','adresa','stare_civila','nr_copii_intretinere','casa_sanatate',
      'act_identitate_tip','act_identitate_serie','act_identitate_numar','act_identitate_eliberat_de','act_identitate_data_eliberare','act_identitate_valabil_pana',
      'functie_cor','nivel_studii','norma_ore_zi','iban','deducere_personala',
      'data_expirare_contract','data_expirare_permis','data_expirare_iscir','permis_conducere_categorii','permis_conducere_expira',
      'apt_medical_expira','adeverinta_medicala','acord_gdpr','data_acord_gdpr',
      'zile_co_drept','activ','department_id','tip_contract','data_angajare','data_plecare']
    if (authHasPermission(auth, 'hr:salary_view')) allowed.push('salariu_baza')
    allowed.forEach((key) => {
      if (body[key] === undefined) return
      if (key === 'act_identitate_serie') employee[key] = String(body[key] || '').toUpperCase().slice(0, 5)
      else if (key === 'act_identitate_numar') employee[key] = String(body[key] || '').slice(0, 10)
      else employee[key] = body[key]
    })
    employee.updated_at = nowIso()
    addAudit(db, auth.user, 'hr_employee_updated', `${employee.nume} ${employee.prenume}`)
    writeDb(db)
    sendJson(res, 200, publicEmployee(employeeWithSalary(hr, employee), auth, db))
  } catch (error) {
    next(error)
  }
})

const photoUpload = multer({
  dest: path.join(__dirname, '../../../storage/temp/'),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true)
    else cb(new Error('Doar imagini JPG/PNG/WEBP sunt acceptate.'))
  }
})

router.post('/hr/employees/:id/photo', photoUpload.single('photo'), (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    if (!req.file) return sendJson(res, 400, { error: 'Fotografia este obligatorie.' })
    const db = readDb()
    const hr = ensureHrDb(db)
    const employee = hr.employees.find((item) => String(item.id) === String(req.params.id))
    if (!employee && !isMssqlMode()) { fs.unlink(req.file.path, () => {}); return sendJson(res, 404, { error: 'Angajatul nu a fost gasit.' }) }
    const dir = path.join(__dirname, '../../../storage/angajati', String(req.params.id))
    fs.mkdirSync(dir, { recursive: true })
    const ext = req.file.mimetype === 'image/png' ? '.png' : '.jpg'
    const dest = path.join(dir, `photo${ext}`)
    // remove old photo if different extension
    ;['.jpg','.png','.webp'].forEach((e) => { try { if (e !== ext) fs.unlinkSync(path.join(dir, `photo${e}`)) } catch { /* ok */ } })
    fs.renameSync(req.file.path, dest)
    const photoUrl = `/api/hr/employees/${req.params.id}/photo`
    if (employee) { employee.photo_url = photoUrl; employee.updated_at = nowIso() }
    writeDb(db)
    addAudit(db, auth.user, 'hr_employee_photo_uploaded', req.params.id)
    sendJson(res, 200, { photo_url: photoUrl })
  } catch (error) {
    if (req.file?.path) fs.unlink(req.file.path, () => {})
    next(error)
  }
})

router.get('/hr/employees/:id/photo', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    const dir = path.join(__dirname, '../../../storage/angajati', String(req.params.id))
    for (const ext of ['.jpg','.png','.webp']) {
      const filePath = path.join(dir, `photo${ext}`)
      if (fs.existsSync(filePath)) {
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
        res.setHeader('Content-Type', mime)
        res.setHeader('Cache-Control', 'public, max-age=3600')
        return res.sendFile(filePath)
      }
    }
    sendJson(res, 404, { error: 'Fotografia nu exista.' })
  } catch (error) {
    next(error)
  }
})

router.post('/hr/leave-requests/:uuid/reject', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:leave_manage')) return
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(`UPDATE hr.leave_requests SET status=N'respinsa', aprobat_de=JSON_VALUE(@p,'$.userId'), aprobat_la=sysdatetime(), motiv_respingere=NULLIF(JSON_VALUE(@p,'$.motiv'),''), updated_at=sysdatetime() WHERE uuid=JSON_VALUE(@p,'$.uuid'); SELECT TOP 1 * FROM hr.leave_requests WHERE uuid=JSON_VALUE(@p,'$.uuid') FOR JSON PATH;`, { uuid: req.params.uuid, userId: auth.user.id, motiv: req.body.motiv || '' })
      addAudit(db, auth.user, 'hr_leave_rejected', req.params.uuid)
      writeDb(db)
      return sendJson(res, 200, item)
    }
    const hr = ensureHrDb(db)
    const item = hr.leaveRequests.find((leave) => leave.uuid === req.params.uuid)
    if (!item) return sendJson(res, 404, { error: 'Cererea nu a fost gasita.' })
    item.status = 'respinsa'
    item.aprobat_de = auth.user.id
    item.aprobat_la = nowIso()
    item.motiv_respingere = req.body.motiv || ''
    item.updated_at = nowIso()
    addAudit(db, auth.user, 'hr_leave_rejected', item.uuid)
    writeDb(db)
    sendJson(res, 200, item)
  } catch (error) {
    next(error)
  }
})

router.get('/hr/employees/:id/transfers', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:view')) return
    if (isMssqlMode()) return sendJson(res, 200, [])
    const hr = ensureHrDb(readDb())
    sendJson(res, 200, hr.departmentTransfers.filter((item) => String(item.employee_id) === String(req.params.id)))
  } catch (error) {
    next(error)
  }
})

router.post('/hr/employees/:id/transfer', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    const db = readDb()
    if (isMssqlMode()) {
      const newDept = departmentCod(db, req.body.department_nou || req.body.dept_nou || req.body.departament_nou)
      if (!newDept) return sendJson(res, 400, { error: 'Departamentul nou este obligatoriu.' })
      const result = mssqlObject(`DECLARE @old nvarchar(80)=(SELECT COALESCE(department_cod,CONVERT(nvarchar(80),department_id)) FROM hr.employees WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id'))); UPDATE hr.employees SET department_cod=JSON_VALUE(@p,'$.dept_nou'), updated_at=sysdatetime() WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')); INSERT INTO hr.department_transfers (uuid,employee_id,dept_vechi,dept_nou,data_transfer,motiv,aprobat_de) VALUES (JSON_VALUE(@p,'$.uuid'),TRY_CONVERT(int,JSON_VALUE(@p,'$.id')),@old,JSON_VALUE(@p,'$.dept_nou'),TRY_CONVERT(date,JSON_VALUE(@p,'$.data_transfer')),NULLIF(JSON_VALUE(@p,'$.motiv'),''),JSON_VALUE(@p,'$.aprobat_de')); SELECT TOP 1 * FROM hr.department_transfers WHERE id=SCOPE_IDENTITY() FOR JSON PATH;`, { id: req.params.id, uuid: crypto.randomUUID(), dept_nou: newDept, data_transfer: req.body.data_transfer || todayIso(), motiv: req.body.motiv || '', aprobat_de: auth.user.id })
      addAudit(db, auth.user, 'hr_employee_transferred', `${req.params.id}: ${newDept}`)
      writeDb(db)
      return sendJson(res, 200, { transfer: result })
    }
    const hr = ensureHrDb(db)
    const employee = hr.employees.find((item) => String(item.id) === String(req.params.id))
    if (!employee) return sendJson(res, 404, { error: 'Angajatul nu a fost gasit.' })
    const oldDept = employeeDepartment(employee, db)
    const newDept = departmentCod(db, req.body.department_nou || req.body.dept_nou || req.body.departament_nou)
    if (!newDept) return sendJson(res, 400, { error: 'Departamentul nou este obligatoriu.' })
    const transfer = {
      id: nextId(hr.departmentTransfers),
      uuid: crypto.randomUUID(),
      employee_id: employee.id,
      dept_vechi: oldDept,
      dept_nou: newDept,
      data_transfer: req.body.data_transfer || todayIso(),
      motiv: req.body.motiv || '',
      aprobat_de: auth.user.id,
      created_at: nowIso()
    }
    hr.departmentTransfers.push(transfer)
    employee.department_cod = newDept
    employee.department_id = req.body.department_nou || req.body.dept_nou || req.body.departament_nou || employee.department_id
    employee.updated_at = nowIso()
    addAudit(db, auth.user, 'hr_employee_transferred', `${employee.nume || ''} ${employee.prenume || ''}: ${oldDept} -> ${newDept}`)
    writeDb(db)
    sendJson(res, 200, { employee, transfer })
  } catch (error) {
    next(error)
  }
})

router.get('/hr/employees/:id/contracts', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:view')) return
    if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`SELECT * FROM hr.contracts WHERE employee_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id')) ORDER BY data_start DESC FOR JSON PATH;`, req.params))
    const hr = ensureHrDb(readDb())
    sendJson(res, 200, hr.contracts.filter((item) => String(item.employee_id) === String(req.params.id)))
  } catch (error) {
    next(error)
  }
})

router.post('/hr/employees/:id/contracts', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    const year = new Date().getFullYear()
    const db = readDb()

    if (isMssqlMode()) {
      const created = mssqlObject(`
DECLARE @nr int = (SELECT COUNT(*) + 1 FROM hr.contracts WHERE YEAR(created_at) = YEAR(GETDATE()));
DECLARE @numar nvarchar(100) = CONCAT(N'CIM-', YEAR(GETDATE()), N'-', RIGHT(CONCAT(N'0000', @nr), 4));
INSERT INTO hr.contracts (
  employee_id, tip, numar_contract, data_contract, data_start, data_sfarsit,
  norma_ore, salariu_baza, cost_ora, status, observatii
)
VALUES (
  TRY_CONVERT(int, JSON_VALUE(@p, '$.employee_id')),
  COALESCE(NULLIF(JSON_VALUE(@p, '$.tip'), ''), N'CIM'),
  @numar,
  TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.data_contract'), '')),
  TRY_CONVERT(date, JSON_VALUE(@p, '$.data_start')),
  TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.data_sfarsit'), '')),
  TRY_CONVERT(decimal(5,2), NULLIF(JSON_VALUE(@p, '$.norma_ore'), '')),
  TRY_CONVERT(decimal(15,2), NULLIF(JSON_VALUE(@p, '$.salariu_baza'), '')),
  TRY_CONVERT(decimal(12,2), NULLIF(JSON_VALUE(@p, '$.cost_ora'), '')),
  COALESCE(NULLIF(JSON_VALUE(@p, '$.status'), ''), N'activ'),
  NULLIF(JSON_VALUE(@p, '$.observatii'), '')
);
SELECT TOP 1 * FROM hr.contracts WHERE id = SCOPE_IDENTITY() FOR JSON PATH;
`, { ...req.body, employee_id: req.params.id })
      addAudit(db, auth.user, 'hr_contract_created', created?.numar_contract)
      writeDb(db)
      return sendJson(res, 201, created)
    }

    const hr = ensureHrDb(db)
    const nr = hr.contracts.filter((item) => String(item.created_at || '').slice(0, 4) === String(year)).length + 1
    const item = {
      id: nextId(hr.contracts),
      employee_id: Number(req.params.id),
      tip: req.body.tip || 'CIM',
      numar_contract: `CIM-${year}-${String(nr).padStart(4, '0')}`,
      data_contract: req.body.data_contract || todayIso(),
      data_start: req.body.data_start,
      data_sfarsit: req.body.data_sfarsit || null,
      norma_ore: req.body.norma_ore || null,
      salariu_baza: req.body.salariu_baza || null,
      cost_ora: req.body.cost_ora || null,
      status: req.body.status || 'activ',
      observatii: req.body.observatii || null,
      created_at: nowIso(),
      updated_at: null
    }
    hr.contracts.push(item)
    addAudit(db, auth.user, 'hr_contract_created', item.numar_contract)
    writeDb(db)
    sendJson(res, 201, item)
  } catch (error) {
    next(error)
  }
})

router.get('/hr/timesheets', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:timesheet')) return
    const luna = String(req.query.luna || todayIso().slice(0, 7)).slice(0, 7)
    const dates = monthDates(luna)

    if (isMssqlMode()) {
      const rows = mssqlArray(`
SELECT ts.*, e.nume, e.prenume, e.department_id
FROM hr.time_sheets ts
JOIN hr.employees e ON e.id = ts.employee_id
WHERE FORMAT(ts.data, 'yyyy-MM') = JSON_VALUE(@p, '$.luna')
AND (NULLIF(JSON_VALUE(@p, '$.dept_id'), '') IS NULL OR e.department_id = JSON_VALUE(@p, '$.dept_id'))
AND (NULLIF(JSON_VALUE(@p, '$.employee_id'), '') IS NULL OR ts.employee_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.employee_id')))
ORDER BY e.nume, e.prenume, ts.data
FOR JSON PATH;
`, { ...req.query, luna })
      return sendJson(res, 200, { luna, zile: dates, pontaje: rows })
    }

    const db = readDb()
    const hr = ensureHrDb(db)
    let employees = hr.employees
    if (req.query.dept_id) employees = employees.filter((item) => String(item.department_id) === String(req.query.dept_id))
    if (req.query.employee_id) employees = employees.filter((item) => String(item.id) === String(req.query.employee_id))
    const rows = employees.map((employee) => ({
      employee,
      zile: dates.map((date) => hr.timeSheets.find((item) => String(item.employee_id) === String(employee.id) && item.data === date) || { employee_id: employee.id, data: date, ore_lucrate: 0, tip: 'lucru' })
    }))
    sendJson(res, 200, { luna, zile: dates, pontaje: rows })
  } catch (error) {
    next(error)
  }
})

router.post('/hr/timesheets', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:timesheet')) return
    const body = req.body || {}
    const db = readDb()

    if (isMssqlMode()) {
      const item = mssqlObject(`
DECLARE @id int;
SELECT @id = id FROM hr.time_sheets
WHERE employee_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.employee_id'))
AND data = TRY_CONVERT(date, JSON_VALUE(@p, '$.data'));
IF @id IS NULL
BEGIN
  INSERT INTO hr.time_sheets (employee_id, data, ore_lucrate, tip, santier_id, cost_center_id, observatii)
  VALUES (
    TRY_CONVERT(int, JSON_VALUE(@p, '$.employee_id')),
    TRY_CONVERT(date, JSON_VALUE(@p, '$.data')),
    TRY_CONVERT(decimal(5,2), JSON_VALUE(@p, '$.ore_lucrate')),
    COALESCE(NULLIF(JSON_VALUE(@p, '$.tip'), ''), N'lucru'),
    TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.santier_id'), '')),
    TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.cost_center_id'), '')),
    NULLIF(JSON_VALUE(@p, '$.observatii'), '')
  );
  SET @id = SCOPE_IDENTITY();
END
ELSE
BEGIN
  UPDATE hr.time_sheets
  SET ore_lucrate = TRY_CONVERT(decimal(5,2), JSON_VALUE(@p, '$.ore_lucrate')),
      tip = COALESCE(NULLIF(JSON_VALUE(@p, '$.tip'), ''), tip),
      santier_id = TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.santier_id'), '')),
      cost_center_id = TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.cost_center_id'), '')),
      observatii = NULLIF(JSON_VALUE(@p, '$.observatii'), ''),
      updated_at = sysdatetime()
  WHERE id = @id;
END;
SELECT TOP 1 * FROM hr.time_sheets WHERE id = @id FOR JSON PATH;
`, body)
      addAudit(db, auth.user, 'hr_timesheet_upserted', `${body.employee_id}/${body.data}`)
      writeDb(db)
      return sendJson(res, 200, item)
    }

    const hr = ensureHrDb(db)
    let item = hr.timeSheets.find((entry) => String(entry.employee_id) === String(body.employee_id) && entry.data === body.data)
    if (!item) {
      item = { id: nextId(hr.timeSheets), employee_id: body.employee_id, data: body.data, created_at: nowIso() }
      hr.timeSheets.push(item)
    }
    Object.assign(item, {
      ore_lucrate: numberValue(body.ore_lucrate),
      tip: body.tip || 'lucru',
      santier_id: body.santier_id || null,
      cost_center_id: body.cost_center_id || null,
      observatii: body.observatii || null,
      updated_at: nowIso()
    })
    addAudit(db, auth.user, 'hr_timesheet_upserted', `${body.employee_id}/${body.data}`)
    writeDb(db)
    sendJson(res, 200, item)
  } catch (error) {
    next(error)
  }
})

router.get('/hr/timesheets/my-department', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:timesheet')) return
    const luna = String(req.query.luna || todayIso().slice(0, 7)).slice(0, 7)
    const db = readDb()
    if (isMssqlMode()) return sendJson(res, 200, { luna, department: auth.user.department_id || null, pontaje: [] })
    const hr = ensureHrDb(db)
    const dept = userDepartment(auth, db)
    const employees = hr.employees.filter((employee) => employeeDepartment(employee, db) === dept)
    const employeeIds = new Set(employees.map((employee) => String(employee.id)))
    const pontaje = hr.timeSheets.filter((entry) => employeeIds.has(String(entry.employee_id)) && String(entry.data || '').startsWith(luna))
    const status = hr.timesheetDepartments.find((item) => item.luna === luna && item.department_cod === dept) || null
    sendJson(res, 200, { luna, department: dept, employees, pontaje, status })
  } catch (error) {
    next(error)
  }
})

router.post('/hr/timesheets/submit-department', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:timesheet')) return
    const db = readDb()
    if (isMssqlMode()) {
      const luna = String(req.body.luna || todayIso().slice(0, 7)).slice(0, 7)
      const department = String(req.body.department_cod || auth.user.department_cod || auth.user.department_id || '').toLowerCase()
      const item = mssqlObject(`DECLARE @id int; SELECT @id=id FROM hr.timesheet_departments WHERE luna=JSON_VALUE(@p,'$.luna') AND department_cod=JSON_VALUE(@p,'$.department'); IF @id IS NULL BEGIN INSERT INTO hr.timesheet_departments (luna,department_cod,status,completat_la,completat_de) VALUES (JSON_VALUE(@p,'$.luna'),JSON_VALUE(@p,'$.department'),JSON_VALUE(@p,'$.status'),sysdatetime(),JSON_VALUE(@p,'$.userId')); SET @id=SCOPE_IDENTITY(); END ELSE UPDATE hr.timesheet_departments SET status=JSON_VALUE(@p,'$.status'), completat_la=sysdatetime(), completat_de=JSON_VALUE(@p,'$.userId'), updated_at=sysdatetime() WHERE id=@id; SELECT TOP 1 * FROM hr.timesheet_departments WHERE id=@id FOR JSON PATH;`, { luna, department, status: req.body.status || 'finalizat', userId: auth.user.id })
      addAudit(db, auth.user, 'hr_timesheet_department_submitted', `${department}/${luna}`)
      writeDb(db)
      return sendJson(res, 200, item)
    }
    const hr = ensureHrDb(db)
    const luna = String(req.body.luna || todayIso().slice(0, 7)).slice(0, 7)
    const department = departmentCod(db, req.body.department_cod || userDepartment(auth, db))
    let item = hr.timesheetDepartments.find((entry) => entry.luna === luna && entry.department_cod === department)
    if (!item) {
      item = { id: nextId(hr.timesheetDepartments), luna, department_cod: department, created_at: nowIso() }
      hr.timesheetDepartments.push(item)
    }
    Object.assign(item, {
      status: req.body.status || 'finalizat',
      completat_la: nowIso(),
      completat_de: auth.user.id,
      updated_at: nowIso()
    })
    hrUsers(db).forEach((user) => notifyUser(user.id, 'hr_timesheet_submitted', { luna, department }))
    addAudit(db, auth.user, 'hr_timesheet_department_submitted', `${department}/${luna}`)
    writeDb(db)
    sendJson(res, 200, item)
  } catch (error) {
    next(error)
  }
})

router.get('/hr/timesheets/overview', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:timesheet_approve')) return
    const luna = String(req.query.luna || todayIso().slice(0, 7)).slice(0, 7)
    const db = readDb()
    if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`SELECT d.denumire AS department, COALESCE(td.department_cod,d.cod) AS department_cod, COALESCE(td.status,N'necompletat') AS status, td.completat_la, 0 AS procent FROM core.departments d LEFT JOIN hr.timesheet_departments td ON td.department_cod=d.cod AND td.luna=JSON_VALUE(@p,'$.luna') WHERE d.activ=1 ORDER BY d.denumire FOR JSON PATH;`, { luna }))
    const hr = ensureHrDb(db)
    const dates = monthDates(luna)
    const rows = departmentsList(db).map((dept) => {
      const department = departmentCod(db, dept.cod || dept.id || dept.denumire || dept.name)
      const employees = hr.employees.filter((employee) => employeeDepartment(employee, db) === department && employee.activ !== false)
      const employeeIds = new Set(employees.map((employee) => String(employee.id)))
      const expected = Math.max(1, employees.length * dates.length)
      const completed = hr.timeSheets.filter((entry) => employeeIds.has(String(entry.employee_id)) && String(entry.data || '').startsWith(luna)).length
      const status = hr.timesheetDepartments.find((entry) => entry.luna === luna && entry.department_cod === department)
      return {
        department: dept.denumire || dept.name || department,
        department_cod: department,
        status: status?.status || (completed ? 'in_lucru' : 'necompletat'),
        completat_la: status?.completat_la || null,
        procent: Math.min(100, Math.round(completed / expected * 100))
      }
    })
    sendJson(res, 200, rows)
  } catch (error) {
    next(error)
  }
})

router.post('/hr/timesheets/set-deadline', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:timesheet_approve')) return
    const db = readDb()
    const luna = String(req.body.luna || todayIso().slice(0, 7)).slice(0, 7)
    db.settings = db.settings || {}
    db.settings.hr_timesheet_deadlines = db.settings.hr_timesheet_deadlines || {}
    db.settings.hr_timesheet_deadlines[luna] = {
      deadline_date: req.body.deadline_date,
      send_reminder: req.body.send_reminder === true,
      updated_by: auth.user.id,
      updated_at: nowIso()
    }
    addAudit(db, auth.user, 'hr_timesheet_deadline_set', `${luna}: ${req.body.deadline_date}`)
    writeDb(db)
    sendJson(res, 200, { luna, deadline: db.settings.hr_timesheet_deadlines[luna] })
  } catch (error) {
    next(error)
  }
})

router.post('/hr/timesheets/send-reminder', async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:timesheet_approve')) return
    const db = readDb()
    if (isMssqlMode()) return sendJson(res, 200, { sent: 0 })
    const hr = ensureHrDb(db)
    const luna = String(req.body.luna || todayIso().slice(0, 7)).slice(0, 7)
    const deadline = db.settings?.hr_timesheet_deadlines?.[luna]?.deadline_date || req.body.deadline_date || ''
    const done = new Set(hr.timesheetDepartments.filter((entry) => entry.luna === luna && entry.status === 'finalizat').map((entry) => entry.department_cod))
    let sent = 0
    for (const dept of departmentsList(db)) {
      const deptCod = departmentCod(db, dept.cod || dept.id || dept.denumire || dept.name)
      if (!deptCod || done.has(deptCod)) continue
      const message = `Termen limita pontaj ${luna}: ${deadline || 'nesetat'}. Departamentul vostru nu a finalizat completarea.`
      const users = (db.users || []).filter((user) => departmentCod(db, user.department || user.department_cod || user.departmentId || user.department_id) === deptCod)
      for (const user of users) {
        notifyUser(user.id, 'hr_timesheet_reminder', { luna, deadline, message })
        if (user.email) {
          await sendEmail({ to: user.email, subject: `Reminder pontaj ${luna}`, body: `<p>${message}</p>` }, db).catch(() => {})
        }
        sent += 1
      }
    }
    addAudit(db, auth.user, 'hr_timesheet_reminder_sent', `${luna}: ${sent}`)
    writeDb(db)
    sendJson(res, 200, { sent })
  } catch (error) {
    next(error)
  }
})

router.post('/hr/timesheets/validate', async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:timesheet_approve')) return
    const employeeIds = (req.body.employee_ids || []).map(String)
    const luna = String(req.body.luna || todayIso().slice(0, 7)).slice(0, 7)
    const db = readDb()

    if (isMssqlMode()) {
      const rows = mssqlArray(`
UPDATE ts
SET validat = 1,
    validat_de = JSON_VALUE(@p, '$.userId'),
    validat_la = sysdatetime()
FROM hr.time_sheets ts
WHERE FORMAT(ts.data, 'yyyy-MM') = JSON_VALUE(@p, '$.luna')
AND ts.employee_id IN (SELECT TRY_CONVERT(int, value) FROM OPENJSON(JSON_QUERY(@p, '$.employeeIds')));

SELECT ts.*, e.nume, e.prenume, e.department_id, c.salariu_baza
FROM hr.time_sheets ts
JOIN hr.employees e ON e.id = ts.employee_id
OUTER APPLY (
  SELECT TOP 1 salariu_baza
  FROM hr.contracts c
  WHERE c.employee_id = e.id AND c.status <> N'incetat'
  ORDER BY c.data_start DESC
) c
WHERE FORMAT(ts.data, 'yyyy-MM') = JSON_VALUE(@p, '$.luna')
AND ts.employee_id IN (SELECT TRY_CONVERT(int, value) FROM OPENJSON(JSON_QUERY(@p, '$.employeeIds')))
FOR JSON PATH;
`, { employeeIds, luna, userId: auth.user.id })
      for (const row of rows) {
        await registerPontaj(row, row, db)
      }
      addAudit(db, auth.user, 'hr_timesheets_validated', luna)
      writeDb(db)
      return sendJson(res, 200, { validated: rows.length })
    }

    const hr = ensureHrDb(db)
    const rows = hr.timeSheets.filter((entry) => employeeIds.includes(String(entry.employee_id)) && String(entry.data).startsWith(luna))
    for (const pontaj of rows) {
      pontaj.validat = true
      pontaj.validat_de = auth.user.id
      pontaj.validat_la = nowIso()
      const employee = hr.employees.find((item) => String(item.id) === String(pontaj.employee_id))
      await registerPontaj(pontaj, employeeWithSalary(hr, employee || {}), db)
    }
    addAudit(db, auth.user, 'hr_timesheets_validated', luna)
    writeDb(db)
    sendJson(res, 200, { validated: rows.length })
  } catch (error) {
    next(error)
  }
})

router.get('/hr/timesheets/monthly-sheet', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:timesheet')) return
    const luna = String(req.query.luna || todayIso().slice(0, 7)).slice(0, 7)
    const dates = monthDates(luna)
    const db = readDb()

    if (isMssqlMode()) {
      const rows = mssqlArray(`
SELECT e.id, e.nume, e.prenume, e.department_id, d.denumire AS department_name, ts.data, ts.ore_lucrate, ts.tip
FROM hr.employees e
LEFT JOIN core.departments d ON d.id = e.department_id
LEFT JOIN hr.time_sheets ts ON ts.employee_id = e.id AND FORMAT(ts.data, 'yyyy-MM') = JSON_VALUE(@p, '$.luna')
WHERE e.activ = 1
AND (NULLIF(JSON_VALUE(@p, '$.dept_id'), '') IS NULL OR e.department_id = JSON_VALUE(@p, '$.dept_id'))
ORDER BY e.nume, e.prenume, ts.data
FOR JSON PATH;
`, { ...req.query, luna })
      const byEmployee = new Map()
      rows.forEach((row) => {
        if (!byEmployee.has(row.id)) byEmployee.set(row.id, { employee_id: row.id, nume: row.nume, prenume: row.prenume, department_name: row.department_name, zile: {} })
        if (row.data) byEmployee.get(row.id).zile[String(row.data).slice(0, 10)] = row.ore_lucrate
      })
      return sendJson(res, 200, [...byEmployee.values()])
    }

    const hr = ensureHrDb(db)
    let employees = hr.employees.filter((item) => item.activ !== false)
    if (req.query.dept_id) employees = employees.filter((item) => String(item.department_id) === String(req.query.dept_id))
    const sheet = employees.map((employee) => {
      const zile = {}
      dates.forEach((date) => {
        zile[date] = numberValue(hr.timeSheets.find((item) => String(item.employee_id) === String(employee.id) && item.data === date)?.ore_lucrate)
      })
      return { employee_id: employee.id, nume: employee.nume, prenume: employee.prenume, department_name: departmentName(db, employee.department_id), zile }
    })
    sendJson(res, 200, sheet)
  } catch (error) {
    next(error)
  }
})

router.get('/hr/leave-requests', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    const hasFullView = authHasPermission(auth, 'hr:view')
    const hasOwnView = authHasPermission(auth, 'hr:view_own') || authHasPermission(auth, 'hr:leave_own')
    if (!hasFullView && !hasOwnView) return requirePermission(auth, res, 'hr:view')
    if (isMssqlMode()) {
      let rows
      if (!hasFullView) {
        const ownEmpRow = mssqlObject(`SELECT TOP 1 id FROM hr.employees WHERE user_id = JSON_VALUE(@p, '$.userId') FOR JSON PATH;`, { userId: String(auth.user.id) })
        const ownEmpId = ownEmpRow ? ownEmpRow.id : -1
        rows = mssqlArray(`SELECT * FROM hr.leave_requests WHERE employee_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.empId')) ORDER BY created_at DESC FOR JSON PATH;`, { empId: ownEmpId })
      } else {
        rows = mssqlArray(`SELECT * FROM hr.leave_requests ORDER BY created_at DESC FOR JSON PATH;`)
      }
      return sendJson(res, 200, rows)
    }
    const db = readDb()
    const hr = ensureHrDb(db)
    let leaves = hr.leaveRequests
    if (!hasFullView) {
      const ownEmp = hr.employees.find((e) => String(e.user_id) === String(auth.user.id))
      if (ownEmp) leaves = leaves.filter((lr) => String(lr.employee_id) === String(ownEmp.id))
      else leaves = []
    }
    sendJson(res, 200, leaves)
  } catch (error) {
    next(error)
  }
})

router.post('/hr/kiosk/sync', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canUseKioskSync(auth)) return requirePermission(auth, res, 'hr:view_own')

    const operations = Array.isArray(req.body?.operations) ? req.body.operations : []
    if (!operations.length) return sendJson(res, 200, { ok: true, synced: [], failed: [], remaining: 0 })

    const db = readDb()
    const hr = ensureHrDb(db)
    const synced = []
    const failed = []
    let createdCount = 0

    for (const operation of operations) {
      const operationId = operation.id || operation.client_id || operation.data?.uuid || crypto.randomUUID()
      try {
        if (operation.type !== 'leave_request') {
          failed.push({ id: operationId, error: 'Operațiune Kiosk necunoscută.' })
          continue
        }

        const normalized = buildKioskLeave(operation.data || {}, auth, hr, operationId)
        if (normalized.error) {
          failed.push({ id: operationId, error: normalized.error })
          continue
        }
        const leave = normalized.item

        if (isMssqlMode()) {
          const existing = mssqlObject(`
SELECT TOP 1 * FROM hr.leave_requests
WHERE uuid = JSON_VALUE(@p, '$.uuid')
FOR JSON PATH;
`, { uuid: leave.uuid })
          if (existing) {
            synced.push({ id: operationId, uuid: existing.uuid, duplicate: true })
            continue
          }
          const item = mssqlObject(`
INSERT INTO hr.leave_requests (uuid, employee_id, tip, data_start, data_sfarsit, zile, motiv)
VALUES (
  JSON_VALUE(@p, '$.uuid'),
  TRY_CONVERT(int, JSON_VALUE(@p, '$.employee_id')),
  JSON_VALUE(@p, '$.tip'),
  TRY_CONVERT(date, JSON_VALUE(@p, '$.data_start')),
  TRY_CONVERT(date, JSON_VALUE(@p, '$.data_sfarsit')),
  TRY_CONVERT(decimal(6,2), JSON_VALUE(@p, '$.zile')),
  NULLIF(JSON_VALUE(@p, '$.motiv'), '')
);
SELECT TOP 1 * FROM hr.leave_requests
WHERE uuid = JSON_VALUE(@p, '$.uuid')
FOR JSON PATH;
`, leave)
          createdCount += 1
          synced.push({ id: operationId, uuid: item?.uuid || leave.uuid, item })
          addAudit(db, auth.user, 'hr_kiosk_leave_synced', leave.uuid)
          continue
        }

        const existing = hr.leaveRequests.find((item) => String(item.uuid) === String(leave.uuid))
        if (existing) {
          synced.push({ id: operationId, uuid: existing.uuid, duplicate: true })
          continue
        }
        const item = { id: nextId(hr.leaveRequests), ...leave }
        hr.leaveRequests.push(item)
        createdCount += 1
        synced.push({ id: operationId, uuid: item.uuid, item })
        addAudit(db, auth.user, 'hr_kiosk_leave_synced', item.uuid)
      } catch (error) {
        failed.push({ id: operationId, error: error.message || 'Sincronizare eșuată.' })
      }
    }

    if (createdCount > 0 || !isMssqlMode()) writeDb(db)
    sendJson(res, 200, { ok: failed.length === 0, synced, failed, remaining: failed.length })
  } catch (error) {
    next(error)
  }
})

router.post('/hr/leave-requests', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:timesheet')) return
    const body = req.body || {}
    const zile = businessDays(body.data_start, body.data_sfarsit)
    const db = readDb()

    if (isMssqlMode()) {
      const item = mssqlObject(`
INSERT INTO hr.leave_requests (uuid, employee_id, tip, data_start, data_sfarsit, zile, motiv)
VALUES (
  JSON_VALUE(@p, '$.uuid'),
  TRY_CONVERT(int, JSON_VALUE(@p, '$.employee_id')),
  JSON_VALUE(@p, '$.tip'),
  TRY_CONVERT(date, JSON_VALUE(@p, '$.data_start')),
  TRY_CONVERT(date, JSON_VALUE(@p, '$.data_sfarsit')),
  TRY_CONVERT(decimal(6,2), JSON_VALUE(@p, '$.zile')),
  NULLIF(JSON_VALUE(@p, '$.motiv'), '')
);
SELECT TOP 1 * FROM hr.leave_requests WHERE uuid = JSON_VALUE(@p, '$.uuid') FOR JSON PATH;
`, { ...body, uuid: crypto.randomUUID(), zile })
      addAudit(db, auth.user, 'hr_leave_created', item?.uuid)
      writeDb(db)
      return sendJson(res, 201, item)
    }

    const hr = ensureHrDb(db)
    const item = { id: nextId(hr.leaveRequests), uuid: crypto.randomUUID(), ...body, zile, status: 'cerut', created_at: nowIso(), updated_at: null }
    hr.leaveRequests.push(item)
    addAudit(db, auth.user, 'hr_leave_created', item.uuid)
    writeDb(db)
    sendJson(res, 201, item)
  } catch (error) {
    next(error)
  }
})

router.post('/hr/leave-requests/:uuid/approve', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:leave_manage')) return
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(`
UPDATE hr.leave_requests
SET status = N'aprobata', aprobat_de = JSON_VALUE(@p, '$.userId'), aprobat_la = sysdatetime(), updated_at = sysdatetime()
WHERE uuid = JSON_VALUE(@p, '$.uuid');
SELECT TOP 1 * FROM hr.leave_requests WHERE uuid = JSON_VALUE(@p, '$.uuid') FOR JSON PATH;
`, { uuid: req.params.uuid, userId: auth.user.id })
      addAudit(db, auth.user, 'hr_leave_approved', req.params.uuid)
      writeDb(db)
      return sendJson(res, 200, item)
    }
    const hr = ensureHrDb(db)
    const item = hr.leaveRequests.find((leave) => leave.uuid === req.params.uuid)
    if (!item) return sendJson(res, 404, { error: 'Cererea nu a fost gasita.' })
    item.status = 'aprobata'
    item.aprobat_de = auth.user.id
    item.aprobat_la = nowIso()
    item.updated_at = nowIso()
    // Track CO efectuate on employee
    const coTypes = ['co', 'concediu_odihna', 'concediu']
    if (coTypes.includes(String(item.tip || '').toLowerCase())) {
      const emp = hr.employees.find((e) => String(e.id) === String(item.employee_id))
      if (emp) {
        emp.zile_co_efectuate = numberValue(emp.zile_co_efectuate) + numberValue(item.zile)
        emp.updated_at = nowIso()
      }
    }
    addAudit(db, auth.user, 'hr_leave_approved', item.uuid)
    writeDb(db)
    sendJson(res, 200, item)
  } catch (error) {
    next(error)
  }
})

router.get('/hr/authorizations', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    const hasFullView = authHasPermission(auth, 'hr:view')
    const hasOwnView = authHasPermission(auth, 'hr:view_own')
    if (!hasFullView && !hasOwnView) return requirePermission(auth, res, 'hr:view')
    if (isMssqlMode()) {
      let rows
      if (!hasFullView) {
        const ownEmpRow = mssqlObject(`SELECT TOP 1 id FROM hr.employees WHERE user_id = JSON_VALUE(@p, '$.userId') FOR JSON PATH;`, { userId: String(auth.user.id) })
        const ownEmpId = ownEmpRow ? ownEmpRow.id : -1
        rows = mssqlArray(`SELECT * FROM hr.authorizations WHERE employee_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.empId')) ORDER BY data_expirare FOR JSON PATH;`, { empId: ownEmpId })
      } else {
        rows = mssqlArray(`SELECT * FROM hr.authorizations ORDER BY data_expirare FOR JSON PATH;`)
      }
      return sendJson(res, 200, rows.map(authorizationView))
    }
    const db = readDb()
    const hr = ensureHrDb(db)
    let auths = hr.authorizations
    if (!hasFullView) {
      const ownEmp = hr.employees.find((e) => String(e.user_id) === String(auth.user.id))
      if (ownEmp) auths = auths.filter((a) => String(a.employee_id) === String(ownEmp.id))
      else auths = []
    }
    sendJson(res, 200, auths.map(authorizationView))
  } catch (error) {
    next(error)
  }
})

router.post('/hr/reges/export', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:reges_export')) return
    const body = req.body || {}
    const db = readDb()
    let employee
    let contract

    if (isMssqlMode()) {
      employee = mssqlObject(`SELECT TOP 1 * FROM hr.employees WHERE id = TRY_CONVERT(int, JSON_VALUE(@p, '$.employee_id')) FOR JSON PATH;`, body)
      contract = mssqlObject(`SELECT TOP 1 * FROM hr.contracts WHERE id = TRY_CONVERT(int, JSON_VALUE(@p, '$.contract_id')) FOR JSON PATH;`, body)
    } else {
      const hr = ensureHrDb(db)
      employee = hr.employees.find((item) => String(item.id) === String(body.employee_id))
      contract = hr.contracts.find((item) => String(item.id) === String(body.contract_id))
    }
    if (!employee || !contract) return sendJson(res, 404, { error: 'Angajatul sau contractul nu a fost gasit.' })

    const uuid = crypto.randomUUID()
    const xml = regesXml(db, employee, contract)
    const filePath = saveRegesFile(uuid, xml)

    if (isMssqlMode()) {
      mssqlObject(`
INSERT INTO hr.reges_exports (uuid, tip, fisier_path, status, generat_de, mesaj)
VALUES (
  JSON_VALUE(@p, '$.uuid'),
  JSON_VALUE(@p, '$.tip'),
  JSON_VALUE(@p, '$.filePath'),
  N'generat',
  JSON_VALUE(@p, '$.userId'),
  NULL
);
SELECT TOP 1 * FROM hr.reges_exports WHERE uuid = JSON_VALUE(@p, '$.uuid') FOR JSON PATH;
`, { uuid, tip: body.tip, filePath, userId: auth.user.id })
    } else {
      const hr = ensureHrDb(db)
      hr.regesExports.push({ id: nextId(hr.regesExports), uuid, tip: body.tip, fisier_path: filePath, status: 'generat', generat_de: auth.user.id, created_at: nowIso() })
    }
    addAudit(db, auth.user, 'hr_reges_export', `${body.tip}/${employee.id}`)
    writeDb(db)
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename=reges-${uuid}.xml`)
    res.send(xml)
  } catch (error) {
    next(error)
  }
})

router.get('/hr/reges/history', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:reges_export')) return
    if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`SELECT TOP 50 * FROM hr.reges_exports ORDER BY created_at DESC FOR JSON PATH;`))
    sendJson(res, 200, [...ensureHrDb(readDb()).regesExports].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 50))
  } catch (error) {
    next(error)
  }
})

router.get('/hr/training', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:view')) return
    if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`SELECT * FROM hr.training ORDER BY data_start DESC FOR JSON PATH;`))
    sendJson(res, 200, ensureHrDb(readDb()).training)
  } catch (error) {
    next(error)
  }
})

router.post('/hr/training', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(`
INSERT INTO hr.training (denumire, tip, furnizor, data_start, data_sfarsit, valabil_pana_la, cost_total)
VALUES (
  JSON_VALUE(@p, '$.denumire'),
  NULLIF(JSON_VALUE(@p, '$.tip'), ''),
  NULLIF(JSON_VALUE(@p, '$.furnizor'), ''),
  TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.data_start'), '')),
  TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.data_sfarsit'), '')),
  TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.valabil_pana_la'), '')),
  TRY_CONVERT(decimal(15,2), NULLIF(JSON_VALUE(@p, '$.cost_total'), ''))
);
SELECT TOP 1 * FROM hr.training WHERE id = SCOPE_IDENTITY() FOR JSON PATH;
`, req.body)
      addAudit(db, auth.user, 'hr_training_created', item?.denumire)
      writeDb(db)
      return sendJson(res, 201, item)
    }
    const hr = ensureHrDb(db)
    const item = { id: nextId(hr.training), ...req.body, created_at: nowIso(), updated_at: null }
    hr.training.push(item)
    addAudit(db, auth.user, 'hr_training_created', item.denumire)
    writeDb(db)
    sendJson(res, 201, item)
  } catch (error) {
    next(error)
  }
})

router.post('/hr/training/:id/employees', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    const employeeIds = req.body.employee_ids || []
    const db = readDb()
    if (isMssqlMode()) {
      mssqlObject(`
INSERT INTO hr.training_employees (training_id, employee_id, status)
SELECT TRY_CONVERT(int, JSON_VALUE(@p, '$.trainingId')), TRY_CONVERT(int, value), N'inscris'
FROM OPENJSON(JSON_QUERY(@p, '$.employeeIds')) ids
WHERE NOT EXISTS (
  SELECT 1 FROM hr.training_employees te
  WHERE te.training_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.trainingId'))
  AND te.employee_id = TRY_CONVERT(int, ids.value)
);
SELECT 1 AS ok FOR JSON PATH;
`, { trainingId: req.params.id, employeeIds })
      addAudit(db, auth.user, 'hr_training_employees_added', req.params.id)
      writeDb(db)
      return sendJson(res, 200, { added: employeeIds.length })
    }
    const hr = ensureHrDb(db)
    let added = 0
    employeeIds.forEach((employeeId) => {
      const exists = hr.trainingEmployees.some((item) => String(item.training_id) === String(req.params.id) && String(item.employee_id) === String(employeeId))
      if (!exists) {
        hr.trainingEmployees.push({ training_id: Number(req.params.id), employee_id: Number(employeeId), status: 'inscris', created_at: nowIso() })
        added += 1
      }
    })
    addAudit(db, auth.user, 'hr_training_employees_added', req.params.id)
    writeDb(db)
    sendJson(res, 200, { added })
  } catch (error) {
    next(error)
  }
})

router.get('/hr/employees/:id/co-balance', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    const hasFullView = authHasPermission(auth, 'hr:view')
    const hasOwnView = authHasPermission(auth, 'hr:view_own') || authHasPermission(auth, 'hr:leave_own')
    if (!hasFullView && !hasOwnView) return requirePermission(auth, res, 'hr:view')
    // When only own-view, verify the requested employee belongs to the current user
    if (!hasFullView) {
      let empUserId = null
      if (isMssqlMode()) {
        const empRow = mssqlObject(`SELECT TOP 1 user_id FROM hr.employees WHERE id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id')) FOR JSON PATH;`, { id: req.params.id })
        empUserId = empRow ? String(empRow.user_id) : null
      } else {
        const dbCheck = readDb()
        const hrCheck = ensureHrDb(dbCheck)
        const emp = hrCheck.employees.find((e) => String(e.id) === String(req.params.id))
        empUserId = emp ? String(emp.user_id) : null
      }
      if (!empUserId || empUserId !== String(auth.user.id)) return sendJson(res, 403, { error: 'Acces interzis la datele altui angajat.' })
    }
    const year = String(req.query.year || new Date().getFullYear())
    if (isMssqlMode()) {
      const result = mssqlObject(`
SELECT
  e.zile_co_drept,
  COALESCE(SUM(CASE WHEN lr.status IN (N'aprobata',N'aprobat') AND YEAR(lr.data_start)=TRY_CONVERT(int,JSON_VALUE(@p,'$.year')) AND lr.tip IN (N'CO',N'concediu_odihna',N'concediu') THEN lr.zile ELSE 0 END),0) AS zile_efectuate
FROM hr.employees e
LEFT JOIN hr.leave_requests lr ON lr.employee_id=e.id
WHERE e.id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id'))
GROUP BY e.zile_co_drept
FOR JSON PATH;
`, { id: req.params.id, year })
      const zile_drept = Number(result?.zile_co_drept ?? 21)
      const zile_efectuate = Number(result?.zile_efectuate ?? 0)
      return sendJson(res, 200, { year, zile_drept, zile_efectuate, zile_ramase: Math.max(0, zile_drept - zile_efectuate) })
    }
    const db = readDb()
    const hr = ensureHrDb(db)
    const employee = hr.employees.find((item) => String(item.id) === String(req.params.id))
    if (!employee) return sendJson(res, 404, { error: 'Angajatul nu a fost gasit.' })
    const coTypes = ['co', 'concediu_odihna', 'concediu']
    const zile_efectuate = hr.leaveRequests
      .filter((lr) => String(lr.employee_id) === String(req.params.id) &&
        ['aprobata', 'aprobat'].includes(String(lr.status || '')) &&
        String(lr.data_start || '').startsWith(year) &&
        coTypes.includes(String(lr.tip || '').toLowerCase()))
      .reduce((sum, lr) => sum + numberValue(lr.zile), 0)
    const zile_drept = numberValue(employee.zile_co_drept, 21)
    sendJson(res, 200, { year, zile_drept, zile_efectuate, zile_ramase: Math.max(0, zile_drept - zile_efectuate) })
  } catch (error) {
    next(error)
  }
})

router.get('/hr/employees/:id/adeverinta', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:view')) return
    const db = readDb()
    const hr = ensureHrDb(db)
    const tip = String(req.query.tip || 'salariat')
    let employee
    if (isMssqlMode()) {
      employee = mssqlObject(`SELECT TOP 1 * FROM hr.employees WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')) FOR JSON PATH;`, req.params)
    } else {
      employee = hr.employees.find((item) => String(item.id) === String(req.params.id))
    }
    if (!employee) return sendJson(res, 404, { error: 'Angajatul nu a fost gasit.' })
    const company = companySettings(db)
    const contract = activeContractFor(hr, req.params.id)
    const today = new Date()
    const hired = employee.data_angajare ? new Date(employee.data_angajare) : null
    let vechime = { ani: 0, luni: 0 }
    if (hired && !Number.isNaN(hired.getTime())) {
      let months = (today.getFullYear() - hired.getFullYear()) * 12 + today.getMonth() - hired.getMonth()
      if (today.getDate() < hired.getDate()) months -= 1
      vechime = { ani: Math.max(0, Math.floor(months / 12)), luni: Math.max(0, months % 12) }
    }
    const start12 = new Date(today)
    start12.setMonth(start12.getMonth() - 12)
    const zileMedical = hr.leaveRequests
      .filter((item) => String(item.employee_id) === String(employee.id))
      .filter((item) => ['aprobata', 'aprobat'].includes(String(item.status || '').toLowerCase()))
      .filter((item) => ['cm', 'concediu_medical', 'medical'].includes(String(item.tip || '').toLowerCase()))
      .filter((item) => new Date(item.data_sfarsit || item.data_start || 0) >= start12)
      .reduce((sum, item) => sum + numberValue(item.zile, businessDays(item.data_start, item.data_sfarsit)), 0)
    const numarAdeverinta = `ADV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`
    const companyPublic = publicCompanySettings(company)
    sendJson(res, 200, {
      tip,
      numar: numarAdeverinta,
      data: todayIso(),
      data_generare: todayIso(),
      vechime,
      zile_concediu_medical_12_luni: zileMedical,
      company: companyPublic,
      identitate_text: identityText(employee),
      footer_html: `Document generat electronic din aplicația InfraFlow la data de ${todayIso()}. Nr. ${numarAdeverinta}.`,
      angajat: {
        ...publicEmployee(employeeWithSalary(hr, employee), auth, db),
        salariu_baza: authHasPermission(auth, 'hr:salary_view') ? numberValue(contract?.salariu_baza) : null,
      },
      contract: contract || null,
    })
  } catch (error) {
    next(error)
  }
})

router.get('/hr/stats', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:view')) return
    const today = todayIso()
    const month = today.slice(0, 7)
    const year = today.slice(0, 4)

    if (isMssqlMode()) {
      const stats = mssqlObject(`
SELECT
  (SELECT COUNT(*) FROM hr.employees WHERE activ = 1) AS total_angajati,
  (SELECT COUNT(DISTINCT employee_id) FROM hr.time_sheets WHERE data = CAST(GETDATE() AS date) AND tip = N'lucru') AS prezenti_azi,
  (SELECT COUNT(*) FROM hr.leave_requests WHERE status IN (N'aprobata', N'aprobat') AND CAST(GETDATE() AS date) BETWEEN data_start AND data_sfarsit) AS in_concediu,
  (SELECT COUNT(*) FROM hr.authorizations WHERE DATEDIFF(day, GETDATE(), data_expirare) BETWEEN 0 AND 30) AS autorizatii_expira_30_zile,
  (SELECT COUNT(*) FROM hr.training WHERE FORMAT(data_start, 'yyyy-MM') = FORMAT(GETDATE(), 'yyyy-MM')) AS formari_luna_aceasta,
  (SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(SUM(CASE WHEN data_plecare IS NOT NULL AND YEAR(data_plecare) = YEAR(GETDATE()) THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) END FROM hr.employees) AS fluctuatie_procent_an_curent
FOR JSON PATH;
`)
      return sendJson(res, 200, stats || {})
    }

    const hr = ensureHrDb(readDb())
    const total = hr.employees.filter((employee) => employee.activ !== false).length
    const leftThisYear = hr.employees.filter((employee) => String(employee.data_plecare || '').startsWith(year)).length
    sendJson(res, 200, {
      total_angajati: total,
      prezenti_azi: new Set(hr.timeSheets.filter((item) => item.data === today && item.tip === 'lucru').map((item) => item.employee_id)).size,
      in_concediu: hr.leaveRequests.filter((item) => ['aprobata', 'aprobat'].includes(item.status) && today >= item.data_start && today <= item.data_sfarsit).length,
      autorizatii_expira_30_zile: hr.authorizations.map(authorizationView).filter((item) => item.alert && !item.expirat).length,
      formari_luna_aceasta: hr.training.filter((item) => String(item.data_start || '').startsWith(month)).length,
      fluctuatie_procent_an_curent: total > 0 ? Number(((leftThisYear / total) * 100).toFixed(2)) : 0
    })
  } catch (error) {
    next(error)
  }
})

// ─── CIM — date pentru generare contract individual de muncă ─────────────────
router.get('/hr/employees/:id/cim', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:view')) return
    const db = readDb()
    const hr = ensureHrDb(db)
    const employee = isMssqlMode()
      ? mssqlObject(`SELECT TOP 1 * FROM hr.employees WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')) FOR JSON PATH;`, req.params)
      : hr.employees.find((item) => String(item.id) === String(req.params.id))
    if (!employee) return sendJson(res, 404, { error: 'Angajatul nu a fost gasit.' })
    const contract = activeContractFor(hr, req.params.id)
    const company = companySettings(db)
    sendJson(res, 200, {
      angajat: publicEmployee(employeeWithSalary(hr, employee), auth, db),
      contract: contract || null,
      company: publicCompanySettings(company),
      nr_cim: contract?.numar_contract || `CIM-${new Date().getFullYear()}-????`,
      data_generare: todayIso(),
    })
  } catch (error) { next(error) }
})

// ─── EVALUĂRI ────────────────────────────────────────────────────────────────
router.get('/hr/evaluations', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:view')) return
    const db = readDb()
    const hr = ensureHrDb(db)
    let evals = hr.evaluations
    if (req.query.employee_id) evals = evals.filter(e => String(e.employee_id) === String(req.query.employee_id))
    if (req.query.year) evals = evals.filter(e => String(e.data_evaluare || '').startsWith(req.query.year))
    sendJson(res, 200, evals.sort((a, b) => String(b.data_evaluare || '').localeCompare(String(a.data_evaluare || ''))))
  } catch (error) { next(error) }
})

router.post('/hr/evaluations', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    const body = req.body || {}
    const db = readDb()
    const hr = ensureHrDb(db)
    const item = {
      id: nextId(hr.evaluations),
      uuid: crypto.randomUUID(),
      employee_id: body.employee_id,
      evaluator_id: body.evaluator_id || auth.user.id,
      evaluator_name: body.evaluator_name || auth.user.name || auth.user.username,
      data_evaluare: body.data_evaluare || todayIso(),
      tip: body.tip || 'periodica',       // periodica | proba | anuala | speciala
      calificativ: body.calificativ || null, // FB / B / S / NS
      punctaj: body.punctaj != null ? numberValue(body.punctaj) : null,
      observatii: body.observatii || null,
      obiective: body.obiective || null,
      recomandari: body.recomandari || null,
      status: body.status || 'finalizata',
      created_at: nowIso(),
      updated_at: null,
    }
    hr.evaluations.push(item)
    addAudit(db, auth.user, 'hr_evaluation_created', `${item.employee_id}/${item.data_evaluare}`)
    writeDb(db)
    sendJson(res, 201, item)
  } catch (error) { next(error) }
})

router.patch('/hr/evaluations/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    const db = readDb()
    const hr = ensureHrDb(db)
    const item = hr.evaluations.find(e => String(e.id) === String(req.params.id))
    if (!item) return sendJson(res, 404, { error: 'Evaluarea nu a fost gasita.' })
    const body = req.body || {}
    ;['tip','calificativ','punctaj','observatii','obiective','recomandari','status','data_evaluare'].forEach(k => {
      if (body[k] !== undefined) item[k] = body[k]
    })
    item.updated_at = nowIso()
    addAudit(db, auth.user, 'hr_evaluation_updated', item.id)
    writeDb(db)
    sendJson(res, 200, item)
  } catch (error) { next(error) }
})

router.delete('/hr/evaluations/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    const db = readDb()
    const hr = ensureHrDb(db)
    const idx = hr.evaluations.findIndex(e => String(e.id) === String(req.params.id))
    if (idx === -1) return sendJson(res, 404, { error: 'Evaluarea nu a fost gasita.' })
    hr.evaluations.splice(idx, 1)
    addAudit(db, auth.user, 'hr_evaluation_deleted', req.params.id)
    writeDb(db)
    sendJson(res, 200, { ok: true })
  } catch (error) { next(error) }
})

// ─── PONTAJ AVANSAT — raport lunar per angajat cu sporuri ────────────────────
router.get('/hr/timesheets/raport-lunar/:employeeId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:timesheet')) return
    const luna = String(req.query.luna || todayIso().slice(0, 7)).slice(0, 7)
    const db = readDb()
    const hr = ensureHrDb(db)
    const employee = hr.employees.find(e => String(e.id) === String(req.params.employeeId))
    if (!employee) return sendJson(res, 404, { error: 'Angajatul nu a fost gasit.' })
    const dates = monthDates(luna)
    const pontaje = hr.timeSheets.filter(ts =>
      String(ts.employee_id) === String(req.params.employeeId) &&
      String(ts.data || '').startsWith(luna)
    )
    const totals = {
      ore_lucru: 0, ore_suplimentare_s1: 0, ore_suplimentare_s2: 0,
      ore_noapte: 0, zile_co: 0, zile_cm: 0, zile_absente: 0,
    }
    const zileleLunii = dates.map(date => {
      const ts = pontaje.find(p => p.data === date) || {}
      const tip = String(ts.tip || 'lucru').toLowerCase()
      const ore = numberValue(ts.ore_lucrate)
      const s1 = numberValue(ts.ore_suplimentare_s1)
      const s2 = numberValue(ts.ore_suplimentare_s2)
      const noapte = numberValue(ts.ore_noapte)
      if (tip === 'lucru' || (!ts.tip && ore > 0)) totals.ore_lucru += ore
      if (tip === 'co' || tip === 'concediu_odihna') totals.zile_co += 1
      if (tip === 'cm' || tip === 'concediu_medical') totals.zile_cm += 1
      if (tip === 'nemotivat' || tip === 'absent') totals.zile_absente += 1
      totals.ore_suplimentare_s1 += s1
      totals.ore_suplimentare_s2 += s2
      totals.ore_noapte += noapte
      return { date, tip: ts.tip || (ore > 0 ? 'lucru' : '-'), ore_lucrate: ore, ore_suplimentare_s1: s1, ore_suplimentare_s2: s2, ore_noapte: noapte, observatii: ts.observatii || null }
    })
    const contract = activeContractFor(hr, req.params.employeeId)
    const salariu = numberValue(contract?.salariu_baza || employee.salariu_baza)
    const normaLuna = totals.ore_lucru || 160
    const costOra = salariu > 0 && normaLuna > 0 ? salariu / normaLuna : 0
    sendJson(res, 200, {
      luna, employee: publicEmployee(employee, auth, db),
      zile: zileleLunii, totals,
      sporuri: {
        spor_s1: Math.round(totals.ore_suplimentare_s1 * costOra * 0.75 * 100) / 100,
        spor_s2: Math.round(totals.ore_suplimentare_s2 * costOra * 1.0 * 100) / 100,
        spor_noapte: Math.round(totals.ore_noapte * costOra * 0.25 * 100) / 100,
      },
    })
  } catch (error) { next(error) }
})

// ─── SCADENȚAR TRAINING OBLIGATORIU ──────────────────────────────────────────
router.get('/hr/training/scadentar', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:view')) return
    const db = readDb()
    const hr = ensureHrDb(db)
    const today = todayIso()
    // Cursuri obligatorii legate de tipuri de autorizații
    const obligatorii = [
      { tip: 'SSM', interval_luni: 12, icon: '🦺' },
      { tip: 'PSI', interval_luni: 12, icon: '🔥' },
      { tip: 'ISCIR', interval_luni: 24, icon: '⚙️' },
      { tip: 'Permis_conducere_auto', interval_luni: 60, icon: '🚗' },
    ]
    const rezultate = []
    hr.employees.filter(e => e.activ !== false).forEach(emp => {
      obligatorii.forEach(curs => {
        const lastTraining = hr.trainingEmployees
          .map(te => hr.training.find(t => t.id === te.training_id && String(te.employee_id) === String(emp.id)))
          .filter(t => t && String(t.tip || '').toLowerCase().includes(curs.tip.toLowerCase()))
          .sort((a, b) => String(b.data_sfarsit || b.data_start || '').localeCompare(String(a.data_sfarsit || a.data_start || '')))[0]
        const lastDate = lastTraining?.valabil_pana_la || lastTraining?.data_sfarsit || null
        const days = lastDate ? Math.ceil((new Date(lastDate).getTime() - new Date(today).getTime()) / 86400000) : -999
        if (days <= 60) {
          rezultate.push({
            employee_id: emp.id, employee_name: `${emp.prenume || ''} ${emp.nume || ''}`.trim(),
            department: emp.department_name || departmentName(db, emp.department_id),
            tip_curs: curs.tip, icon: curs.icon,
            valabil_pana_la: lastDate, days_until_expiry: days,
            status: days < 0 ? 'expirat' : days <= 30 ? 'urgent' : 'avertizare',
          })
        }
      })
    })
    sendJson(res, 200, rezultate.sort((a, b) => (a.days_until_expiry ?? -9999) - (b.days_until_expiry ?? -9999)))
  } catch (error) { next(error) }
})

// ══════════════════════════════════════════════════════════════════════════════
// KIOSK ANGAJAT — Activare cont, Login, Resetare parolă, Foi proprii
// ══════════════════════════════════════════════════════════════════════════════

function hashPasswordKiosk(password) {
  const crypto = require('crypto')
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

function verifyPasswordKiosk(kioskUser, password) {
  if (!kioskUser?.passwordHash) return false
  const parts = String(kioskUser.passwordHash).split(':')
  if (parts[0] !== 'scrypt' || !parts[1] || !parts[2]) return false
  try {
    const crypto = require('crypto')
    const hash = crypto.scryptSync(password, parts[1], 64)
    const stored = Buffer.from(parts[2], 'hex')
    return stored.length === hash.length && crypto.timingSafeEqual(stored, hash)
  } catch { return false }
}

// POST /hr/kiosk/activate
router.post('/hr/kiosk/activate', (req, res, next) => {
  try {
    const ip = kioskSessions.clientIp(req)
    if (kioskSessions.isBlocked(ip)) {
      return sendJson(res, 429, { error: 'Prea multe încercări eșuate. Încearcă din nou peste 30 de minute.' })
    }
    const body = req.body || {}
    const cnp = String(body.cnp || '').trim()
    const act_tip = String(body.act_tip || 'CI').trim()
    const act_serie = String(body.act_serie || '').trim().toUpperCase()
    const act_numar = String(body.act_numar || '').trim()
    const functia = String(body.functia || '').trim()
    const username = String(body.username || '').trim().toLowerCase()
    const password = String(body.password || '')

    if (!cnp || !act_serie || !act_numar || !functia || !username || !password) {
      return sendJson(res, 400, { error: 'Toate câmpurile marcate cu * sunt obligatorii.' })
    }
    if (password.length < 6) {
      return sendJson(res, 400, { error: 'Parola trebuie să aibă cel puțin 6 caractere.' })
    }
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      return sendJson(res, 400, { error: 'Username invalid (3-32 caractere, litere mici, cifre, punct, liniuță).' })
    }

    const GENERIC_ERR = 'Datele introduse nu corespund cu evidențele noastre. Verifică CNP-ul, seria/numărul actului și funcția.'
    const db = readDb()
    const hr = ensureHrDb(db)

    const emp = hr.employees.find(e => e.cnp === cnp && e.activ !== false)
    if (!emp) { kioskSessions.recordFailure(ip); return sendJson(res, 422, { error: GENERIC_ERR }) }

    const empSerie = String(emp.act_identitate_serie || emp.ci_serie || '').toUpperCase()
    const empNumar = String(emp.act_identitate_numar || emp.ci_numar || '').trim()
    if (empSerie !== act_serie || empNumar !== act_numar) {
      kioskSessions.recordFailure(ip); return sendJson(res, 422, { error: GENERIC_ERR })
    }
    if (!(emp.functia || '').toLowerCase().includes(functia.toLowerCase())) {
      kioskSessions.recordFailure(ip); return sendJson(res, 422, { error: GENERIC_ERR })
    }
    if (hr.kioskUsers.find(u => u.username === username)) {
      kioskSessions.recordFailure(ip)
      return sendJson(res, 409, { error: 'Username indisponibil. Alege altul.' })
    }
    if (hr.kioskUsers.find(u => String(u.employee_id) === String(emp.id))) {
      return sendJson(res, 409, { error: 'Angajatul are deja un cont Kiosk. Folosește "Am uitat parola" pentru resetare.' })
    }

    hr.kioskUsers.push({
      id: nextId(hr.kioskUsers),
      uuid: crypto.randomUUID(),
      employee_id: emp.id,
      username,
      passwordHash: hashPasswordKiosk(password),
      act_tip,
      created_at: nowIso(),
      activ: true
    })
    writeDb(db)
    kioskSessions.clearLimit(ip)
    return sendJson(res, 201, { ok: true, message: 'Cont activat cu succes. Te poți loga cu username-ul ales.' })
  } catch (err) { next(err) }
})

// POST /hr/kiosk/login
router.post('/hr/kiosk/login', (req, res, next) => {
  try {
    const ip = kioskSessions.clientIp(req)
    if (kioskSessions.isBlocked(ip)) {
      return sendJson(res, 429, { error: 'Prea multe încercări eșuate. Încearcă din nou peste 30 de minute.' })
    }
    const body = req.body || {}
    const username = String(body.username || '').trim().toLowerCase()
    const password = String(body.password || '')
    if (!username || !password) return sendJson(res, 400, { error: 'Username și parola sunt obligatorii.' })

    const db = readDb()
    const hr = ensureHrDb(db)
    const kioskUser = hr.kioskUsers.find(u => u.username === username && u.activ !== false)
    if (!kioskUser || !verifyPasswordKiosk(kioskUser, password)) {
      kioskSessions.recordFailure(ip)
      return sendJson(res, 401, { error: 'Username sau parolă incorectă.' })
    }
    kioskSessions.clearLimit(ip)

    const token = kioskSessions.createSession(kioskUser.employee_id, username)
    const emp = hr.employees.find(e => String(e.id) === String(kioskUser.employee_id))
    return sendJson(res, 200, {
      token,
      employee_id: kioskUser.employee_id,
      employee_name: emp ? [emp.prenume, emp.nume].filter(Boolean).join(' ') : username,
      username
    })
  } catch (err) { next(err) }
})

// POST /hr/kiosk/reset-request
router.post('/hr/kiosk/reset-request', (req, res, next) => {
  try {
    const ip = kioskSessions.clientIp(req)
    if (kioskSessions.isBlocked(ip)) {
      return sendJson(res, 429, { error: 'Prea multe încercări. Încearcă mai târziu.' })
    }
    const body = req.body || {}
    const cnp = String(body.cnp || '').trim()
    const act_serie = String(body.act_serie || '').trim().toUpperCase()
    const act_numar = String(body.act_numar || '').trim()
    if (!cnp || !act_serie || !act_numar) return sendJson(res, 400, { error: 'CNP, serie și număr act sunt obligatorii.' })

    const GENERIC_ERR = 'Datele introduse nu corespund. Contactează HR pentru asistență.'
    const db = readDb()
    const hr = ensureHrDb(db)

    const emp = hr.employees.find(e => e.cnp === cnp && e.activ !== false)
    if (!emp) { kioskSessions.recordFailure(ip); return sendJson(res, 422, { error: GENERIC_ERR }) }

    const empSerie = String(emp.act_identitate_serie || emp.ci_serie || '').toUpperCase()
    const empNumar = String(emp.act_identitate_numar || emp.ci_numar || '').trim()
    if (empSerie !== act_serie || empNumar !== act_numar) {
      kioskSessions.recordFailure(ip); return sendJson(res, 422, { error: GENERIC_ERR })
    }
    const kioskUser = hr.kioskUsers.find(u => String(u.employee_id) === String(emp.id))
    if (!kioskUser) {
      return sendJson(res, 422, { error: 'Nu există cont Kiosk pentru aceste date. Activează contul mai întâi.' })
    }

    const cod = String(Math.floor(100000 + Math.random() * 900000))
    const expires_at = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    hr.kioskResetCodes = hr.kioskResetCodes.filter(c => String(c.employee_id) !== String(emp.id))
    hr.kioskResetCodes.push({ employee_id: emp.id, cnp, cod, expires_at, created_at: nowIso() })

    // Notificare HR (useri cu rol hr)
    const hrUsers = (db.users || []).filter(u => u.active &&
      (u.role === 'hr' || (u.roles || []).includes('hr') || (u.roles || []).includes('hr-manager')))
    if (!Array.isArray(db.notifications)) db.notifications = []
    const empName = [emp.prenume, emp.nume].filter(Boolean).join(' ')
    hrUsers.forEach(hrUser => {
      db.notifications.push({
        id: crypto.randomUUID(),
        type: 'kiosk_reset_request',
        user_id: hrUser.id,
        message: `Resetare parolă Kiosk solicitată de ${empName} (${emp.functia || '—'}). Cod: ${cod} (valabil 2 ore).`,
        created_at: nowIso(),
        read: false
      })
    })
    writeDb(db)
    kioskSessions.clearLimit(ip)
    return sendJson(res, 200, { ok: true, message: 'Solicitarea a fost înregistrată. HR-ul îți va comunica codul de resetare.' })
  } catch (err) { next(err) }
})

// POST /hr/kiosk/reset-confirm
router.post('/hr/kiosk/reset-confirm', (req, res, next) => {
  try {
    const body = req.body || {}
    const cnp = String(body.cnp || '').trim()
    const cod = String(body.cod || '').trim()
    const password_nou = String(body.password_nou || '')
    if (!cnp || !cod || !password_nou) return sendJson(res, 400, { error: 'CNP, cod și parola nouă sunt obligatorii.' })
    if (password_nou.length < 6) return sendJson(res, 400, { error: 'Parola trebuie să aibă cel puțin 6 caractere.' })

    const db = readDb()
    const hr = ensureHrDb(db)
    const resetEntry = hr.kioskResetCodes.find(c => c.cnp === cnp && c.cod === cod)
    if (!resetEntry) return sendJson(res, 422, { error: 'Cod de resetare invalid sau CNP incorect.' })
    if (new Date(resetEntry.expires_at) < new Date()) {
      return sendJson(res, 422, { error: 'Codul a expirat. Solicită un cod nou.' })
    }
    const kioskUser = hr.kioskUsers.find(u => String(u.employee_id) === String(resetEntry.employee_id))
    if (!kioskUser) return sendJson(res, 422, { error: 'Contul Kiosk nu a fost găsit.' })
    kioskUser.passwordHash = hashPasswordKiosk(password_nou)
    kioskUser.updated_at = nowIso()
    hr.kioskResetCodes = hr.kioskResetCodes.filter(c => c !== resetEntry)
    writeDb(db)
    return sendJson(res, 200, { ok: true, message: 'Parola a fost schimbată cu succes. Te poți loga cu noua parolă.' })
  } catch (err) { next(err) }
})

// GET /hr/kiosk/my-trips
router.get('/hr/kiosk/my-trips', (req, res, next) => {
  try {
    const session = kioskSessions.requireKioskAuth(req, res)
    if (!session) return
    const db = readDb()
    const hr = ensureHrDb(db)
    const emp = hr.employees.find(e => String(e.id) === String(session.employee_id))
    if (!emp) return sendJson(res, 404, { error: 'Angajatul nu a fost găsit.' })

    const trips = Array.isArray(db.fleetTripLogs) ? db.fleetTripLogs : []
    const firstName = (emp.prenume || '').toLowerCase()
    const lastName = (emp.nume || '').toLowerCase()
    const myTrips = trips.filter(t =>
      String(t.sofer_id) === String(emp.id) ||
      String(t.employee_id) === String(emp.id) ||
      (firstName && lastName && t.sofer_text &&
        t.sofer_text.toLowerCase().includes(firstName) &&
        t.sofer_text.toLowerCase().includes(lastName))
    )
    .sort((a, b) => String(b.data || b.created_at || '').localeCompare(String(a.data || a.created_at || '')))
    .slice(0, 60)

    const assets = Array.isArray(db.fleetAssets) ? db.fleetAssets : []
    const enriched = myTrips.map(t => {
      const asset = assets.find(a => String(a.id) === String(t.asset_id))
      const assetLbl = asset ? [
        asset.nr_inmatriculare || asset.registration || asset.cod,
        [asset.marca || asset.brand, asset.model].filter(Boolean).join(' ')
      ].filter(Boolean).join(' / ') : (t.nr_inmatriculare || '')
      return { ...t, asset_label: assetLbl }
    })
    return sendJson(res, 200, { trips: enriched })
  } catch (err) { next(err) }
})

// ── POST /hr/verify-employee — verifică angajat din HR (pentru creare cont) ──

router.post('/hr/verify-employee', async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'users:manage')) return

    const body = req.body || {}
    const cnp = String(body.cnp || '').trim()
    const act_serie = String(body.act_serie || '').toUpperCase().trim()
    const act_numar = String(body.act_numar || '').trim()

    if (!cnp || !act_serie || !act_numar) {
      return sendJson(res, 400, { error: 'CNP, serie și număr act de identitate sunt obligatorii.' })
    }

    const db = readDb()
    const hr = db.hr || {}
    const employees = hr.employees || []

    const emp = employees.find(e =>
      e.cnp === cnp &&
      String(e.act_identitate_serie || e.ci_serie || '').toUpperCase() === act_serie &&
      String(e.act_identitate_numar || e.ci_numar || '').trim() === act_numar &&
      e.activ !== false
    )

    if (!emp) {
      return sendJson(res, 404, { found: false })
    }

    // Verifică să nu fie deja asociat unui alt cont activ
    const alreadyLinked = (db.users || []).find(u =>
      u.employee_id === String(emp.id) && u.active !== false
    )
    if (alreadyLinked) {
      return sendJson(res, 409, {
        found: false,
        error: 'Angajatul este deja asociat unui cont existent.'
      })
    }

    return sendJson(res, 200, {
      found: true,
      employee_id: String(emp.id),
      nume: [emp.prenume, emp.nume].filter(Boolean).join(' '),
      functia: emp.functia || '',
      departament: emp.department || emp.departament || ''
    })
  } catch (err) { next(err) }
})

module.exports = router
