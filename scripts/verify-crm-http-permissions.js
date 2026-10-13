'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'infraflow-crm-http-'))
const seedFile = path.join(evidenceDir, 'seed.json')
const database = `INFRAFLOW_DEMO_PERMISSIONS_${crypto.randomBytes(6).toString('hex').toUpperCase()}`
assert.match(database, /^INFRAFLOW_DEMO_PERMISSIONS_[A-F0-9]{12}$/)

const password = crypto.randomBytes(24).toString('hex')
const salt = crypto.randomBytes(16).toString('hex')
const passwordHash = `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`
const roles = {
  crmViewer: ['crm:view'],
  crmCreator: ['crm:view', 'crm:lead_create', 'crm:quote_create'],
  crmLeadManager: ['crm:view', 'crm:lead_manage'],
}
const seed = {
  settings: {
    setupCompleted: true,
    demo_profile: 'commercial-mssql',
    modules_enabled: ['crm'],
    license: { modules: ['all'] },
    customRoles: Object.entries(roles).map(([id, permissions]) => ({ id, name: id, permissions })),
  },
  users: [
    ...Object.keys(roles).map(id => ({ id, username: id, role: id, active: true, passwordHash })),
    { id: 'crm-admin', username: 'crm-admin', role: 'superadmin', active: true, passwordHash },
  ],
  departments: [],
  audit: [],
}
fs.writeFileSync(seedFile, JSON.stringify(seed))

execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
  $ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Data;
  $c=New-Object System.Data.SqlClient.SqlConnection('Server=.\\SQLEXPRESS;Database=master;Integrated Security=True;TrustServerCertificate=True;Connect Timeout=5');
  try { $c.Open(); $q=$c.CreateCommand(); $q.CommandText='CREATE DATABASE [${database}]'; [void]$q.ExecuteNonQuery() } finally { $c.Dispose() }
`], { stdio: 'pipe', timeout: 15000 })

const port = 48000 + crypto.randomInt(1000)
const base = `http://127.0.0.1:${port}`
let logs = ''
const child = spawn(process.execPath, [path.join(root, 'server/app.js')], {
  cwd: root,
  env: {
    ...process.env,
    APP_KEY: crypto.randomBytes(32).toString('hex'),
    INFRAFLOW_DB_PROVIDER: 'mssql',
    DB_MODE: 'mssql',
    DB_SERVER: '.\\SQLEXPRESS',
    DB_DATABASE: database,
    DB_TRUSTED_CONNECTION: '1',
    DB_ENCRYPT: 'false',
    INFRAFLOW_DB_FILE: seedFile,
    // CRM are bootstrap separat, idempotent. Restul migrărilor relaționale nu
    // sunt necesare acestei probe și ar transforma pornirea într-un test complet
    // de instalare MSSQL, cu durată mult mai mare.
    INFRAFLOW_SQL_RELATIONAL: '0',
    INFRAFLOW_DISABLE_APP_STATE_RECOVERY: '1',
    INFRAFLOW_HOST: '127.0.0.1',
    PORT: String(port),
    INFRAFLOW_PORT: String(port),
    INFRAFLOW_SCHEDULER_DISABLED: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
child.stdout.on('data', value => { logs += value })
child.stderr.on('data', value => { logs += value })

async function request(url, token, method = 'GET', body) {
  const response = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  return { status: response.status, data: await response.json() }
}

async function login(username) {
  const result = await request('/api/login', null, 'POST', { username, password })
  assert.equal(result.status, 200, `login ${username}`)
  return result.data.token
}

async function verifyBrowser(tokens, quoteId, quoteNumber) {
  const { chromium } = require(process.env.INFRAFLOW_PLAYWRIGHT_MODULE || 'playwright')
  const dist = process.env.INFRAFLOW_UI_DIST || path.join(root, 'client/dist')
  const proxy = http.createServer(async (req, res) => {
    if (req.url.startsWith('/api/')) {
      try {
        const upstream = await fetch(base + req.url, { headers: { authorization: req.headers.authorization || '' }, signal: AbortSignal.timeout(15000) })
        res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' })
        res.end(Buffer.from(await upstream.arrayBuffer()))
      } catch { res.writeHead(502); res.end('{}') }
      return
    }
    const pathname = new URL(req.url, base).pathname
    const requested = path.resolve(dist, '.' + pathname)
    const artifact = requested.startsWith(dist + path.sep) && fs.existsSync(requested) && fs.statSync(requested).isFile() ? requested : path.join(dist, 'index.html')
    res.setHeader('Content-Type', ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html' })[path.extname(artifact)] || 'application/octet-stream')
    fs.createReadStream(artifact).pipe(res)
  })
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const uiBase = `http://127.0.0.1:${proxy.address().port}`
    const viewer = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    await viewer.addInitScript(token => localStorage.setItem('infraflow_token', token), tokens.crmViewer)
    const viewerPage = await viewer.newPage()
    await viewerPage.goto(`${uiBase}/crm/oferte/noua`)
    await viewerPage.getByText('Ai acces la consultarea ofertelor', { exact: false }).waitFor()
    assert.equal(await viewerPage.getByRole('button', { name: 'Salvează draftul' }).count(), 0)
    await viewerPage.screenshot({ path: path.join(evidenceDir, 'crm-viewer-new-denied.png'), fullPage: true })
    await viewerPage.goto(`${uiBase}/crm/oferte/${quoteId}`)
    await viewerPage.getByRole('heading', { name: new RegExp(`^${quoteNumber} / Rev\\.`) }).waitFor()
    assert.equal(await viewerPage.getByRole('button', { name: 'Salvează draftul' }).count(), 0)
    await viewerPage.getByText('Serviciu test CRM', { exact: true }).waitFor()
    await viewerPage.screenshot({ path: path.join(evidenceDir, 'crm-viewer-draft-readonly.png'), fullPage: true })
    await viewer.close()

    const creator = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    await creator.addInitScript(token => localStorage.setItem('infraflow_token', token), tokens.crmCreator)
    const creatorPage = await creator.newPage()
    await creatorPage.goto(`${uiBase}/crm/oferte/noua`)
    await creatorPage.getByRole('button', { name: 'Salvează draftul' }).waitFor()
    await creatorPage.screenshot({ path: path.join(evidenceDir, 'crm-creator-new.png'), fullPage: true })
    await creator.close()
  } finally {
    if (browser) await browser.close()
    await new Promise(resolve => proxy.close(resolve))
  }
}

async function main() {
  try {
    let ready = false
    for (let index = 0; index < 300; index += 1) {
      try { ready = (await request('/api/health')).status === 200 } catch {}
      if (ready) break
      await new Promise(resolve => setTimeout(resolve, 400))
    }
    assert.ok(ready, `Serverul CRM izolat nu a pornit. ${logs.slice(-2000)}`)
    const tokens = {}
    for (const username of [...Object.keys(roles), 'crm-admin']) tokens[username] = await login(username)
    assert.equal((await request('/api/crm/health', tokens.crmViewer)).status, 200)
    assert.equal((await request('/api/crm/leads', tokens.crmViewer)).status, 200)
    assert.equal((await request('/api/crm/leads', tokens.crmViewer, 'POST', { source: 'manual', title: 'Interzis' })).status, 403)
    assert.equal((await request('/api/crm/quotes', tokens.crmViewer, 'POST', {})).status, 403)

    const account = await request('/api/crm/accounts', tokens['crm-admin'], 'POST', { name: 'Client test permisiuni', lifecycle_status: 'prospect' })
    assert.equal(account.status, 201)
    const quote = await request('/api/crm/quotes', tokens.crmCreator, 'POST', {
      title: 'Draft permisiuni CRM',
      account_id: account.data.account.id,
      currency: 'RON',
      issue_date: '2026-10-13',
      lines: [{ item_type: 'service', description: 'Serviciu test CRM', quantity: 1, unit: 'serviciu', unit_price: 100, discount_percent: 0, tax_percent: 0 }],
    })
    assert.equal(quote.status, 201)
    const quoteId = quote.data.quote.id
    const workspace = await request(`/api/crm/quotes/workspace?quote_id=${quoteId}`, tokens.crmViewer)
    assert.equal(workspace.status, 200)
    assert.equal(String(workspace.data.quote.id), String(quoteId))
    assert.equal((await request(`/api/crm/quotes/${quoteId}`, tokens.crmViewer, 'PATCH', { title: 'Interzis' })).status, 403)
    assert.equal((await request(`/api/crm/quotes/${quoteId}/submit-approval`, tokens.crmViewer, 'POST', {})).status, 403)
    const updatedQuote = await request(`/api/crm/quotes/${quoteId}`, tokens.crmCreator, 'PATCH', {
      title: 'Draft actualizat permis', account_id: account.data.account.id, currency: 'RON', issue_date: '2026-10-13',
      lines: [{ item_type: 'service', description: 'Serviciu test CRM', quantity: 1, unit: 'serviciu', unit_price: 100, discount_percent: 0, tax_percent: 0 }],
    })
    assert.equal(updatedQuote.status, 200, `actualizare ofertă: ${JSON.stringify(updatedQuote.data)}\n${logs.slice(-4000)}`)
    assert.equal((await request('/api/crm/accounts', tokens.crmLeadManager, 'POST', { name: 'Prospect permis' })).status, 201)
    assert.equal((await request('/api/crm/quotes', tokens.crmLeadManager, 'POST', {})).status, 403)
    await verifyBrowser(tokens, quoteId, quote.data.quote.quote_number)
    assert.ok(!/scheduler\s+check[A-Za-z]+\s+start/i.test(logs))
    console.log(`OK CRM HTTP/UI: rol viewer read-only, creator ofertă și manager lead separate. Bază păstrată: ${database}. Dovezi: ${evidenceDir}`)
  } finally {
    child.kill()
    await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve) })
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
