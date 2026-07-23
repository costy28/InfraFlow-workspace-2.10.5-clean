#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const version = require(path.join(root, 'package.json')).version
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'infraflow-smoke-'))
const dbFile = path.join(tempDir, 'app-db.json')
const port = Number(process.env.SMOKE_PORT || (45680 + Math.floor(Math.random() * 700)))
const baseUrl = `http://127.0.0.1:${port}`
const username = process.env.SMOKE_USERNAME || 'admin'
const password = process.env.SMOKE_PASSWORD || `smoke-${crypto.randomBytes(12).toString('hex')}`
const month = process.env.SMOKE_MONTH || '2026-07'

const checks = []
let child = null
let serverOutput = ''

function hashPassword(value) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(value, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

function prepareDatabase() {
  const seedPath = path.join(root, 'data', 'app-db.seed.json')
  const db = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
  db.users = Array.isArray(db.users) ? db.users : []
  let user = db.users.find(item => String(item.username || '').toLowerCase() === username.toLowerCase())
  if (!user) {
    user = {
      id: `smoke-user-${Date.now()}`,
      username,
      name: 'Smoke Superadmin',
      role: 'superadmin',
      active: true,
      created_at: new Date().toISOString(),
    }
    db.users.push(user)
  }
  user.role = 'superadmin'
  user.active = true
  user.passwordHash = hashPassword(password)
  delete user.password
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2))
}

function spawnServer() {
  child = spawn(process.execPath, [path.join(root, 'server', 'src', 'server.js')], {
    cwd: root,
    env: {
      ...process.env,
      APP_KEY: process.env.APP_KEY || 'infraflow-smoke-local-key',
      DB_MODE: 'json',
      INFRAFLOW_DB_PROVIDER: 'json',
      INFRAFLOW_DB_FILE: dbFile,
      INFRAFLOW_PORT: String(port),
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', data => { serverOutput += data })
  child.stderr.on('data', data => { serverOutput += data })
}

async function waitForHealth(timeoutMs = 30_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/system/health`)
      if (response.ok) {
        const data = await response.json()
        if (data?.ok) return data
      }
    } catch {}
    await delay(400)
  }
  throw new Error(`Serverul nu a raspuns la /api/system/health in ${Math.round(timeoutMs / 1000)}s.`)
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function request(pathname, options = {}) {
  const method = options.method || 'GET'
  const payload = options.body ? JSON.stringify(options.body) : null
  const headers = {
    Accept: 'application/json',
    ...(payload ? { 'Content-Type': 'application/json' } : {}),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
  }
  const response = await fetch(`${baseUrl}${pathname}`, { method, headers, body: payload })
  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()
  let data = text
  try { data = text ? JSON.parse(text) : null } catch {}
  return { status: response.status, contentType, data, text }
}

function countFrom(data, keys = []) {
  if (Array.isArray(data)) return data.length
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key].length
  }
  return 0
}

function addCheck(name, ok, details = '') {
  checks.push({ name, ok, details })
  const marker = ok ? 'OK ' : 'ERR'
  console.log(`[${marker}] ${name}${details ? ` - ${details}` : ''}`)
}

async function checkEndpoint(token, item) {
  const response = await request(item.path, { token })
  const statusOk = item.statuses ? item.statuses.includes(response.status) : response.status === 200
  let validateOk = statusOk
  let details = `status=${response.status}`
  if (statusOk && item.validate) {
    try {
      validateOk = Boolean(item.validate(response.data, response))
    } catch (error) {
      validateOk = false
      details += `, validate=${error.message}`
    }
  }
  if (statusOk && item.countKeys) details += `, count=${countFrom(response.data, item.countKeys)}`
  addCheck(item.name, statusOk && validateOk, details)
}

const endpointChecks = [
  { name: 'core /api/session', path: '/api/session', validate: data => data?.user?.username === username },
  { name: 'core /api/settings', path: '/api/settings', validate: data => Boolean(data?.settings || data?.companyName || data?.company) },
  { name: 'core /api/settings/modules/catalog', path: '/api/settings/modules/catalog', validate: data => Array.isArray(data?.catalog?.groups) && Array.isArray(data?.catalog?.packages) },
  { name: 'core /api/settings/country-profiles', path: '/api/settings/country-profiles', validate: data => Array.isArray(data?.countries) && data.countries.some(item => item.code === 'RO') },
  { name: 'core /api/settings/country-rules', path: '/api/settings/country-rules', validate: data => data?.current?.country === 'RO' && Boolean(data?.current?.rules?.modules?.accounting) },
  { name: 'core /api/system/version', path: '/api/system/version', validate: data => Boolean(data?.version || data?.appVersion) },
  { name: 'core /api/system/update/status', path: '/api/system/update/status', validate: data => data?.ok === true && Boolean(data?.version) && typeof data?.restart === 'object' },
  { name: 'core /api/departments', path: '/api/departments', countKeys: ['departments'] },
  { name: 'core /api/users', path: '/api/users', countKeys: ['users'] },
  { name: 'core /api/roles/permissions-catalog', path: '/api/roles/permissions-catalog', validate: data => Array.isArray(data) ? data.length > 0 : Boolean(data?.groups || data?.permissions || data?.catalog) },

  { name: 'HR /api/hr/stats', path: '/api/hr/stats', validate: data => typeof data === 'object' && data !== null },
  { name: 'HR /api/hr/employees', path: '/api/hr/employees', countKeys: ['employees'] },
  { name: 'HR /api/hr/timesheets', path: `/api/hr/timesheets?luna=${month}`, countKeys: ['rows', 'timesheets'] },
  { name: 'HR /api/hr/timesheets/overview', path: `/api/hr/timesheets/overview?luna=${month}`, validate: data => typeof data === 'object' && data !== null },
  { name: 'HR /api/hr/leave-requests', path: '/api/hr/leave-requests', countKeys: ['requests', 'leaveRequests'] },
  { name: 'HR /api/hr/medical-leaves/register', path: `/api/hr/medical-leaves/register?luna=${month}`, validate: data => typeof data === 'object' && data !== null },
  { name: 'HR /api/hr/document-templates', path: '/api/hr/document-templates', countKeys: ['templates'] },
  { name: 'HR /api/hr/training/scadentar', path: '/api/hr/training/scadentar', countKeys: ['items', 'scadentar'] },
  { name: 'HR /api/hr/meal-tickets', path: `/api/hr/meal-tickets?luna=${month}`, countKeys: ['rows'] },

  { name: 'Documente /api/documents/templates', path: '/api/documents/templates', countKeys: ['templates'] },
  { name: 'Documente /api/documents/template-catalog', path: '/api/documents/template-catalog', countKeys: ['templates'] },
  { name: 'Documente /api/documents/stats', path: '/api/documents/stats', validate: data => typeof data === 'object' && data !== null },
  { name: 'Documente /api/documents/inbox', path: '/api/documents/inbox', countKeys: ['documents'] },
  { name: 'Task-uri /api/tasks/my-open', path: '/api/tasks/my-open', countKeys: ['tasks'] },
  { name: 'Task-uri /api/tasks/assignees', path: '/api/tasks/assignees', countKeys: ['users'] },
  { name: 'Task-uri /api/tasks/templates', path: '/api/tasks/templates', validate: data => Array.isArray(data?.templates) && data.templates.length >= 5 },
  { name: 'Task-uri /api/tasks/source-types', path: '/api/tasks/source-types', validate: data => Array.isArray(data?.source_types) && data.source_types.some(item => item.value === 'contract') && data.source_types.some(item => item.value === 'email') },
  { name: 'Comunicare /api/messaging/email/categories', path: '/api/messaging/email/categories', validate: data => Array.isArray(data?.categories) && data.categories.some(item => item.id === 'contracte') },
  { name: 'Comunicare /api/messaging/email/inbox', path: '/api/messaging/email/inbox', countKeys: ['emails'], validate: data => Array.isArray(data?.categories) && typeof data?.stats === 'object' },

  { name: 'Contabilitate /api/accounting/summary', path: `/api/accounting/summary?luna=${month}`, validate: data => Boolean(data?.period) },
  { name: 'Contabilitate /api/accounting/health', path: `/api/accounting/health?luna=${month}`, validate: data => Boolean(data?.status && data?.counts) },
  { name: 'Contabilitate /api/accounting/chart', path: '/api/accounting/chart', countKeys: ['accounts', 'chart'] },
  { name: 'Contabilitate /api/accounting/third-parties', path: '/api/accounting/third-parties', countKeys: ['thirdParties', 'parties'] },
  { name: 'Contabilitate /api/accounting/declarations/readiness', path: `/api/accounting/declarations/readiness?perioada=${month}`, validate: data => typeof data === 'object' && data !== null },

  { name: 'Achiziții /api/paap', path: '/api/paap?an=2026', countKeys: ['items', 'paap'] },
  { name: 'Achiziții /api/paap/raport', path: '/api/paap/raport?an=2026', validate: (_data, response) => response.contentType.includes('spreadsheetml.sheet') && response.text.length > 100 },
  { name: 'Referate /api/referate/stats', path: '/api/referate/stats', validate: data => typeof data === 'object' && data !== null },
  { name: 'Referate /api/referate', path: '/api/referate', countKeys: ['referate'] },
  { name: 'Procurement /api/procurement-orders', path: '/api/procurement-orders', countKeys: ['orders'] },

  { name: 'Gestiune /api/materials', path: '/api/materials', countKeys: ['materials'] },
  { name: 'Gestiune /api/stock-operations', path: '/api/stock-operations', countKeys: ['operations', 'stockOperations'] },
  { name: 'Gestiune /api/gestiune/dashboard', path: '/api/gestiune/dashboard', validate: data => typeof data === 'object' && data !== null },

  { name: 'Mecanizare /api/fleet-assets', path: '/api/fleet-assets', countKeys: ['assets', 'fleetAssets'] },
  { name: 'Mecanizare /api/mechanization/dashboard', path: '/api/mechanization/dashboard', validate: data => typeof data === 'object' && data !== null },
  { name: 'Mecanizare /api/fleet/trip-logs', path: '/api/fleet/trip-logs', countKeys: ['trip_logs', 'logs'] },
  { name: 'Mecanizare /api/fleet/faz', path: '/api/fleet/faz', countKeys: ['rows', 'faz'] },

  { name: 'Producție /api/recipes', path: '/api/recipes', countKeys: ['recipes'] },
  { name: 'Producție /api/consumptions', path: '/api/consumptions', countKeys: ['consumptions'] },
  { name: 'Tehnic /api/technical/report', path: '/api/technical/report', validate: data => typeof data === 'object' && data !== null },
  { name: 'Controlling /api/controlling/cost-centers', path: '/api/controlling/cost-centers', validate: data => Array.isArray(data) },
  { name: 'Controlling /api/controlling/cost-centers/link-options', path: '/api/controlling/cost-centers/link-options', validate: data => typeof data === 'object' && Array.isArray(data.assets) },
  { name: 'Controlling /api/controlling/dashboard', path: '/api/controlling/dashboard', validate: data => typeof data === 'object' && data !== null },
  { name: 'Contracte /api/contracts/dashboard', path: '/api/contracts/dashboard', validate: data => typeof data === 'object' && Number.isFinite(Number(data?.contracts_total)) },
  { name: 'Contracte /api/contracts', path: '/api/contracts', countKeys: ['contracts'] },
  { name: 'Contracte /api/contracts/tasks', path: '/api/contracts/tasks', countKeys: ['tasks'] },
  { name: 'Contracte /api/contracts/linkable-sources', path: '/api/contracts/linkable-sources', countKeys: ['sources'] },
  { name: 'Contracte /api/contracts/portfolio/print', path: '/api/contracts/portfolio/print', validate: (_data, response) => response.contentType.includes('text/html') && response.text.includes('Raport portofoliu contracte') },
  { name: 'Contracte /api/contracts/portfolio/export.xlsx', path: '/api/contracts/portfolio/export.xlsx', validate: (_data, response) => response.contentType.includes('spreadsheetml.sheet') && response.text.length > 100 },

  { name: 'ANAF /api/anaf/settings', path: '/api/anaf/settings', validate: data => typeof data === 'object' && data !== null },
  { name: 'ANAF /api/anaf/invoices', path: '/api/anaf/invoices', countKeys: ['invoices'] },

  { name: 'Servicii /api/sanitation/zones', path: '/api/sanitation/zones', countKeys: ['zones'] },
  { name: 'Servicii /api/traffic-safety/map-data', path: '/api/traffic-safety/map-data', validate: data => typeof data === 'object' && data !== null },
  { name: 'Servicii /api/environment/alerts', path: '/api/environment/alerts', countKeys: ['alerts'] },
  { name: 'Servicii /api/snow-removal/dashboard', path: '/api/snow-removal/dashboard', validate: data => typeof data === 'object' && data !== null },
]

async function main() {
  console.log(`InfraFlow module smoke read-only — v${version}`)
  console.log(`Baza temporara: ${dbFile}`)
  prepareDatabase()
  spawnServer()

  try {
    const health = await waitForHealth()
    addCheck('public /api/system/health', health.ok === true && health.mode === 'json', `mode=${health.mode}`)

    const login = await request('/api/login', { method: 'POST', body: { username, password } })
    const token = login.data?.token
    addCheck(`login ${username}`, login.status === 200 && Boolean(token), `status=${login.status}, role=${login.data?.user?.role || '-'}`)
    if (!token) throw new Error('Autentificarea smoke nu a returnat token.')

    for (const item of endpointChecks) {
      await checkEndpoint(token, item)
    }

    const failed = checks.filter(check => !check.ok)
    if (failed.length) {
      const error = new Error(`Smoke suite esuata: ${failed.length}/${checks.length} verificari au picat.`)
      error.failed = failed
      throw error
    }

    console.log(JSON.stringify({
      ok: true,
      version,
      checks: checks.length,
      baseUrl,
      database: dbFile,
      server_output_tail: serverOutput.slice(-600),
    }, null, 2))
  } finally {
    if (child && !child.killed) child.kill()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

main().catch(error => {
  if (error.failed) {
    console.error('\nVerificari esuate:')
    for (const item of error.failed) console.error(`- ${item.name}: ${item.details}`)
  }
  if (serverOutput) console.error(`\nServer output tail:\n${serverOutput.slice(-1200)}`)
  console.error(error.stack || error.message)
  process.exitCode = 1
})
