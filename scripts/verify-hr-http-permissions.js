'use strict'
// Real authentication and HTTP routes, isolated JSON database, no file uploads.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const { spawn, execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'infraflow-hr-http-'))
const file = path.join(dir, 'db.json')
const password = crypto.randomBytes(24).toString('hex')
const salt = crypto.randomBytes(16).toString('hex')
const passwordHash = `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`
const roles = {
  own: ['dashboard:view', 'hr:view_own', 'hr:timesheet'],
  viewer: ['hr:view'],
  editor: ['hr:view', 'hr:employees_manage'],
  trainer: ['hr:training'],
  trainerPersonal: ['hr:training', 'hr:personal_sensitive'],
  timesheetManager: ['hr:view', 'hr:timesheet', 'hr:timesheet_approve', 'hr:timesheets_manage'],
}
const db = { settings: { setupCompleted: true, customRoles: Object.entries(roles).map(([id, permissions]) => ({ id, name: id, permissions })) }, users: Object.keys(roles).map(id => ({ id, username: id, role: id, active: true, passwordHash, ...(id === 'own' ? { department_id: 'd1', email: 'own@example.test' } : {}) })), departments: [{ id: 'd1', cod: 'D1', name: 'Test' }], hr: { employees: [{ id: 1, user_id: 'own', nume: 'Propriu', activ: true, department_id: 'd1', cnp: 'secret-own', salariu_baza: 1234 }, { id: 2, user_id: 'other', nume: 'Colegul', activ: true, department_id: 'd1', cnp: 'secret-other', salariu_baza: 5678 }], timeSheets: [], timesheetDepartments: [], contracts: [], leaveRequests: [] } }
// Normalization promotes the first account when no superadmin exists.
db.users.push({ id: 'test-admin', username: 'test-admin', role: 'superadmin', active: true, passwordHash })
db.users.push(...[{ id: 'link-free', active: true }, { id: 'link-inactive', active: false }, { id: 'link-reverse', active: true, employee_id: '99' }].map(user => ({ ...user, username: user.id, role: 'viewer', passwordHash })))
fs.writeFileSync(file, JSON.stringify(db))
const port = 47000 + crypto.randomInt(1000)
const base = `http://127.0.0.1:${port}`
const mssql = process.argv.includes('--mssql')
const database = `INFRAFLOW_TEST_PERMISSIONS_${crypto.randomBytes(6).toString('hex').toUpperCase()}`
if (mssql) {
  assert.match(database, /^INFRAFLOW_TEST_PERMISSIONS_[A-F0-9]{12}$/)
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
    $ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Data;
    $c=New-Object System.Data.SqlClient.SqlConnection('Server=.\\SQLEXPRESS;Database=master;Integrated Security=True;TrustServerCertificate=True;Connect Timeout=5');
    try { $c.Open(); $q=$c.CreateCommand(); $q.CommandText='CREATE DATABASE [${database}]'; [void]$q.ExecuteNonQuery() } finally { $c.Dispose() }
  `], { stdio: 'pipe', timeout: 15000 })
  console.log(`Bază MSSQL nouă izolată: ${database}; mod app_state, nu HR relațional.`)
}
let logs = ''
const child = spawn(process.execPath, [path.join(root, 'server/app.js')], { cwd: root, env: { ...process.env, APP_KEY: crypto.randomBytes(32).toString('hex'), INFRAFLOW_DB_PROVIDER: mssql ? 'mssql' : 'json', DB_MODE: mssql ? 'mssql' : 'json', ...(mssql ? { DB_SERVER: '.\\SQLEXPRESS', DB_DATABASE: database, DB_TRUSTED_CONNECTION: '1', DB_ENCRYPT: 'false', INFRAFLOW_SQL_RELATIONAL: '0', INFRAFLOW_DISABLE_APP_STATE_RECOVERY: '1' } : {}), INFRAFLOW_DB_FILE: file, INFRAFLOW_HOST: '127.0.0.1', PORT: String(port), INFRAFLOW_PORT: String(port), INFRAFLOW_SCHEDULER_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
child.stdout.on('data', data => { logs += data })
child.stderr.on('data', data => { logs += data })
async function request(url, token, method = 'GET', body) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) })
  return { status: res.status, data: await res.json() }
}
async function main() {
  try {
    let ready = false
    for (let i = 0; i < (mssql ? 300 : 75); i++) {
      try { ready = (await request('/api/health')).status === 200 } catch {}
      if (ready) break
      await new Promise(resolve => setTimeout(resolve, 400))
    }
    assert.ok(ready, 'Serverul izolat nu a pornit')
    const adminLogin = await request('/api/login', null, 'POST', { username: 'test-admin', password })
    assert.equal(adminLogin.status, 200)
    const tokens = {}
    for (const username of Object.keys(roles)) {
      const login = await request('/api/login', null, 'POST', { username, password })
      assert.equal(login.status, 200, `login ${username}`)
      assert.ok(login.data.token)
      assert.ok(!login.data.permissions.includes('hr:manage'), `Rolul ${username} a primit hr:manage la autentificare`)
      tokens[username] = login.data.token
    }
    assert.equal((await request('/api/hr/employees')).status, 401)
    const own = await request('/api/hr/employees', tokens.own)
    assert.equal(own.status, 200)
    assert.deepEqual(own.data.map(row => row.id), [1])
    const viewer = await request('/api/hr/employees', tokens.viewer)
    assert.equal(viewer.status, 200)
    assert.equal(viewer.data.length, 2)
    assert.equal(viewer.data[1].cnp, undefined)
    assert.equal(viewer.data[1].salariu_baza, undefined)
    const before = (await request('/api/hr/employees', adminLogin.data.token)).data
    for (const [url, method, body] of [
      ['/api/hr/employees/2', 'PATCH', { user_id: 'editor' }],
      ['/api/hr/employees/2', 'PATCH', { salariu_baza: 1 }],
      ['/api/hr/reges/history', 'GET'],
      ['/api/hr/linkable-users', 'GET'],
    ]) assert.equal((await request(url, tokens.editor, method, body)).status, 403, url)
    assert.deepEqual((await request('/api/hr/employees', adminLogin.data.token)).data, before)
    if (process.argv.includes('--ui')) await verifyBrowser(tokens)
    if (process.argv.includes('--links')) await verifyLinks(adminLogin.data.token)
    if (process.argv.includes('--training')) await verifyTraining(tokens)
    if (process.argv.includes('--timesheet')) await verifyTimesheet(tokens)
    assert.ok(!/scheduler\s+check[A-Za-z]+\s+start/i.test(logs))
    console.log(`OK: autentificare reală, acces propriu, sanitizare și 4 refuzuri HTTP fără modificarea angajaților. Provider ${mssql ? 'MSSQL app_state izolat (HR relațional nevalidat)' : 'JSON izolat'}. UI real: ${process.argv.includes('--ui') ? 'verificat' : 'neexecutat'}.`)
  } finally {
    child.kill()
    await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve) })
    // Keep the temporary evidence database; never remove any active workspace data.
  }
}
async function verifyTimesheet(tokens) {
  const department = await request('/api/hr/timesheets/my-department?luna=2026-10', tokens.own)
  assert.equal(department.status, 200)
  assert.deepEqual(department.data.employees.map(employee => employee.id), [1])
  const overview = await request('/api/hr/timesheets/overview?luna=2026-10', tokens.timesheetManager)
  assert.equal(overview.status, 200)
  assert.ok(overview.data.some(item => String(item.department_cod).toLowerCase() === 'd1'))
  const reminder = await request('/api/hr/timesheets/send-reminder', tokens.timesheetManager, 'POST', { luna: '2026-10', deadline_date: '2026-10-31' })
  assert.equal(reminder.status, 200)
  assert.equal(reminder.data.sent, 1)
  assert.equal((await request('/api/hr/timesheets/send-reminder', tokens.timesheetManager, 'POST', { luna: '2026-13' })).status, 422)
  const notifications = await request('/api/notifications', tokens.own)
  assert.equal(notifications.status, 200)
  const persisted = notifications.data.notifications.find(item => item.type === 'hr_timesheet_reminder')
  assert.ok(persisted)
  assert.equal(persisted.targetView, '/hr?section=pontaj')
  console.log('OK pontaj HTTP real: aria proprie, overview, reminder persistent, lună invalidă refuzată și deep-link expus.')
}
async function verifyTraining(tokens) {
  assert.equal((await request('/api/hr/training', tokens.trainer)).status, 200)
  const course = await request('/api/hr/training', tokens.trainer, 'POST', { denumire: 'SSM API test', tip: 'SSM', data_start: '2026-10-11' })
  assert.equal(course.status, 201)
  assert.ok(course.data.id)
  assert.equal((await request('/api/hr/training/scadentar', tokens.trainer)).status, 403)
  assert.equal((await request(`/api/hr/training/${course.data.id}/employees`, tokens.trainer, 'POST', { employee_ids: [1] })).status, 403)
  const before = await request('/api/hr/training/scadentar', tokens.trainerPersonal)
  assert.equal(before.status, 200)
  const missingCourse = await request('/api/hr/training/999999/employees', tokens.trainerPersonal, 'POST', { employee_ids: [1] })
  assert.equal(missingCourse.status, 404)
  assert.equal(missingCourse.data.code, 'HR_TRAINING_NOT_FOUND')
  const mixed = await request(`/api/hr/training/${course.data.id}/employees`, tokens.trainerPersonal, 'POST', { employee_ids: [1, 999999] })
  assert.equal(mixed.status, 422)
  assert.equal(mixed.data.code, 'HR_TRAINING_EMPLOYEE_NOT_FOUND')
  const enrolled = await request(`/api/hr/training/${course.data.id}/employees`, tokens.trainerPersonal, 'POST', { employee_ids: [1, '1', 2] })
  assert.equal(enrolled.status, 200)
  assert.equal(enrolled.data.added, 2)
  const repeated = await request(`/api/hr/training/${course.data.id}/employees`, tokens.trainerPersonal, 'POST', { employee_ids: [1, 2] })
  assert.equal(repeated.status, 200)
  assert.equal(repeated.data.added, 0)
  assert.equal((await request('/api/hr/training/scadentar', tokens.trainerPersonal)).status, 200)
  console.log('OK instruiri HTTP reale: rol dedicat, protecție date personale, lot invalid refuzat, înscriere și repetare idempotentă.')
}
async function verifyLinks(token) {
  const snapshot = (await request('/api/hr/employees', token)).data
  for (const [user_id, status, code] of [
    ['link-missing', 422, 'HR_USER_NOT_FOUND'],
    ['link-inactive', 422, 'HR_USER_INACTIVE'],
    ['link-reverse', 409, 'HR_USER_ALREADY_LINKED'],
    ['own', 409, 'HR_USER_ALREADY_LINKED'],
  ]) {
    for (const [url, method] of [['/api/hr/employees', 'POST'], ['/api/hr/employees/2', 'PATCH']]) {
      const result = await request(url, token, method, { nume: 'Test', user_id })
      assert.equal(result.status, status, `${method} ${user_id}`)
      assert.equal(result.data.code, code)
    }
  }
  assert.deepEqual((await request('/api/hr/employees', token)).data, snapshot)
  const created = await request('/api/hr/employees', token, 'POST', { nume: 'Legatura', prenume: 'Test', user_id: 'link-free' })
  assert.equal(created.status, 201)
  const login = await request('/api/login', null, 'POST', { username: 'link-free', password })
  assert.equal(login.status, 200)
  assert.equal(String(login.data.user.employee_id), String(created.data.id))
  const unlinked = await request(`/api/hr/employees/${created.data.id}`, token, 'PATCH', { user_id: '' })
  assert.equal(unlinked.status, 200)
  const relogin = await request('/api/login', null, 'POST', { username: 'link-free', password })
  assert.equal(relogin.status, 200)
  assert.ok(!relogin.data.user.employee_id)
  console.log('OK legături HTTP reale: 8 refuzuri fără modificarea angajaților, creare și dezasociere, legătură inversă verificată prin login.')
}
async function verifyBrowser(tokens) {
  const { chromium } = require(process.env.INFRAFLOW_PLAYWRIGHT_MODULE || 'playwright')
  const http = require('node:http')
  const dist = process.env.INFRAFLOW_UI_DIST || path.join(root, 'client/.permission-build-check-5')
  const proxy = http.createServer(async (req, res) => {
    if (req.url.startsWith('/api/')) {
      try {
        const upstream = await fetch(base + req.url, { headers: { authorization: req.headers.authorization || '' }, signal: AbortSignal.timeout(10000) })
        res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' })
        res.end(Buffer.from(await upstream.arrayBuffer()))
      } catch { res.writeHead(502); res.end('{}') }
      return
    }
    const requested = path.resolve(dist, '.' + new URL(req.url, base).pathname)
    if (!requested.startsWith(dist + path.sep) && requested !== dist) { res.writeHead(403); res.end(); return }
    const artifact = fs.existsSync(requested) && fs.statSync(requested).isFile() ? requested : path.join(dist, 'index.html')
    res.setHeader('Content-Type', ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html' })[path.extname(artifact)] || 'application/octet-stream')
    fs.createReadStream(artifact).pipe(res)
  })
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const url = `http://127.0.0.1:${proxy.address().port}`
    for (const name of ['own', 'viewer']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
      await context.addInitScript(token => localStorage.setItem('infraflow_token', token), tokens[name])
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      const employeeResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/hr/employees')
      await page.goto(url + '/hr')
      const employees = await (await employeeResponse).json()
      await page.waitForSelector('.hr-navigation')
      await page.getByText('Se incarca...', { exact: true }).waitFor({ state: 'hidden' })
      if (name === 'own') {
        await page.getByText('Propriu', { exact: true }).waitFor()
        assert.equal(await page.getByText('Colegul', { exact: true }).count(), 0)
      }
      assert.equal(employees.length, name === 'own' ? 1 : 2)
      if (name === 'viewer') assert.equal(employees[1].cnp, undefined)
      assert.equal(await page.getByText('Asistent HR', { exact: true }).count(), 0)
      assert.equal(await page.getByRole('button', { name: /Angajat nou/ }).count(), 0)
      if (name === 'own') assert.equal((await page.locator('.hr-navigation').innerText()).trim(), 'Pontaj')
      await page.screenshot({ path: path.join(dir, `${name}-real-api.png`), fullPage: true })
      await page.goto(url + '/crm/oferte')
      await page.getByText('Acces restricționat', { exact: true }).waitFor()
      assert.deepEqual(errors, [])
      await context.close()
    }
    for (const name of ['trainer', 'trainerPersonal']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
      await context.addInitScript(token => localStorage.setItem('infraflow_token', token), tokens[name])
      const page = await context.newPage()
      const errors = []
      const apiPaths = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('request', request => {
        const pathname = new URL(request.url()).pathname
        if (pathname.startsWith('/api/')) apiPaths.push(pathname)
      })
      await page.goto(url + '/hr')
      await page.waitForSelector('.hr-navigation')
      const trainingTab = page.getByRole('button', { name: 'Training & Evaluări', exact: true })
      await trainingTab.waitFor()
      await trainingTab.click()
      if (name === 'trainer') {
        await page.getByText('Scadențarul nominal necesită acces la date personale HR.', { exact: true }).waitFor()
        assert.equal(apiPaths.includes('/api/hr/training/scadentar'), false)
      } else {
        await page.getByText(/Scadențar cursuri obligatorii/).waitFor()
        assert.equal(apiPaths.includes('/api/hr/training/scadentar'), true)
      }
      await page.getByText('Evaluările individuale necesită acces la date personale HR.', { exact: true }).waitFor()
      assert.equal(apiPaths.includes('/api/hr/evaluations'), false)
      assert.equal(await page.getByRole('button', { name: '+ Evaluare nouă', exact: true }).count(), 0)
      assert.deepEqual(errors, [])
      await page.screenshot({ path: path.join(dir, `${name}-training-real-api.png`), fullPage: true })
      await context.close()
    }
    if (process.argv.includes('--timesheet')) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
      await context.addInitScript(token => localStorage.setItem('infraflow_token', token), tokens.timesheetManager)
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(url + '/hr?section=pontaj')
      await page.waitForSelector('.hr-navigation')
      const pontajTab = page.getByRole('button', { name: 'Pontaj', exact: true })
      await pontajTab.waitFor()
      assert.match(await pontajTab.getAttribute('class'), /ui-button-primary/)
      await page.getByText(/Pontaj 2026-/).first().waitFor()
      assert.deepEqual(errors, [])
      await page.screenshot({ path: path.join(dir, 'timesheet-deep-link-real-api.png'), fullPage: true })
      await context.close()
    }
    console.log(`OK browser/API real: patru roluri, liste filtrate, instruiri protejate, CRM blocat, fără erori JavaScript. Capturi: ${dir}`)
  } finally {
    if (browser) await browser.close()
    await new Promise(resolve => proxy.close(resolve))
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
