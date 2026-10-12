const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

function fixture(options = {}) {
  const filename = path.join(__dirname, '../modules/hr/routes.js')
  const localRequire = createRequire(filename)
  const handlers = new Map()
  const firstHandlers = new Map()
  const router = {}
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'use']) {
    router[method] = (url, ...callbacks) => { firstHandlers.set(`${method} ${url}`, callbacks[0]); handlers.set(`${method} ${url}`, callbacks.at(-1)) }
  }
  const db = { settings: { customRoles: [{ id: 'limited', permissions: ['hr:timesheet', 'hr:view_own'] }] }, users: [], departments: [], hr: {
    employees: [{ id: 1, user_id: 'u1', nume: 'Propriu', activ: true }, { id: 2, user_id: 'u2', nume: 'Altul', activ: true }],
    timeSheets: [{ id: 1, employee_id: 1, data: '2026-10-01', ore_lucrate: 8 }, { id: 2, employee_id: 2, data: '2026-10-01', ore_lucrate: 8 }],
  } }
  const auth = { db, user: { id: 'u1', role: 'limited' } }
  let writes = 0
  let storageChecks = 0
  let photoDownloads = 0
  const headers = {}
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: { exports: {} }, __dirname: path.dirname(filename), console, Buffer, process,
    require(name) {
      if (name === 'fs' && options.photo) return { ...fs, existsSync() { storageChecks++; return true } }
      if (name === 'express') return { Router: () => router }
      if (name === '../../core/auth') return { requireAuth: () => auth }
      if (name === '../../core/db') return { DB_MODE: options.sql ? 'mssql' : 'json', MSSQL_RELATIONAL_MODE: Boolean(options.sql), runMssqlScalar: options.sql, readDb: () => db, writeDb: () => { writes++ } }
      if (name === '../../core/audit') return { addAudit() {} }
      if (name === '../messaging/routes') return { notifyUser() {}, createDepartmentChannel() {} }
      if (name === '../messaging/email') return { sendEmail() {} }
      if (name === './payroll-routes') return {}
      return localRequire(name)
    },
  }, { filename })
  storageChecks = 0
  return { db, auth, headers, preflight(route, params) {
    let code; let continued = false
    firstHandlers.get(route)({ params }, { status(value) { code = value; return this }, json() {}, writeHead(value) { code = value }, end() {} }, error => { if (error) throw error; continued = true })
    return { code, continued }
  }, storageChecks: () => storageChecks, photoDownloads: () => photoDownloads, writes: () => writes, async invoke(route, body = {}, query = {}, params = {}) {
    let code; let data; let error
    await handlers.get(route)({ body, query, params }, { status(value) { code = value; return this }, json(value) { data = value }, send(value) { data = value }, writeHead(value) { code = value }, end(value) { if (value) data = Buffer.isBuffer(value) ? value : JSON.parse(value) }, setHeader(key, value) { headers[key] = value }, sendFile() { photoDownloads++ } }, value => { error = value })
    if (error) throw error
    return { code, data }
  } }
}

test('rutele HR relaționale execută SQL real într-o bază sintetică izolată', { skip: process.env.INFRAFLOW_TEST_HR_SQL !== '1' }, async () => {
  const { createSqlFixture } = require('./support/hr-sql-fixture')
  const sql = createSqlFixture()
  const f = fixture({ sql })
  f.db.settings.customRoles[0].permissions = ['hr:view_own']
  const own = await f.invoke('get /hr/employees')
  assert.equal(own.code, 200)
  assert.deepEqual(Array.from(own.data, row => row.id), [1])
  f.db.settings.customRoles[0].permissions = ['hr:view']
  const colleagues = await f.invoke('get /hr/employees')
  assert.equal(colleagues.data.length, 2)
  const colleague = colleagues.data.find(row => row.id === 2)
  assert.equal(colleague.cnp, undefined)
  assert.equal(colleague.salariu_baza, undefined)
  const mealTickets = await f.invoke('get /hr/meal-tickets', {}, { luna: '2026-10' })
  const colleagueMealTickets = mealTickets.data.rows.find(row => row.employee_id === 2)
  assert.equal(colleagueMealTickets.zile_lucrate, 2)
  assert.equal(colleagueMealTickets.zile_co, 1)
  assert.equal(colleagueMealTickets.tichete, 1)
  assert.equal(colleagueMealTickets.cnp, undefined)
  assert.equal((await f.invoke('get /hr/meal-tickets/export', {}, { luna: '2026-10' })).code, 403)
  f.db.settings.customRoles[0].permissions = ['hr:view', 'hr:personal_sensitive']
  const mealExport = await f.invoke('get /hr/meal-tickets/export', {}, { luna: '2026-10' })
  assert.match(mealExport.data, /secret2/)
  assert.match(mealExport.data, /;"1";"40"/)
  f.db.settings.customRoles[0].permissions = ['hr:view']
  const colleagueCim = await f.invoke('get /hr/employees/:id/cim', {}, {}, { id: 2 })
  assert.equal(colleagueCim.code, 200)
  assert.equal(colleagueCim.data.contract.id, 2)
  assert.equal(colleagueCim.data.contract.salariu_baza, undefined)
  assert.equal(colleagueCim.data.angajat.salariu_baza, undefined)
  const ownCim = await f.invoke('get /hr/employees/:id/cim', {}, {}, { id: 1 })
  assert.equal(ownCim.data.contract.id, 1)
  assert.equal(ownCim.data.contract.salariu_baza, 1000)
  assert.equal(ownCim.data.angajat.salariu_baza, 1000)
  assert.equal((await f.invoke('get /hr/employees/:id/adeverinta', {}, { tip: 'concediu_medical' }, { id: 2 })).code, 403)
  const ownCertificate = await f.invoke('get /hr/employees/:id/adeverinta', {}, { tip: 'concediu_medical' }, { id: 1 })
  assert.equal(ownCertificate.code, 200)
  assert.equal(ownCertificate.data.zile_concediu_medical_12_luni, 3)
  assert.equal(ownCertificate.data.contract.id, 1)
  assert.equal(ownCertificate.data.contract.salariu_baza, 1000)
  f.db.settings.customRoles[0].permissions = ['hr:timesheet']
  const monthlyReport = await f.invoke('get /hr/timesheets/raport-lunar/:employeeId', {}, { luna: '2026-10' }, { employeeId: 1 })
  assert.equal(monthlyReport.code, 200)
  assert.equal(monthlyReport.data.employee.id, 1)
  assert.equal(monthlyReport.data.totals.ore_lucru, 10)
  assert.equal(monthlyReport.data.totals.ore_suplimentare_s1, 2)
  assert.equal(monthlyReport.data.totals.ore_noapte, 2)
  assert.equal(monthlyReport.data.totals.zile_co, 1)
  assert.equal(monthlyReport.data.sporuri.spor_s1, 150)
  assert.equal(monthlyReport.data.sporuri.spor_noapte, 50)
  assert.equal(monthlyReport.data.zile.find(day => day.date === '2026-10-01').observatii, 'Tura extinsă')
  f.db.settings.customRoles[0].permissions = ['hr:timesheet', 'hr:timesheet_dept']
  f.auth.user.department_id = 'd1'
  const departmentTimesheets = await f.invoke('get /hr/timesheets/my-department', {}, { luna: '2026-10' })
  assert.equal(departmentTimesheets.code, 200)
  assert.deepEqual(Array.from(departmentTimesheets.data.employees, employee => employee.id).sort((left, right) => left - right), [1, 2])
  assert.equal(departmentTimesheets.data.pontaje.length, 4)
  assert.equal(departmentTimesheets.data.status.status, 'finalizat')
  assert.equal(departmentTimesheets.data.employees.find(employee => employee.id === 2).cnp, undefined)
  f.db.settings.customRoles[0].permissions = ['hr:timesheet_approve', 'hr:timesheet_dept']
  const overview = await f.invoke('get /hr/timesheets/overview', {}, { luna: '2026-10' })
  assert.equal(overview.code, 200)
  assert.deepEqual(Array.from(overview.data, row => row.department_cod), ['D1'])
  assert.equal(overview.data[0].status, 'finalizat')
  assert.equal(overview.data[0].procent, 6)
  assert.equal((await f.invoke('get /hr/timesheets/overview', {}, { luna: '2026-13' })).code, 422)
  sql("UPDATE hr.timesheet_departments SET status=N'in_lucru' WHERE luna='2026-10' AND department_cod='D1'; SELECT 1;")
  f.db.settings.customRoles[0].permissions = ['hr:timesheet_approve', 'hr:timesheets_manage']
  const sqlReminder = await f.invoke('post /hr/timesheets/send-reminder', { luna: '2026-10', deadline_date: '2026-10-05' })
  assert.equal(sqlReminder.data.sent, 2)
  assert.equal(sqlReminder.data.emailed, 2)
  assert.equal(f.db.notifications.filter(item => item.type === 'hr_timesheet_reminder').length, 2)
  assert.deepEqual(Array.from(f.db.notifications, item => item.user_id).sort(), ['u1', 'u2'])
  f.db.settings.customRoles[0].permissions = ['hr:employees_manage']
  const transfer = await f.invoke('post /hr/employees/:id/transfer', { department_nou: '2' }, {}, { id: 2 })
  assert.equal(transfer.code, 200)
  assert.equal(transfer.data.transfer.dept_nou, 'd2')
  assert.equal(sql('SELECT department_id FROM hr.employees WHERE id=2;').trim(), '2')
  assert.equal((await f.invoke('post /hr/employees/:id/transfer', { department_nou: '999' }, {}, { id: 2 })).code, 400)
  await assert.rejects(f.invoke('post /hr/employees/:id/transfer', { department_nou: '1' }, {}, { id: 999 }))
  assert.equal(sql('SELECT COUNT(*) FROM hr.department_transfers;').trim(), '1')
  f.db.settings.customRoles[0].permissions = ['hr:reges_export', 'hr:personal_sensitive', 'hr:salary_view']
  const mismatch = await f.invoke('post /hr/reges/export', { employee_id: 2, contract_id: 1 })
  assert.equal(mismatch.code, 422)
  const history = await f.invoke('get /hr/reges/history')
  assert.equal(history.code, 200)
  assert.equal(history.data[0].mesaj, 'Export intern')
  assert.equal(history.data[0].fisier_path, undefined)
  assert.ok(sql('SELECT fisier_path FROM hr.reges_exports WHERE id=1;').includes('registry.xml'))
  f.db.settings.customRoles[0].permissions = ['hr:reges_export']
  assert.equal((await f.invoke('get /hr/reges/history')).code, 403)
  f.db.settings.customRoles[0].permissions = ['hr:training', 'hr:personal_sensitive']
  assert.equal((await f.invoke('post /hr/training', { denumire: 'Invalid', data_start: '2026-10-12', data_sfarsit: '2026-10-11' })).code, 422)
  assert.equal(sql('SELECT COUNT(*) FROM hr.training;').trim(), '1')
  const createdTraining = await f.invoke('post /hr/training', {
    denumire: '  PSI real  ', tip: ' PSI ', furnizor: ' Furnizor test ',
    data_start: '2026-10-11', data_sfarsit: '2026-10-12', valabil_pana_la: '2027-10-12', cost_total: '99.50', ignored: 'secret',
  })
  assert.equal(createdTraining.code, 201)
  assert.equal(createdTraining.data.denumire, 'PSI real')
  assert.equal(createdTraining.data.cost_total, 99.5)
  assert.equal(createdTraining.data.ignored, undefined)
  assert.equal(sql('SELECT COUNT(*) FROM hr.training;').trim(), '2')
  const enrollment = 'post /hr/training/:id/employees'
  assert.equal((await f.invoke(enrollment, { employee_ids: [1] }, {}, { id: 999 })).code, 404)
  assert.equal((await f.invoke(enrollment, { employee_ids: [1, 999] }, {}, { id: 1 })).code, 422)
  assert.equal(sql('SELECT COUNT(*) FROM hr.training_employees;').trim(), '0')
  assert.equal((await f.invoke(enrollment, { employee_ids: [1, '1', 2] }, {}, { id: 1 })).data.added, 2)
  assert.equal((await f.invoke(enrollment, { employee_ids: [1, 2] }, {}, { id: 1 })).data.added, 0)
  assert.equal(sql('SELECT COUNT(*) FROM hr.training_employees;').trim(), '2')
  const schedule = await f.invoke('get /hr/training/scadentar')
  assert.equal(schedule.code, 200)
  assert.equal(schedule.data.length, 8)
  assert.ok(schedule.data.some(item => item.employee_id === 1 && item.department === 'Unu' && item.tip_curs === 'SSM'))
  assert.ok(schedule.data.some(item => item.employee_id === 2 && item.department === 'Doi'))
  f.db.settings.customRoles[0].permissions = ['hr:view', 'hr:manage', 'hr:personal_sensitive']
  f.auth.user.name = 'Evaluator SQL'
  assert.equal(sql('SELECT COUNT(*) FROM hr.evaluations;').trim(), '1')
  const importedEvaluation = await f.invoke('get /hr/evaluations', {}, { employee_id: 2, year: '2026' })
  assert.equal(importedEvaluation.data.length, 1)
  assert.equal(importedEvaluation.data[0].evaluator_name, 'Evaluator vechi')
  assert.equal(importedEvaluation.data[0].observatii, 'Import app state')
  assert.equal((await f.invoke('post /hr/evaluations', { employee_id: 999, data_evaluare: '2026-10-11' })).code, 422)
  assert.equal(sql('SELECT COUNT(*) FROM hr.evaluations;').trim(), '1')
  const createdEvaluation = await f.invoke('post /hr/evaluations', {
    employee_id: 1, evaluator_id: 'spoof', evaluator_name: 'Spoof', data_evaluare: '2026-10-11',
    tip: 'anuala', calificativ: 'FB', punctaj: '98.50', observatii: 'SQL real',
  })
  assert.equal(createdEvaluation.code, 201)
  assert.equal(createdEvaluation.data.evaluator_id, 'u1')
  assert.equal(createdEvaluation.data.evaluator_name, 'Evaluator SQL')
  assert.equal(createdEvaluation.data.punctaj, 98.5)
  assert.equal((await f.invoke('get /hr/evaluations', {}, { employee_id: 1, year: '2026' })).data.length, 1)
  assert.equal((await f.invoke('get /hr/evaluations', {}, { year: '20x6' })).code, 422)
  const patchedEvaluation = await f.invoke('patch /hr/evaluations/:id', {
    employee_id: 2, evaluator_id: 'spoof', punctaj: 87, status: 'draft', observatii: 'Actualizat',
  }, {}, { id: createdEvaluation.data.id })
  assert.equal(patchedEvaluation.code, 200)
  assert.equal(patchedEvaluation.data.employee_id, 1)
  assert.equal(patchedEvaluation.data.evaluator_id, 'u1')
  assert.equal(patchedEvaluation.data.punctaj, 87)
  assert.equal((await f.invoke('delete /hr/evaluations/:id', {}, {}, { id: createdEvaluation.data.id })).code, 200)
  assert.equal(sql('SELECT COUNT(*) FROM hr.evaluations;').trim(), '1')
})

test('citirea pontajului nu acordă export Nexus sau completare automată', async () => {
  const f = fixture({ photo: true })
  f.db.settings.customRoles[0].permissions = ['hr:timesheets_view']
  for (const route of ['get /hr/timesheets/export-nexus', 'post /hr/timesheets/fill-month']) {
    assert.equal((await f.invoke(route, { luna: '2026-10' }, { luna: '2026-10' })).code, 403)
    assert.equal(f.writes(), 0)
    assert.equal(f.storageChecks(), 0)
  }
})

test('lista conturilor asociabile cere ambele drepturi și nu expune secrete', async () => {
  for (const permissions of [['hr:manage'], ['hr:employees_manage'], ['users:manage']]) {
    const f = fixture()
    f.db.settings.customRoles[0].permissions = permissions
    assert.equal((await f.invoke('get /hr/linkable-users')).code, 403)
    assert.equal(f.writes(), 0)
  }
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:employees_manage', 'users:manage']
  f.db.users = [{ id: 'u2', username: 'test', password: 'secret', totpSecret: 'secret' }, { id: 'inactive', active: false }, { id: 'inactive-numeric', active: 0 }]
  const result = await f.invoke('get /hr/linkable-users')
  assert.equal(result.code, 200)
  assert.equal(result.data.length, 1)
  assert.equal(result.data[0].password, undefined)
  assert.equal(result.data[0].totpSecret, undefined)
})

test('administrarea HR nu permite asocierea sau eliminarea contului fără users:manage', async () => {
  for (const route of ['post /hr/employees', 'patch /hr/employees/:id']) {
    for (const user_id of ['u1', '', null]) {
      const f = fixture()
      f.db.settings.customRoles[0].permissions = ['hr:manage', 'hr:employees_manage', 'hr:personal_sensitive', 'hr:salary_view', 'hr:medical_view']
      const result = await f.invoke(route, { user_id }, {}, { id: 2 })
      assert.equal(result.code, 403)
      assert.equal(f.writes(), 0)
      assert.equal(f.db.hr.employees[1].user_id, 'u2')
    }
  }
})

test('administratorul autorizat păstrează verificarea contului deja asociat', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:employees_manage', 'users:manage']
  const result = await f.invoke('patch /hr/employees/:id', { user_id: 'u1' }, {}, { id: 2 })
  assert.equal(result.code, 409)
  assert.equal(f.writes(), 0)
})

test('crearea angajatului nu reutilizează un cont asociat și sincronizează contul liber', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:employees_manage', 'users:manage']
  const conflict = await f.invoke('post /hr/employees', { nume: 'Nou', user_id: 'u1' })
  assert.equal(conflict.code, 409)
  assert.equal(f.writes(), 0)
  assert.equal(f.db.hr.employees.length, 2)
  f.db.users = [{ id: 'u3' }]
  const created = await f.invoke('post /hr/employees', { nume: 'Nou', user_id: 'u3' })
  assert.equal(created.code, 201)
  assert.equal(f.db.users[0].employee_id, String(created.data.id))
  assert.equal(f.writes(), 1)
})

test('asocierea autorizată sincronizează contul și permite eliminarea legăturii', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:employees_manage', 'users:manage']
  f.db.users = [{ id: 'u2', employee_id: '2' }, { id: 'u3' }]
  const linked = await f.invoke('patch /hr/employees/:id', { user_id: 'u3' }, {}, { id: 2 })
  assert.equal(linked.code, 200)
  assert.equal(f.db.users[0].employee_id, undefined)
  assert.equal(f.db.users[1].employee_id, '2')
  const unlinked = await f.invoke('patch /hr/employees/:id', { user_id: '' }, {}, { id: 2 })
  assert.equal(unlinked.code, 200)
  assert.equal(f.db.users[1].employee_id, undefined)
  assert.equal(f.writes(), 2)
})

test('crearea relațională refuză contul ocupat înainte de INSERT', async () => {
  const queries = []
  const f = fixture({ sql(query) { queries.push(query); return JSON.stringify([{ id: 1 }]) } })
  f.db.settings.customRoles[0].permissions = ['hr:employees_manage', 'users:manage']
  const result = await f.invoke('post /hr/employees', { nume: 'Nou', user_id: 'u1' })
  assert.equal(result.code, 409)
  assert.equal(f.writes(), 0)
  assert.equal(queries.length, 1)
  assert.doesNotMatch(queries[0], /INSERT/i)
})

test('contul inexistent, inactiv sau legat invers este refuzat fără scrieri', async () => {
  for (const route of ['post /hr/employees', 'patch /hr/employees/:id']) {
    for (const [user, status, code] of [[null, 422, 'HR_USER_NOT_FOUND'], [{ id: 'u3', active: false }, 422, 'HR_USER_INACTIVE'], [{ id: 'u3', active: 0 }, 422, 'HR_USER_INACTIVE'], [{ id: 'u3', employee_id: '99' }, 409, 'HR_USER_ALREADY_LINKED']]) {
      const f = fixture()
      f.db.settings.customRoles[0].permissions = ['hr:employees_manage', 'users:manage']
      f.db.users = user ? [user] : []
      const result = await f.invoke(route, { nume: 'Nou', user_id: 'u3' }, {}, { id: 2 })
      assert.equal(result.code, status)
      assert.equal(result.data.code, code)
      assert.equal(f.writes(), 0)
      assert.equal(f.db.hr.employees.length, 2)
      assert.equal(f.db.hr.employees[1].user_id, 'u2')
    }
  }
})

test('registrul HR cere export, acces personal și salarial înainte de scriere', async () => {
  for (const route of ['post /hr/reges/export', 'get /hr/reges/history', 'get /hr/reges/work-register.xlsx', 'get /hr/reges/work-register/diagnostic', 'get /hr/reges/work-register/diagnostic.xlsx']) {
    for (const missing of ['hr:reges_export', 'hr:personal_sensitive', 'hr:salary_view']) {
      const f = fixture()
      f.db.settings.customRoles[0].permissions = ['hr:reges_export', 'hr:personal_sensitive', 'hr:salary_view'].filter(right => right !== missing)
      assert.equal((await f.invoke(route)).code, 403)
      assert.equal(f.writes(), 0)
    }
  }
})

test('evaluările individuale cer acces personal și dreptul operației', async () => {
  for (const route of ['get /hr/evaluations', 'post /hr/evaluations', 'patch /hr/evaluations/:id', 'delete /hr/evaluations/:id']) {
    const f = fixture()
    f.db.settings.customRoles[0].permissions = ['hr:view', 'hr:manage']
    f.db.hr.evaluations = [{ id: 1, employee_id: 2, observatii: 'Confidențial' }]
    assert.equal((await f.invoke(route, { employee_id: 2 }, {}, { id: 1 })).code, 403)
    assert.equal(f.writes(), 0)
    assert.equal(f.db.hr.evaluations.length, 1)
  }
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:view', 'hr:personal_sensitive']
  f.db.hr.evaluations = [{ id: 1, employee_id: 2, observatii: 'Confidențial' }]
  assert.equal((await f.invoke('get /hr/evaluations')).data[0].observatii, 'Confidențial')
  assert.equal((await f.invoke('post /hr/evaluations', { employee_id: 2 })).code, 403)
  f.db.settings.customRoles[0].permissions.push('hr:manage')
  assert.equal((await f.invoke('post /hr/evaluations', { employee_id: 2 })).code, 201)
  assert.equal(f.writes(), 1)
})

test('evaluările validează angajatul și câmpurile fără a permite falsificarea evaluatorului', async () => {
  const invalid = [
    {},
    { employee_id: 0 },
    { employee_id: 1, data_evaluare: '2026-02-30' },
    { employee_id: 1, tip: 'inventat' },
    { employee_id: 1, calificativ: 'excelent' },
    { employee_id: 1, punctaj: -1 },
    { employee_id: 1, punctaj: 101 },
    { employee_id: 1, status: 'publicata' },
    { employee_id: 1, observatii: 'x'.repeat(5001) },
  ]
  for (const body of invalid) {
    const f = fixture()
    f.db.settings.customRoles[0].permissions = ['hr:manage', 'hr:personal_sensitive']
    const result = await f.invoke('post /hr/evaluations', body)
    assert.equal(result.code, 422)
    assert.equal(result.data.code, 'HR_EVALUATION_INVALID')
    assert.equal(f.writes(), 0)
    assert.equal((f.db.hr.evaluations || []).length, 0)
  }

  const missing = fixture()
  missing.db.settings.customRoles[0].permissions = ['hr:manage', 'hr:personal_sensitive']
  assert.equal((await missing.invoke('post /hr/evaluations', { employee_id: 999, data_evaluare: '2026-10-11' })).data.code, 'HR_EVALUATION_EMPLOYEE_NOT_FOUND')
  assert.equal(missing.writes(), 0)

  const f = fixture()
  f.auth.user.name = 'Evaluator Real'
  f.db.settings.customRoles[0].permissions = ['hr:view', 'hr:manage', 'hr:personal_sensitive']
  const created = await f.invoke('post /hr/evaluations', {
    employee_id: 1, evaluator_id: 'spoof', evaluator_name: 'Spoof', data_evaluare: '2026-10-11',
    tip: ' ANUALA ', calificativ: 'fb', punctaj: '97.25', observatii: '  Bun  ', extra: 'secret',
  })
  assert.equal(created.code, 201)
  assert.equal(created.data.evaluator_id, 'u1')
  assert.equal(created.data.evaluator_name, 'Evaluator Real')
  assert.equal(created.data.tip, 'anuala')
  assert.equal(created.data.calificativ, 'FB')
  assert.equal(created.data.punctaj, 97.25)
  assert.equal(created.data.observatii, 'Bun')
  assert.equal(created.data.extra, undefined)
  const patched = await f.invoke('patch /hr/evaluations/:id', {
    employee_id: 2, evaluator_id: 'spoof', evaluator_name: 'Spoof', punctaj: 80, status: 'draft',
  }, {}, { id: created.data.id })
  assert.equal(patched.code, 200)
  assert.equal(patched.data.employee_id, 1)
  assert.equal(patched.data.evaluator_id, 'u1')
  assert.equal(patched.data.evaluator_name, 'Evaluator Real')
  assert.equal(patched.data.punctaj, 80)
  assert.equal((await f.invoke('get /hr/evaluations', {}, { year: '20x6' })).code, 422)
  assert.equal((await f.invoke('get /hr/evaluations', {}, { employee_id: '1 OR 1=1' })).code, 422)
})

test('formările au administrare dedicată, dar datele nominale cer acces personal', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:training']
  assert.equal((await f.invoke('get /hr/training')).code, 200)
  assert.equal((await f.invoke('post /hr/training', { denumire: 'SSM', tip: 'SSM' })).code, 201)
  const writes = f.writes()
  assert.equal((await f.invoke('get /hr/training/scadentar')).code, 403)
  assert.equal((await f.invoke('post /hr/training/:id/employees', { employee_ids: [1] }, {}, { id: 1 })).code, 403)
  assert.equal(f.writes(), writes)
  f.db.settings.customRoles[0].permissions.push('hr:personal_sensitive')
  assert.equal((await f.invoke('get /hr/training/scadentar')).code, 200)
  assert.equal((await f.invoke('post /hr/training/:id/employees', { employee_ids: [1] }, {}, { id: 1 })).code, 200)
  assert.equal(f.db.hr.trainingEmployees.length, 1)
})

test('crearea cursului validează și normalizează aceleași câmpuri înainte de scriere', async () => {
  const invalid = [
    {},
    { denumire: '   ' },
    { denumire: 'x'.repeat(201) },
    { denumire: 'SSM', tip: 'x'.repeat(81) },
    { denumire: 'SSM', furnizor: 'x'.repeat(201) },
    { denumire: 'SSM', data_start: '2026-02-30' },
    { denumire: 'SSM', data_start: '11.10.2026' },
    { denumire: 'SSM', data_start: '2026-10-12', data_sfarsit: '2026-10-11' },
    { denumire: 'SSM', data_sfarsit: '2026-10-12', valabil_pana_la: '2026-10-11' },
    { denumire: 'SSM', cost_total: -1 },
    { denumire: 'SSM', cost_total: '12.345' },
  ]
  for (const body of invalid) {
    const f = fixture()
    f.db.settings.customRoles[0].permissions = ['hr:training']
    const result = await f.invoke('post /hr/training', body)
    assert.equal(result.code, 422)
    assert.equal(result.data.code, 'HR_TRAINING_INVALID')
    assert.equal(f.writes(), 0)
    assert.equal((f.db.hr.training || []).length, 0)
  }

  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:training']
  const result = await f.invoke('post /hr/training', {
    denumire: '  Instruire SSM  ', tip: ' SSM ', furnizor: ' Furnizor ',
    data_start: '2026-10-11', data_sfarsit: '2026-10-12', valabil_pana_la: '2027-10-12',
    cost_total: '120.50', camp_nepermis: 'secret',
  })
  assert.equal(result.code, 201)
  assert.equal(result.data.denumire, 'Instruire SSM')
  assert.equal(result.data.tip, 'SSM')
  assert.equal(result.data.cost_total, 120.5)
  assert.equal(result.data.camp_nepermis, undefined)
  assert.equal(f.writes(), 1)
})

test('scadențarul ignoră angajații inactivi și cursurile încă valabile', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:training', 'hr:personal_sensitive']
  f.db.hr.employees.push({ id: 3, nume: 'Inactiv', activ: 0 })
  f.db.hr.training = [{ id: 1, tip: 'SSM', data_sfarsit: '2026-10-10', valabil_pana_la: '2099-12-31' }]
  f.db.hr.trainingEmployees = [{ training_id: 1, employee_id: 1 }]
  const result = await f.invoke('get /hr/training/scadentar')
  assert.equal(result.code, 200)
  assert.equal(result.data.length, 7)
  assert.equal(result.data.some(item => item.employee_id === 1 && item.tip_curs === 'SSM'), false)
  assert.equal(result.data.some(item => item.employee_id === 3), false)
  assert.equal(f.writes(), 0)
})

test('înscrierea validează întregul lot și nu dublează persoanele', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:training', 'hr:personal_sensitive']
  f.db.hr.training = [{ id: 1 }]
  f.db.hr.trainingEmployees = []
  for (const employee_ids of [[], '1', [0], ['1x'], [1, 999]]) {
    assert.equal((await f.invoke('post /hr/training/:id/employees', { employee_ids }, {}, { id: 1 })).code, 422)
    assert.equal(f.writes(), 0)
    assert.equal(f.db.hr.trainingEmployees.length, 0)
  }
  assert.equal((await f.invoke('post /hr/training/:id/employees', { employee_ids: [1] }, {}, { id: 999 })).code, 404)
  assert.equal(f.writes(), 0)
  assert.equal((await f.invoke('post /hr/training/:id/employees', { employee_ids: [1, '1', 2] }, {}, { id: 1 })).data.added, 2)
  assert.equal((await f.invoke('post /hr/training/:id/employees', { employee_ids: [1, 2] }, {}, { id: 1 })).data.added, 0)
  assert.equal(f.db.hr.trainingEmployees.length, 2)
})

test('istoricul registrului păstrează metadatele fără căi interne în JSON și SQL', async () => {
  for (const relational of [false, true]) {
    let query = ''
    const row = { id: 1, uuid: 'export-test', tip: 'registru', status: 'generat', generat_de: 'u1', mesaj: 'Export intern', created_at: '2026-10-11', fisier_path: 'C:\\private\\registry.xml', extra_secret: 'secret' }
    const f = fixture(relational ? { sql(sql) { query = sql; return JSON.stringify([row]) } } : {})
    f.db.settings.customRoles[0].permissions = ['hr:reges_export', 'hr:personal_sensitive', 'hr:salary_view']
    f.db.hr.regesExports = [row]
    const result = await f.invoke('get /hr/reges/history')
    assert.equal(result.code, 200)
    assert.equal(result.data[0].mesaj, 'Export intern')
    assert.equal(result.data[0].id, 1)
    assert.equal(result.data[0].fisier_path, undefined)
    assert.equal(result.data[0].extra_secret, undefined)
    assert.equal(f.writes(), 0)
    assert.equal(f.db.hr.regesExports[0].fisier_path, row.fisier_path)
    if (relational) assert.doesNotMatch(query, /SELECT TOP 50 \*|fisier_path/i)
  }
})

test('exportul registrului refuză contractul altui angajat fără scriere', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:reges_export', 'hr:personal_sensitive', 'hr:salary_view']
  f.db.hr.contracts = [{ id: 1, employee_id: 1 }]
  const result = await f.invoke('post /hr/reges/export', { employee_id: 2, contract_id: 1 })
  assert.equal(result.code, 422)
  assert.equal(result.data.code, 'HR_REGISTRY_CONTRACT_MISMATCH')
  assert.equal(f.writes(), 0)
})

test('importul angajaților refuză accesul înainte de middleware multipart', () => {
  for (const permissions of [[], ['hr:employees_manage'], ['hr:manage'], ['hr:personal_sensitive']]) {
    const f = fixture({ photo: true })
    f.db.settings.customRoles[0].permissions = permissions
    const result = f.preflight('post /hr/employees/import', {})
    assert.equal(result.code, 403)
    assert.equal(result.continued, false)
    assert.equal(f.storageChecks(), 0)
    assert.equal(f.writes(), 0)
  }
})

test('dreptul dedicat angajaților cu acces personal permite continuarea importului', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:employees_manage', 'hr:personal_sensitive']
  assert.equal(f.preflight('post /hr/employees/import', {}).continued, true)
  const result = await f.invoke('post /hr/employees/import')
  assert.equal(result.code, 400)
  assert.equal(f.writes(), 0)
})

test('dreptul dedicat contractelor permite act adițional fără administrarea globală HR', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:contracts_manage', 'hr:personal_sensitive', 'hr:salary_view']
  f.db.hr.contracts = [{ id: 1, employee_id: 2, salariu_baza: 5000 }]
  const result = await f.invoke('post /hr/employees/:id/contracts/:contractId/amendments', { tip: 'salariu', salariu_baza: 6000, data_efect: '2026-10-11' }, {}, { id: 2, contractId: 1 })
  assert.equal(result.code, 201)
  assert.equal(f.writes(), 1)
  assert.equal(f.db.hr.contracts[0].salariu_baza, 6000)
})

test('dreptul contractelor nu acordă modificarea fișei generale a angajatului', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:contracts_manage', 'hr:personal_sensitive', 'hr:salary_view']
  const result = await f.invoke('patch /hr/employees/:id', { nume: 'Modificat' }, {}, { id: 2 })
  assert.equal(result.code, 403)
  assert.equal(f.writes(), 0)
})

test('administrarea angajaților nu permite scrierea câmpurilor sensibile fără drepturi', async () => {
  for (const route of ['post /hr/employees', 'patch /hr/employees/:id']) {
    for (const [field, value] of [['adresa', 'Secret'], ['iban', null], ['apt_medical_expira', '2027-01-01'], ['salariu_baza', 1], ['cost_ora', 1]]) {
      const f = fixture()
      f.db.settings.customRoles[0].permissions = ['hr:employees_manage']
      const result = await f.invoke(route, { [field]: value }, {}, { id: 2 })
      assert.equal(result.code, 403, `${route}/${field}`)
      assert.equal(f.writes(), 0)
    }
  }
})

test('dreptul dedicat angajaților permite editarea operațională fără administrare globală', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:employees_manage']
  f.db.hr.employees[1].adresa = 'Secret'
  const result = await f.invoke('patch /hr/employees/:id', { functia: 'Operator' }, {}, { id: 2 })
  assert.equal(result.code, 200)
  assert.equal(f.writes(), 1)
  assert.equal(f.db.hr.employees[1].functia, 'Operator')
  assert.equal(result.data.adresa, undefined)
  assert.equal(f.db.hr.employees[1].adresa, 'Secret')
})

test('editarea sensibilă autorizată păstrează actualizarea normală', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:employees_manage', 'hr:personal_sensitive', 'hr:medical_view', 'hr:salary_view']
  const result = await f.invoke('patch /hr/employees/:id', { adresa: 'Nouă', apt_medical_expira: '2027-01-01', salariu_baza: 7000 }, {}, { id: 2 })
  assert.equal(result.code, 200)
  assert.equal(f.writes(), 1)
  assert.equal(f.db.hr.employees[1].adresa, 'Nouă')
  assert.equal(f.db.hr.employees[1].salariu_baza, 7000)
  assert.equal(result.data.adresa, 'Nouă')
})

test('upload foto verifică drepturile și angajatul înainte de middleware multipart', () => {
  for (const permissions of [[], ['hr:manage'], ['hr:personal_sensitive']]) {
    const f = fixture({ photo: true })
    f.db.settings.customRoles[0].permissions = permissions
    const result = f.preflight('post /hr/employees/:id/photo', { id: 2 })
    assert.equal(result.code, 403)
    assert.equal(result.continued, false)
    assert.equal(f.storageChecks(), 0)
    assert.equal(f.writes(), 0)
  }
})

test('upload foto autorizat acceptă doar un angajat existent cu ID valid', () => {
  const f = fixture({ photo: true })
  f.db.settings.customRoles[0].permissions = ['hr:manage', 'hr:personal_sensitive']
  assert.equal(f.preflight('post /hr/employees/:id/photo', { id: '../x' }).code, 400)
  assert.equal(f.preflight('post /hr/employees/:id/photo', { id: 999 }).code, 404)
  assert.equal(f.preflight('post /hr/employees/:id/photo', { id: 2 }).continued, true)
  assert.equal(f.writes(), 0)
})

test('fotografia colegului cere acces personal înainte de accesul storage', async () => {
  const f = fixture({ photo: true })
  f.db.settings.customRoles[0].permissions = ['hr:view']
  const result = await f.invoke('get /hr/employees/:id/photo', {}, {}, { id: 2 })
  assert.equal(result.code, 403)
  assert.equal(f.storageChecks(), 0)
  assert.equal(f.photoDownloads(), 0)
})

test('fotografia proprie sau autorizată este livrată fără cache public', async () => {
  for (const own of [false, true]) {
    const f = fixture({ photo: true })
    f.db.settings.customRoles[0].permissions = own ? [] : ['hr:view', 'hr:personal_sensitive']
    await f.invoke('get /hr/employees/:id/photo', {}, {}, { id: own ? 1 : 2 })
    assert.equal(f.photoDownloads(), 1)
    assert.equal(f.headers['Cache-Control'], 'private, no-store')
  }
})

test('identificatorul de fotografie nu permite traversarea directoarelor', async () => {
  const f = fixture({ photo: true })
  const result = await f.invoke('get /hr/employees/:id/photo', {}, {}, { id: '../other' })
  assert.equal(result.code, 400)
  assert.equal(f.storageChecks(), 0)
})

test('decizia de concediu nu expune certificatul medical aprobatorului limitat', async () => {
  for (const action of ['approve', 'reject']) {
    const f = fixture()
    f.db.settings.customRoles[0].permissions = ['hr:leave_manage']
    f.db.hr.leaveRequests = [{ id: 1, uuid: 'cm1', employee_id: 2, tip: 'CM', status: 'cerut', data_start: '2026-10-05', data_sfarsit: '2026-10-05', zile: 1, cod_diagnostic: 'secret', certificat_numar: '123', motiv: 'Detalii diagnostic' }]
    f.db.hr.medicalLeaveCertificates = [{ leave_request_uuid: 'cm1', status_verificare: 'verificat' }]
    const result = await f.invoke(`post /hr/leave-requests/:uuid/${action}`, {}, {}, { uuid: 'cm1' })
    assert.equal(result.code, 200)
    assert.equal(f.writes(), 1)
    for (const field of ['cod_diagnostic', 'certificat_numar', 'motiv']) assert.equal(result.data[field], undefined)
    assert.equal(result.data.tip, 'CM')
    assert.equal(f.db.hr.leaveRequests[0].cod_diagnostic, 'secret')
  }
})

test('decizia medicală păstrează detaliile pentru titular sau drept medical explicit', async () => {
  for (const own of [false, true]) {
    const f = fixture()
    f.db.settings.customRoles[0].permissions = own ? ['hr:leave_manage'] : ['hr:leave_manage', 'hr:medical_view']
    f.db.hr.leaveRequests = [{ uuid: 'cm1', employee_id: own ? 1 : 2, tip: 'CM', cod_diagnostic: 'secret', motiv: 'Detalii diagnostic' }]
    const result = await f.invoke('post /hr/leave-requests/:uuid/reject', {}, {}, { uuid: 'cm1' })
    assert.equal(result.code, 200)
    assert.equal(result.data.cod_diagnostic, 'secret')
    assert.equal(result.data.motiv, 'Detalii diagnostic')
  }
})

test('transferul autorizat funcționează fără a returna fișa sensibilă completă', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:manage']
  f.db.departments = [{ id: 'd1', cod: 'OLD', name: 'Vechi' }, { id: 'd2', cod: 'NEW', name: 'Nou' }]
  Object.assign(f.db.hr.employees[1], { department_id: 'd1', department_cod: 'OLD', cnp: '123', iban: 'RO00', salariu_baza: 7000, cost_ora: 42, apt_medical_expira: '2026-12-01' })
  const result = await f.invoke('post /hr/employees/:id/transfer', { department_nou: 'd2', motiv: 'Reorganizare' }, {}, { id: 2 })
  assert.equal(result.code, 200)
  assert.equal(f.writes(), 1)
  assert.equal(result.data.transfer.dept_nou, 'new')
  for (const field of ['cnp', 'iban', 'salariu_baza', 'cost_ora', 'apt_medical_expira']) assert.equal(result.data.employee[field], undefined)
  assert.equal(f.db.hr.employees[1].department_id, 'd2')
  assert.equal(f.db.hr.employees[1].salariu_baza, 7000)
})

test('dreptul dedicat angajaților permite transferul după cod cu ID canonic', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:employees_manage']
  f.db.departments = [{ id: 'd2', cod: 'NEW', name: 'Nou' }]
  const result = await f.invoke('post /hr/employees/:id/transfer', { department_nou: 'NEW' }, {}, { id: 2 })
  assert.equal(result.code, 200)
  assert.equal(f.db.hr.employees[1].department_id, 'd2')
  assert.equal(f.db.hr.employees[1].department_cod, 'new')
  assert.equal(f.writes(), 1)
})

test('transferul către departament inexistent nu scrie și nu schimbă angajatul', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:employees_manage']
  const result = await f.invoke('post /hr/employees/:id/transfer', { department_nou: 'inexistent' }, {}, { id: 2 })
  assert.equal(result.code, 400)
  assert.equal(result.data.code, 'HR_TRANSFER_DEPARTMENT_INVALID')
  assert.equal(f.db.hr.employees[1].department_id, undefined)
  assert.equal(f.writes(), 0)
})

test('transferul fără drept administrativ nu modifică angajatul', async () => {
  const f = fixture()
  const result = await f.invoke('post /hr/employees/:id/transfer', { department_nou: 'd2' }, {}, { id: 2 })
  assert.equal(result.code, 403)
  assert.equal(f.writes(), 0)
  assert.equal(f.db.hr.employees[1].department_id, undefined)
})

test('actele adiționale nu expun salariul sau observațiile libere colegului', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:view']
  f.db.hr.contractAmendments = [{ id: 1, employee_id: 2, salariu_baza: 7000, observatii: 'Salariu negociat', tip: 'salariu' }]
  const result = await f.invoke('get /hr/employees/:id/contract-amendments', {}, {}, { id: 2 })
  assert.equal(result.code, 200)
  assert.equal(result.data[0].salariu_baza, undefined)
  assert.equal(result.data[0].observatii, undefined)
  assert.equal(f.db.hr.contractAmendments[0].salariu_baza, 7000)
})

test('actele adiționale proprii și citirea salarială autorizată păstrează datele', async () => {
  for (const own of [false, true]) {
    const f = fixture()
    f.db.settings.customRoles[0].permissions = own ? ['hr:view'] : ['hr:view', 'hr:salary_view']
    const id = own ? 1 : 2
    f.db.hr.contractAmendments = [{ id: 1, employee_id: id, salariu_baza: 7000, observatii: 'Salariu negociat' }]
    const result = await f.invoke('get /hr/employees/:id/contract-amendments', {}, {}, { id })
    assert.equal(result.data[0].salariu_baza, 7000)
    assert.equal(result.data[0].observatii, 'Salariu negociat')
  }
})

test('administrarea HR singură nu modifică contractele sau actele adiționale', async () => {
  for (const route of ['post /hr/employees/:id/contracts', 'patch /hr/employees/:id/contracts/:contractId', 'post /hr/employees/:id/contracts/:contractId/amendments']) {
    for (const permissions of [['hr:manage'], ['hr:manage', 'hr:personal_sensitive'], ['hr:manage', 'hr:salary_view']]) {
      const f = fixture()
      f.db.settings.customRoles[0].permissions = permissions
      const result = await f.invoke(route, { salariu_baza: 1, data_efect: '2026-10-11' }, {}, { id: 2, contractId: 1 })
      assert.equal(result.code, 403)
      assert.equal(f.writes(), 0)
    }
  }
})

test('ruta HTTP de pontaj nu returnează colegul când se schimbă filtrul employee_id', async () => {
  const f = fixture()
  const result = await f.invoke('get /hr/timesheets', {}, { luna: '2026-10', employee_id: '2' })
  assert.equal(result.code, 200)
  assert.equal(result.data.pontaje.length, 0)
})

test('rutele de pontaj și concediu refuză angajatul străin fără scriere', async () => {
  for (const route of ['post /hr/timesheets', 'post /hr/leave-requests']) {
    const f = fixture()
    const result = await f.invoke(route, { employee_id: 2, data: '2026-10-02', data_start: '2026-10-05', data_sfarsit: '2026-10-06', ore_lucrate: 4 })
    assert.equal(result.code, 403)
    assert.equal(f.writes(), 0)
    assert.equal(f.db.hr.timeSheets.length, 2)
  }
})

test('salvarea pontajului propriu funcționează în ruta reală', async () => {
  const f = fixture()
  const result = await f.invoke('post /hr/timesheets', { employee_id: 1, data: '2026-10-02', ore_lucrate: 4 })
  assert.equal(result.code, 200)
  assert.equal(f.writes(), 1)
  assert.equal(f.db.hr.timeSheets.find(item => item.data === '2026-10-02').employee_id, 1)
})

test('raportul lunar al colegului este refuzat', async () => {
  const f = fixture()
  const result = await f.invoke('get /hr/timesheets/raport-lunar/:employeeId', {}, { luna: '2026-10' }, { employeeId: 2 })
  assert.equal(result.code, 403)
})

test('raportul lunar validează luna înainte de citirea datelor', async () => {
  const f = fixture()
  const result = await f.invoke('get /hr/timesheets/raport-lunar/:employeeId', {}, { luna: '2026-13' }, { employeeId: 1 })
  assert.equal(result.code, 422)
  assert.equal(result.data.code, 'HR_TIMESHEET_MONTH_INVALID')
})

test('tichetele de masă nu expun CNP-ul în listă și scad concediile din aceeași lună', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:view']
  f.db.hr.employees[1].cnp = 'secret-cnp'
  f.db.hr.timeSheets = [
    { employee_id: 2, data: '2026-10-01', tip: 'lucru', validat: true },
    { employee_id: 2, data: '2026-10-02', tip: 'lucru', validat: 1 },
    { employee_id: 2, data: '2026-10-03', tip: 'lucru', validat: false },
  ]
  f.db.hr.leaveRequests = [{ employee_id: 2, tip: 'CO', status: 'aprobat', data_start: '2026-10-02', data_sfarsit: '2026-10-02' }]
  const result = await f.invoke('get /hr/meal-tickets', {}, { luna: '2026-10' })
  const row = result.data.rows.find(item => item.employee_id === 2)
  assert.equal(row.zile_lucrate, 2)
  assert.equal(row.zile_co, 1)
  assert.equal(row.tichete, 1)
  assert.equal(row.valoare, 40)
  assert.equal(row.cnp, undefined)
})

test('exportul tichetelor cere acces personal și validează luna', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:view']
  assert.equal((await f.invoke('get /hr/meal-tickets/export', {}, { luna: '2026-10' })).code, 403)
  f.db.settings.customRoles[0].permissions.push('hr:personal_sensitive')
  const invalid = await f.invoke('get /hr/meal-tickets/export', {}, { luna: '2026-13' })
  assert.equal(invalid.code, 422)
  assert.equal(invalid.data.code, 'HR_MEAL_TICKET_MONTH_INVALID')
  f.db.hr.employees[0].cnp = 'cnp-propriu'
  f.db.hr.timeSheets = [{ employee_id: 1, data: '2026-10-01', tip: 'lucru', validat: true }]
  const exported = await f.invoke('get /hr/meal-tickets/export', {}, { luna: '2026-10' })
  assert.match(exported.data, /cnp-propriu/)
})

test('hr:view nu expune salariul și costul orar prin contractele angajatului', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:view']
  f.db.hr.contracts = [{ id: 1, employee_id: 2, status: 'activ', salariu_baza: 6000, cost_ora: 40 }]
  const result = await f.invoke('get /hr/employees/:id/contracts', {}, {}, { id: 2 })
  assert.equal(result.code, 200)
  assert.equal(result.data[0].salariu_baza, undefined)
  assert.equal(result.data[0].cost_ora, undefined)
  assert.equal(result.data[0].status, 'activ')
})

test('CIM folosește contractul activ fără a expune salariul colegului', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:view']
  f.db.hr.contracts = [
    { id: 1, employee_id: 2, status: 'incetat', data_start: '2026-05-01', salariu_baza: 9000, cost_ora: 60 },
    { id: 2, employee_id: 2, status: 'activ', data_start: '2026-01-01', numar_contract: 'CIM-2', salariu_baza: 6000, cost_ora: 40 },
  ]
  const result = await f.invoke('get /hr/employees/:id/cim', {}, {}, { id: 2 })
  assert.equal(result.code, 200)
  assert.equal(result.data.nr_cim, 'CIM-2')
  assert.equal(result.data.contract.id, 2)
  assert.equal(result.data.contract.salariu_baza, undefined)
  assert.equal(result.data.contract.cost_ora, undefined)
  assert.equal(result.data.angajat.salariu_baza, undefined)
})

test('CIM propriu păstrează datele salariale ale titularului', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:view']
  f.db.hr.contracts = [{ id: 1, employee_id: 1, status: 'activ', salariu_baza: 5000, cost_ora: 35 }]
  const result = await f.invoke('get /hr/employees/:id/cim', {}, {}, { id: 1 })
  assert.equal(result.code, 200)
  assert.equal(result.data.contract.salariu_baza, 5000)
  assert.equal(result.data.contract.cost_ora, 35)
  assert.equal(result.data.angajat.salariu_baza, 5000)
})

test('adeverința validează tipul și nu expune date personale, salariale sau medicale ale colegului', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:view']
  Object.assign(f.db.hr.employees[1], { act_identitate_tip: 'CI', act_identitate_serie: 'NT', act_identitate_numar: 'secret' })
  f.db.hr.contracts = [{ id: 2, employee_id: 2, status: 'activ', salariu_baza: 6000, cost_ora: 40 }]
  f.db.hr.leaveRequests = [{ employee_id: 2, tip: 'CM', status: 'aprobat', data_start: '2026-09-01', data_sfarsit: '2026-09-03', zile: 3 }]
  assert.equal((await f.invoke('get /hr/employees/:id/adeverinta', {}, { tip: 'inventata' }, { id: 2 })).code, 422)
  assert.equal((await f.invoke('get /hr/employees/:id/adeverinta', {}, { tip: 'venit' }, { id: 2 })).code, 403)
  assert.equal((await f.invoke('get /hr/employees/:id/adeverinta', {}, { tip: 'concediu_medical' }, { id: 2 })).code, 403)
  const result = await f.invoke('get /hr/employees/:id/adeverinta', {}, { tip: 'salariat' }, { id: 2 })
  assert.equal(result.code, 200)
  assert.equal(result.data.identitate_text, '')
  assert.equal(result.data.zile_concediu_medical_12_luni, null)
  assert.equal(result.data.angajat.act_identitate_numar, undefined)
  assert.equal(result.data.angajat.salariu_baza, null)
  assert.equal(result.data.contract.salariu_baza, undefined)
  assert.equal(result.data.contract.cost_ora, undefined)
})

test('adeverința proprie folosește contractul și concediile titularului', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['kiosk:documents_own']
  Object.assign(f.db.hr.employees[0], { act_identitate_tip: 'CI', act_identitate_serie: 'NT', act_identitate_numar: '123456' })
  f.db.hr.contracts = [{ id: 1, employee_id: 1, status: 'activ', salariu_baza: 5000, cost_ora: 35 }]
  f.db.hr.leaveRequests = [{ employee_id: 1, tip: 'CM', status: 'aprobat', data_start: '2026-09-01', data_sfarsit: '2026-09-03', zile: 3 }]
  const result = await f.invoke('get /hr/employees/:id/adeverinta', {}, { tip: 'concediu_medical' }, { id: 1 })
  assert.equal(result.code, 200)
  assert.match(result.data.identitate_text, /NT/)
  assert.equal(result.data.zile_concediu_medical_12_luni, 3)
  assert.equal(result.data.angajat.salariu_baza, 5000)
  assert.equal(result.data.contract.salariu_baza, 5000)
})

test('citirea globală a pontajului nu include datele personale sau salariul colegilor', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions.push('hr:timesheets_view')
  Object.assign(f.db.hr.employees[1], { cnp: 'secret-cnp', iban: 'secret-iban', salariu_baza: 6000 })
  const result = await f.invoke('get /hr/timesheets', {}, { luna: '2026-10' })
  const employee = result.data.pontaje.find(row => row.employee.id === 2).employee
  assert.equal(employee.cnp, undefined)
  assert.equal(employee.iban, undefined)
  assert.equal(employee.salariu_baza, undefined)
})

test('vederea de departament nu acordă angajatului acces la colegi fără dreptul de departament', async () => {
  const f = fixture()
  const result = await f.invoke('get /hr/timesheets/my-department', {}, { luna: '2026-10' })
  assert.equal(result.code, 200)
  assert.deepEqual(Array.from(result.data.employees, employee => employee.id), [1])
  assert.deepEqual(Array.from(result.data.pontaje, row => row.employee_id), [1])
})

test('overview-ul aprobatorului este limitat la departamentul asociat', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:timesheet_approve', 'hr:timesheet_dept']
  f.auth.user.department_id = 'd1'
  f.db.departments = [{ id: 'd1', cod: 'unu', name: 'Departament unu' }, { id: 'd2', cod: 'doi', name: 'Departament doi' }]
  const result = await f.invoke('get /hr/timesheets/overview', {}, { luna: '2026-10' })
  assert.equal(result.code, 200)
  assert.deepEqual(Array.from(result.data, row => row.department_cod), ['unu'])
})

test('aprobatorul fără departament nu vede overview și nu trimite remindere', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:timesheet_approve', 'hr:timesheet_dept']
  const overview = await f.invoke('get /hr/timesheets/overview', {}, { luna: '2026-10' })
  assert.equal(overview.data.length, 0)
  const reminder = await f.invoke('post /hr/timesheets/send-reminder', { luna: '2026-10' })
  assert.equal(reminder.code, 403)
  assert.equal(f.writes(), 0)
})

test('reminderul pontajului persistă notificări doar pentru utilizatorii activi din departamente nefinalizate', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:timesheet_approve', 'hr:timesheets_manage']
  f.db.departments = [{ id: 'd1', cod: 'd1', name: 'Finalizat' }, { id: 'd2', cod: 'd2', name: 'Restant' }]
  f.db.users = [
    { id: 'done', department_id: 'd1', active: true },
    { id: 'target', department_id: 'd2', active: true, email: 'target@example.test' },
    { id: 'inactive', department_id: 'd2', active: false },
  ]
  f.db.hr.timesheetDepartments = [{ luna: '2026-10', department_cod: 'd1', status: 'finalizat' }]
  const result = await f.invoke('post /hr/timesheets/send-reminder', { luna: '2026-10', deadline_date: '2026-10-05' })
  assert.equal(result.data.sent, 1)
  assert.equal(result.data.emailed, 1)
  assert.equal(f.db.notifications.length, 1)
  assert.equal(f.db.notifications[0].user_id, 'target')
  assert.equal(f.db.notifications[0].target_view, '/hr?section=pontaj')
  assert.equal(f.writes(), 1)
  assert.equal((await f.invoke('post /hr/timesheets/send-reminder', { luna: '2026-13' })).code, 422)
})

test('ajustarea băncii de ore refuză angajatul din alt departament fără scriere', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:timesheet_approve', 'hr:timesheet_dept']
  f.auth.user.department_id = 'd1'
  f.db.hr.employees[1].department_id = 'd2'
  const result = await f.invoke('post /hr/overtime-bank/adjustment', { employee_id: 2, ore: 8, tip: 'sold_initial' })
  assert.equal(result.code, 403)
  assert.equal(f.writes(), 0)
  assert.equal(f.db.hr.overtimeCompensations.length, 0)
})

test('ajustarea băncii de ore permite angajatul din departamentul aprobatorului', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:timesheet_approve', 'hr:timesheet_dept']
  f.auth.user.department_id = 'd1'
  f.db.hr.employees[1].department_id = 'd1'
  const result = await f.invoke('post /hr/overtime-bank/adjustment', { employee_id: 2, ore: 8, tip: 'sold_initial' })
  assert.equal(result.code, 201)
  assert.equal(f.writes(), 1)
  assert.equal(f.db.hr.overtimeCompensations[0].employee_id, 2)
})

test('ajustarea băncii de ore refuză angajatul inexistent chiar cu administrare globală', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:timesheet_approve', 'hr:timesheets_manage']
  const result = await f.invoke('post /hr/overtime-bank/adjustment', { employee_id: 999, ore: 8, tip: 'sold_initial' })
  assert.equal(result.code, 403)
  assert.equal(f.writes(), 0)
})

test('vizualizarea HR nu expune certificatul medical al colegului prin concedii', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:view']
  f.db.hr.leaveRequests = [{ id: 1, uuid: 'leave2', employee_id: 2, tip: 'CM', data_start: '2026-10-01' }]
  f.db.hr.medicalLeaveCertificates = [{ uuid: 'certificate2', leave_request_uuid: 'leave2', serie: 'secret', cod_indemnizatie: '01', medic_nume: 'Medic' }]
  const result = await f.invoke('get /hr/leave-requests')
  assert.equal(result.code, 200)
  assert.equal(result.data[0].medical_certificate_uuid, undefined)
  assert.equal(result.data[0].certificat_serie, undefined)
  assert.equal(result.data[0].medic_nume, undefined)
  assert.equal(result.data[0].tip, 'CM')
})

test('dreptul medical explicit păstrează datele certificatului în lista concediilor', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:view', 'hr:medical_view']
  f.db.hr.leaveRequests = [{ uuid: 'leave2', employee_id: 2, tip: 'CM' }]
  f.db.hr.medicalLeaveCertificates = [{ uuid: 'certificate2', leave_request_uuid: 'leave2', serie: 'serie2' }]
  const result = await f.invoke('get /hr/leave-requests')
  assert.equal(result.data[0].medical_certificate_uuid, 'certificate2')
  assert.equal(result.data[0].certificat_serie, 'serie2')
})

test('administrarea concediilor fără drept medical nu verifică sau respinge certificate', async () => {
  for (const action of ['verify', 'reject']) {
    const f = fixture()
    f.db.settings.customRoles[0].permissions = ['hr:leave_manage']
    f.db.hr.medicalLeaveCertificates = [{ uuid: 'certificate2', status_verificare: 'in_verificare' }]
    const result = await f.invoke(`post /hr/medical-leaves/:uuid/${action}`, { motiv: 'Motiv verificare' }, {}, { uuid: 'certificate2' })
    assert.equal(result.code, 403)
    assert.equal(f.writes(), 0)
    assert.equal(f.db.hr.medicalLeaveCertificates[0].status_verificare, 'in_verificare')
  }
})

test('drepturile medical și administrare concedii permit verificarea certificatului', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:leave_manage', 'hr:medical_view']
  f.db.hr.medicalLeaveCertificates = [{ uuid: 'certificate2', status_verificare: 'in_verificare' }]
  const result = await f.invoke('post /hr/medical-leaves/:uuid/verify', {}, {}, { uuid: 'certificate2' })
  assert.equal(result.code, 200)
  assert.equal(f.writes(), 1)
  assert.equal(result.data.status_verificare, 'verificat')
})

test('registrul medical financiar și exportul nu sunt acordate de administrarea concediilor', async () => {
  for (const route of ['get /hr/medical-leaves/register', 'get /hr/medical-leaves/register.xlsx']) {
    for (const permissions of [['hr:leave_manage'], ['hr:leave_manage', 'hr:medical_view']]) {
      const f = fixture()
      f.db.settings.customRoles[0].permissions = permissions
      const result = await f.invoke(route, {}, { luna: '2026-10' })
      assert.equal(result.code, 403)
      assert.equal(f.writes(), 0)
    }
  }
})

test('administrarea HR nu acordă implicit transmiterea datelor medicale către salarizare', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:manage']
  const result = await f.invoke('post /hr/medical-leaves/:uuid/payroll', {}, {}, { uuid: 'certificate2' })
  assert.equal(result.code, 403)
  assert.equal(f.writes(), 0)
})

test('generarea și arhivarea Word nu ocolesc drepturile personale și salariale', async () => {
  for (const route of ['get /hr/document-templates/:id/render-word', 'post /hr/document-templates/:id/render-word/archive']) {
    for (const rights of [[], ['hr:personal_sensitive'], ['hr:salary_view']]) {
      const f = fixture()
      f.db.settings.customRoles[0].permissions = ['hr:view', 'hr:manage', ...rights]
      await assert.rejects(f.invoke(route, { employee_id: 2 }, { employee_id: 2 }, { id: 'cim' }), error => error.status === 403 && error.code === 'HR_DOCUMENT_SENSITIVE_ACCESS_REQUIRED')
      assert.equal(f.writes(), 0)
    }
  }
})

test('drepturile complete pentru Word trec de controlul sensibil fără a simula un fișier', async () => {
  const f = fixture()
  f.db.settings.customRoles[0].permissions = ['hr:view', 'hr:personal_sensitive', 'hr:salary_view']
  await assert.rejects(f.invoke('get /hr/document-templates/:id/render-word', {}, { employee_id: 2 }, { id: 'cim' }), error => error.status === 404 && error.code === 'HR_TEMPLATE_WORD_NOT_FOUND')
  assert.equal(f.writes(), 0)
})
