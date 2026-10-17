#!/usr/bin/env node
'use strict'

// HTTP real, autentificare reală, bază JSON temporară. Nu folosește instalația activă.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { ensureDefaultCustomRoles } = require('../server/core/permissions')

const root = path.resolve(__dirname, '..')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'infraflow-hr-roles-'))
const database = path.join(directory, 'app-db.json')
const port = 48000 + crypto.randomInt(1000)
const origin = `http://127.0.0.1:${port}/api`
const password = `Hr-${crypto.randomBytes(18).toString('hex')}!aA1`
const salt = crypto.randomBytes(16).toString('hex')
const passwordHash = `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`
const roles = {
  employee: ['hr:timesheet', 'hr:view_own'],
  chief: ['hr:timesheet', 'hr:timesheet_dept', 'hr:timesheet_approve'],
  validator: ['hr:timesheet', 'hr:timesheet_dept', 'hr:timesheets_validate'],
  hr: ['hr:view', 'hr:timesheet', 'hr:timesheets_manage', 'hr:timesheets_validate', 'hr:leave_manage'],
  admin: [],
  restrictedAdmin: ['documents:view_own', 'messaging:view'],
  templateEditor: ['documents:templates'],
  channelManager: ['messaging:admin'],
  documentActor: ['documents:view_own', 'documents:create', 'documents:approve', 'documents:share'],
  documentReader: ['documents:view_own'],
  messageSender: ['messaging:view', 'messaging:send'],
}
const tokens = {}
let child
let output = ''
let checks = 0

function prepare() {
  const db = JSON.parse(fs.readFileSync(path.join(root, 'data/app-db.seed.json'), 'utf8'))
  db.settings = { ...db.settings, setupCompleted: true, initialSetupCompleted: true, networkAccessMode: 'open',
    license: { plan: 'internal', modules: ['all'], maxUsers: 1000, maxDevices: 1000 },
    imap_auto_sync_enabled: false, email_sync_enabled: false, piusi_auto_sync_enabled: false }
  ensureDefaultCustomRoles(db.settings)
  db.settings.rolePermissionOverrides = { ...db.settings.rolePermissionOverrides, admin: roles.restrictedAdmin }
  db.settings.customRoles.push(...Object.entries(roles).map(([id, permissions]) => ({ id: `smoke-${id}`, name: id, permissions })))
  db.users = Object.keys(roles).map((id, index) => ({ id: `u-${id}`, username: `hrsmoke_${id}`, name: id,
    passwordHash, role: id === 'admin' ? 'superadmin' : id === 'restrictedAdmin' ? 'admin' : `smoke-${id}`, active: true,
    employee_id: index + 1, department_id: 'd1', mustChangePassword: false }))
  db.departments = [{ id: 'd1', cod: 'D1', name: 'Unu', denumire: 'Unu', activ: true }, { id: 'd2', cod: 'D2', name: 'Doi', denumire: 'Doi', activ: true }]
  db.hr = { employees: [
    { id: 1, user_id: 'u-employee', nume: 'Propriu', department_id: 'd1', activ: true, zile_co_drept: 21 },
    { id: 2, user_id: 'u-chief', nume: 'Coleg', department_id: 'd1', activ: true },
    { id: 3, user_id: 'u-other', nume: 'Alt departament', department_id: 'd2', activ: true },
  ], timeSheets: [1, 2, 3].map(id => ({ id, employee_id: id, data: '2026-10-01', ore_lucrate: 10,
    ore_suplimentare_s1: 2, overtime_status: 'propus', validat: false, tip: 'lucru' })),
  leaveRequests: [{ id: 1, uuid: 'smoke-co', employee_id: 1, tip: 'CO', status: 'cerut', data_start: '2026-11-02', data_sfarsit: '2026-11-02', zile: 1 }] }
  db.documents = { documentTypes: [], documents: [
    { id: 901, uuid: 'smoke-doc-reader', titlu: 'Propriu cititor', nr_document: 'TEST-901', status: 'in_circuit', creat_de: 'u-documentReader', date_json: JSON.stringify({ watchers: ['u-documentActor'] }) },
    { id: 902, uuid: 'smoke-doc-foreign', titlu: 'Fără acces', nr_document: 'TEST-902', status: 'in_circuit', creat_de: 'u-other', date_json: JSON.stringify({ watchers: ['u-documentActor'] }) },
    { id: 903, uuid: 'smoke-doc-actor', titlu: 'Pas atribuit', nr_document: 'TEST-903', status: 'in_circuit', creat_de: 'u-other' },
  ], circuitSteps: [
    { id: 901, document_id: 901, nr_pas: 1, status: 'asteptare', user_responsabil: 'u-documentReader' },
    { id: 903, document_id: 903, nr_pas: 1, status: 'asteptare', user_responsabil: 'u-documentActor' },
  ], circuitAudit: [], documentShares: [
    { id: 901, document_id: 901, shared_with_user: 'u-restrictedAdmin' },
    { id: 902, document_id: 901, shared_with_user: 'u-documentActor' },
    { id: 903, document_id: 901, shared_with_user: 'u-documentActor' },
    { id: 904, document_id: 902, shared_with_user: 'u-documentActor', expires_at: '2000-01-01T00:00:00Z' },
  ] }
  db.messaging = { ...(db.messaging || {}), emailMessages: [{ id: 910, direction: 'inbound', subject: 'Email test', body: 'Verificare', status: 'unread', category: 'general' }],
    whatsapp: { messages: [{ id: 'wa-test', body: 'Mesaj test', status: 'unread', from_phone: '40000000000' }], events: [] } }
  fs.writeFileSync(database, JSON.stringify(db))
}

async function request(role, url, method = 'GET', body, expected = 200) {
  const response = await fetch(origin + url, { method, signal: AbortSignal.timeout(10000), headers: {
    'Content-Type': 'application/json', ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await response.json()
  assert.equal(response.status, expected, `${role} ${method} ${url}: status ${response.status}, cod ${data.code || '-'}, eroare ${data.error || '-'}`)
  return data
}
async function check(name, fn) { await fn(); checks++; console.log(`OK ${name}`) }

async function main() {
  prepare()
  child = spawn(process.execPath, [path.join(root, 'server/app.js')], { cwd: root, windowsHide: true,
    env: { ...process.env, APP_KEY: crypto.randomBytes(32).toString('hex'), NODE_ENV: 'test',
      INFRAFLOW_DB_PROVIDER: 'json', DB_MODE: 'json', INFRAFLOW_DB_FILE: database, INFRAFLOW_SEED_FILE: database,
      INFRAFLOW_HOST: '127.0.0.1', HOST: '127.0.0.1', INFRAFLOW_PORT: String(port), PORT: String(port), INFRAFLOW_SCHEDULER_DISABLED: '1', INFRAFLOW_AUDIT_SMOKE: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', data => { output += data })
  child.stderr.on('data', data => { output += data })
  let healthy = false
  for (let attempt = 0; attempt < 60; attempt++) {
    try { const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1000) }); if (response.ok) { healthy = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  assert.ok(healthy, 'Serverul temporar nu a pornit')
  for (const role of Object.keys(roles)) {
    const login = await request(role, '/login', 'POST', { username: `hrsmoke_${role}`, password })
    assert.ok(login.token, `Token lipsă pentru ${role}`)
    tokens[role] = login.token
  }
  await check('Angajat: numai pontaj propriu; editarea colegului este refuzată', async () => {
    const sheet = await request('employee', '/hr/timesheets/monthly-sheet?luna=2026-10')
    assert.deepEqual(sheet.map(row => row.employee_id), [1])
    await request('employee', '/hr/timesheets', 'POST', { employee_id: 3, data: '2026-10-02', ore_lucrate: 8 }, 403)
    await request('employee', '/hr/overtime-bank/compensate', 'POST', { employee_id: 1, ore: 8, tip: 'sold_initial' }, 422)
    await request('employee', '/hr/overtime-bank/compensate', 'POST', { employee_id: 1, ore: -8, tip: 'timp_liber' }, 422)
  })
  await check('Șef: colegi din departament; aprobarea nu acordă validare sau acces străin', async () => {
    const sheet = await request('chief', '/hr/timesheets/monthly-sheet?luna=2026-10')
    assert.deepEqual(sheet.map(row => row.employee_id).sort(), [1, 2])
    await request('chief', '/hr/timesheets/validate', 'POST', { luna: '2026-10', employee_ids: [1] }, 403)
    await request('chief', '/hr/overtime/3/approve', 'POST', {}, 403)
    await request('chief', '/hr/overtime/1/approve', 'POST', {})
  })
  await check('Validator: lot mixt refuzat; validare proprie permisă; închidere globală refuzată', async () => {
    await request('validator', '/hr/timesheets/validate', 'POST', { luna: '2026-10', employee_ids: [1, 3] }, 403)
    await request('validator', '/hr/timesheets/validate', 'POST', { luna: '2026-10', employee_ids: [1] })
    await request('validator', '/hr/timesheets/lock', 'POST', { luna: '2026-10' }, 403)
    await request('employee', '/hr/timesheets', 'POST', { employee_id: 1, data: '2026-10-01', ore_lucrate: 12 }, 409)
  })
  await check('HR global: închidere, refuz scriere în luna închisă și redeschidere', async () => {
    await request('hr', '/hr/timesheets/lock', 'POST', { luna: '2026-10' }, 201)
    await request('employee', '/hr/timesheets', 'POST', { employee_id: 1, data: '2026-10-02', ore_lucrate: 8 }, 409)
    await request('hr', '/hr/timesheets/unlock', 'POST', { luna: '2026-10', motiv: 'Corecție controlată' })
  })
  await check('Concediu: repetarea aprobării este idempotentă și inversarea este refuzată', async () => {
    await request('hr', '/hr/leave-requests/smoke-co/approve', 'POST', {})
    const before = await request('employee', '/hr/employees/1/co-balance?year=2026')
    await request('hr', '/hr/leave-requests/smoke-co/approve', 'POST', {})
    assert.deepEqual(await request('employee', '/hr/employees/1/co-balance?year=2026'), before)
    assert.equal(before.zile_efectuate, 1)
    await request('hr', '/hr/leave-requests/smoke-co/reject', 'POST', {}, 409)
  })
  await check('Superadmin: administrarea globală este disponibilă', async () => {
    const state = await request('admin', '/hr/timesheets/lock?luna=2026-10')
    assert.equal(state.can_manage, true)
  })
  await check('Admin restrâns: fără administrare implicită de șabloane, canale sau WhatsApp', async () => {
    await request('restrictedAdmin', '/documents/smoke-doc-reader')
    await request('restrictedAdmin', '/messaging/channels')
    await request('restrictedAdmin', '/documents/templates', 'GET', undefined, 403)
    await request('restrictedAdmin', '/documents/templates', 'POST', { id: 'DENIED', denumire: 'Interzis' }, 403)
    await request('restrictedAdmin', '/messaging/channels', 'POST', { nume: 'Interzis', tip: 'public' }, 403)
    await request('restrictedAdmin', '/messaging/whatsapp/status', 'GET', undefined, 403)
  })
  await check('Editor autorizat: șablonul poate fi administrat fără rol admin', async () => {
    await request('templateEditor', '/documents/templates', 'POST', { id: 'SMOKE-TEMPLATE', denumire: 'Model verificare', template_html: '<p>Test</p>' })
    const list = await request('templateEditor', '/documents/templates')
    assert.ok(list.templates.some(item => item.id === 'SMOKE-TEMPLATE'))
  })
  await check('Gestionar canale autorizat: creare canal și citire stare WhatsApp fără rol admin', async () => {
    await request('channelManager', '/messaging/channels', 'POST', { nume: 'Verificare canale', tip: 'public' }, 201)
    await request('channelManager', '/messaging/whatsapp/status')
  })
  await check('Documente: cititorul nu aprobă, retrage sau partajează, chiar dacă pasul îi este atribuit', async () => {
    await request('documentReader', '/documents/smoke-doc-reader')
    for (const action of ['approve', 'reject', 'withdraw', 'share', 'launch']) {
      await request('documentReader', `/documents/smoke-doc-reader/${action}`, 'POST', { comment: 'Test' }, 403)
    }
    assert.equal((await request('documentReader', '/documents/smoke-doc-reader')).document.status, 'in_circuit')
  })
  await check('Documente: dreptul general nu permite citirea, PDF, istoricul sau partajarea unui document străin', async () => {
    for (const suffix of ['', '/pdf', '/audit']) await request('documentActor', `/documents/smoke-doc-foreign${suffix}`, 'GET', undefined, 403)
    await request('documentActor', '/documents/smoke-doc-foreign/share', 'POST', { shared_with_user: 'u-employee' }, 403)
  })
  await check('Documente: responsabilul cu drept explicit poate aproba și consulta istoricul', async () => {
    await request('documentActor', '/documents/smoke-doc-actor/approve', 'POST', {})
    const result = await request('documentActor', '/documents/smoke-doc-actor')
    assert.equal(result.steps[0].status, 'aprobat')
    await request('documentActor', '/documents/smoke-doc-actor/audit')
  })
  await check('Documente partajate: accesul expirat este exclus, iar partajările multiple nu dublează documentul', async () => {
    const list = await request('documentActor', '/documents/shared')
    assert.deepEqual(list.documents.map(row => row.uuid), ['smoke-doc-reader'])
  })
  await check('Documente urmărite: urmărirea nu acordă acces și nu poate modifica un document străin', async () => {
    for (const watched of [true, false]) await request('documentActor', '/documents/smoke-doc-foreign/watch', 'POST', { watched }, 403)
    await request('documentActor', '/documents/smoke-doc-reader/watch', 'POST', { watched: true })
    const list = await request('documentActor', '/documents/watched')
    assert.deepEqual(list.documents.map(row => row.uuid), ['smoke-doc-reader'])
    await request('documentActor', '/documents/smoke-doc-reader/watch', 'POST', { watched: false })
    assert.equal((await request('documentActor', '/documents/watched')).documents.length, 0)
  })
  await check('Task din document: crearea proprie rămâne disponibilă fără delegare automată către colegi', async () => {
    const payload = { title: 'Verifică documentul', source_type: 'document', source_id: 'smoke-doc-reader', assigned_to: 'u-documentReader' }
    const created = await request('documentReader', '/tasks', 'POST', payload, 201)
    assert.equal(created.task.assigned_to, 'u-documentReader')
    await request('documentReader', '/tasks', 'POST', { ...payload, assigned_to: 'u-documentActor' }, 403)
  })
  await check('Mesagerie: consultarea nu permite modificare, sincronizare sau compunere', async () => {
    await request('restrictedAdmin', '/messaging/email/inbox')
    await request('restrictedAdmin', '/messaging/whatsapp/inbox')
    await request('restrictedAdmin', '/messaging/email/inbox/910', 'PATCH', { status: 'archived' }, 403)
    await request('restrictedAdmin', '/messaging/whatsapp/inbox/wa-test', 'PATCH', { status: 'archived' }, 403)
    for (const action of ['send', 'drafts', 'sync']) await request('restrictedAdmin', `/messaging/email/${action}`, 'POST', {}, 403)
    const inbox = await request('restrictedAdmin', '/messaging/whatsapp/inbox')
    assert.equal(inbox.messages.find(row => row.id === 'wa-test').status, 'unread')
  })
  await check('Mesagerie: expeditorul autorizat modifică statusul și salvează draft fără expediere externă', async () => {
    await request('messageSender', '/messaging/email/inbox/910', 'PATCH', { status: 'read' })
    await request('messageSender', '/messaging/whatsapp/inbox/wa-test', 'PATCH', { status: 'read' })
    await request('messageSender', '/messaging/email/drafts', 'POST', { subject: 'Draft verificare', body: 'Nu se expediază' }, 201)
  })
  assert.ok(!/scheduler\s+check[A-Za-z]+\s+start/i.test(output), 'Schedulerul a rulat în simulare')
  assert.deepEqual(JSON.parse(fs.readFileSync(database, 'utf8')).settings.rolePermissionOverrides.admin, roles.restrictedAdmin, 'Drepturile adminului restrâns trebuie păstrate după toate scrierile HTTP')
  await check('Drepturile standard persistă la recitirea bazei într-un proces nou', async () => {
    const result = spawnSync(process.execPath, ['-e', "const assert=require('node:assert/strict'); const {readDb}=require('./server/core/db'); Promise.resolve(readDb({fresh:true})).then(db=>assert.deepEqual(db.settings.rolePermissionOverrides.admin,['documents:view_own','messaging:view'])).catch(e=>{console.error(e.message);process.exitCode=1})"], {
      cwd: root, windowsHide: true, encoding: 'utf8', timeout: 30000,
      env: { ...process.env, INFRAFLOW_DB_PROVIDER: 'json', DB_MODE: 'json', INFRAFLOW_DB_FILE: database, INFRAFLOW_SEED_FILE: database, NODE_ENV: 'test' },
    })
    assert.equal(result.status, 0, result.stderr || result.error?.message || 'Recitirea a eșuat')
  })
  console.log(`Simulare HR HTTP: ${checks}/${checks} scenarii trecute. Baza temporară: ${directory}`)
}

main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(async () => {
  if (child && child.exitCode === null) {
    const stopped = new Promise(resolve => child.once('exit', resolve))
    child.kill()
    await stopped
  }
})
