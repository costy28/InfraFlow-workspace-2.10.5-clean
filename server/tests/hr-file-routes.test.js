const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

function fixture(permissions = ['hr:view']) {
  const filename = path.join(__dirname, '../modules/hr/employee-file-routes.js')
  const localRequire = createRequire(filename)
  const handlers = new Map()
  const router = {}
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'use']) router[method] = (url, ...callbacks) => handlers.set(`${method} ${url}`, callbacks)
  const db = { settings: { customRoles: [{ id: 'limited', permissions }] }, hr: {
    employees: [{ id: 1, user_id: 'u1', activ: true }, { id: 2, user_id: 'u2', activ: true }],
    employeeFiles: [{ id: 1, employee_id: 1, tip: 'contract', stored_name: 'own.docx', file_name: 'own.docx', kiosk_visible: true }, { id: 2, employee_id: 2, tip: 'contract', stored_name: 'other.docx', file_name: 'other.docx', kiosk_visible: true }],
  } }
  const auth = { db, user: { id: 'u1', role: 'limited' } }
  let storageChecks = 0
  let downloads = 0
  let writes = 0
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: { exports: {} }, __dirname: path.dirname(filename), console, Buffer, process,
    require(name) {
      if (name === 'express') return { Router: () => router }
      if (name === 'fs') return { mkdirSync() {}, existsSync() { storageChecks++; return true } }
      if (name === '../../core/auth') return { requireAuth: () => auth }
      if (name === '../../core/db') return { readDb: () => db, writeDb() { writes++ } }
      if (name === '../../core/audit') return { addAudit() {} }
      if (name === '../../core/kiosk-sessions') return { getSession: () => null, tokenFromRequest: () => '' }
      return localRequire(name)
    },
  }, { filename })
  return { auth, db, storageChecks: () => storageChecks, downloads: () => downloads, writes: () => writes,
    invoke(route, params, body = {}) {
      let code = 200; let data
      const req = { params, body, query: {} }
      const res = { status(value) { code = value; return this }, json(value) { data = value }, writeHead(value) { code = value }, end(value) { if (value) data = JSON.parse(value) }, type() {}, download() { downloads++ } }
      const callbacks = handlers.get(route)
      let i = 0
      function next(error) { if (error) throw error; const callback = callbacks[i++]; if (callback) callback(req, res, next) }
      next()
      return { code, data }
    },
  }
}

test('la listele reale nu apar documentele salariale ale colegului cu hr:view', () => {
  const f = fixture()
  const result = f.invoke('get /hr/employees/:id/files', { id: 2 })
  assert.equal(result.code, 200)
  assert.equal(result.data.items.length, 0)
})
test('descărcarea colegului este refuzată înainte de orice acces storage', () => {
  const f = fixture()
  const result = f.invoke('get /hr/employees/:id/files/:fileId/download', { id: 2, fileId: 2 })
  assert.equal(result.code, 403)
  assert.equal(f.storageChecks(), 0)
  assert.equal(f.downloads(), 0)
  assert.equal(f.writes(), 0)
})
test('documentul propriu și contractul autorizat ajung la descărcare', () => {
  for (const [permissions, id] of [[['hr:view'], 1], [['hr:view', 'hr:personal_sensitive', 'hr:salary_view'], 2]]) {
    const f = fixture(permissions)
    f.invoke('get /hr/employees/:id/files/:fileId/download', { id, fileId: id })
    assert.equal(f.downloads(), 1)
  }
})
test('Kiosk nu poate descărca documentul altui angajat prin schimbarea ID-ului', () => {
  const f = fixture()
  const result = f.invoke('get /hr/kiosk/my-documents/:fileId/download', { fileId: 2 })
  assert.equal(result.code, 404)
  assert.equal(f.storageChecks(), 0)
  assert.equal(f.downloads(), 0)
})

test('descărcările HR și Kiosk refuză numele intern care poate ieși din storage', () => {
  const f = fixture(['hr:view', 'hr:personal_sensitive', 'hr:salary_view'])
  f.db.hr.employeeFiles[0].stored_name = '../outside.docx'
  for (const route of ['get /hr/employees/:id/files/:fileId/download', 'get /hr/kiosk/my-documents/:fileId/download']) {
    const result = f.invoke(route, route.includes('/kiosk/') ? { fileId: 1 } : { id: 1, fileId: 1 })
    assert.equal(result.code, 404)
    assert.equal(result.data.code, 'HR_FILE_STORAGE_MISSING')
  }
  assert.equal(f.storageChecks(), 0)
  assert.equal(f.downloads(), 0)
})

test('administrarea HR nu permite generarea sau anularea contractului inaccesibil', () => {
  for (const route of ['post /hr/employees/:id/files/generated', 'delete /hr/employees/:id/files/:fileId']) {
    const f = fixture(['hr:manage'])
    const result = f.invoke(route, { id: 2, fileId: 2 }, { tip: 'contract' })
    assert.equal(result.code, 403)
    assert.equal(f.writes(), 0)
    assert.equal(f.storageChecks(), 0)
    assert.equal(f.db.hr.employeeFiles[1].cancelled_at, undefined)
  }
})

test('reclasificarea cere acces atât la categoria veche cât și la cea nouă', () => {
  const f = fixture(['hr:documents_manage', 'hr:personal_sensitive', 'hr:salary_view'])
  const result = f.invoke('patch /hr/employees/:id/files/:fileId', { id: 2, fileId: 2 }, { tip: 'medical' })
  assert.equal(result.code, 403)
  assert.equal(f.db.hr.employeeFiles[1].tip, 'contract')
  assert.equal(f.writes(), 0)
})

test('rapoartele complete HR cer raportare și acces personal/medical explicit', () => {
  for (const route of ['get /hr/dossier-report.xlsx', 'get /hr/management-report', 'get /hr/management-report.xlsx']) {
    for (const permissions of [['hr:view'], ['hr:view', 'hr:reports'], ['hr:view', 'hr:reports', 'hr:personal_sensitive']]) {
      const f = fixture(permissions)
      const result = f.invoke(route, {})
      assert.equal(result.code, 403)
      assert.equal(f.writes(), 0)
      assert.equal(f.downloads(), 0)
    }
  }
})

test('raportul de management rămâne disponibil cu drepturile complete', () => {
  const f = fixture(['hr:view', 'hr:reports', 'hr:personal_sensitive', 'hr:medical_view'])
  const result = f.invoke('get /hr/management-report', {})
  assert.equal(result.code, 200)
  assert.ok(result.data.kpi)
  assert.equal(f.writes(), 0)
})

test('sumarele dosarului nu dezvăluie date medicale cu simpla vizualizare HR', () => {
  for (const route of ['get /hr/dossier-checklist', 'get /hr/dossier-dashboard', 'get /hr/inbox', 'get /hr/advanced-expirations']) {
    const f = fixture(['hr:view', 'hr:personal_sensitive'])
    assert.equal(f.invoke(route, {}).code, 403)
    assert.equal(f.writes(), 0)
  }
})

test('jurnalul HR nu expune textul liber salarial fără drept salarial', () => {
  for (const route of ['get /hr/activity', 'get /hr/activity.xlsx']) {
    const f = fixture(['hr:view', 'hr:personal_sensitive', 'hr:medical_view'])
    assert.equal(f.invoke(route, {}).code, 403)
  }
})

test('Dashboard-ul dosarului rămâne disponibil cu drepturile sensibile', () => {
  const f = fixture(['hr:view', 'hr:personal_sensitive', 'hr:medical_view'])
  const result = f.invoke('get /hr/dossier-dashboard', {})
  assert.equal(result.code, 200)
  assert.equal(result.data.rows.length, 2)
})

test('fluxurile HR complete nu se deschid sau modifică fără drepturi sensibile', () => {
  for (const route of ['get /hr/employees/:id/workflow', 'post /hr/employees/:id/workflow/start', 'patch /hr/employees/:id/workflow/steps/:stepKey', 'post /hr/employees/:id/workflow/close']) {
    const f = fixture(['hr:view', 'hr:workflow_manage', 'hr:personal_sensitive', 'hr:medical_view'])
    assert.equal(f.invoke(route, { id: 2, stepKey: 'apt_medical' }, { type: 'onboarding', done: true }).code, 403)
    assert.equal(f.writes(), 0)
    assert.equal(f.db.hr.employeeWorkflows, undefined)
  }
})

test('pornirea onboarding autorizat păstrează fluxul și scrierea auditată', () => {
  const f = fixture(['hr:view', 'hr:workflow_manage', 'hr:personal_sensitive', 'hr:medical_view', 'hr:salary_view'])
  const result = f.invoke('post /hr/employees/:id/workflow/start', { id: 2 }, { type: 'onboarding' })
  assert.equal(result.code, 201)
  assert.equal(result.data.workflow.employee_id, 2)
  assert.equal(f.writes(), 1)
})

test('reminderul Kiosk nu modifică dosarul fără toate drepturile sensibile', () => {
  for (const missing of ['hr:personal_sensitive', 'hr:medical_view', 'hr:salary_view']) {
    const permissions = ['hr:notifications_manage', 'hr:personal_sensitive', 'hr:medical_view', 'hr:salary_view'].filter(p => p !== missing)
    const f = fixture(permissions)
    assert.equal(f.invoke('post /hr/dossier-dashboard/:employeeId/reminder', { employeeId: 2 }).code, 403)
    assert.equal(f.writes(), 0)
  }
})

test('notificările sensibile cer toate drepturile înainte de citire sau scriere', () => {
  for (const route of ['post /hr/advanced-expirations/notify', 'post /hr/notifications/generate', 'get /hr/advanced-expirations/notifications', 'post /hr/advanced-expirations/notifications/:id/resolve']) {
    for (const missing of ['hr:personal_sensitive', 'hr:medical_view', 'hr:salary_view']) {
      const f = fixture(['hr:notifications_manage', 'hr:personal_sensitive', 'hr:medical_view', 'hr:salary_view'].filter(p => p !== missing))
      assert.equal(f.invoke(route, { id: 'n1' }).code, 403)
      assert.equal(f.writes(), 0)
      assert.equal(f.db.notifications, undefined)
    }
  }
})

test('notificările detaliate nu sunt distribuite rolurilor HR limitate', () => {
  const f = fixture(['hr:notifications_manage', 'hr:personal_sensitive', 'hr:medical_view', 'hr:salary_view'])
  f.db.settings.customRoles.push({ id: 'partial', permissions: ['hr:authorizations_manage'] })
  f.db.users = [f.auth.user, { id: 'limited-recipient', role: 'partial', active: true }]
  f.db.hr.employees[1].apt_medical_expira = '2020-01-01'
  const result = f.invoke('post /hr/advanced-expirations/notify', {})
  assert.equal(result.code, 200)
  assert.ok(result.data.created > 0)
  assert.equal(result.data.targets, 1)
  assert.ok(f.db.notifications.every(item => item.user_id === f.auth.user.id))
})
