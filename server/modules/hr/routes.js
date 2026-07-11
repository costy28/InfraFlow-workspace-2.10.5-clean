const { Router } = require('express')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const xlsx = require('xlsx')
const AdmZip = require('adm-zip')
const { requireAuth, hashPassword, verifyPassword } = require('../../core/auth')
const { requirePermission, authHasPermission } = require('../../core/permissions')
const kioskSessions = require('../../core/kiosk-sessions')
const { readDb, writeDb, runMssqlScalar, DB_MODE, MSSQL_RELATIONAL_MODE } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const { valideazaCNP, infoCNP } = require('../../shared/cnp-validator')
const { registerPontaj, reversePontajRegistration } = require('../controlling/auto-register')
const { notifyUser, createDepartmentChannel } = require('../messaging/routes')
const { sendEmail } = require('../messaging/email')
const { sanitizeEmployee } = require('./data-policy')
const payrollRoutes = require('./payroll-routes')
const { assertTimesheetOpen } = require('./timesheet-locks')
const { buildRegesWorkRow, buildRegesWorkbook, buildInternalXml } = require('./reges-work-register')
const { dailyOvertime } = require('./overtime-policy')
const { weeklyControls } = require('./working-time-policy')
const { calendarDays, missingMedicalField } = require('./medical-leave-policy')
const { buildMedicalRegister } = require('./medical-leave-register')
const { applyCompensatedHours } = require('./timesheet-compensation')

const router = Router()
const NEXUS_TIMESHEET_TEMPLATE = path.join(__dirname, '../../../db/templates/pontaj_nexus_sablon.xlsx')
const HR_TEMPLATE_ROOT = path.join(__dirname, '../../../storage/hr-templates')
const HR_FILE_ROOT = path.join(__dirname, '../../../storage/hr-files')
const upload = multer({
  dest: path.join(__dirname, '../../../storage/temp/'),
  limits: { fileSize: 10 * 1024 * 1024 }
})

// Asigură existența directoarelor de storage la pornire
;['storage/angajati', 'storage/temp', 'storage/documente', 'storage/hr-templates', 'storage/hr-files'].forEach(dir => {
  const p = path.join(__dirname, '../../../', dir)
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
})

function sendJson(res, status, data) {
  res.status(status).json(data)
}

function isMssqlMode() {
  return MSSQL_RELATIONAL_MODE && (DB_MODE === 'mssql' || DB_MODE === 'sqlserver')
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
  db.hr.contractAmendments = Array.isArray(db.hr.contractAmendments) ? db.hr.contractAmendments : []
  db.hr.documentTemplates = Array.isArray(db.hr.documentTemplates) ? db.hr.documentTemplates : []
  db.hr.timeSheets = Array.isArray(db.hr.timeSheets) ? db.hr.timeSheets : []
  db.hr.leaveRequests = Array.isArray(db.hr.leaveRequests) ? db.hr.leaveRequests : []
  db.hr.medicalLeaveCertificates = Array.isArray(db.hr.medicalLeaveCertificates) ? db.hr.medicalLeaveCertificates : []
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
  db.hr.timesheetLocks = Array.isArray(db.hr.timesheetLocks) ? db.hr.timesheetLocks : []
  return db.hr
}

const DEFAULT_HR_DOCUMENT_TEMPLATES = [
  {
    id: 'cim',
    denumire: 'Contract individual de munca',
    tip: 'contract',
    descriere: 'Sablon CIM folosit la generarea contractului din fisa angajatului.',
    template_html: `<h2 style="text-align:center">CONTRACT INDIVIDUAL DE MUNCĂ</h2>
<p style="text-align:center">Nr. <strong>{{nr_cim}}</strong> / data <strong>{{data_generare}}</strong></p>
<h3>I. Angajator</h3>
<p><strong>{{company.denumire}}</strong>, CUI {{company.cui}}, sediul {{company.adresa}}, reprezentată de {{company.reprezentant}}.</p>
<h3>II. Salariat</h3>
<p>{{angajat.prenume}} {{angajat.nume}}, CNP {{angajat.cnp}}, marca {{angajat.marca}}, domiciliu {{angajat.adresa}}.</p>
<h3>III. Obiectul contractului</h3>
<p>Salariatul este angajat în funcția de <strong>{{contract.functia}}</strong>, în cadrul departamentului <strong>{{angajat.department_name}}</strong>.</p>
<h3>IV. Durata și locul muncii</h3>
<p>Data începerii activității: <strong>{{contract.data_start}}</strong>. Tip contract: <strong>{{contract.tip}}</strong>.</p>
<h3>V. Durata muncii</h3>
<p>Program de lucru: <strong>{{contract.norma_ore}}</strong> ore/zi.</p>
<h3>VI. Salariul</h3>
<p>Salariu de bază brut lunar: <strong>{{contract.salariu_baza}}</strong> RON.</p>
<h3>VII. Concediu</h3>
<p>Durata concediului anual de odihnă: <strong>{{angajat.zile_co_drept}}</strong> zile lucrătoare.</p>
<div style="margin-top:60px;display:flex;justify-content:space-between"><div><strong>ANGAJATOR</strong><br>{{company.reprezentant}}<br><br>Semnătură: ____________</div><div><strong>SALARIAT</strong><br>{{angajat.prenume}} {{angajat.nume}}<br><br>Semnătură: ____________</div></div>`
  },
  {
    id: 'act_aditional',
    denumire: 'Act aditional CIM',
    tip: 'act_aditional',
    descriere: 'Sablon pentru acte aditionale generate din contractele HR.',
    template_html: `<h2 style="text-align:center">{{titlu}}</h2>
<h3 style="text-align:center">la Contractul Individual de Muncă</h3>
<p style="text-align:center">Nr. <strong>{{amendment.numar_act}}</strong> / data <strong>{{amendment.data_act}}</strong></p>
<p>Angajatorul <strong>{{company.denumire}}</strong> și salariatul <strong>{{angajat.prenume}} {{angajat.nume}}</strong>, CNP {{angajat.cnp}}, convin următoarea modificare cu efect de la <strong>{{amendment.data_efect}}</strong>:</p>
<div>{{modificare_html}}</div>
<p>Celelalte clauze ale contractului individual de muncă rămân neschimbate.</p>
<div style="margin-top:60px;display:flex;justify-content:space-between"><div><strong>ANGAJATOR</strong><br>{{company.reprezentant}}<br><br>Semnătură: ____________</div><div><strong>SALARIAT</strong><br>{{angajat.prenume}} {{angajat.nume}}<br><br>Semnătură: ____________</div></div>`
  }
]

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
    denumire: company.company_name || company.companyName || company.denumire_firma || company.denumire || '',
    cui: company.company_cui || company.companyCui || company.cui || '',
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
  const result = sanitizeEmployee({
    ...employee,
    department_name: employee.department_name || departmentName(db, employee.department_id),
    zile_vechime: daysBetween(employee.data_angajare)
  }, {
    own: String(employee.user_id || '') === String(auth?.user?.id || ''),
    personal: authHasPermission(auth, 'hr:personal_sensitive'),
    medical: authHasPermission(auth, 'hr:medical_view'),
    contact: authHasPermission(auth, 'hr:view') && !authHasPermission(auth, 'echipamente:gestionar') || authHasPermission(auth, 'hr:employees_manage'),
    salary: authHasPermission(auth, 'hr:salary_view')
  })
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
    `${year}-01-01`, `${year}-01-02`, `${year}-01-06`, `${year}-01-07`, `${year}-01-24`, `${year}-05-01`,
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

function businessDateRange(start, end) {
  return dateRange(start, end).filter((iso) => {
    const date = new Date(`${iso}T12:00:00`)
    return date.getDay() !== 0 && date.getDay() !== 6 && !legalHolidays(date.getFullYear()).has(iso)
  })
}

function leaveTimesheetType(value) {
  const type = String(value || '').toLowerCase()
  if (['co', 'concediu', 'concediu_odihna'].includes(type)) return 'concediu_odihna'
  if (['cm', 'medical', 'concediu_medical'].includes(type)) return 'concediu_medical'
  if (type === 'delegatie') return 'delegatie'
  if (type === 'nemotivat') return 'nemotivat'
  return 'liber'
}

function cloneStyle(style) {
  return style ? JSON.parse(JSON.stringify(style)) : undefined
}

function cellStyleWithFill(style, rgb) {
  return {
    ...(cloneStyle(style) || {}),
    fill: { patternType: 'solid', fgColor: { rgb } },
  }
}

function setSheetCell(sheet, row, col, value, style) {
  const ref = xlsx.utils.encode_cell({ r: row, c: col })
  sheet[ref] = { t: typeof value === 'number' ? 'n' : 's', v: value ?? '' }
  if (style) sheet[ref].s = cloneStyle(style)
}

function applyNexusStyles(buffer, fillsByCell, dataEndRow, footerRow) {
  const colors = [...new Set(Object.values(fillsByCell))]
  const zip = new AdmZip(buffer)
  const templateZip = new AdmZip(NEXUS_TIMESHEET_TEMPLATE)
  const stylesEntry = zip.getEntry('xl/styles.xml')
  const sheetEntry = zip.getEntry('xl/worksheets/sheet1.xml')
  const templateStylesEntry = templateZip.getEntry('xl/styles.xml')
  const templateSheetEntry = templateZip.getEntry('xl/worksheets/sheet1.xml')
  if (!stylesEntry || !sheetEntry || !templateStylesEntry || !templateSheetEntry) return buffer
  let stylesXml = templateStylesEntry.getData().toString('utf8')
  let sheetXml = sheetEntry.getData().toString('utf8')
  const templateSheetXml = templateSheetEntry.getData().toString('utf8')
  const sourceStyles = new Map()
  for (const match of templateSheetXml.matchAll(/<c r="([A-Z]+\d+)"([^>]*)>/g)) {
    const style = /\ss="(\d+)"/.exec(match[2])?.[1]
    if (style !== undefined) sourceStyles.set(match[1], style)
  }
  sheetXml = sheetXml.replace(/<c r="([A-Z]+)(\d+)"([^>]*)>/g, (cell, col, rawRow, attributes) => {
    const row = Number(rawRow)
    let sourceRow = row
    if (row >= 7 && row <= dataEndRow) sourceRow = row % 2 === 1 ? 7 : 8
    if (row === footerRow) sourceRow = 11
    if (row === footerRow + 1) sourceRow = 12
    const style = sourceStyles.get(`${col}${sourceRow}`)
    if (style === undefined) return cell
    const cleanAttributes = attributes.replace(/\ss="\d+"/, '')
    return `<c r="${col}${row}" s="${style}"${cleanAttributes}>`
  })
  if (!colors.length) {
    zip.updateFile(stylesEntry.entryName, Buffer.from(stylesXml, 'utf8'))
    zip.updateFile(sheetEntry.entryName, Buffer.from(sheetXml, 'utf8'))
    return zip.toBuffer()
  }
  const fillMatch = /<fills count="(\d+)">([\s\S]*?)<\/fills>/.exec(stylesXml)
  const xfMatch = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(stylesXml)
  if (!fillMatch || !xfMatch) return buffer
  const fillStart = Number(fillMatch[1])
  const xfStart = Number(xfMatch[1])
  const styleByColor = new Map()
  const fillNodes = colors.map((rgb, index) => {
    styleByColor.set(rgb, xfStart + index)
    return `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`
  }).join('')
  const xfNodes = colors.map((rgb, index) => (
    `<xf numFmtId="0" fontId="0" fillId="${fillStart + index}" borderId="0" xfId="0" applyFill="1"/>`
  )).join('')
  stylesXml = stylesXml
    .replace(fillMatch[0], `<fills count="${fillStart + colors.length}">${fillMatch[2]}${fillNodes}</fills>`)
    .replace(xfMatch[0], `<cellXfs count="${xfStart + colors.length}">${xfMatch[2]}${xfNodes}</cellXfs>`)
  Object.entries(fillsByCell).forEach(([cell, rgb]) => {
    const styleId = styleByColor.get(rgb)
    sheetXml = sheetXml.replace(new RegExp(`<c r="${cell}"(?: s="\\d+")?`), `<c r="${cell}" s="${styleId}"`)
  })
  zip.updateFile(stylesEntry.entryName, Buffer.from(stylesXml, 'utf8'))
  zip.updateFile(sheetEntry.entryName, Buffer.from(sheetXml, 'utf8'))
  return zip.toBuffer()
}

function nexusCode(value) {
  const raw = String(value || '').trim().toLowerCase()
  const codes = {
    co: 'CO', concediu: 'CO', concediu_odihna: 'CO',
    cm: 'CM', concediu_medical: 'CM',
    ced: 'CED', concediu_evenimente: 'CED',
    cfp: 'CFP', concediu_fara_plata: 'CFP',
    abs: 'ABS', absent: 'ABS', absenta: 'ABS', nemotivat: 'ABS',
    cic: 'CIC', ca: 'CIC', crestere_copil: 'CIC',
    ctl: 'CTL', lp: 'LP', prb: 'PRB', c: 'C', d: 'D', i: 'I', n: 'N', s: 'S', ls: 'LS', zn: 'ZN',
  }
  return codes[raw] || ''
}

function nexusLeaveForDate(leaves, employeeId, date) {
  return leaves.find((leave) => (
    String(leave.employee_id) === String(employeeId) &&
    ['aprobata', 'aprobat', 'approved'].includes(String(leave.status || '').toLowerCase()) &&
    String(leave.data_start || '') <= date &&
    String(leave.data_sfarsit || '') >= date
  ))
}

function nexusTimesheetRows(db, luna, deptId) {
  const hr = ensureHrDb(db)
  if (isMssqlMode()) {
    return {
      employees: mssqlArray(`
SELECT e.*, d.denumire AS department_name
FROM hr.employees e
LEFT JOIN core.departments d ON d.id = e.department_id
WHERE ISNULL(e.activ, 1) = 1
AND (NULLIF(JSON_VALUE(@p, '$.deptId'), '') IS NULL OR CONVERT(nvarchar(100), e.department_id) = JSON_VALUE(@p, '$.deptId'))
ORDER BY e.nume, e.prenume
FOR JSON PATH;
`, { deptId }),
      timesheets: mssqlArray(`
SELECT ts.*
FROM hr.time_sheets ts
JOIN hr.employees e ON e.id = ts.employee_id
WHERE FORMAT(ts.data, 'yyyy-MM') = JSON_VALUE(@p, '$.luna')
AND (NULLIF(JSON_VALUE(@p, '$.deptId'), '') IS NULL OR CONVERT(nvarchar(100), e.department_id) = JSON_VALUE(@p, '$.deptId'))
FOR JSON PATH;
`, { luna, deptId }),
      leaves: mssqlArray(`
SELECT lr.*
FROM hr.leave_requests lr
JOIN hr.employees e ON e.id = lr.employee_id
WHERE lr.status IN (N'aprobata', N'aprobat', N'approved')
AND CONVERT(char(7), lr.data_start, 126) <= JSON_VALUE(@p, '$.luna')
AND CONVERT(char(7), lr.data_sfarsit, 126) >= JSON_VALUE(@p, '$.luna')
AND (NULLIF(JSON_VALUE(@p, '$.deptId'), '') IS NULL OR CONVERT(nvarchar(100), e.department_id) = JSON_VALUE(@p, '$.deptId'))
FOR JSON PATH;
`, { luna, deptId }),
    }
  }
  const employees = hr.employees
    .filter((employee) => employee.activ !== false && employee.activ !== 0)
    .filter((employee) => !deptId || String(employee.department_id) === String(deptId))
    .map((employee) => ({ ...employee, department_name: departmentName(db, employee.department_id) }))
    .sort((left, right) => employeeName(left).localeCompare(employeeName(right), 'ro'))
  const employeeIds = new Set(employees.map((employee) => String(employee.id)))
  return {
    employees,
    timesheets: hr.timeSheets.filter((item) => employeeIds.has(String(item.employee_id)) && String(item.data || '').startsWith(luna)),
    leaves: hr.leaveRequests.filter((item) => employeeIds.has(String(item.employee_id))),
  }
}

function buildNexusTimesheetWorkbook(db, user, luna, deptId) {
  const workbook = xlsx.readFile(NEXUS_TIMESHEET_TEMPLATE, { cellStyles: true })
  const sourceSheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sourceSheetName]
  const { employees, timesheets, leaves } = nexusTimesheetRows(db, luna, deptId)
  const [year, month] = luna.split('-').map(Number)
  const dates = monthDates(luna)
  const holidays = legalHolidays(year)
  const monthName = new Intl.DateTimeFormat('ro-RO', { month: 'long' }).format(new Date(year, month - 1, 1)).toUpperCase()
  const company = publicCompanySettings(companySettings(db))
  const deptName = employees[0]?.department_name || (deptId ? departmentName(db, deptId) : 'Toate departamentele')
  const dataRowStyles = [6, 7].map((row) => Array.from({ length: 55 }, (_, col) => sheet[xlsx.utils.encode_cell({ r: row, c: col })]?.s))
  const dataMerges = (sheet['!merges'] || []).filter((merge) => merge.s.r >= 6 && merge.e.r <= 7)
  const nexusFills = {}
  sheet['!merges'] = (sheet['!merges'] || []).filter((merge) => merge.e.r < 6)
  Object.keys(sheet).filter((key) => !key.startsWith('!')).forEach((key) => {
    const cell = xlsx.utils.decode_cell(key)
    if (cell.r >= 6) delete sheet[key]
  })
  setSheetCell(sheet, 1, 2, `Nume Societate: ${company.denumire}\r\nCIF: ${company.cui}`, sheet.C2?.s)
  setSheetCell(sheet, 2, 2, `${deptName} - Foaie colectiva de prezenta pe luna ${monthName} ${year}`, sheet.C3?.s)
  const weekdays = ['D', 'L', 'Ma', 'Mi', 'J', 'V', 'S']
  for (let day = 1; day <= 31; day += 1) {
    const date = dates[day - 1]
    setSheetCell(sheet, 3, day + 2, day, sheet[xlsx.utils.encode_cell({ r: 3, c: day + 2 })]?.s)
    setSheetCell(sheet, 4, day + 2, date ? weekdays[new Date(`${date}T00:00:00`).getDay()] : '', sheet[xlsx.utils.encode_cell({ r: 4, c: day + 2 })]?.s)
    const isWorkDay = date && ![0, 6].includes(new Date(`${date}T00:00:00`).getDay()) && !holidays.has(date)
    setSheetCell(sheet, 5, day + 2, date ? (isWorkDay ? 'Z' : 'N') : '', sheet[xlsx.utils.encode_cell({ r: 5, c: day + 2 })]?.s)
  }
  employees.forEach((employee, index) => {
    const topRow = 6 + index * 2
    const bottomRow = topRow + 1
    dataMerges.forEach((merge) => sheet['!merges'].push({
      s: { c: merge.s.c, r: topRow + merge.s.r - 6 },
      e: { c: merge.e.c, r: bottomRow + merge.e.r - 7 },
    }))
    const totals = { ore: 0, CO: 0, CM: 0, CED: 0, CFP: 0, ABS: 0, CIC: 0, supl: 0, sl: 0, noapte: 0, weekend: 0, cercetare: 0, supl1: 0, supl2: 0, compensate: 0, a152: 0, consemn: 0 }
    for (let col = 0; col < 55; col += 1) {
      setSheetCell(sheet, topRow, col, '', dataRowStyles[0][col])
      setSheetCell(sheet, bottomRow, col, '', dataRowStyles[1][col])
    }
    setSheetCell(sheet, topRow, 0, index + 1, dataRowStyles[0][0])
    setSheetCell(sheet, topRow, 1, employee.marca || '', dataRowStyles[0][1])
    setSheetCell(sheet, topRow, 2, employeeName(employee).toUpperCase(), dataRowStyles[0][2])
    setSheetCell(sheet, bottomRow, 0, index + 1, dataRowStyles[1][0])
    setSheetCell(sheet, bottomRow, 1, employee.marca || '', dataRowStyles[1][1])
    dates.forEach((date, dateIndex) => {
      const timesheet = timesheets.find((item) => String(item.employee_id) === String(employee.id) && String(item.data || '').slice(0, 10) === date)
      const leave = nexusLeaveForDate(leaves, employee.id, date)
      const code = nexusCode(timesheet?.tip) || nexusCode(leave?.tip)
      const hours = numberValue(timesheet?.ore_lucrate)
      const day = new Date(`${date}T00:00:00`).getDay()
      const weekend = day === 0 || day === 6
      const holiday = holidays.has(date)
      let topStyle = dataRowStyles[0][dateIndex + 3]
      let bottomStyle = dataRowStyles[1][dateIndex + 3]
      if (weekend) {
        topStyle = cellStyleWithFill(topStyle, 'D9D9D9')
        bottomStyle = cellStyleWithFill(bottomStyle, 'D9D9D9')
        nexusFills[xlsx.utils.encode_cell({ r: topRow, c: dateIndex + 3 })] = 'D9D9D9'
        nexusFills[xlsx.utils.encode_cell({ r: bottomRow, c: dateIndex + 3 })] = 'D9D9D9'
      }
      if (holiday) {
        topStyle = cellStyleWithFill(topStyle, 'FFB3B3')
        bottomStyle = cellStyleWithFill(bottomStyle, 'FFB3B3')
        nexusFills[xlsx.utils.encode_cell({ r: topRow, c: dateIndex + 3 })] = 'FFB3B3'
        nexusFills[xlsx.utils.encode_cell({ r: bottomRow, c: dateIndex + 3 })] = 'FFB3B3'
      }
      if (code === 'CO') {
        bottomStyle = cellStyleWithFill(bottomStyle, 'FFF2CC')
        nexusFills[xlsx.utils.encode_cell({ r: bottomRow, c: dateIndex + 3 })] = 'FFF2CC'
      }
      if (code === 'CM') {
        bottomStyle = cellStyleWithFill(bottomStyle, 'DDEBF7')
        nexusFills[xlsx.utils.encode_cell({ r: bottomRow, c: dateIndex + 3 })] = 'DDEBF7'
      }
      if (code === 'ABS') {
        bottomStyle = cellStyleWithFill(bottomStyle, 'FFB3B3')
        nexusFills[xlsx.utils.encode_cell({ r: bottomRow, c: dateIndex + 3 })] = 'FFB3B3'
      }
      setSheetCell(sheet, topRow, dateIndex + 3, code ? '' : (hours || ''), topStyle)
      setSheetCell(sheet, bottomRow, dateIndex + 3, code, bottomStyle)
      totals.ore += code ? 0 : hours
      if (totals[code] !== undefined) totals[code] += numberValue(employee.norma_ore_zi, 8)
      totals.supl1 += numberValue(timesheet?.ore_suplimentare_s1)
      totals.supl2 += numberValue(timesheet?.ore_suplimentare_s2)
      totals.noapte += numberValue(timesheet?.ore_noapte)
      totals.compensate += numberValue(timesheet?.ore_compensate)
      if (weekend) totals.weekend += hours
      if (holiday) totals.sl += hours
    })
    const values = [
      totals.ore, totals.CO, totals.CM, totals.CED, totals.CFP, totals.ABS, totals.CIC,
      totals.supl1 + totals.supl2, totals.sl, totals.noapte, totals.weekend, totals.cercetare,
      totals.supl1, totals.supl2, totals.compensate, totals.ore ? Math.round((totals.supl1 + totals.supl2) / totals.ore * 10000) / 100 : 0,
      numberValue(employee.norma_ore_zi, 8), businessDays(`${luna}-01`, dates.at(-1)), totals.a152, totals.consemn,
      employee.cost_center_name || employee.cost_center || employee.centru_cost || '',
    ]
    values.forEach((value, offset) => setSheetCell(sheet, topRow, 34 + offset, value, dataRowStyles[0][34 + offset]))
  })
  const footerRow = 6 + employees.length * 2 + 2
  setSheetCell(sheet, footerRow, 36, 'Intocmit:', sheet[xlsx.utils.encode_cell({ r: 10, c: 36 })]?.s)
  setSheetCell(sheet, footerRow + 1, 36, user.name || user.fullName || user.username || '', sheet[xlsx.utils.encode_cell({ r: 11, c: 36 })]?.s)
  sheet['!merges'].push({ s: { r: footerRow + 1, c: 36 }, e: { r: footerRow + 1, c: 44 } })
  sheet['!ref'] = `A1:BC${footerRow + 2}`
  const sheetName = monthName.slice(0, 31)
  workbook.SheetNames[0] = sheetName
  workbook.Sheets[sheetName] = sheet
  if (sheetName !== sourceSheetName) delete workbook.Sheets[sourceSheetName]
  return applyNexusStyles(
    xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx', cellStyles: true }),
    nexusFills,
    6 + employees.length * 2,
    footerRow + 1
  )
}

function canUseKioskSync(auth) {
  return authHasPermission(auth, 'hr:view')
    || authHasPermission(auth, 'hr:manage')
    || authHasPermission(auth, 'kiosk:leave_request')
    || authHasPermission(auth, 'hr:view_own')
    || authHasPermission(auth, 'hr:leave_own')
    || authHasPermission(auth, 'hr:timesheet')
}

function canSyncLeaveForEmployee(auth, hr, employeeId) {
  if (authHasPermission(auth, 'hr:view') || authHasPermission(auth, 'hr:manage')) return true
  const linkedEmployeeId = auth.user.employee_id || auth.user.employeeId || ''
  const ownEmployee = hr.employees.find((employee) => (
    String(employee.user_id || '') === String(auth.user.id) ||
    (linkedEmployeeId && String(employee.id) === String(linkedEmployeeId))
  ))
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

function personalNotifications(db, userId) {
  return (db.notifications || [])
    .filter((item) => String(item.user_id || item.userId || '') === String(userId))
    .sort((a, b) => String(b.created_at || b.createdAt || '').localeCompare(String(a.created_at || a.createdAt || '')))
    .slice(0, 20)
}

function kioskEquipmentResponsibility(db, employeeId) {
  const hr = ensureHrDb(db)
  const types = Array.isArray(hr.echipamenteTipuri) ? hr.echipamenteTipuri : []
  const dotari = (Array.isArray(hr.echipamenteDotari) ? hr.echipamenteDotari : [])
    .filter((item) => String(item.angajat_id) === String(employeeId) && !item.predat_la_lichidare && !['casat', 'returnat'].includes(String(item.stare || '').toLowerCase()))
    .map((item) => {
      const tip = types.find((row) => String(row.id) === String(item.tip_id)) || {}
      return {
        ...item,
        tip_denumire: tip.denumire || '',
        categorie: tip.categorie || 'protectie',
        valoare_inventar: numberValue(item.valoare_inventar ?? tip.valoare_inventar),
      }
    })
  const total = (rows) => rows.reduce((sum, item) => sum + numberValue(item.valoare_inventar) * numberValue(item.cantitate, 1), 0)
  const protectie = dotari.filter((item) => ['protectie', 'SSM'].includes(item.categorie))
  const scule = dotari.filter((item) => ['scule', 'unelte'].includes(item.categorie))
  const inventar = dotari.filter((item) => !['protectie', 'SSM', 'scule', 'unelte'].includes(item.categorie))
  return {
    echipamente_protectie: protectie,
    scule_unelte: scule,
    alte_obiecte: inventar,
    total_echipamente: total(protectie),
    total_scule: total(scule),
    total_inventar: total(inventar),
    total_valoare: total(dotari),
  }
}

function kioskDataFor(db, auth) {
  const hr = ensureHrDb(db)
  payrollRoutes.ensurePayroll(db)
  const month = todayIso().slice(0, 7)
  const year = todayIso().slice(0, 4)
  const linkedEmployeeId = auth.user.employee_id || auth.user.employeeId || ''
  let employee
  let timesheets
  let leaves
  let authorizations
  let schedules

  if (isMssqlMode()) {
    employee = mssqlObject(`
SELECT TOP 1 e.*, d.denumire AS department_name
FROM hr.employees e
LEFT JOIN core.departments d ON d.id=e.department_id
WHERE e.activ=1 AND (
  e.user_id=JSON_VALUE(@p,'$.userId')
  OR (NULLIF(JSON_VALUE(@p,'$.employeeId'),'') IS NOT NULL AND e.id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employeeId')))
)
ORDER BY CASE WHEN e.user_id=JSON_VALUE(@p,'$.userId') THEN 0 ELSE 1 END
FOR JSON PATH;`, { userId: String(auth.user.id), employeeId: String(linkedEmployeeId) })
    if (!employee) return { angajat: null, pontaj_luna: { luna: month, zile_lucrate: 0, ore_total: 0 }, concedii: { co_ramase: 0, cm_zile: 0 }, autorizatii: [], cereri_asteptare: [], program: [], fluturasi: [], notificari: personalNotifications(db, auth.user.id) }
    timesheets = mssqlArray(`SELECT * FROM hr.time_sheets WHERE employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employeeId')) AND FORMAT(data,'yyyy-MM')=JSON_VALUE(@p,'$.month') FOR JSON PATH;`, { employeeId: employee.id, month })
    leaves = mssqlArray(`SELECT lr.*,mc.uuid AS medical_certificate_uuid,mc.status_verificare,mc.motiv_respingere AS medical_rejection_reason FROM hr.leave_requests lr LEFT JOIN hr.medical_leave_certificates mc ON mc.leave_request_uuid=lr.uuid WHERE lr.employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employeeId')) ORDER BY lr.created_at DESC FOR JSON PATH;`, { employeeId: employee.id })
    authorizations = mssqlArray(`SELECT * FROM hr.authorizations WHERE employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employeeId')) ORDER BY data_expirare FOR JSON PATH;`, { employeeId: employee.id })
    schedules = mssqlArray(`
SELECT s.*, t.nume AS tura_nume, t.ora_start, t.ora_sfarsit
FROM hr.schedules s
LEFT JOIN hr.tures t ON t.id=s.tura_id
WHERE s.employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employeeId')) AND FORMAT(s.data,'yyyy-MM')=JSON_VALUE(@p,'$.month')
ORDER BY s.data
FOR JSON PATH;`, { employeeId: employee.id, month })
  } else {
    employee = hr.employees.find((item) => (
      item.activ !== false &&
      item.activ !== 0 &&
      (String(item.user_id || '') === String(auth.user.id) || (linkedEmployeeId && String(item.id) === String(linkedEmployeeId)))
    ))
    if (!employee) return { angajat: null, pontaj_luna: { luna: month, zile_lucrate: 0, ore_total: 0 }, concedii: { co_ramase: 0, cm_zile: 0 }, autorizatii: [], cereri_asteptare: [], program: [], fluturasi: [], notificari: personalNotifications(db, auth.user.id) }
    timesheets = hr.timeSheets.filter((item) => String(item.employee_id) === String(employee.id) && String(item.data || '').startsWith(month))
    leaves = hr.leaveRequests.filter((item) => String(item.employee_id) === String(employee.id)).map((leave) => {
      const certificate = hr.medicalLeaveCertificates.find((item) => String(item.leave_request_uuid) === String(leave.uuid))
      return certificate ? { ...leave, medical_certificate_uuid: certificate.uuid, status_verificare: certificate.status_verificare, medical_rejection_reason: certificate.motiv_respingere } : leave
    })
    authorizations = hr.authorizations.filter((item) => String(item.employee_id) === String(employee.id))
    schedules = hr.schedules
      .filter((item) => String(item.employee_id) === String(employee.id) && String(item.data || '').startsWith(month))
      .map((item) => ({ ...item, tura_nume: hr.tures.find((tura) => String(tura.id) === String(item.tura_id))?.nume || '' }))
  }

  const approvedLeaves = leaves.filter((item) => ['aprobata', 'aprobat', 'approved'].includes(String(item.status || '').toLowerCase()))
  const coUsed = approvedLeaves
    .filter((item) => String(item.data_start || '').startsWith(year) && ['co', 'concediu_odihna', 'concediu'].includes(String(item.tip || '').toLowerCase()))
    .reduce((sum, item) => sum + numberValue(item.zile), 0)
  const cmDays = approvedLeaves
    .filter((item) => String(item.data_start || '').startsWith(year) && ['cm', 'concediu_medical', 'medical'].includes(String(item.tip || '').toLowerCase()))
    .reduce((sum, item) => sum + numberValue(item.zile), 0)
  const coTotal = numberValue(employee.zile_co_drept, 21)

  return {
    angajat: {
      id: employee.id,
      nume: employee.nume || '',
      prenume: employee.prenume || '',
      nume_complet: employeeName(employee),
      functia: employee.functia || employee.functie || '',
      functie: employee.functia || employee.functie || '',
      department_name: employee.department_name || departmentName(db, employee.department_id),
      departament: employee.department_name || departmentName(db, employee.department_id),
      marca: employee.marca || '',
      data_angajare: employee.data_angajare || '',
      photo_url: employee.photo_url || '',
      data_expirare_permis: employee.data_expirare_permis || '',
      data_expirare_iscir: employee.data_expirare_iscir || '',
      adeverinta_medicala: employee.adeverinta_medicala || '',
      data_expirare_contract: employee.data_expirare_contract || '',
    },
    pontaj_luna: {
      luna: month,
      zile_lucrate: new Set(timesheets.filter((item) => numberValue(item.ore_lucrate) > 0).map((item) => String(item.data || '').slice(0, 10))).size,
      ore_total: timesheets.reduce((sum, item) => sum + numberValue(item.ore_lucrate), 0),
    },
    concedii: { co_ramase: Math.max(0, coTotal - coUsed), co_efectuate: coUsed, co_total: coTotal, cm_zile: cmDays },
    cereri: leaves,
    cereri_asteptare: leaves.filter((item) => ['cerut', 'asteptare', 'in_asteptare', 'pending'].includes(String(item.status || '').toLowerCase())),
    autorizatii: authorizations.map(authorizationView),
    program: schedules,
    fluturasi: hr.payrollLines
      .filter((line) => String(line.employee_id) === String(employee.id) && !line.cancelled_at)
      .map((line) => ({ line, run: hr.payrollRuns.find((run) => run.id === line.run_id && run.status === 'validat' && !run.cancelled_at) }))
      .filter((entry) => entry.run)
      .sort((a, b) => String(b.run.luna).localeCompare(String(a.run.luna)))
      .slice(0, 12)
      .map(({ line, run }) => ({ id: line.id, run_id: run.id, luna: run.luna, net: line.net, status: run.status, url: `/api/hr/kiosk/payslips/${run.id}/${line.id}` })),
    notificari: personalNotifications(db, auth.user.id),
    echipamente: kioskEquipmentResponsibility(db, employee.id),
  }
}

router.get('/kiosk/data', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    sendJson(res, 200, kioskDataFor(auth.db, auth))
  } catch (error) {
    next(error)
  }
})

function regesXml(db, employee, contract) {
  const company = companySettings(db)
  return buildInternalXml(buildRegesWorkRow(employee, contract, company))
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
    .filter((item) => String(item.employee_id) === String(employeeId) && (!item.overtime_status || item.overtime_status === 'aprobat'))
    .forEach((item) => {
      const luna = String(item.data || '').slice(0, 7)
      if (!luna) return
      const current = byMonth.get(luna) || { luna, ore_suplimentare: 0, ore_compensate: 0, sold_luna: 0 }
      const assignedShift = hr.schedules.find((schedule) => String(schedule.employee_id) === String(employeeId) && schedule.data === item.data)
      const shift = assignedShift ? hr.tures.find((entry) => String(entry.id) === String(assignedShift.tura_id)) : null
      const explicit = numberValue(item.ore_suplimentare_s1) + numberValue(item.ore_suplimentare_s2) + numberValue(item.ore_suplimentare)
      current.ore_suplimentare += dailyOvertime(item.ore_lucrate, shift?.ore_normale, item.ore_suplimentare_s1, item.ore_suplimentare_s2) + numberValue(item.ore_suplimentare)
      byMonth.set(luna, current)
    })
  hr.overtimeCompensations
    .filter((item) => String(item.employee_id) === String(employeeId))
    .forEach((item) => {
      const luna = String(item.data || '').slice(0, 7) || todayIso().slice(0, 7)
      const current = byMonth.get(luna) || { luna, ore_suplimentare: 0, ore_compensate: 0, sold_luna: 0 }
      if (item.tip === 'sold_initial') current.ore_suplimentare += Math.abs(numberValue(item.ore))
      else current.ore_compensate += Math.abs(numberValue(item.ore))
      byMonth.set(luna, current)
    })
  let sold = 0
  const istoric = [...byMonth.values()].sort((a, b) => a.luna.localeCompare(b.luna)).map((item) => {
    sold += item.ore_suplimentare - item.ore_compensate
    return { ...item, sold_luna: Math.round(sold * 100) / 100 }
  })
  const ore_acumulate_total = istoric.reduce((sum, item) => sum + numberValue(item.ore_suplimentare), 0)
  const ore_compensate_total = istoric.reduce((sum, item) => sum + numberValue(item.ore_compensate), 0)
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90)
  const accumulatedExpired = hr.timeSheets.filter((item) => String(item.employee_id) === String(employeeId) && (!item.overtime_status || item.overtime_status === 'aprobat') && new Date(`${item.data}T12:00:00`) < cutoff).reduce((sum, item) => {
    const assignedShift = hr.schedules.find((schedule) => String(schedule.employee_id) === String(employeeId) && schedule.data === item.data)
    const shift = assignedShift ? hr.tures.find((entry) => String(entry.id) === String(assignedShift.tura_id)) : null
    const explicit = numberValue(item.ore_suplimentare_s1) + numberValue(item.ore_suplimentare_s2) + numberValue(item.ore_suplimentare)
    return sum + dailyOvertime(item.ore_lucrate, shift?.ore_normale, item.ore_suplimentare_s1, item.ore_suplimentare_s2) + numberValue(item.ore_suplimentare)
  }, 0)
  return {
    ore_acumulate_total: Math.round(ore_acumulate_total * 100) / 100,
    ore_compensate_total: Math.round(ore_compensate_total * 100) / 100,
    sold_curent: Math.round((ore_acumulate_total - ore_compensate_total) * 100) / 100,
    ore_scadente_plata: Math.round(Math.max(0, accumulatedExpired - Math.max(0, ore_compensate_total)) * 100) / 100,
    termen_compensare_zile: 90,
    spor_minim_plata_procent: 75,
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
SELECT FORMAT(ts.data,'yyyy-MM') AS luna,
  COALESCE(SUM(CASE WHEN ts.ore_suplimentare_s1 + ts.ore_suplimentare_s2 > 0 THEN ts.ore_suplimentare_s1 + ts.ore_suplimentare_s2 ELSE CASE WHEN ts.ore_lucrate > COALESCE(t.ore_normale,8) THEN ts.ore_lucrate - COALESCE(t.ore_normale,8) ELSE 0 END END), 0) AS ore_suplimentare,
  0 AS ore_compensate
FROM hr.time_sheets ts
LEFT JOIN hr.schedules s ON s.employee_id=ts.employee_id AND s.data=ts.data
LEFT JOIN hr.tures t ON t.id=s.tura_id
WHERE ts.employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')) AND (ts.overtime_status=N'aprobat' OR ts.overtime_status IS NULL)
GROUP BY FORMAT(ts.data,'yyyy-MM')
ORDER BY luna
FOR JSON PATH;`, req.query)
      const compensations = mssqlArray(`
SELECT FORMAT(data,'yyyy-MM') AS luna, COALESCE(SUM(CASE WHEN tip=N'sold_initial' THEN 0 ELSE ABS(ore) END), 0) AS ore_compensate, COALESCE(SUM(CASE WHEN tip=N'sold_initial' THEN ABS(ore) ELSE 0 END),0) AS ore_initiale
FROM hr.overtime_compensations
WHERE employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id'))
GROUP BY FORMAT(data,'yyyy-MM')
FOR JSON PATH;`, req.query)
      compensations.forEach((item) => {
        const existing = rows.find((row) => row.luna === item.luna)
        if (existing) { existing.ore_compensate = numberValue(item.ore_compensate); existing.ore_suplimentare = numberValue(existing.ore_suplimentare) + numberValue(item.ore_initiale) }
        else rows.push({ luna: item.luna, ore_suplimentare: numberValue(item.ore_initiale), ore_compensate: numberValue(item.ore_compensate) })
      })
      rows.sort((a, b) => String(a.luna).localeCompare(String(b.luna)))
      let sold = 0
      const istoric = rows.map((row) => {
        sold += numberValue(row.ore_suplimentare) - numberValue(row.ore_compensate)
        return { ...row, sold_luna: Math.round(sold * 100) / 100 }
      }).reverse()
      const ore_acumulate_total = rows.reduce((sum, row) => sum + numberValue(row.ore_suplimentare), 0)
      const ore_compensate_total = rows.reduce((sum, row) => sum + numberValue(row.ore_compensate), 0)
      const expired = mssqlObject(`SELECT COALESCE(SUM(CASE WHEN ts.ore_suplimentare_s1+ts.ore_suplimentare_s2>0 THEN ts.ore_suplimentare_s1+ts.ore_suplimentare_s2 ELSE CASE WHEN ts.ore_lucrate>COALESCE(t.ore_normale,8) THEN ts.ore_lucrate-COALESCE(t.ore_normale,8) ELSE 0 END END),0) AS ore FROM hr.time_sheets ts LEFT JOIN hr.schedules s ON s.employee_id=ts.employee_id AND s.data=ts.data LEFT JOIN hr.tures t ON t.id=s.tura_id WHERE ts.employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')) AND (ts.overtime_status=N'aprobat' OR ts.overtime_status IS NULL) AND ts.data<DATEADD(day,-90,CAST(GETDATE() AS date)) FOR JSON PATH;`, req.query)
      return sendJson(res, 200, { ore_acumulate_total, ore_compensate_total, sold_curent: ore_acumulate_total - ore_compensate_total, ore_scadente_plata: Math.max(0, numberValue(expired?.ore) - Math.max(0, ore_compensate_total)), termen_compensare_zile: 90, spor_minim_plata_procent: 75, istoric })
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
    const data = body.data || todayIso()
    const tip = body.tip || 'timp_liber'
    const updatesTimesheet = tip === 'timp_liber'
    if (updatesTimesheet) assertTimesheetOpen(db, data.slice(0, 7))
    if (isMssqlMode()) {
      if (updatesTimesheet) {
        const validated = mssqlObject(`SELECT TOP 1 id FROM hr.time_sheets WHERE employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')) AND data=TRY_CONVERT(date,JSON_VALUE(@p,'$.data')) AND validat=1 FOR JSON PATH;`, { employee_id: body.employee_id, data })
        if (validated) return sendJson(res, 409, { error: 'Pontajul zilei de recuperare este validat. Devalideaza-l inainte de compensare.', code: 'HR_TIMESHEET_VALIDATED' })
      }
      const item = mssqlObject(`
DECLARE @compId bigint;
INSERT INTO hr.overtime_compensations (uuid,employee_id,ore,tip,data,created_by)
VALUES (JSON_VALUE(@p,'$.uuid'),TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')),TRY_CONVERT(decimal(6,2),JSON_VALUE(@p,'$.ore')),JSON_VALUE(@p,'$.tip'),TRY_CONVERT(date,JSON_VALUE(@p,'$.data')),JSON_VALUE(@p,'$.created_by'));
SET @compId=SCOPE_IDENTITY();
IF JSON_VALUE(@p,'$.tip')=N'timp_liber'
BEGIN
  DECLARE @norma decimal(5,2)=COALESCE((SELECT TOP 1 t.ore_normale FROM hr.schedules s JOIN hr.tures t ON t.id=s.tura_id WHERE s.employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')) AND s.data=TRY_CONVERT(date,JSON_VALUE(@p,'$.data'))),8);
  DECLARE @tsId int=(SELECT TOP 1 id FROM hr.time_sheets WHERE employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')) AND data=TRY_CONVERT(date,JSON_VALUE(@p,'$.data')));
  IF @tsId IS NULL INSERT INTO hr.time_sheets(employee_id,data,ore_lucrate,ore_compensate,tip,observatii) VALUES(TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')),TRY_CONVERT(date,JSON_VALUE(@p,'$.data')),CASE WHEN @norma>TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore')) THEN @norma-TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore')) ELSE 0 END,TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore')),CASE WHEN TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore'))>=@norma THEN N'liber' ELSE N'lucru' END,N'Actualizat automat din banca de ore');
  ELSE UPDATE hr.time_sheets SET ore_compensate=COALESCE(ore_compensate,0)+TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore')),ore_lucrate=CASE WHEN COALESCE(ore_lucrate,@norma)>TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore')) THEN COALESCE(ore_lucrate,@norma)-TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore')) ELSE 0 END,tip=CASE WHEN COALESCE(ore_lucrate,@norma)<=TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore')) THEN N'liber' ELSE tip END,observatii=N'Actualizat automat din banca de ore',updated_at=SYSDATETIME() WHERE id=@tsId;
END;
SELECT TOP 1 * FROM hr.overtime_compensations WHERE id=@compId FOR JSON PATH;`, { ...body, uuid: crypto.randomUUID(), data, tip, created_by: auth.user.id })
      addAudit(db, auth.user, 'hr_overtime_compensated', `${body.employee_id}/${body.ore}`)
      writeDb(db)
      return sendJson(res, 201, item)
    }
    const hr = ensureHrDb(db)
    const existingTimesheet = updatesTimesheet ? hr.timeSheets.find((entry) => String(entry.employee_id) === String(body.employee_id) && entry.data === data) : null
    if (existingTimesheet?.validat) return sendJson(res, 409, { error: 'Pontajul zilei de recuperare este validat. Devalideaza-l inainte de compensare.', code: 'HR_TIMESHEET_VALIDATED' })
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
    if (updatesTimesheet) {
      const timesheet = existingTimesheet || { id: nextId(hr.timeSheets), employee_id: body.employee_id, data, ore_lucrate: 8, ore_compensate: 0, tip: 'lucru', created_at: nowIso() }
      if (!existingTimesheet) hr.timeSheets.push(timesheet)
      applyCompensatedHours(timesheet, body.ore, 8)
      timesheet.updated_at = nowIso()
    }
    addAudit(db, auth.user, 'hr_overtime_compensated', `${body.employee_id}/${item.ore}`)
    writeDb(db)
    sendJson(res, 201, item)
  } catch (error) { next(error) }
})

router.get('/hr/linkable-users', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'hr:manage')) return
    const db = readDb()
    const users = (db.users || []).filter((item) => item.active !== false).map((item) => ({ id: item.id, username: item.username, name: item.name || item.fullName || item.username, role: item.role }))
    sendJson(res, 200, users)
  } catch (error) { next(error) }
})

router.get('/hr/employees', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    const hasFullView = authHasPermission(auth, 'hr:view')
    const hasEquipmentView = authHasPermission(auth, 'echipamente:gestionar')
    const hasDeptTimesheet = authHasPermission(auth, 'hr:timesheet_dept')
    const hasOwnView = authHasPermission(auth, 'hr:view_own')
    if (!hasFullView && !hasOwnView && !hasDeptTimesheet && !hasEquipmentView) return requirePermission(auth, res, 'hr:view')
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
${!hasFullView && !hasDeptTimesheet && !hasEquipmentView ? `AND e.user_id = JSON_VALUE(@p, '$.userId')` : ''}
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
    } else if (!hasFullView && !hasEquipmentView) {
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
    if (!authHasPermission(auth, 'hr:view') && !authHasPermission(auth, 'echipamente:gestionar')) {
      if (!requirePermission(auth, res, 'hr:view')) return
    }

    if (isMssqlMode()) {
      const employee = mssqlObject(`SELECT TOP 1 * FROM hr.employees WHERE id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id')) FOR JSON PATH;`, req.params)
      if (!employee) return sendJson(res, 404, { error: 'Angajatul nu a fost gasit.' })
      const contracts = mssqlArray(`SELECT * FROM hr.contracts WHERE employee_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id')) AND ISNULL(status,N'activ') <> N'incetat' ORDER BY data_start DESC FOR JSON PATH;`, req.params)
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
    if (body.user_id) {
      const linked = isMssqlMode()
        ? mssqlObject(`SELECT TOP 1 id,nume,prenume FROM hr.employees WHERE user_id=JSON_VALUE(@p,'$.user_id') AND id<>TRY_CONVERT(int,JSON_VALUE(@p,'$.id')) FOR JSON PATH;`, { user_id: body.user_id, id: req.params.id })
        : ensureHrDb(db).employees.find((item) => String(item.user_id || '') === String(body.user_id) && String(item.id) !== String(req.params.id))
      if (linked) return sendJson(res, 409, { error: 'Contul selectat este deja asociat altui angajat.', code: 'HR_USER_ALREADY_LINKED' })
    }

    if (isMssqlMode()) {
      const emp = mssqlObject(`SELECT TOP 1 * FROM hr.employees WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')) FOR JSON PATH;`, req.params)
      if (!emp) return sendJson(res, 404, { error: 'Angajatul nu a fost gasit.' })
      mssqlObject(`UPDATE hr.employees SET
        user_id=CASE WHEN JSON_VALUE(@p,'$.user_id') IS NULL THEN user_id ELSE NULLIF(JSON_VALUE(@p,'$.user_id'),'') END,
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
      if (body.user_id !== undefined) syncAppUserEmployeeLink(db, body.user_id, req.params.id)
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
      'zile_co_drept','activ','department_id','tip_contract','data_angajare','data_plecare','user_id']
    if (authHasPermission(auth, 'hr:salary_view')) allowed.push('salariu_baza')
    allowed.forEach((key) => {
      if (body[key] === undefined) return
      if (key === 'act_identitate_serie') employee[key] = String(body[key] || '').toUpperCase().slice(0, 5)
      else if (key === 'act_identitate_numar') employee[key] = String(body[key] || '').slice(0, 10)
      else employee[key] = body[key]
    })
    employee.updated_at = nowIso()
    if (body.user_id !== undefined) syncAppUserEmployeeLink(db, body.user_id, employee.id)
    addAudit(db, auth.user, 'hr_employee_updated', `${employee.nume} ${employee.prenume}`)
    writeDb(db)
    sendJson(res, 200, publicEmployee(employeeWithSalary(hr, employee), auth, db))
  } catch (error) {
    next(error)
  }
})

function syncAppUserEmployeeLink(db, userId, employeeId) {
  const normalizedUserId = String(userId || '').trim()
  const normalizedEmployeeId = String(employeeId || '').trim()
  for (const user of db.users || []) {
    if (String(user.employee_id || '') === normalizedEmployeeId || (normalizedUserId && String(user.id) === normalizedUserId)) delete user.employee_id
  }
  if (!normalizedUserId) return
  const user = (db.users || []).find((item) => String(item.id) === normalizedUserId)
  if (user) {
    user.employee_id = normalizedEmployeeId
    user.verified_from_hr = true
    user.updatedAt = nowIso()
  }
}

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
    if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`
      SELECT t.*, old_d.denumire AS departament_vechi_nume, new_d.denumire AS departament_nou_nume
      FROM hr.department_transfers t
      LEFT JOIN core.departments old_d ON old_d.cod=t.dept_vechi OR CONVERT(nvarchar(80),old_d.id)=t.dept_vechi
      LEFT JOIN core.departments new_d ON new_d.cod=t.dept_nou OR CONVERT(nvarchar(80),new_d.id)=t.dept_nou
      WHERE t.employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id'))
      ORDER BY t.data_transfer DESC,t.id DESC
      FOR JSON PATH;`, req.params))
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
    const paymentAdjustment = body.tip === 'plata' ? registerOvertimePayment(db, body, auth.user) : null
    if (isMssqlMode()) {
      const rawDepartment = req.body.department_nou || req.body.dept_nou || req.body.departament_nou
      const newDept = departmentCod(db, rawDepartment)
      if (!newDept) return sendJson(res, 400, { error: 'Departamentul nou este obligatoriu.' })
      const result = mssqlObject(`
        DECLARE @employeeId int=TRY_CONVERT(int,JSON_VALUE(@p,'$.id'));
        DECLARE @old nvarchar(80)=(SELECT COALESCE(NULLIF(department_cod,N''),CONVERT(nvarchar(80),department_id)) FROM hr.employees WHERE id=@employeeId);
        DECLARE @newId int=TRY_CONVERT(int,JSON_VALUE(@p,'$.department_id'));
        IF @newId IS NULL SELECT TOP 1 @newId=id FROM core.departments WHERE LOWER(cod)=LOWER(JSON_VALUE(@p,'$.dept_nou'));
        IF @newId IS NULL BEGIN RAISERROR(N'Departamentul selectat nu exista.',16,1); RETURN; END;
        UPDATE hr.employees SET department_id=@newId,department_cod=JSON_VALUE(@p,'$.dept_nou'),updated_at=sysdatetime() WHERE id=@employeeId;
        INSERT INTO hr.department_transfers (uuid,employee_id,dept_vechi,dept_nou,data_transfer,motiv,aprobat_de)
        VALUES (JSON_VALUE(@p,'$.uuid'),@employeeId,@old,JSON_VALUE(@p,'$.dept_nou'),TRY_CONVERT(date,JSON_VALUE(@p,'$.data_transfer')),NULLIF(JSON_VALUE(@p,'$.motiv'),''),JSON_VALUE(@p,'$.aprobat_de'));
        SELECT TOP 1 * FROM hr.department_transfers WHERE id=SCOPE_IDENTITY() FOR JSON PATH;`, { id: req.params.id, uuid: crypto.randomUUID(), department_id: rawDepartment, dept_nou: newDept, data_transfer: req.body.data_transfer || todayIso(), motiv: req.body.motiv || '', aprobat_de: auth.user.id })
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
    assertTimesheetOpen(db, String(body.data || '').slice(0, 7))

    if (isMssqlMode()) {
      const item = mssqlObject(`
DECLARE @id int;
DECLARE @norma decimal(5,2)=COALESCE((SELECT TOP 1 t.ore_normale FROM hr.schedules s JOIN hr.tures t ON t.id=s.tura_id WHERE s.employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')) AND s.data=TRY_CONVERT(date,JSON_VALUE(@p,'$.data'))),8);
SELECT @id = id FROM hr.time_sheets
WHERE employee_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.employee_id'))
AND data = TRY_CONVERT(date, JSON_VALUE(@p, '$.data'));
IF @id IS NULL
BEGIN
  INSERT INTO hr.time_sheets (employee_id, data, ore_lucrate, tip, santier_id, cost_center_id, observatii, ore_suplimentare_s1, ore_suplimentare_s2, ore_noapte, overtime_status)
  VALUES (
    TRY_CONVERT(int, JSON_VALUE(@p, '$.employee_id')),
    TRY_CONVERT(date, JSON_VALUE(@p, '$.data')),
    TRY_CONVERT(decimal(5,2), JSON_VALUE(@p, '$.ore_lucrate')),
    COALESCE(NULLIF(JSON_VALUE(@p, '$.tip'), ''), N'lucru'),
    TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.santier_id'), '')),
    TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.cost_center_id'), '')),
    NULLIF(JSON_VALUE(@p, '$.observatii'), ''),
    CASE WHEN JSON_VALUE(@p,'$.ore_suplimentare_s1') IS NOT NULL THEN TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore_suplimentare_s1')) ELSE CASE WHEN TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore_lucrate'))>@norma THEN TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore_lucrate'))-@norma ELSE 0 END END,
    COALESCE(TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore_suplimentare_s2')),0),
    COALESCE(TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore_noapte')),0),
    CASE WHEN COALESCE(TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore_suplimentare_s1')),CASE WHEN TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore_lucrate'))>@norma THEN TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore_lucrate'))-@norma ELSE 0 END)+COALESCE(TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore_suplimentare_s2')),0)>0 THEN N'propus' ELSE NULL END
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
      ore_suplimentare_s1 = CASE WHEN JSON_VALUE(@p,'$.ore_suplimentare_s1') IS NOT NULL THEN TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore_suplimentare_s1')) ELSE CASE WHEN TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore_lucrate'))>@norma THEN TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore_lucrate'))-@norma ELSE 0 END END,
      ore_suplimentare_s2 = COALESCE(TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore_suplimentare_s2')),ore_suplimentare_s2),
      ore_noapte = COALESCE(TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore_noapte')),ore_noapte),
      overtime_status = CASE WHEN COALESCE(TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore_suplimentare_s1')),CASE WHEN TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore_lucrate'))>@norma THEN TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore_lucrate'))-@norma ELSE 0 END)+COALESCE(TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.ore_suplimentare_s2')),ore_suplimentare_s2)>0 THEN N'propus' ELSE NULL END,
      overtime_approved_by = NULL, overtime_approved_at = NULL, overtime_rejection_reason = NULL,
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
      ore_suplimentare_s1: body.ore_suplimentare_s1 !== undefined ? numberValue(body.ore_suplimentare_s1) : dailyOvertime(body.ore_lucrate, 8),
      ore_suplimentare_s2: numberValue(body.ore_suplimentare_s2),
      ore_noapte: numberValue(body.ore_noapte),
      tip: body.tip || 'lucru',
      santier_id: body.santier_id || null,
      cost_center_id: body.cost_center_id || null,
      observatii: body.observatii || null,
      updated_at: nowIso()
    })
    item.overtime_status = numberValue(item.ore_suplimentare_s1) + numberValue(item.ore_suplimentare_s2) > 0 ? 'propus' : null
    item.overtime_approved_by = null
    item.overtime_approved_at = null
    item.overtime_rejection_reason = null
    addAudit(db, auth.user, 'hr_timesheet_upserted', `${body.employee_id}/${body.data}`)
    writeDb(db)
    sendJson(res, 200, item)
  } catch (error) {
    next(error)
  }
})

router.get('/hr/overtime/pending', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'hr:timesheet')) return
    if (isMssqlMode()) return sendJson(res, 200, mssqlArray(`
SELECT ts.id,ts.employee_id,ts.data,ts.ore_lucrate,ts.ore_suplimentare_s1,ts.ore_suplimentare_s2,ts.overtime_status,
  LTRIM(RTRIM(COALESCE(e.prenume,N'')+N' '+COALESCE(e.nume,N''))) AS employee_name,e.department_id
FROM hr.time_sheets ts JOIN hr.employees e ON e.id=ts.employee_id
WHERE ts.overtime_status=N'propus'
  AND (NULLIF(JSON_VALUE(@p,'$.luna'),'') IS NULL OR CONVERT(char(7),ts.data,126)=JSON_VALUE(@p,'$.luna'))
  AND (NULLIF(JSON_VALUE(@p,'$.dept_id'),'') IS NULL OR CONVERT(nvarchar(100),e.department_id)=JSON_VALUE(@p,'$.dept_id'))
ORDER BY ts.data,e.nume,e.prenume FOR JSON PATH;`, req.query))
    const db = readDb(); const hr = ensureHrDb(db)
    const rows = hr.timeSheets.filter((item) => item.overtime_status === 'propus' && (!req.query.luna || String(item.data).startsWith(req.query.luna))).map((item) => {
      const employee = hr.employees.find((entry) => String(entry.id) === String(item.employee_id)) || {}
      return { ...item, employee_name: `${employee.prenume || ''} ${employee.nume || ''}`.trim(), department_id: employee.department_id }
    }).filter((item) => !req.query.dept_id || String(item.department_id) === String(req.query.dept_id))
    sendJson(res, 200, rows)
  } catch (error) { next(error) }
})

router.post('/hr/overtime/:timesheetId/approve', (req, res, next) => updateOvertimeApproval(req, res, next, 'aprobat'))
router.post('/hr/overtime/:timesheetId/reject', (req, res, next) => updateOvertimeApproval(req, res, next, 'respins'))

function updateOvertimeApproval(req, res, next, status) {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'hr:timesheet_approve')) return
    const reason = String(req.body?.reason || '').trim()
    if (status === 'respins' && reason.length < 5) return sendJson(res, 422, { error: 'Motivul respingerii trebuie sa aiba minimum 5 caractere.' })
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(`UPDATE hr.time_sheets SET overtime_status=JSON_VALUE(@p,'$.status'),overtime_approved_by=JSON_VALUE(@p,'$.userId'),overtime_approved_at=SYSDATETIME(),overtime_rejection_reason=NULLIF(JSON_VALUE(@p,'$.reason'),'') WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')) AND overtime_status=N'propus'; SELECT TOP 1 * FROM hr.time_sheets WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.id')) FOR JSON PATH;`, { id: req.params.timesheetId, status, userId: auth.user.id, reason })
      if (!item) return sendJson(res, 404, { error: 'Propunerea de ore suplimentare nu a fost gasita.' })
      addAudit(db, auth.user, `hr_overtime_${status}`, item.id); writeDb(db); return sendJson(res, 200, item)
    }
    const hr = ensureHrDb(db); const item = hr.timeSheets.find((entry) => String(entry.id) === String(req.params.timesheetId) && entry.overtime_status === 'propus')
    if (!item) return sendJson(res, 404, { error: 'Propunerea de ore suplimentare nu a fost gasita.' })
    item.overtime_status = status; item.overtime_approved_by = auth.user.id; item.overtime_approved_at = nowIso(); item.overtime_rejection_reason = reason || null
    addAudit(db, auth.user, `hr_overtime_${status}`, item.id); writeDb(db); sendJson(res, 200, item)
  } catch (error) { next(error) }
}

router.get('/hr/timesheets/weekly-controls', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'hr:timesheet')) return
    const luna = String(req.query.luna || todayIso().slice(0, 7)).slice(0, 7)
    if (isMssqlMode()) {
      const entries = mssqlArray(`SELECT ts.*,LTRIM(RTRIM(COALESCE(e.prenume,N'')+N' '+COALESCE(e.nume,N''))) AS employee_name FROM hr.time_sheets ts JOIN hr.employees e ON e.id=ts.employee_id WHERE CONVERT(char(7),ts.data,126)=JSON_VALUE(@p,'$.luna') AND (NULLIF(JSON_VALUE(@p,'$.dept_id'),'') IS NULL OR CONVERT(nvarchar(100),e.department_id)=JSON_VALUE(@p,'$.dept_id')) ORDER BY ts.data FOR JSON PATH;`, { ...req.query, luna })
      return sendJson(res, 200, weeklyControls(entries))
    }
    const db = readDb(); const hr = ensureHrDb(db)
    const entries = hr.timeSheets.filter((item) => String(item.data).startsWith(luna)).map((item) => {
      const employee = hr.employees.find((entry) => String(entry.id) === String(item.employee_id)) || {}
      return { ...item, employee_name: `${employee.prenume || ''} ${employee.nume || ''}`.trim(), department_id: employee.department_id }
    }).filter((item) => !req.query.dept_id || String(item.department_id) === String(req.query.dept_id))
    sendJson(res, 200, weeklyControls(entries))
  } catch (error) { next(error) }
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
    assertTimesheetOpen(db, String(req.body.luna || todayIso().slice(0, 7)).slice(0, 7))
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
    assertTimesheetOpen(db, luna)

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

router.post('/hr/timesheets/invalidate', async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'hr:timesheet_approve')) return
    const employeeIds = (req.body.employee_ids || []).map(String)
    const luna = String(req.body.luna || todayIso().slice(0, 7)).slice(0, 7)
    const reason = String(req.body.reason || '').trim()
    if (!employeeIds.length) return sendJson(res, 422, { error: 'Nu exista angajati selectati pentru devalidare.' })
    if (reason.length < 5) return sendJson(res, 422, { error: 'Motivul devalidarii trebuie sa aiba minimum 5 caractere.' })
    const db = readDb()
    assertTimesheetOpen(db, luna)
    if (isMssqlMode()) {
      const result = mssqlObject(`
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @targets TABLE (id bigint NOT NULL PRIMARY KEY);
INSERT INTO @targets(id)
SELECT ts.id
FROM hr.time_sheets ts
WHERE ts.validat = 1
  AND CONVERT(char(7), ts.data, 126) = JSON_VALUE(@p, '$.luna')
  AND ts.employee_id IN (
    SELECT TRY_CONVERT(int, value)
    FROM OPENJSON(JSON_QUERY(@p, '$.employeeIds'))
    WHERE TRY_CONVERT(int, value) IS NOT NULL
  );

;WITH totals AS (
  SELECT ce.sursa_ref_id,
         SUM(ce.valoare) AS valoare,
         SUM(ce.tva) AS tva
  FROM controlling.cost_entries ce
  JOIN @targets t ON CONVERT(nvarchar(64), t.id) = ce.sursa_ref_id
  WHERE ce.sursa = N'pontaj'
  GROUP BY ce.sursa_ref_id
), latest AS (
  SELECT ce.*,
         ROW_NUMBER() OVER (PARTITION BY ce.sursa_ref_id ORDER BY ce.id DESC) AS rn
  FROM controlling.cost_entries ce
  JOIN @targets t ON CONVERT(nvarchar(64), t.id) = ce.sursa_ref_id
  WHERE ce.sursa = N'pontaj'
)
INSERT INTO controlling.cost_entries(
  uuid, company_id, cost_center_id, subcentru_id, santier_id, data, luna,
  categorie, subcategorie, descriere, valoare, tva, moneda, sursa,
  sursa_ref_id, nr_document, furnizor, inregistrat_de, observatii
)
SELECT CONVERT(char(36), NEWID()), l.company_id, l.cost_center_id,
       l.subcentru_id, l.santier_id, l.data, l.luna, l.categorie,
       l.subcategorie, N'Reversare devalidare - ' + COALESCE(l.descriere, N'pontaj'),
       -t.valoare, -t.tva, l.moneda, N'pontaj', l.sursa_ref_id,
       l.nr_document, l.furnizor,
       TRY_CONVERT(uniqueidentifier, JSON_VALUE(@p, '$.userId')),
       N'Generata automat la devalidarea pontajului'
FROM totals t
JOIN latest l ON l.sursa_ref_id = t.sursa_ref_id AND l.rn = 1
WHERE ABS(COALESCE(t.valoare, 0)) >= 0.005
   OR ABS(COALESCE(t.tva, 0)) >= 0.005;

UPDATE ts
SET validat = 0,
    validat_de = NULL,
    validat_la = NULL,
    updated_at = SYSDATETIME()
FROM hr.time_sheets ts
JOIN @targets t ON t.id = ts.id;

DECLARE @invalidated int = @@ROWCOUNT;
COMMIT TRANSACTION;
SELECT @invalidated AS invalidated FOR JSON PATH;
`, { employeeIds, luna, userId: auth.user.id })
      addAudit(db, auth.user, 'hr_timesheets_invalidated', `${luna}: ${reason}`); writeDb(db)
      return sendJson(res, 200, { invalidated: Number(result?.invalidated || 0) })
    }
    const hr = ensureHrDb(db)
    const rows = hr.timeSheets.filter((entry) => entry.validat && employeeIds.includes(String(entry.employee_id)) && String(entry.data).startsWith(luna))
    for (const row of rows) {
      await reversePontajRegistration(row.id, auth.user.id, db)
      row.validat = false; row.validat_de = null; row.validat_la = null; row.updated_at = nowIso()
    }
    addAudit(db, auth.user, 'hr_timesheets_invalidated', `${luna}: ${reason}`); writeDb(db)
    sendJson(res, 200, { invalidated: rows.length })
  } catch (error) { next(error) }
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
        if (!byEmployee.has(row.id)) byEmployee.set(row.id, { employee_id: row.id, nume: row.nume, prenume: row.prenume, department_id: row.department_id, department_name: row.department_name, zile: {} })
        if (row.data) byEmployee.get(row.id).zile[String(row.data).slice(0, 10)] = { ore_lucrate: row.ore_lucrate, tip: row.tip || 'lucru' }
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

router.post('/hr/overtime-bank/adjustment', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'hr:timesheet_approve')) return
    const body = req.body || {}
    const ore = Math.abs(numberValue(body.ore))
    if (!body.employee_id || !ore) return sendJson(res, 422, { error: 'Angajatul si numarul de ore sunt obligatorii.' })
    if (!['sold_initial', 'avans_timp_liber'].includes(body.tip)) return sendJson(res, 422, { error: 'Tipul ajustarii bancii de ore este invalid.' })
    const storedHours = ore
    const db = readDb()
    if (isMssqlMode()) {
      const item = mssqlObject(`INSERT INTO hr.overtime_compensations(uuid,employee_id,ore,tip,data,created_by) VALUES(JSON_VALUE(@p,'$.uuid'),TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')),TRY_CONVERT(decimal(6,2),JSON_VALUE(@p,'$.storedHours')),JSON_VALUE(@p,'$.tip'),TRY_CONVERT(date,JSON_VALUE(@p,'$.data')),JSON_VALUE(@p,'$.created_by')); SELECT TOP 1 * FROM hr.overtime_compensations WHERE id=SCOPE_IDENTITY() FOR JSON PATH;`, { ...body, uuid: crypto.randomUUID(), storedHours, data: body.data || todayIso(), created_by: auth.user.id })
      addAudit(db, auth.user, 'hr_overtime_adjustment', `${body.employee_id}/${body.tip}/${ore}`); writeDb(db); return sendJson(res, 201, item)
    }
    const hr = ensureHrDb(db)
    const item = { id: nextId(hr.overtimeCompensations), uuid: crypto.randomUUID(), employee_id: body.employee_id, ore: storedHours, tip: body.tip, data: body.data || todayIso(), created_by: auth.user.id, created_at: nowIso() }
    hr.overtimeCompensations.push(item); addAudit(db, auth.user, 'hr_overtime_adjustment', `${body.employee_id}/${body.tip}/${ore}`); writeDb(db); sendJson(res, 201, item)
  } catch (error) { next(error) }
})

router.post('/hr/timesheets/fill-month', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'hr:timesheet')) return
    const luna = String(req.body.luna || todayIso().slice(0, 7)).slice(0, 7)
    const departmentId = String(req.body.dept_id || '').trim()
    const hours = Math.max(0, Math.min(24, numberValue(req.body.ore_lucrate, 8)))
    const db = readDb()
    assertTimesheetOpen(db, luna)
    if (isMssqlMode()) {
      const result = mssqlObject(`
DECLARE @start date=TRY_CONVERT(date,JSON_VALUE(@p,'$.luna')+'-01');
DECLARE @finish date=DATEADD(day,-1,DATEADD(month,1,@start));
;WITH calendar AS (
  SELECT @start AS data
  UNION ALL SELECT DATEADD(day,1,data) FROM calendar WHERE data<@finish
), targets AS (
  SELECT e.id AS employee_id,c.data
  FROM hr.employees e CROSS JOIN calendar c
  WHERE ISNULL(e.activ,1)=1
    AND DATEDIFF(day,0,c.data)%7 BETWEEN 0 AND 4
    AND (NULLIF(JSON_VALUE(@p,'$.dept_id'),'') IS NULL OR CONVERT(nvarchar(100),e.department_id)=JSON_VALUE(@p,'$.dept_id'))
)
INSERT INTO hr.time_sheets(employee_id,data,ore_lucrate,tip,created_at)
SELECT t.employee_id,t.data,TRY_CONVERT(decimal(5,2),JSON_VALUE(@p,'$.hours')),N'lucru',SYSDATETIME()
FROM targets t
WHERE NOT EXISTS(SELECT 1 FROM hr.time_sheets ts WHERE ts.employee_id=t.employee_id AND ts.data=t.data)
OPTION (MAXRECURSION 40);
SELECT @@ROWCOUNT AS inserted FOR JSON PATH;`, { luna, dept_id: departmentId, hours })
      addAudit(db, auth.user, 'hr_timesheet_month_filled', `${luna}/${departmentId || 'toate'}/${result?.inserted || 0}`)
      writeDb(db)
      return sendJson(res, 201, { inserted: result?.inserted || 0 })
    }
    const hr = ensureHrDb(db)
    const employees = hr.employees.filter((item) => item.activ !== false && (!departmentId || String(item.department_id) === departmentId))
    let inserted = 0
    for (const employee of employees) for (const data of monthDates(luna)) {
      const weekday = new Date(`${data}T12:00:00`).getDay()
      if (weekday === 0 || weekday === 6 || hr.timeSheets.some((item) => String(item.employee_id) === String(employee.id) && item.data === data)) continue
      hr.timeSheets.push({ id: nextId(hr.timeSheets), employee_id: employee.id, data, ore_lucrate: hours, tip: 'lucru', created_at: nowIso() }); inserted += 1
    }
    addAudit(db, auth.user, 'hr_timesheet_month_filled', `${luna}/${departmentId || 'toate'}/${inserted}`)
    writeDb(db)
    sendJson(res, 201, { inserted })
  } catch (error) { next(error) }
})

router.get('/hr/timesheets/export-nexus', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:timesheet')) return
    const luna = String(req.query.luna || todayIso().slice(0, 7)).slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(luna)) return sendJson(res, 422, { error: 'Luna pentru export trebuie sa aiba formatul YYYY-MM.' })
    const deptId = String(req.query.dept_id || '').trim()
    const db = readDb()
    const department = deptId ? departmentName(db, deptId) : 'Toate_departamentele'
    const safeDepartment = String(department || deptId || 'Departament').replace(/[^a-zA-Z0-9_-]+/g, '_')
    const [year, month] = luna.split('-').map(Number)
    const monthName = new Intl.DateTimeFormat('ro-RO', { month: 'long' }).format(new Date(year, month - 1, 1)).toUpperCase()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename=Pontaj_${safeDepartment}_${monthName}_${year}.xlsx`)
    res.end(buildNexusTimesheetWorkbook(db, auth.user, luna, deptId))
  } catch (error) {
    next(error)
  }
})

router.patch('/hr/employees/:id/contracts/:contractId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    const db = readDb()
    const body = req.body || {}

    if (isMssqlMode()) {
      const updated = mssqlObject(`
UPDATE hr.contracts
SET
  tip = COALESCE(NULLIF(JSON_VALUE(@p, '$.tip'), ''), tip),
  numar_contract = COALESCE(NULLIF(JSON_VALUE(@p, '$.numar_contract'), ''), numar_contract),
  data_contract = COALESCE(TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.data_contract'), '')), data_contract),
  data_start = COALESCE(TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.data_start'), '')), data_start),
  data_sfarsit = TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.data_sfarsit'), '')),
  norma_ore = COALESCE(TRY_CONVERT(decimal(5,2), NULLIF(JSON_VALUE(@p, '$.norma_ore'), '')), norma_ore),
  salariu_baza = COALESCE(TRY_CONVERT(decimal(15,2), NULLIF(JSON_VALUE(@p, '$.salariu_baza'), '')), salariu_baza),
  cost_ora = TRY_CONVERT(decimal(12,2), NULLIF(JSON_VALUE(@p, '$.cost_ora'), '')),
  status = COALESCE(NULLIF(JSON_VALUE(@p, '$.status'), ''), status, N'activ'),
  observatii = NULLIF(JSON_VALUE(@p, '$.observatii'), ''),
  updated_at = SYSDATETIME()
WHERE id = TRY_CONVERT(int, JSON_VALUE(@p, '$.contractId'))
  AND employee_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.employeeId'));
SELECT TOP 1 * FROM hr.contracts WHERE id = TRY_CONVERT(int, JSON_VALUE(@p, '$.contractId')) AND employee_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.employeeId')) FOR JSON PATH;
`, { ...body, employeeId: req.params.id, contractId: req.params.contractId })
      if (!updated) return sendJson(res, 404, { error: 'Contractul nu a fost gasit.' })
      addAudit(db, auth.user, 'hr_contract_updated', `${updated.numar_contract || updated.id}`)
      writeDb(db)
      return sendJson(res, 200, updated)
    }

    const hr = ensureHrDb(db)
    const item = hr.contracts.find((row) => String(row.id) === String(req.params.contractId) && String(row.employee_id) === String(req.params.id))
    if (!item) return sendJson(res, 404, { error: 'Contractul nu a fost gasit.' })
    ;['tip', 'numar_contract', 'data_contract', 'data_start', 'data_sfarsit', 'norma_ore', 'salariu_baza', 'cost_ora', 'status', 'observatii'].forEach((key) => {
      if (body[key] !== undefined) item[key] = body[key] === '' ? null : body[key]
    })
    item.updated_at = nowIso()
    item.updated_by = auth.user.id
    addAudit(db, auth.user, 'hr_contract_updated', `${item.numar_contract || item.id}`)
    writeDb(db)
    sendJson(res, 200, item)
  } catch (error) {
    next(error)
  }
})

router.get('/hr/document-templates', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:view')) return
    if (isMssqlMode()) {
      const rows = mssqlArray(`
IF OBJECT_ID(N'hr.document_templates', N'U') IS NULL
BEGIN
  SELECT CAST(NULL AS nvarchar(50)) AS id WHERE 1=0 FOR JSON PATH;
  RETURN;
END;
SELECT id, denumire, tip, descriere, template_html, activ,
       word_template_file, word_template_original_name, word_template_size, word_template_uploaded_at, word_template_uploaded_by,
       updated_at, updated_by, created_at, created_by
FROM hr.document_templates
WHERE ISNULL(activ, 1) = 1
ORDER BY denumire
FOR JSON PATH;
`)
      return sendJson(res, 200, { templates: ensureDefaultHrDocumentTemplates(rows) })
    }
    const db = readDb()
    const hr = ensureHrDb(db)
    sendJson(res, 200, { templates: ensureDefaultHrDocumentTemplates(hr.documentTemplates).filter((item) => item.activ !== false) })
  } catch (error) {
    next(error)
  }
})

router.put('/hr/document-templates/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    const db = readDb()
    const id = String(req.params.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 50)
    const body = normalizeHrDocumentTemplate({ ...req.body, id })
    if (!body.id) return sendJson(res, 400, { error: 'ID-ul sablonului este obligatoriu.' })
    if (!body.denumire) return sendJson(res, 400, { error: 'Denumirea sablonului este obligatorie.' })
    if (!body.template_html) return sendJson(res, 400, { error: 'Continutul HTML al sablonului este obligatoriu.' })

    if (isMssqlMode()) {
      const template = mssqlObject(`
DECLARE @id nvarchar(50), @denumire nvarchar(200), @tip nvarchar(50), @descriere nvarchar(500), @templateHtml nvarchar(max), @activ nvarchar(10), @userId nvarchar(80);
SELECT @id = id, @denumire = denumire, @tip = tip, @descriere = descriere, @templateHtml = template_html, @activ = activ, @userId = userId
FROM OPENJSON(@p) WITH (
  id nvarchar(50) '$.id',
  denumire nvarchar(200) '$.denumire',
  tip nvarchar(50) '$.tip',
  descriere nvarchar(500) '$.descriere',
  template_html nvarchar(max) '$.template_html',
  activ nvarchar(10) '$.activ',
  userId nvarchar(80) '$.userId'
);
MERGE hr.document_templates AS target
USING (SELECT @id AS id) AS source
ON target.id = source.id
WHEN MATCHED THEN UPDATE SET
  denumire = @denumire,
  tip = @tip,
  descriere = @descriere,
  template_html = @templateHtml,
  activ = CASE WHEN @activ = N'false' THEN 0 ELSE 1 END,
  updated_at = SYSDATETIME(),
  updated_by = TRY_CONVERT(uniqueidentifier, NULLIF(@userId, ''))
WHEN NOT MATCHED THEN INSERT (id, denumire, tip, descriere, template_html, activ, created_by, updated_by)
  VALUES (@id, @denumire, @tip, @descriere, @templateHtml, CASE WHEN @activ = N'false' THEN 0 ELSE 1 END, TRY_CONVERT(uniqueidentifier, NULLIF(@userId, '')), TRY_CONVERT(uniqueidentifier, NULLIF(@userId, '')));
SELECT TOP 1 id, denumire, tip, descriere, template_html, activ,
       word_template_file, word_template_original_name, word_template_size, word_template_uploaded_at, word_template_uploaded_by,
       updated_at, updated_by, created_at, created_by
FROM hr.document_templates WHERE id = @id FOR JSON PATH;
`, { ...body, userId: auth.user.id })
      addAudit(db, auth.user, 'hr_document_template_save', template?.id || body.id)
      writeDb(db)
      return sendJson(res, 200, { template })
    }

    const hr = ensureHrDb(db)
    let template = hr.documentTemplates.find((item) => item.id === id)
    if (!template) {
      template = { id, created_at: nowIso(), created_by: auth.user.id }
      hr.documentTemplates.push(template)
    }
    Object.assign(template, body, { updated_at: nowIso(), updated_by: auth.user.id })
    addAudit(db, auth.user, 'hr_document_template_save', id)
    writeDb(db)
    sendJson(res, 200, { template })
  } catch (error) {
    next(error)
  }
})

router.post('/hr/document-templates/:id/word-template', upload.single('file'), (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    const id = String(req.params.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 50)
    if (!id) return sendJson(res, 400, { error: 'ID-ul sablonului este obligatoriu.' })
    if (!req.file) return sendJson(res, 422, { error: 'Incarca un fisier Word .docx.', code: 'HR_TEMPLATE_WORD_MISSING' })
    if (!String(req.file.originalname || '').toLowerCase().endsWith('.docx')) {
      fs.unlinkSync(req.file.path)
      return sendJson(res, 422, { error: 'Sunt acceptate doar fisiere Word .docx.', code: 'HR_TEMPLATE_WORD_INVALID' })
    }
    const storedName = `${id}-${crypto.randomUUID()}.docx`
    const storedPath = path.join(HR_TEMPLATE_ROOT, storedName)
    fs.renameSync(req.file.path, storedPath)
    const relativePath = path.join('storage', 'hr-templates', storedName).replace(/\\/g, '/')
    const originalName = String(req.file.originalname || `${id}.docx`).slice(0, 255)
    const size = Number(req.file.size || 0)
    const db = readDb()
    const fallbackTemplate = DEFAULT_HR_DOCUMENT_TEMPLATES.find((item) => item.id === id) || { id, denumire: id, tip: 'altul', descriere: '', template_html: '<p></p>' }

    if (isMssqlMode()) {
      const current = mssqlObject(`SELECT TOP 1 word_template_file FROM hr.document_templates WHERE id=JSON_VALUE(@p,'$.id') FOR JSON PATH;`, { id })
      const template = mssqlObject(`
DECLARE @id nvarchar(50), @file nvarchar(500), @original nvarchar(255), @size bigint, @userId nvarchar(80), @denumire nvarchar(200), @tip nvarchar(50), @descriere nvarchar(500), @templateHtml nvarchar(max);
SELECT @id=id, @file=filePath, @original=originalName, @size=TRY_CONVERT(bigint, fileSize), @userId=userId, @denumire=denumire, @tip=tip, @descriere=descriere, @templateHtml=templateHtml
FROM OPENJSON(@p) WITH (
  id nvarchar(50) '$.id',
  filePath nvarchar(500) '$.filePath',
  originalName nvarchar(255) '$.originalName',
  fileSize nvarchar(50) '$.fileSize',
  userId nvarchar(80) '$.userId',
  denumire nvarchar(200) '$.denumire',
  tip nvarchar(50) '$.tip',
  descriere nvarchar(500) '$.descriere',
  templateHtml nvarchar(max) '$.template_html'
);
IF NOT EXISTS (SELECT 1 FROM hr.document_templates WHERE id=@id)
  INSERT INTO hr.document_templates (id, denumire, tip, descriere, template_html, activ, created_by, updated_by)
  VALUES (@id, @denumire, @tip, @descriere, @templateHtml, 1, TRY_CONVERT(uniqueidentifier, NULLIF(@userId, '')), TRY_CONVERT(uniqueidentifier, NULLIF(@userId, '')));
UPDATE hr.document_templates
SET word_template_file=@file,
    word_template_original_name=@original,
    word_template_size=@size,
    word_template_uploaded_at=SYSDATETIME(),
    word_template_uploaded_by=TRY_CONVERT(uniqueidentifier, NULLIF(@userId, '')),
    updated_at=SYSDATETIME(),
    updated_by=TRY_CONVERT(uniqueidentifier, NULLIF(@userId, ''))
WHERE id=@id;
SELECT TOP 1 id, denumire, tip, descriere, template_html, activ,
       word_template_file, word_template_original_name, word_template_size, word_template_uploaded_at, word_template_uploaded_by,
       updated_at, updated_by, created_at, created_by
FROM hr.document_templates WHERE id=@id FOR JSON PATH;
`, { ...fallbackTemplate, id, filePath: relativePath, originalName, fileSize: size, userId: auth.user.id })
      removeStoredHrTemplateFile(current?.word_template_file)
      addAudit(db, auth.user, 'hr_document_template_word_upload', `${id} / ${originalName}`)
      writeDb(db)
      return sendJson(res, 200, { template })
    }

    const hr = ensureHrDb(db)
    let template = hr.documentTemplates.find((item) => item.id === id)
    if (!template) {
      template = normalizeTemplatePublic({ ...fallbackTemplate, created_at: nowIso(), created_by: auth.user.id })
      hr.documentTemplates.push(template)
    }
    removeStoredHrTemplateFile(template.word_template_file)
    Object.assign(template, {
      word_template_file: relativePath,
      word_template_original_name: originalName,
      word_template_size: size,
      word_template_uploaded_at: nowIso(),
      word_template_uploaded_by: auth.user.id,
      updated_at: nowIso(),
      updated_by: auth.user.id
    })
    addAudit(db, auth.user, 'hr_document_template_word_upload', `${id} / ${originalName}`)
    writeDb(db)
    sendJson(res, 200, { template })
  } catch (error) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
    next(error)
  }
})

router.get('/hr/document-templates/:id/word-template', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:view')) return
    const id = String(req.params.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 50)
    const template = isMssqlMode()
      ? mssqlObject(`SELECT TOP 1 word_template_file, word_template_original_name FROM hr.document_templates WHERE id=JSON_VALUE(@p,'$.id') FOR JSON PATH;`, { id })
      : (ensureHrDb(readDb()).documentTemplates || []).find((item) => item.id === id)
    if (!template?.word_template_file) return sendJson(res, 404, { error: 'Sablonul Word nu exista pentru acest document.', code: 'HR_TEMPLATE_WORD_NOT_FOUND' })
    const absolute = resolveStoredHrTemplateFile(template.word_template_file)
    if (!absolute || !fs.existsSync(absolute)) return sendJson(res, 404, { error: 'Fisierul Word nu a fost gasit in storage.', code: 'HR_TEMPLATE_WORD_FILE_MISSING' })
    res.download(absolute, template.word_template_original_name || `${id}.docx`)
  } catch (error) {
    next(error)
  }
})

router.get('/hr/document-templates/:id/render-word', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:view')) return
    const templateId = String(req.params.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 50)
    const rendered = renderHrWordDocument(auth, templateId, req.query)
    addAudit(rendered.db, auth.user, 'hr_document_template_word_render', `${templateId} / ${rendered.employee.id}`)
    writeDb(rendered.db)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="${rendered.baseName}.docx"`)
    res.end(rendered.buffer)
  } catch (error) {
    next(error)
  }
})

router.post('/hr/document-templates/:id/render-word/archive', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    const templateId = String(req.params.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 50)
    const rendered = renderHrWordDocument(auth, templateId, req.body || {})
    const files = ensureEmployeeFiles(rendered.db)
    const folder = path.join(HR_FILE_ROOT, `employee_${safeSegment(rendered.employee.id)}`)
    fs.mkdirSync(folder, { recursive: true })
    const uuid = crypto.randomUUID()
    const storedName = `${uuid}.docx`
    fs.writeFileSync(path.join(folder, storedName), rendered.buffer)
    const tip = String(req.body?.tip || (templateId === 'act_aditional' ? 'act_aditional' : 'contract')).slice(0, 50)
    const denumire = String(req.body?.denumire || rendered.displayName || 'Document HR Word generat').slice(0, 200)
    const item = {
      id: nextId(files),
      uuid,
      employee_id: String(rendered.employee.id),
      tip,
      denumire,
      file_name: `${safeDocxName(denumire)}.docx`,
      stored_name: storedName,
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      file_size: rendered.buffer.length,
      data_document: req.body?.data_document || todayIso(),
      data_expirare: req.body?.data_expirare || null,
      generated: true,
      generated_source: String(req.body?.source || `word-template:${templateId}`).slice(0, 80),
      requires_ack: req.body?.requires_ack !== false,
      kiosk_visible: req.body?.kiosk_visible !== false,
      uploaded_by: auth.user.id,
      created_at: new Date().toISOString()
    }
    files.push(item)
    addAudit(rendered.db, auth.user, 'hr_employee_file_word_generated', `${rendered.employee.id} / ${item.tip} / ${item.denumire}`)
    writeDb(rendered.db)
    res.status(201).json({ item })
  } catch (error) {
    next(error)
  }
})

router.get('/hr/document-templates/:id/validate-word', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:view')) return
    const templateId = String(req.params.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 50)
    const db = readDb()
    const template = findHrDocumentTemplateForRender(db, templateId)
    if (!template?.word_template_file) return sendJson(res, 404, { error: 'Nu există șablon Word încărcat pentru acest document.', code: 'HR_TEMPLATE_WORD_NOT_FOUND' })
    const absolute = resolveStoredHrTemplateFile(template.word_template_file)
    if (!absolute || !fs.existsSync(absolute)) return sendJson(res, 404, { error: 'Fișierul Word nu a fost găsit în storage.', code: 'HR_TEMPLATE_WORD_FILE_MISSING' })
    const sample = renderHrWordDocument(auth, templateId, req.query || {}, { dryRun: true })
    const analysis = analyzeDocxTemplate(absolute, sample.data)
    const status = analysis.detected_count > 0 && analysis.unknown.length === 0 ? 'ok' : 'warning'
    sendJson(res, 200, {
      status,
      template: { id: template.id, denumire: template.denumire, word_template_original_name: template.word_template_original_name },
      employee: sample.employee ? { id: sample.employee.id, nume: sample.employee.nume, prenume: sample.employee.prenume, marca: sample.employee.marca } : null,
      contract: sample.contract ? { id: sample.contract.id, numar_contract: sample.contract.numar_contract } : null,
      amendment: sample.amendment ? { id: sample.amendment.id, numar_act: sample.amendment.numar_act } : null,
      ...analysis
    })
  } catch (error) {
    next(error)
  }
})

router.get('/hr/employees/:id/contract-amendments', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:view')) return
    if (isMssqlMode()) {
      return sendJson(res, 200, mssqlArray(`
SELECT a.*, c.numar_contract
FROM hr.contract_amendments a
JOIN hr.contracts c ON c.id = a.contract_id
WHERE a.employee_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.id'))
  AND a.cancelled_at IS NULL
ORDER BY a.data_efect DESC, a.created_at DESC
FOR JSON PATH;
`, req.params))
    }
    const hr = ensureHrDb(readDb())
    const rows = hr.contractAmendments
      .filter((item) => String(item.employee_id) === String(req.params.id) && !item.cancelled_at)
      .sort((a, b) => String(b.data_efect || b.created_at || '').localeCompare(String(a.data_efect || a.created_at || '')))
    sendJson(res, 200, rows)
  } catch (error) {
    next(error)
  }
})

router.post('/hr/employees/:id/contracts/:contractId/amendments', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'hr:manage')) return
    const db = readDb()
    const body = normalizeContractAmendment(req.body || {})
    if (!body.data_efect) return sendJson(res, 400, { error: 'Data de efect a actului aditional este obligatorie.' })

    if (isMssqlMode()) {
      const created = mssqlObject(`
DECLARE @employeeId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.employeeId'));
DECLARE @contractId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.contractId'));
DECLARE @tip nvarchar(40) = COALESCE(NULLIF(JSON_VALUE(@p, '$.tip'), ''), N'altul');
DECLARE @dataEfect date = TRY_CONVERT(date, JSON_VALUE(@p, '$.data_efect'));
IF NOT EXISTS (SELECT 1 FROM hr.contracts WHERE id=@contractId AND employee_id=@employeeId)
BEGIN
  SELECT CAST(NULL AS int) AS id WHERE 1=0 FOR JSON PATH;
  RETURN;
END;
INSERT INTO hr.contract_amendments (
  employee_id, contract_id, tip, numar_act, data_act, data_efect,
  salariu_baza, norma_ore, functia, functie_cor, department_id, status_contract,
  observatii, created_by
)
VALUES (
  @employeeId, @contractId, @tip, NULLIF(JSON_VALUE(@p, '$.numar_act'), ''),
  TRY_CONVERT(date, NULLIF(JSON_VALUE(@p, '$.data_act'), '')), @dataEfect,
  TRY_CONVERT(decimal(15,2), NULLIF(JSON_VALUE(@p, '$.salariu_baza'), '')),
  TRY_CONVERT(decimal(5,2), NULLIF(JSON_VALUE(@p, '$.norma_ore'), '')),
  NULLIF(JSON_VALUE(@p, '$.functia'), ''),
  NULLIF(JSON_VALUE(@p, '$.functie_cor'), ''),
  TRY_CONVERT(uniqueidentifier, NULLIF(JSON_VALUE(@p, '$.department_id'), '')),
  NULLIF(JSON_VALUE(@p, '$.status_contract'), ''),
  NULLIF(JSON_VALUE(@p, '$.observatii'), ''),
  TRY_CONVERT(uniqueidentifier, NULLIF(JSON_VALUE(@p, '$.userId'), ''))
);
DECLARE @id int = SCOPE_IDENTITY();
UPDATE hr.contracts
SET
  salariu_baza = COALESCE(TRY_CONVERT(decimal(15,2), NULLIF(JSON_VALUE(@p, '$.salariu_baza'), '')), salariu_baza),
  norma_ore = COALESCE(TRY_CONVERT(decimal(5,2), NULLIF(JSON_VALUE(@p, '$.norma_ore'), '')), norma_ore),
  status = COALESCE(NULLIF(JSON_VALUE(@p, '$.status_contract'), ''), status),
  data_sfarsit = CASE WHEN NULLIF(JSON_VALUE(@p, '$.status_contract'), '') = N'incetat' THEN @dataEfect ELSE data_sfarsit END,
  observatii = COALESCE(NULLIF(JSON_VALUE(@p, '$.observatii'), ''), observatii),
  updated_at = SYSDATETIME()
WHERE id=@contractId;
UPDATE hr.employees
SET
  functia = COALESCE(NULLIF(JSON_VALUE(@p, '$.functia'), ''), functia),
  functie_cor = COALESCE(NULLIF(JSON_VALUE(@p, '$.functie_cor'), ''), functie_cor),
  department_id = COALESCE(TRY_CONVERT(uniqueidentifier, NULLIF(JSON_VALUE(@p, '$.department_id'), '')), department_id),
  data_plecare = CASE WHEN NULLIF(JSON_VALUE(@p, '$.status_contract'), '') = N'incetat' THEN @dataEfect ELSE data_plecare END,
  activ = CASE WHEN NULLIF(JSON_VALUE(@p, '$.status_contract'), '') = N'incetat' THEN 0 ELSE activ END,
  updated_at = SYSDATETIME()
WHERE id=@employeeId;
SELECT TOP 1 * FROM hr.contract_amendments WHERE id=@id FOR JSON PATH;
`, { ...body, employeeId: req.params.id, contractId: req.params.contractId, userId: auth.user.id })
      if (!created) return sendJson(res, 404, { error: 'Contractul nu a fost gasit.' })
      addAudit(db, auth.user, 'hr_contract_amendment_create', `${created.tip} / ${created.numar_act || created.id}`)
      writeDb(db)
      return sendJson(res, 201, created)
    }

    const hr = ensureHrDb(db)
    const employee = hr.employees.find((item) => String(item.id) === String(req.params.id))
    const contract = hr.contracts.find((item) => String(item.id) === String(req.params.contractId) && String(item.employee_id) === String(req.params.id))
    if (!employee || !contract) return sendJson(res, 404, { error: 'Angajatul sau contractul nu a fost gasit.' })
    const amendment = {
      id: nextId(hr.contractAmendments),
      uuid: crypto.randomUUID(),
      employee_id: Number(req.params.id),
      contract_id: Number(req.params.contractId),
      ...body,
      created_by: auth.user.id,
      created_at: nowIso()
    }
    hr.contractAmendments.push(amendment)
    applyContractAmendmentJson(employee, contract, amendment)
    addAudit(db, auth.user, 'hr_contract_amendment_create', `${amendment.tip} / ${amendment.numar_act || amendment.id}`)
    writeDb(db)
    sendJson(res, 201, amendment)
  } catch (error) {
    next(error)
  }
})

function normalizeContractAmendment(body) {
  const tip = String(body.tip || 'altul').trim()
  const allowed = new Set(['salariu', 'functie', 'norma', 'departament', 'suspendare', 'incetare', 'altul'])
  return {
    tip: allowed.has(tip) ? tip : 'altul',
    numar_act: String(body.numar_act || '').trim().slice(0, 100),
    data_act: String(body.data_act || todayIso()).slice(0, 10),
    data_efect: String(body.data_efect || '').slice(0, 10),
    salariu_baza: body.salariu_baza === '' || body.salariu_baza == null ? '' : numberValue(body.salariu_baza),
    norma_ore: body.norma_ore === '' || body.norma_ore == null ? '' : numberValue(body.norma_ore),
    functia: String(body.functia || '').trim().slice(0, 150),
    functie_cor: String(body.functie_cor || '').trim().slice(0, 20),
    department_id: String(body.department_id || '').trim(),
    status_contract: String(body.status_contract || '').trim(),
    observatii: String(body.observatii || '').trim().slice(0, 1000)
  }
}

function normalizeHrDocumentTemplate(body) {
  return {
    id: String(body.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 50),
    denumire: String(body.denumire || '').trim().slice(0, 200),
    tip: String(body.tip || 'altul').trim().slice(0, 50),
    descriere: String(body.descriere || '').trim().slice(0, 500),
    template_html: String(body.template_html || '').trim().slice(0, 50000),
    activ: body.activ !== false
  }
}

function ensureDefaultHrDocumentTemplates(templates = []) {
  const rows = Array.isArray(templates) ? templates.map((item) => normalizeTemplatePublic(item)) : []
  const byId = new Map(rows.map((item) => [String(item.id), item]))
  DEFAULT_HR_DOCUMENT_TEMPLATES.forEach((template) => {
    if (!byId.has(template.id)) {
      rows.push(normalizeTemplatePublic({ ...template, activ: true, system_default: true }))
    }
  })
  return rows
}

function normalizeTemplatePublic(template = {}) {
  return {
    id: String(template.id || '').trim(),
    denumire: String(template.denumire || '').trim(),
    tip: String(template.tip || 'altul').trim(),
    descriere: String(template.descriere || '').trim(),
    template_html: String(template.template_html || '').trim(),
    word_template_file: String(template.word_template_file || '').trim(),
    word_template_original_name: String(template.word_template_original_name || '').trim(),
    word_template_size: Number(template.word_template_size || 0),
    word_template_uploaded_at: template.word_template_uploaded_at || null,
    word_template_uploaded_by: template.word_template_uploaded_by || null,
    activ: template.activ !== false,
    system_default: Boolean(template.system_default),
    created_at: template.created_at || null,
    updated_at: template.updated_at || null
  }
}

function resolveStoredHrTemplateFile(relativePath) {
  if (!relativePath) return null
  const normalized = String(relativePath).replace(/\\/g, '/').replace(/^\/+/, '')
  const absolute = path.resolve(__dirname, '../../../', normalized)
  const root = path.resolve(HR_TEMPLATE_ROOT)
  return absolute.startsWith(root + path.sep) || absolute === root ? absolute : null
}

function removeStoredHrTemplateFile(relativePath) {
  const absolute = resolveStoredHrTemplateFile(relativePath)
  if (absolute && fs.existsSync(absolute)) fs.unlinkSync(absolute)
}

function findHrDocumentTemplateForRender(db, id) {
  if (isMssqlMode()) {
    const template = mssqlObject(`SELECT TOP 1 id, denumire, tip, descriere, template_html, activ,
       word_template_file, word_template_original_name, word_template_size, word_template_uploaded_at, word_template_uploaded_by
FROM hr.document_templates WHERE id=JSON_VALUE(@p,'$.id') FOR JSON PATH;`, { id })
    if (template) return normalizeTemplatePublic(template)
  }
  const hr = ensureHrDb(db)
  const stored = (hr.documentTemplates || []).find((item) => item.id === id)
  if (stored) return normalizeTemplatePublic(stored)
  const fallback = DEFAULT_HR_DOCUMENT_TEMPLATES.find((item) => item.id === id)
  return fallback ? normalizeTemplatePublic({ ...fallback, system_default: true }) : null
}

function renderHrWordDocument(auth, templateId, params = {}, options = {}) {
  const db = readDb()
  const hr = ensureHrDb(db)
  const template = findHrDocumentTemplateForRender(db, templateId)
  if (!template?.word_template_file) {
    const error = new Error('Nu există șablon Word încărcat pentru acest document.')
    error.status = 404
    error.code = 'HR_TEMPLATE_WORD_NOT_FOUND'
    throw error
  }
  const absolute = resolveStoredHrTemplateFile(template.word_template_file)
  if (!absolute || !fs.existsSync(absolute)) {
    const error = new Error('Fișierul Word nu a fost găsit în storage.')
    error.status = 404
    error.code = 'HR_TEMPLATE_WORD_FILE_MISSING'
    throw error
  }
  const employeeId = params.employee_id || params.employeeId || params.angajat_id || params.angajatId
  let employee = null
  let contract = null
  let amendment = null
  if (isMssqlMode()) {
    employee = employeeId ? mssqlObject(`SELECT TOP 1 * FROM hr.employees WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employeeId')) FOR JSON PATH;`, { employeeId }) : null
    contract = params.contract_id ? mssqlObject(`SELECT TOP 1 * FROM hr.contracts WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.contractId')) FOR JSON PATH;`, { contractId: params.contract_id }) : null
    amendment = params.amendment_id ? mssqlObject(`SELECT TOP 1 * FROM hr.contract_amendments WHERE id=TRY_CONVERT(int,JSON_VALUE(@p,'$.amendmentId')) FOR JSON PATH;`, { amendmentId: params.amendment_id }) : null
  } else {
    employee = employeeId ? hr.employees.find((item) => String(item.id) === String(employeeId)) : null
    contract = params.contract_id ? hr.contracts.find((item) => String(item.id) === String(params.contract_id)) : null
    amendment = params.amendment_id ? hr.contractAmendments.find((item) => String(item.id) === String(params.amendment_id)) : null
  }
  if (!employee) {
    const error = new Error('Angajatul nu a fost găsit pentru generarea Word.')
    error.status = 404
    error.code = 'HR_EMPLOYEE_NOT_FOUND'
    throw error
  }
  if (params.contract_id && !contract) {
    const error = new Error('Contractul nu a fost găsit pentru generarea Word.')
    error.status = 404
    error.code = 'HR_CONTRACT_NOT_FOUND'
    throw error
  }
  if (params.amendment_id && !amendment) {
    const error = new Error('Actul adițional nu a fost găsit pentru generarea Word.')
    error.status = 404
    error.code = 'HR_AMENDMENT_NOT_FOUND'
    throw error
  }
  if (contract && String(contract.employee_id || '') !== String(employee.id)) {
    const error = new Error('Contractul selectat nu aparține angajatului.')
    error.status = 409
    error.code = 'HR_CONTRACT_EMPLOYEE_MISMATCH'
    throw error
  }
  if (amendment && contract && String(amendment.contract_id || '') !== String(contract.id)) {
    const error = new Error('Actul adițional nu aparține contractului selectat.')
    error.status = 409
    error.code = 'HR_AMENDMENT_CONTRACT_MISMATCH'
    throw error
  }
  if (!contract) {
    contract = isMssqlMode()
      ? mssqlObject(`SELECT TOP 1 * FROM hr.contracts WHERE employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employeeId')) AND ISNULL(status,N'activ')<>N'incetat' ORDER BY data_start DESC FOR JSON PATH;`, { employeeId: employee.id })
      : activeContractFor(hr, employee.id)
  }
  const data = buildHrWordTemplateData(db, auth, employee, contract, amendment, templateId)
  if (options.dryRun) {
    return { db, template, employee, contract, amendment, data, displayName: `${template.denumire || templateId} ${employee.prenume || ''} ${employee.nume || ''}`.trim() }
  }
  const buffer = renderDocxTemplate(absolute, data)
  const displayName = params.denumire || `${template.denumire || templateId} ${employee.prenume || ''} ${employee.nume || ''}`.trim()
  return {
    db,
    template,
    employee,
    contract,
    amendment,
    buffer,
    displayName,
    baseName: safeDocxName(`${displayName}-${todayIso()}`)
  }
}

function buildHrWordTemplateData(db, auth, employee, contract = {}, amendment = null, templateId = '') {
  const company = publicCompanySettings(companySettings(db))
  const today = todayIso()
  const safeEmployee = publicEmployee(employeeWithSalary(ensureHrDb(db), employee), auth, db)
  const contractData = contract || {}
  const amendmentData = amendment || {}
  return {
    nr_cim: contractData.numar_contract || `CIM-${new Date().getFullYear()}-${employee.marca || employee.id || '____'}`,
    data_generare: today,
    data: today,
    titlu: templateId === 'act_aditional' ? 'ACT ADIȚIONAL' : 'CONTRACT INDIVIDUAL DE MUNCĂ',
    company,
    angajat: {
      ...safeEmployee,
      nume: employee.nume || safeEmployee.nume || '',
      prenume: employee.prenume || safeEmployee.prenume || '',
      cnp: employee.cnp || safeEmployee.cnp || '',
      marca: employee.marca || safeEmployee.marca || '',
      adresa: employee.adresa || safeEmployee.adresa || '',
      department_name: employee.department_name || departmentName(db, employee.department_id),
      zile_co_drept: employee.zile_co_drept ?? 21,
      salariu_baza: contractData.salariu_baza || employee.salariu_baza || ''
    },
    contract: {
      ...contractData,
      numar_contract: contractData.numar_contract || '',
      data_contract: String(contractData.data_contract || '').slice(0, 10),
      data_start: String(contractData.data_start || contractData.data_incepere || '').slice(0, 10),
      tip: contractData.tip || 'CIM',
      functia: contractData.functia || employee.functia || '',
      norma_ore: contractData.norma_ore || employee.norma_ore_zi || 8,
      salariu_baza: contractData.salariu_baza || employee.salariu_baza || ''
    },
    amendment: {
      ...amendmentData,
      numar_act: amendmentData.numar_act || (amendmentData.id ? `AA-${amendmentData.id}` : ''),
      data_act: String(amendmentData.data_act || '').slice(0, 10),
      data_efect: String(amendmentData.data_efect || '').slice(0, 10),
      modificare_text: amendment ? plainText(amendmentText(amendmentData)) : ''
    }
  }
}

function renderDocxTemplate(filePath, data) {
  const zip = new AdmZip(filePath)
  if (!zip.getEntry('word/document.xml')) {
    const error = new Error('Fișierul încărcat nu pare să fie un document Word .docx valid.')
    error.status = 422
    error.code = 'HR_TEMPLATE_WORD_INVALID'
    throw error
  }
  const replacements = flattenTemplateData(data)
  let detectedVariables = 0
  let replacedVariables = 0
  zip.getEntries().forEach((entry) => {
    if (entry.isDirectory || !/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/i.test(entry.entryName)) return
    const xml = entry.getData().toString('utf8')
    const nextXml = xml.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key) => {
      detectedVariables += 1
      replacedVariables += 1
      return escapeXml(templateValue(replacements[key]))
    })
    if (nextXml !== xml) zip.updateFile(entry.entryName, Buffer.from(nextXml, 'utf8'))
  })
  if (!detectedVariables) {
    const error = new Error('Nu am găsit variabile de forma {{angajat.nume}} în documentul Word. Verifică să fie scrise continuu, fără formatare aplicată pe bucăți.')
    error.status = 422
    error.code = 'HR_TEMPLATE_WORD_VARIABLES_NOT_FOUND'
    throw error
  }
  if (!replacedVariables) {
    const error = new Error('Variabilele din șablonul Word nu au putut fi înlocuite.')
    error.status = 422
    error.code = 'HR_TEMPLATE_WORD_RENDER_FAILED'
    throw error
  }
  return zip.toBuffer()
}

function analyzeDocxTemplate(filePath, data) {
  const zip = new AdmZip(filePath)
  if (!zip.getEntry('word/document.xml')) {
    const error = new Error('Fișierul încărcat nu pare să fie un document Word .docx valid.')
    error.status = 422
    error.code = 'HR_TEMPLATE_WORD_INVALID'
    throw error
  }
  const replacements = flattenTemplateData(data)
  const knownKeys = new Set(Object.keys(replacements))
  const detected = []
  zip.getEntries().forEach((entry) => {
    if (entry.isDirectory || !/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/i.test(entry.entryName)) return
    const xml = entry.getData().toString('utf8')
    for (const match of xml.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)) {
      detected.push(match[1])
    }
  })
  const unique = Array.from(new Set(detected)).sort()
  const unknown = unique.filter((key) => !knownKeys.has(key))
  const resolved = unique.filter((key) => knownKeys.has(key))
  const missing_values = resolved.filter((key) => {
    const value = replacements[key]
    return value === undefined || value === null || value === ''
  })
  const warnings = []
  if (!unique.length) warnings.push('Nu am găsit variabile detectabile. Verifică să fie scrise continuu, de exemplu {{angajat.nume}}, fără formatare aplicată pe bucăți.')
  if (unknown.length) warnings.push(`Variabile necunoscute: ${unknown.join(', ')}`)
  if (missing_values.length) warnings.push(`Variabile fără valoare pentru exemplul ales: ${missing_values.join(', ')}`)
  return {
    detected_variables: unique,
    detected_count: unique.length,
    resolved,
    unknown,
    missing_values,
    warnings,
    available_count: knownKeys.size
  }
}

function flattenTemplateData(data, prefix = '', out = {}) {
  Object.entries(data || {}).forEach(([key, value]) => {
    const pathKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      flattenTemplateData(value, pathKey, out)
    } else {
      out[pathKey] = value
    }
  })
  return out
}

function templateValue(value) {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '—'
  return plainText(value)
}

function plainText(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
}

function safeDocxName(value) {
  return String(value || 'document-hr')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'document-hr'
}

function ensureEmployeeFiles(db) {
  db.hr = db.hr || {}
  db.hr.employeeFiles = Array.isArray(db.hr.employeeFiles) ? db.hr.employeeFiles : []
  return db.hr.employeeFiles
}

function applyContractAmendmentJson(employee, contract, amendment) {
  if (amendment.salariu_baza !== '') contract.salariu_baza = amendment.salariu_baza
  if (amendment.norma_ore !== '') contract.norma_ore = amendment.norma_ore
  if (amendment.status_contract) contract.status = amendment.status_contract
  if (amendment.status_contract === 'incetat') {
    contract.data_sfarsit = amendment.data_efect
    employee.data_plecare = amendment.data_efect
    employee.activ = false
  }
  if (amendment.functia) employee.functia = amendment.functia
  if (amendment.functie_cor) employee.functie_cor = amendment.functie_cor
  if (amendment.department_id) employee.department_id = amendment.department_id
  contract.updated_at = nowIso()
  employee.updated_at = nowIso()
}

const medicalLeaveRoot = path.join(__dirname, '../../../storage/hr-medical-leaves')
const medicalLeaveUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
const medicalLeaveMime = new Set(['application/pdf', 'image/jpeg', 'image/png'])
fs.mkdirSync(medicalLeaveRoot, { recursive: true })

function kioskOrAppAuth(req, res) {
  const session = kioskSessions.getSession(kioskSessions.tokenFromRequest(req))
  if (!session) return requireAuth(req, res)
  return { db: readDb(), user: { id: `kiosk-${session.employee_id}`, username: session.username, role: 'kiosk', employee_id: session.employee_id, permissions: ['hr:view_own', 'hr:leave_own', 'kiosk:leave_request'] } }
}

function safeMedicalFile(value) { return String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_') }

router.post('/hr/kiosk/medical-leave', medicalLeaveUpload.single('file'), (req, res, next) => {
  let storedPath = ''
  try {
    const auth = kioskOrAppAuth(req, res)
    if (!auth) return
    if (!canUseKioskSync(auth)) return requirePermission(auth, res, 'hr:view_own')
    if (!req.file || !medicalLeaveMime.has(req.file.mimetype)) return sendJson(res, 422, { error: 'Pentru concediul medical este obligatoriu un fisier PDF, JPG sau PNG de maximum 10 MB.', code: 'HR_MEDICAL_FILE_REQUIRED' })
    const db = readDb()
    const hr = ensureHrDb(db)
    const employeeId = String(auth.user.employee_id || auth.user.employeeId || '').trim()
    const body = req.body || {}
    const missing = missingMedicalField(body)
    if (!employeeId) return sendJson(res, 422, { error: 'Contul Kiosk nu este asociat unui angajat.', code: 'HR_EMPLOYEE_LINK_REQUIRED' })
    if (missing) return sendJson(res, 422, { error: `Camp obligatoriu lipsa: ${missing}.`, code: 'HR_MEDICAL_FIELD_REQUIRED' })
    const zileCalendaristice = calendarDays(body.data_start, body.data_sfarsit)
    if (!zileCalendaristice) return sendJson(res, 422, { error: 'Perioada certificatului medical nu este valida.', code: 'HR_MEDICAL_DATES_INVALID' })
    const leaveUuid = crypto.randomUUID()
    const certificateUuid = crypto.randomUUID()
    const extension = req.file.mimetype === 'application/pdf' ? '.pdf' : req.file.mimetype === 'image/png' ? '.png' : '.jpg'
    const folder = path.join(medicalLeaveRoot, `employee_${safeMedicalFile(employeeId)}`)
    fs.mkdirSync(folder, { recursive: true })
    const storedName = `${certificateUuid}${extension}`
    storedPath = path.join(folder, storedName)
    fs.writeFileSync(storedPath, req.file.buffer)
    const payload = { ...body, employee_id: employeeId, leave_uuid: leaveUuid, certificate_uuid: certificateUuid, zile_lucratoare: businessDays(body.data_start, body.data_sfarsit), zile_calendaristice: zileCalendaristice, file_name: String(req.file.originalname || `certificat${extension}`).slice(0, 255), stored_name: storedName, mime_type: req.file.mimetype, file_size: req.file.size, created_by: auth.user.id }

    if (isMssqlMode()) {
      const overlap = mssqlObject(`SELECT TOP 1 uuid,data_start,data_sfarsit FROM hr.leave_requests WHERE employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')) AND status IN (N'cerut',N'aprobat',N'aprobata') AND data_start<=TRY_CONVERT(date,JSON_VALUE(@p,'$.data_sfarsit')) AND data_sfarsit>=TRY_CONVERT(date,JSON_VALUE(@p,'$.data_start')) FOR JSON PATH;`, payload)
      if (overlap) { fs.unlinkSync(storedPath); storedPath = ''; return sendJson(res, 409, { error: `Exista deja o cerere activa care se suprapune (${overlap.data_start} - ${overlap.data_sfarsit}).`, code: 'HR_LEAVE_OVERLAP' }) }
      const item = mssqlObject(`
SET XACT_ABORT ON; BEGIN TRANSACTION;
INSERT INTO hr.leave_requests(uuid,employee_id,tip,data_start,data_sfarsit,zile,motiv,status)
VALUES(TRY_CONVERT(uniqueidentifier,JSON_VALUE(@p,'$.leave_uuid')),TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')),N'CM',TRY_CONVERT(date,JSON_VALUE(@p,'$.data_start')),TRY_CONVERT(date,JSON_VALUE(@p,'$.data_sfarsit')),TRY_CONVERT(decimal(6,2),JSON_VALUE(@p,'$.zile_lucratoare')),NULLIF(JSON_VALUE(@p,'$.motiv'),''),N'cerut');
INSERT INTO hr.medical_leave_certificates(uuid,leave_request_uuid,employee_id,serie,numar,tip_certificat,data_acordarii,data_start,data_sfarsit,zile_calendaristice,cod_indemnizatie,cod_diagnostic,medic_nume,cod_parafa,unitate_emitenta,file_name,stored_name,mime_type,file_size,created_by)
VALUES(TRY_CONVERT(uniqueidentifier,JSON_VALUE(@p,'$.certificate_uuid')),JSON_VALUE(@p,'$.leave_uuid'),TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')),JSON_VALUE(@p,'$.serie'),JSON_VALUE(@p,'$.numar'),COALESCE(NULLIF(JSON_VALUE(@p,'$.tip_certificat'),''),N'initial'),TRY_CONVERT(date,JSON_VALUE(@p,'$.data_acordarii')),TRY_CONVERT(date,JSON_VALUE(@p,'$.data_start')),TRY_CONVERT(date,JSON_VALUE(@p,'$.data_sfarsit')),TRY_CONVERT(int,JSON_VALUE(@p,'$.zile_calendaristice')),JSON_VALUE(@p,'$.cod_indemnizatie'),NULLIF(JSON_VALUE(@p,'$.cod_diagnostic'),''),JSON_VALUE(@p,'$.medic_nume'),JSON_VALUE(@p,'$.cod_parafa'),JSON_VALUE(@p,'$.unitate_emitenta'),JSON_VALUE(@p,'$.file_name'),JSON_VALUE(@p,'$.stored_name'),JSON_VALUE(@p,'$.mime_type'),TRY_CONVERT(bigint,JSON_VALUE(@p,'$.file_size')),TRY_CONVERT(uniqueidentifier,JSON_VALUE(@p,'$.created_by')));
COMMIT TRANSACTION;
SELECT TOP 1 lr.*,mc.status_verificare,mc.uuid AS medical_certificate_uuid,mc.zile_calendaristice FROM hr.leave_requests lr JOIN hr.medical_leave_certificates mc ON mc.leave_request_uuid=lr.uuid WHERE lr.uuid=JSON_VALUE(@p,'$.leave_uuid') FOR JSON PATH;`, payload)
      addAudit(db, auth.user, 'hr_medical_leave_submitted', `${leaveUuid} / ${employeeId}`); writeDb(db)
      return sendJson(res, 201, item)
    }

    const overlap = hr.leaveRequests.find((entry) => String(entry.employee_id) === employeeId && ['cerut','aprobat','aprobata'].includes(entry.status) && entry.data_start <= body.data_sfarsit && entry.data_sfarsit >= body.data_start)
    if (overlap) { fs.unlinkSync(storedPath); storedPath = ''; return sendJson(res, 409, { error: `Exista deja o cerere activa care se suprapune (${overlap.data_start} - ${overlap.data_sfarsit}).`, code: 'HR_LEAVE_OVERLAP' }) }
    const leave = { id: nextId(hr.leaveRequests), uuid: leaveUuid, employee_id: employeeId, tip: 'CM', data_start: body.data_start, data_sfarsit: body.data_sfarsit, zile: payload.zile_lucratoare, motiv: body.motiv || '', status: 'cerut', created_at: nowIso() }
    const certificate = { id: nextId(hr.medicalLeaveCertificates), uuid: certificateUuid, leave_request_uuid: leaveUuid, employee_id: employeeId, serie: body.serie, numar: body.numar, tip_certificat: body.tip_certificat || 'initial', data_acordarii: body.data_acordarii, data_start: body.data_start, data_sfarsit: body.data_sfarsit, zile_calendaristice: zileCalendaristice, cod_indemnizatie: body.cod_indemnizatie, cod_diagnostic: body.cod_diagnostic || '', medic_nume: body.medic_nume, cod_parafa: body.cod_parafa, unitate_emitenta: body.unitate_emitenta, file_name: payload.file_name, stored_name: storedName, mime_type: req.file.mimetype, file_size: req.file.size, status_verificare: 'in_verificare', created_by: auth.user.id, created_at: nowIso() }
    hr.leaveRequests.push(leave); hr.medicalLeaveCertificates.push(certificate)
    addAudit(db, auth.user, 'hr_medical_leave_submitted', `${leaveUuid} / ${employeeId}`); writeDb(db)
    sendJson(res, 201, { ...leave, status_verificare: certificate.status_verificare, medical_certificate_uuid: certificate.uuid, zile_calendaristice: zileCalendaristice })
  } catch (error) {
    if (storedPath && fs.existsSync(storedPath)) fs.unlinkSync(storedPath)
    next(error)
  }
})

router.get('/hr/medical-leaves/:uuid/document', (req, res, next) => {
  try {
    const auth = kioskOrAppAuth(req, res)
    if (!auth) return
    const db = readDb()
    const ownEmployeeId = String(auth.user.employee_id || auth.user.employeeId || '')
    const fullAccess = authHasPermission(auth, 'hr:leave_manage') || authHasPermission(auth, 'hr:manage')
    const item = isMssqlMode()
      ? mssqlObject(`SELECT TOP 1 * FROM hr.medical_leave_certificates WHERE uuid=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@p,'$.uuid')) FOR JSON PATH;`, req.params)
      : ensureHrDb(db).medicalLeaveCertificates.find((row) => String(row.uuid) === String(req.params.uuid))
    if (!item) return sendJson(res, 404, { error: 'Certificatul medical nu a fost gasit.', code: 'HR_MEDICAL_NOT_FOUND' })
    if (!fullAccess && String(item.employee_id) !== ownEmployeeId) return sendJson(res, 403, { error: 'Nu ai acces la acest document medical.' })
    const filePath = path.join(medicalLeaveRoot, `employee_${safeMedicalFile(item.employee_id)}`, safeMedicalFile(item.stored_name))
    if (!fs.existsSync(filePath)) return sendJson(res, 404, { error: 'Fisierul certificatului nu exista in storage.', code: 'HR_MEDICAL_STORAGE_MISSING' })
    addAudit(db, auth.user, 'hr_medical_leave_document_viewed', String(item.uuid)); writeDb(db)
    res.download(filePath, item.file_name)
  } catch (error) { next(error) }
})

router.post('/hr/medical-leaves/:uuid/verify', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'hr:leave_manage')) return
    const db = readDb()
    let item
    if (isMssqlMode()) item = mssqlObject(`UPDATE hr.medical_leave_certificates SET status_verificare=N'verificat',verificat_de=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@p,'$.userId')),verificat_la=SYSDATETIME(),motiv_respingere=NULL,updated_at=SYSDATETIME() WHERE uuid=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@p,'$.uuid')); SELECT TOP 1 * FROM hr.medical_leave_certificates WHERE uuid=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@p,'$.uuid')) FOR JSON PATH;`, { uuid: req.params.uuid, userId: auth.user.id })
    else { item = ensureHrDb(db).medicalLeaveCertificates.find((row) => String(row.uuid) === String(req.params.uuid)); if (item) Object.assign(item, { status_verificare: 'verificat', verificat_de: auth.user.id, verificat_la: nowIso(), motiv_respingere: null, updated_at: nowIso() }) }
    if (!item) return sendJson(res, 404, { error: 'Certificatul medical nu a fost gasit.' })
    addAudit(db, auth.user, 'hr_medical_leave_verified', req.params.uuid); writeDb(db); sendJson(res, 200, item)
  } catch (error) { next(error) }
})

router.post('/hr/medical-leaves/:uuid/reject', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'hr:leave_manage')) return
    const reason = String(req.body?.motiv || '').trim()
    if (reason.length < 5) return sendJson(res, 422, { error: 'Motivul respingerii trebuie sa aiba minimum 5 caractere.' })
    const db = readDb(); let item
    if (isMssqlMode()) item = mssqlObject(`UPDATE hr.medical_leave_certificates SET status_verificare=N'respinsa',verificat_de=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@p,'$.userId')),verificat_la=SYSDATETIME(),motiv_respingere=JSON_VALUE(@p,'$.motiv'),updated_at=SYSDATETIME() WHERE uuid=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@p,'$.uuid')); SELECT TOP 1 * FROM hr.medical_leave_certificates WHERE uuid=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@p,'$.uuid')) FOR JSON PATH;`, { uuid: req.params.uuid, userId: auth.user.id, motiv: reason })
    else { item = ensureHrDb(db).medicalLeaveCertificates.find((row) => String(row.uuid) === String(req.params.uuid)); if (item) Object.assign(item, { status_verificare: 'respinsa', verificat_de: auth.user.id, verificat_la: nowIso(), motiv_respingere: reason, updated_at: nowIso() }) }
    if (!item) return sendJson(res, 404, { error: 'Certificatul medical nu a fost gasit.' })
    addAudit(db, auth.user, 'hr_medical_leave_rejected', `${req.params.uuid} / ${reason}`); writeDb(db); sendJson(res, 200, item)
  } catch (error) { next(error) }
})

function medicalRegisterRows(db, luna) {
  if (isMssqlMode()) return mssqlArray(`SELECT mc.*,e.nume,e.prenume,e.marca FROM hr.medical_leave_certificates mc JOIN hr.employees e ON e.id=mc.employee_id WHERE mc.data_start<=EOMONTH(TRY_CONVERT(date,JSON_VALUE(@p,'$.luna')+'-01')) AND mc.data_sfarsit>=DATEADD(day,-370,TRY_CONVERT(date,JSON_VALUE(@p,'$.luna')+'-01')) ORDER BY e.nume,e.prenume,mc.data_start FOR JSON PATH;`, { luna })
  const hr = ensureHrDb(db)
  const first = `${luna}-01`; const last = new Date(Date.UTC(Number(luna.slice(0, 4)), Number(luna.slice(5, 7)), 0)).toISOString().slice(0, 10)
  const cutoffDate = new Date(`${first}T12:00:00Z`); cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 370); const cutoff = cutoffDate.toISOString().slice(0, 10)
  return hr.medicalLeaveCertificates.filter((item) => item.data_start <= last && item.data_sfarsit >= cutoff).map((item) => { const employee = hr.employees.find((row) => String(row.id) === String(item.employee_id)) || {}; return { ...item, nume: employee.nume, prenume: employee.prenume, marca: employee.marca } })
}

function monthlyMedicalRegister(db, luna) {
  const first = `${luna}-01`; const last = new Date(Date.UTC(Number(luna.slice(0, 4)), Number(luna.slice(5, 7)), 0)).toISOString().slice(0, 10)
  return buildMedicalRegister(medicalRegisterRows(db, luna)).filter((item) => String(item.data_start).slice(0, 10) <= last && String(item.data_sfarsit).slice(0, 10) >= first)
}

router.get('/hr/medical-leaves/register', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'hr:leave_manage')) return
    const luna = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.luna || '')) ? String(req.query.luna) : todayIso().slice(0, 7)
    const rows = monthlyMedicalRegister(readDb(), luna)
    sendJson(res, 200, { luna, rows, totals: rows.reduce((sum, row) => ({ certificates: sum.certificates + 1, calendar_days: sum.calendar_days + numberValue(row.zile_calendaristice), workdays: sum.workdays + row.workdays, employer_days: sum.employer_days + row.employer_days, fund_days: sum.fund_days + row.fund_days, unpaid_days: sum.unpaid_days + row.unpaid_days, employer_amount: sum.employer_amount + row.employer_amount, fund_amount: sum.fund_amount + row.fund_amount }), { certificates: 0, calendar_days: 0, workdays: 0, employer_days: 0, fund_days: 0, unpaid_days: 0, employer_amount: 0, fund_amount: 0 }) })
  } catch (error) { next(error) }
})

router.post('/hr/medical-leaves/:uuid/payroll', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'hr:manage')) return
    const dailyBase = numberValue(req.body?.baza_calcul_zilnica)
    if (!(dailyBase > 0)) return sendJson(res, 422, { error: 'Baza de calcul zilnica din media ultimelor 6 luni este obligatorie.' })
    const db = readDb(); const raw = isMssqlMode() ? mssqlObject(`SELECT TOP 1 * FROM hr.medical_leave_certificates WHERE uuid=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@p,'$.uuid')) FOR JSON PATH;`, req.params) : ensureHrDb(db).medicalLeaveCertificates.find((row) => String(row.uuid) === String(req.params.uuid))
    if (!raw) return sendJson(res, 404, { error: 'Certificatul medical nu a fost gasit.' })
    if (raw.status_verificare !== 'verificat') return sendJson(res, 409, { error: 'Certificatul trebuie verificat de HR inaintea trimiterii in salarizare.' })
    const calculationSource = medicalRegisterRows(db, String(raw.data_start).slice(0, 7))
      .filter((item) => String(item.employee_id) === String(raw.employee_id))
      .map((item) => String(item.uuid) === String(raw.uuid) ? { ...item, baza_calcul_zilnica: dailyBase } : item)
    const row = buildMedicalRegister(calculationSource).find((item) => String(item.uuid) === String(raw.uuid))
    if (!row) return sendJson(res, 422, { error: 'Episodul medical nu a putut fi calculat.' })
    const hr = payrollRoutes.ensurePayroll(db)
    const certificateCode = `${raw.serie}/${raw.numar}`
    const existing = hr.payrollAdjustments.find((item) => item.tip === 'indemnizatie_medicala' && !item.cancelled_at && (String(item.medical_certificate_uuid || '') === String(raw.uuid) || item.certificate_code === certificateCode))
    if (existing) return sendJson(res, 409, { error: 'Certificatul a fost deja trimis in salarizare.', code: 'HR_MEDICAL_ALREADY_SYNCED' })
    const adjustment = { id: payrollRoutes.nextId(hr.payrollAdjustments), uuid: crypto.randomUUID(), employee_id: raw.employee_id, tip: 'indemnizatie_medicala', cod: `CM-${raw.cod_indemnizatie}`, descriere: `Concediu medical ${certificateCode}`, amount: row.total_amount, quantity: row.workdays, unit_value: dailyBase, certificate_code: certificateCode, medical_certificate_uuid: String(raw.uuid), medical_employer_amount: row.employer_amount, medical_fund_amount: row.fund_amount, medical_diagnostic_code: raw.cod_diagnostic || '', operator_confirmed: true, data_start: raw.data_start, data_sfarsit: raw.data_sfarsit, recurent: false, active: true, created_by: auth.user.id, created_at: nowIso() }
    hr.payrollAdjustments.push(adjustment)
    if (isMssqlMode()) mssqlObject(`UPDATE hr.medical_leave_certificates SET baza_calcul_zilnica=TRY_CONVERT(decimal(15,4),JSON_VALUE(@p,'$.dailyBase')),procent_indemnizatie=TRY_CONVERT(decimal(6,2),JSON_VALUE(@p,'$.percent')),zile_angajator=TRY_CONVERT(int,JSON_VALUE(@p,'$.employerDays')),zile_fnuass=TRY_CONVERT(int,JSON_VALUE(@p,'$.fundDays')),zile_neindemnizate=TRY_CONVERT(int,JSON_VALUE(@p,'$.unpaidDays')),suma_angajator=TRY_CONVERT(decimal(15,2),JSON_VALUE(@p,'$.employerAmount')),suma_fnuass=TRY_CONVERT(decimal(15,2),JSON_VALUE(@p,'$.fundAmount')),payroll_synced_at=SYSDATETIME(),payroll_synced_by=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@p,'$.userId')),updated_at=SYSDATETIME() WHERE uuid=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@p,'$.uuid')); SELECT TOP 1 * FROM hr.medical_leave_certificates WHERE uuid=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@p,'$.uuid')) FOR JSON PATH;`, { uuid: req.params.uuid, dailyBase, percent: row.indemnity_percent, employerDays: row.employer_days, fundDays: row.fund_days, unpaidDays: row.unpaid_days, employerAmount: row.employer_amount, fundAmount: row.fund_amount, userId: auth.user.id })
    else Object.assign(raw, { baza_calcul_zilnica: dailyBase, procent_indemnizatie: row.indemnity_percent, zile_angajator: row.employer_days, zile_fnuass: row.fund_days, zile_neindemnizate: row.unpaid_days, suma_angajator: row.employer_amount, suma_fnuass: row.fund_amount, payroll_synced_at: nowIso(), payroll_synced_by: auth.user.id, updated_at: nowIso() })
    addAudit(db, auth.user, 'hr_medical_leave_payroll_synced', `${req.params.uuid} / ${row.total_amount}`); writeDb(db); sendJson(res, 201, { adjustment, calculation: row })
  } catch (error) { next(error) }
})

router.get('/hr/medical-leaves/register.xlsx', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'hr:leave_manage')) return
    const luna = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.luna || '')) ? String(req.query.luna) : todayIso().slice(0, 7)
    const rows = monthlyMedicalRegister(readDb(), luna).map((row) => ({ 'Marca': row.marca || '', 'Angajat': `${row.nume || ''} ${row.prenume || ''}`.trim(), 'Serie': row.serie, 'Numar': row.numar, 'Initial/Continuare': row.tip_certificat, 'Data acordarii': row.data_acordarii, 'De la': row.data_start, 'Pana la': row.data_sfarsit, 'Zile calendaristice': row.zile_calendaristice, 'Cod indemnizatie': row.cod_indemnizatie, 'Procent': row.indemnity_percent, 'Zile lucratoare': row.workdays, 'Zi neindemnizata': row.unpaid_days, 'Zile angajator': row.employer_days, 'Zile FNUASS': row.fund_days, 'Baza zilnica': row.baza_calcul_zilnica || '', 'Suma angajator': row.employer_amount, 'Suma FNUASS': row.fund_amount, 'Status verificare': row.status_verificare, 'Trimis salarizare': row.payroll_synced_at || '' }))
    const sheet = xlsx.utils.json_to_sheet(rows); const workbook = xlsx.utils.book_new(); xlsx.utils.book_append_sheet(workbook, sheet, 'Registru CM')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', `attachment; filename=Registru_CM_${luna}.xlsx`); res.end(xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
  } catch (error) { next(error) }
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
        rows = mssqlArray(`SELECT lr.*,mc.uuid AS medical_certificate_uuid,mc.status_verificare,mc.serie AS certificat_serie,mc.numar AS certificat_numar,mc.zile_calendaristice,mc.cod_indemnizatie,mc.medic_nume,mc.unitate_emitenta,mc.motiv_respingere AS medical_rejection_reason FROM hr.leave_requests lr LEFT JOIN hr.medical_leave_certificates mc ON mc.leave_request_uuid=lr.uuid WHERE lr.employee_id = TRY_CONVERT(int, JSON_VALUE(@p, '$.empId')) ORDER BY lr.created_at DESC FOR JSON PATH;`, { empId: ownEmpId })
      } else {
        rows = mssqlArray(`SELECT lr.*,mc.uuid AS medical_certificate_uuid,mc.status_verificare,mc.serie AS certificat_serie,mc.numar AS certificat_numar,mc.zile_calendaristice,mc.cod_indemnizatie,mc.medic_nume,mc.unitate_emitenta,mc.motiv_respingere AS medical_rejection_reason FROM hr.leave_requests lr LEFT JOIN hr.medical_leave_certificates mc ON mc.leave_request_uuid=lr.uuid ORDER BY lr.created_at DESC FOR JSON PATH;`)
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
    sendJson(res, 200, leaves.map((leave) => {
      const certificate = hr.medicalLeaveCertificates.find((item) => String(item.leave_request_uuid) === String(leave.uuid))
      return certificate ? { ...leave, medical_certificate_uuid: certificate.uuid, status_verificare: certificate.status_verificare, certificat_serie: certificate.serie, certificat_numar: certificate.numar, zile_calendaristice: certificate.zile_calendaristice, cod_indemnizatie: certificate.cod_indemnizatie, medic_nume: certificate.medic_nume, unitate_emitenta: certificate.unitate_emitenta, medical_rejection_reason: certificate.motiv_respingere } : leave
    }))
  } catch (error) {
    next(error)
  }
})

router.post('/hr/kiosk/sync', (req, res, next) => {
  try {
    let auth = null
    const kioskSession = kioskSessions.getSession(kioskSessions.tokenFromRequest(req))
    if (kioskSession) {
      auth = {
        db: readDb(),
        user: {
          id: `kiosk-${kioskSession.employee_id}`,
          username: kioskSession.username,
          role: 'kiosk',
          employee_id: kioskSession.employee_id,
          permissions: ['hr:view_own', 'hr:leave_own', 'kiosk:leave_request'],
        }
      }
    } else {
      auth = requireAuth(req, res)
    }
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
          const overlap = mssqlObject(`SELECT TOP 1 uuid,data_start,data_sfarsit FROM hr.leave_requests WHERE employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')) AND status IN (N'cerut',N'aprobat',N'aprobata') AND data_start<=TRY_CONVERT(date,JSON_VALUE(@p,'$.data_sfarsit')) AND data_sfarsit>=TRY_CONVERT(date,JSON_VALUE(@p,'$.data_start')) FOR JSON PATH;`, leave)
          if (overlap) { failed.push({ id: operationId, error: `Exista deja o cerere activa in perioada ${overlap.data_start} - ${overlap.data_sfarsit}.` }); continue }
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
        const overlap = hr.leaveRequests.find((item) => String(item.employee_id) === String(leave.employee_id) && ['cerut', 'aprobat', 'aprobata'].includes(item.status) && item.data_start <= leave.data_sfarsit && item.data_sfarsit >= leave.data_start)
        if (overlap) { failed.push({ id: operationId, error: `Exista deja o cerere activa in perioada ${overlap.data_start} - ${overlap.data_sfarsit}.` }); continue }
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
      const overlap = mssqlObject(`SELECT TOP 1 uuid,data_start,data_sfarsit FROM hr.leave_requests WHERE employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')) AND status IN (N'cerut',N'aprobat',N'aprobata') AND data_start<=TRY_CONVERT(date,JSON_VALUE(@p,'$.data_sfarsit')) AND data_sfarsit>=TRY_CONVERT(date,JSON_VALUE(@p,'$.data_start')) FOR JSON PATH;`, body)
      if (overlap) return sendJson(res, 409, { error: `Exista deja o cerere activa care se suprapune (${overlap.data_start} - ${overlap.data_sfarsit}).`, code: 'HR_LEAVE_OVERLAP' })
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
    const overlap = hr.leaveRequests.find((entry) => String(entry.employee_id) === String(body.employee_id) && ['cerut', 'aprobat', 'aprobata'].includes(entry.status) && entry.data_start <= body.data_sfarsit && entry.data_sfarsit >= body.data_start)
    if (overlap) return sendJson(res, 409, { error: `Exista deja o cerere activa care se suprapune (${overlap.data_start} - ${overlap.data_sfarsit}).`, code: 'HR_LEAVE_OVERLAP' })
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
      const leave = mssqlObject(`SELECT TOP 1 * FROM hr.leave_requests WHERE uuid=JSON_VALUE(@p,'$.uuid') FOR JSON PATH;`, { uuid: req.params.uuid })
      if (!leave) return sendJson(res, 404, { error: 'Cererea nu a fost gasita.' })
      if (String(leave.tip).toUpperCase() === 'CM') {
        const certificate = mssqlObject(`SELECT TOP 1 status_verificare FROM hr.medical_leave_certificates WHERE leave_request_uuid=JSON_VALUE(@p,'$.uuid') FOR JSON PATH;`, { uuid: req.params.uuid })
        if (certificate?.status_verificare !== 'verificat') return sendJson(res, 409, { error: 'Certificatul medical trebuie verificat de HR inaintea aprobarii concediului.', code: 'HR_MEDICAL_VERIFICATION_REQUIRED' })
      }
      const dates = businessDateRange(leave.data_start, leave.data_sfarsit)
      for (const month of new Set(dates.map((date) => date.slice(0, 7)))) assertTimesheetOpen(db, month)
      const locked = mssqlObject(`SELECT TOP 1 ts.data FROM hr.time_sheets ts WHERE ts.employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')) AND ts.data BETWEEN TRY_CONVERT(date,JSON_VALUE(@p,'$.start')) AND TRY_CONVERT(date,JSON_VALUE(@p,'$.end')) AND ts.validat=1 FOR JSON PATH;`, { employee_id: leave.employee_id, start: leave.data_start, end: leave.data_sfarsit })
      if (locked) return sendJson(res, 409, { error: `Pontajul din ${locked.data} este deja validat. Devalideaza pontajul inainte de aprobarea concediului.`, code: 'HR_TIMESHEET_VALIDATED' })
      const item = mssqlObject(`
UPDATE hr.leave_requests
SET status = N'aprobata', aprobat_de = JSON_VALUE(@p, '$.userId'), aprobat_la = sysdatetime(), updated_at = sysdatetime()
WHERE uuid = JSON_VALUE(@p, '$.uuid');
DECLARE @start date=TRY_CONVERT(date,JSON_VALUE(@p,'$.start')), @finish date=TRY_CONVERT(date,JSON_VALUE(@p,'$.end'));
;WITH dates AS (SELECT @start AS data UNION ALL SELECT DATEADD(day,1,data) FROM dates WHERE data<@finish), workdays AS (SELECT data FROM dates WHERE DATEDIFF(day,0,data)%7 BETWEEN 0 AND 4)
UPDATE ts SET tip=JSON_VALUE(@p,'$.timesheetType'),ore_lucrate=0,ore_suplimentare_s1=0,ore_suplimentare_s2=0,overtime_status=NULL,observatii=N'Completat automat din cererea de concediu',updated_at=SYSDATETIME()
FROM hr.time_sheets ts JOIN workdays d ON d.data=ts.data WHERE ts.employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id'));
;WITH dates AS (SELECT @start AS data UNION ALL SELECT DATEADD(day,1,data) FROM dates WHERE data<@finish), workdays AS (SELECT data FROM dates WHERE DATEDIFF(day,0,data)%7 BETWEEN 0 AND 4)
INSERT INTO hr.time_sheets(employee_id,data,ore_lucrate,tip,observatii)
SELECT TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')),d.data,0,JSON_VALUE(@p,'$.timesheetType'),N'Completat automat din cererea de concediu'
FROM workdays d WHERE NOT EXISTS(SELECT 1 FROM hr.time_sheets ts WHERE ts.employee_id=TRY_CONVERT(int,JSON_VALUE(@p,'$.employee_id')) AND ts.data=d.data) OPTION(MAXRECURSION 370);
SELECT TOP 1 * FROM hr.leave_requests WHERE uuid = JSON_VALUE(@p, '$.uuid') FOR JSON PATH;
`, { uuid: req.params.uuid, userId: auth.user.id, employee_id: leave.employee_id, start: leave.data_start, end: leave.data_sfarsit, timesheetType: leaveTimesheetType(leave.tip) })
      addAudit(db, auth.user, 'hr_leave_approved', req.params.uuid)
      writeDb(db)
      return sendJson(res, 200, item)
    }
    const hr = ensureHrDb(db)
    const item = hr.leaveRequests.find((leave) => leave.uuid === req.params.uuid)
    if (!item) return sendJson(res, 404, { error: 'Cererea nu a fost gasita.' })
    if (String(item.tip).toUpperCase() === 'CM') {
      const certificate = hr.medicalLeaveCertificates.find((row) => String(row.leave_request_uuid) === String(item.uuid))
      if (certificate?.status_verificare !== 'verificat') return sendJson(res, 409, { error: 'Certificatul medical trebuie verificat de HR inaintea aprobarii concediului.', code: 'HR_MEDICAL_VERIFICATION_REQUIRED' })
    }
    const dates = businessDateRange(item.data_start, item.data_sfarsit)
    for (const month of new Set(dates.map((date) => date.slice(0, 7)))) assertTimesheetOpen(db, month)
    const locked = hr.timeSheets.find((entry) => String(entry.employee_id) === String(item.employee_id) && dates.includes(entry.data) && entry.validat)
    if (locked) return sendJson(res, 409, { error: `Pontajul din ${locked.data} este deja validat. Devalideaza pontajul inainte de aprobarea concediului.`, code: 'HR_TIMESHEET_VALIDATED' })
    item.status = 'aprobata'
    item.aprobat_de = auth.user.id
    item.aprobat_la = nowIso()
    item.updated_at = nowIso()
    for (const data of dates) {
      let entry = hr.timeSheets.find((row) => String(row.employee_id) === String(item.employee_id) && row.data === data)
      if (!entry) { entry = { id: nextId(hr.timeSheets), employee_id: item.employee_id, data, created_at: nowIso() }; hr.timeSheets.push(entry) }
      Object.assign(entry, { tip: leaveTimesheetType(item.tip), ore_lucrate: 0, ore_suplimentare_s1: 0, ore_suplimentare_s2: 0, overtime_status: null, observatii: 'Completat automat din cererea de concediu', updated_at: nowIso() })
    }
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
    res.setHeader('X-InfraFlow-Official-Submission', 'false')
    res.setHeader('Content-Disposition', `attachment; filename=registru-lucru-reges-${uuid}.xml`)
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
    const canViewAll = authHasPermission(auth, 'hr:view')
    const canRequestOwn = authHasPermission(auth, 'kiosk:documents_own')
    if (!canViewAll && !canRequestOwn) return requirePermission(auth, res, 'hr:view')
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
    const ownEmployeeId = auth.user.employee_id || auth.user.employeeId || ''
    if (!canViewAll && String(employee.user_id || '') !== String(auth.user.id) && String(employee.id) !== String(ownEmployeeId)) {
      return sendJson(res, 403, { error: 'Poți solicita adeverințe doar pentru profilul propriu.' })
    }
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
      ore_noapte: 0, zile_co: 0, zile_cm: 0, zile_absente: 0, ore_suplimentare_propuse: 0, ore_suplimentare_aprobate: 0,
    }
    const zileleLunii = dates.map(date => {
      const ts = pontaje.find(p => p.data === date) || {}
      const tip = String(ts.tip || 'lucru').toLowerCase()
      const ore = numberValue(ts.ore_lucrate)
      const assignedShift = hr.schedules.find((schedule) => String(schedule.employee_id) === String(req.params.employeeId) && schedule.data === date)
      const shift = assignedShift ? hr.tures.find((entry) => String(entry.id) === String(assignedShift.tura_id)) : null
      const explicitOvertime = numberValue(ts.ore_suplimentare_s1) + numberValue(ts.ore_suplimentare_s2)
      const s1 = explicitOvertime > 0 ? numberValue(ts.ore_suplimentare_s1) : dailyOvertime(ore, shift?.ore_normale)
      const s2 = numberValue(ts.ore_suplimentare_s2)
      const noapte = numberValue(ts.ore_noapte)
      if (tip === 'lucru' || (!ts.tip && ore > 0)) totals.ore_lucru += ore
      if (tip === 'co' || tip === 'concediu_odihna') totals.zile_co += 1
      if (tip === 'cm' || tip === 'concediu_medical') totals.zile_cm += 1
      if (tip === 'nemotivat' || tip === 'absent') totals.zile_absente += 1
      totals.ore_suplimentare_s1 += s1
      totals.ore_suplimentare_s2 += s2
      if (ts.overtime_status === 'propus') totals.ore_suplimentare_propuse += s1 + s2
      if (!ts.overtime_status || ts.overtime_status === 'aprobat') totals.ore_suplimentare_aprobate += s1 + s2
      totals.ore_noapte += noapte
      return { id: ts.id, date, tip: ts.tip || (ore > 0 ? 'lucru' : '-'), ore_lucrate: ore, ore_suplimentare_s1: s1, ore_suplimentare_s2: s2, ore_noapte: noapte, overtime_status: ts.overtime_status || null, observatii: ts.observatii || null }
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

function registerOvertimePayment(db, body, user) {
  const hr = payrollRoutes.ensurePayroll(db)
  const employee = hr.employees.find((item) => String(item.id) === String(body.employee_id))
  const contract = hr.contracts.find((item) => String(item.employee_id) === String(body.employee_id) && item.status === 'activ')
  const salary = numberValue(contract?.salariu_baza || employee?.salariu_baza)
  if (!(salary > 0)) { const error = new Error('Completeaza salariul de baza in contract inainte de plata orelor suplimentare.'); error.status = 422; throw error }
  const data = body.data || todayIso()
  const luna = data.slice(0, 7)
  const normalHours = monthDates(luna).filter((date) => { const day = new Date(`${date}T12:00:00`).getDay(); return day !== 0 && day !== 6 }).length * 8
  const bonusPercent = Math.max(75, numberValue(body.spor_procent, 75))
  const hours = Math.abs(numberValue(body.ore))
  const amount = payrollRoutes.money(hours * (salary / Math.max(1, normalHours)) * (1 + bonusPercent / 100))
  const item = { id: payrollRoutes.nextId(hr.payrollAdjustments), uuid: `overtime-payment-${Date.now()}`, employee_id: body.employee_id, tip: 'bonus', cod: 'ORE_SUPLIMENTARE', descriere: `Plata ${hours} ore suplimentare, spor ${bonusPercent}%`, amount, quantity: hours, unit_value: payrollRoutes.money(amount / hours), data_start: `${luna}-01`, data_sfarsit: `${luna}-31`, recurent: false, active: true, source: 'overtime_bank', created_by: user.id, created_at: nowIso() }
  hr.payrollAdjustments.push(item)
  return item
}

router.get('/hr/reges/work-register.xlsx', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'hr:reges_export')) return
    const db = readDb()
    const hr = ensureHrDb(db)
    const employees = isMssqlMode() ? mssqlArray(`SELECT * FROM hr.employees WHERE activ=1 FOR JSON PATH;`) : hr.employees.filter((item) => item.activ !== false)
    const contracts = isMssqlMode() ? mssqlArray(`SELECT * FROM hr.contracts WHERE status=N'activ' FOR JSON PATH;`) : hr.contracts.filter((item) => item.status === 'activ')
    const rows = employees.map((employee) => buildRegesWorkRow(employee, contracts.find((contract) => String(contract.employee_id) === String(employee.id)) || {}, companySettings(db)))
    const buffer = xlsx.write(buildRegesWorkbook(rows), { type: 'buffer', bookType: 'xlsx' })
    addAudit(db, auth.user, 'hr_reges_work_register_export', `${rows.length} angajati`)
    writeDb(db)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="Registru_lucru_REGES_ONLINE.xlsx"')
    res.end(buffer)
  } catch (error) { next(error) }
})

router.get('/hr/kiosk/me', (req, res, next) => {
  try {
    const session = kioskSessions.requireKioskAuth(req, res)
    if (!session) return
    const db = readDb()
    const hr = ensureHrDb(db)
    const employee = hr.employees.find(e => String(e.id) === String(session.employee_id) && e.activ !== false)
    if (!employee) return sendJson(res, 404, { error: 'Angajatul nu a fost găsit.' })

    const month = todayIso().slice(0, 7)
    const timeSheets = hr.timeSheets.filter((item) => String(item.employee_id) === String(employee.id) && String(item.data || '').startsWith(month))
    const leaves = hr.leaveRequests
      .filter((item) => String(item.employee_id) === String(employee.id))
      .sort((a, b) => String(b.created_at || b.data_start || '').localeCompare(String(a.created_at || a.data_start || '')))
    const authorizations = hr.authorizations
      .filter((item) => String(item.employee_id) === String(employee.id))
      .map(authorizationView)
      .sort((a, b) => String(a.data_expirare || '').localeCompare(String(b.data_expirare || '')))
    const coTotal = Number(employee.zile_co_drept || 21)
    const currentYear = todayIso().slice(0, 4)
    const coUsed = leaves
      .filter((item) => ['aprobata', 'aprobat'].includes(item.status) && ['co', 'concediu_odihna'].includes(String(item.tip || '').toLowerCase()) && String(item.data_start || '').startsWith(currentYear))
      .reduce((sum, item) => sum + Number(item.zile || businessDays(item.data_start, item.data_sfarsit) || 0), 0)
    const worked = timeSheets.filter((item) => item.tip === 'lucru' || Number(item.ore_lucrate || 0) > 0)
    const pendingLeaves = leaves.filter((item) => ['cerut', 'pending'].includes(String(item.status || '').toLowerCase()))
    sendJson(res, 200, {
      angajat: publicEmployee(employee, { db, user: { role: 'kiosk', permissions: ['hr:view_own'] } }, db),
      concedii: {
        co_total: coTotal,
        co_efectuate: coUsed,
        co_ramase: Math.max(0, coTotal - coUsed),
      },
      cereri: leaves,
      cereri_asteptare: pendingLeaves,
      autorizatii: authorizations,
      pontaj_luna: {
        luna: month,
        ore_total: worked.reduce((sum, item) => sum + Number(item.ore_lucrate || 0), 0),
        zile_lucrate: new Set(worked.map((item) => item.data)).size,
      },
      echipamente: kioskEquipmentResponsibility(db, employee.id),
      notificari: personalNotifications(db, employee.id),
    })
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
