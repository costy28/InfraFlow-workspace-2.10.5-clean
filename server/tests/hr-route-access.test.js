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
    await handlers.get(route)({ body, query, params }, { status(value) { code = value; return this }, json(value) { data = value }, writeHead(value) { code = value }, end(value) { if (value) data = JSON.parse(value) }, setHeader(key, value) { headers[key] = value }, sendFile() { photoDownloads++ } }, value => { error = value })
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
  f.db.users = [{ id: 'u2', username: 'test', password: 'secret', totpSecret: 'secret' }, { id: 'inactive', active: false }]
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
