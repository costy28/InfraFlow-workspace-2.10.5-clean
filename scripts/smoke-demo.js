/**
 * Smoke test pentru instanta demo InfraFlow.
 * Rulare: node scripts/smoke-demo.js [http://localhost:4190]
 */
const http = require('http')
const https = require('https')

const BASE_URL = (process.argv[2] || process.env.DEMO_BASE_URL || 'http://localhost:4190').replace(/\/+$/, '')
const USERNAME = process.env.DEMO_USERNAME || 'demo'
const PASSWORD = process.env.DEMO_PASSWORD || 'demo123'

const checks = []

function addCheck(name, ok, details = '') {
  checks.push({ name, ok, details })
  const marker = ok ? 'OK ' : 'ERR'
  console.log(`[${marker}] ${name}${details ? ` - ${details}` : ''}`)
}

function request(method, pathname, options = {}) {
  const url = new URL(pathname, BASE_URL)
  const payload = options.body ? JSON.stringify(options.body) : null
  const headers = {
    Accept: 'application/json',
    ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
  }
  const transport = url.protocol === 'https:' ? https : http

  return new Promise((resolve, reject) => {
    const req = transport.request(url, { method, headers, timeout: 10_000 }, (res) => {
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { raw += chunk })
      res.on('end', () => {
        let data = raw
        try { data = raw ? JSON.parse(raw) : null } catch {}
        resolve({ status: res.statusCode, data, raw })
      })
    })
    req.on('timeout', () => {
      req.destroy(new Error(`Timeout la ${method} ${url.href}`))
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

function countFrom(data, keys) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key].length
  }
  if (Array.isArray(data)) return data.length
  return 0
}

async function main() {
  console.log(`InfraFlow demo smoke test: ${BASE_URL}`)

  const demoStatus = await request('GET', '/api/demo-status')
  addCheck('/api/demo-status', demoStatus.status === 200 && demoStatus.data?.demo === true, `status=${demoStatus.status}, demo=${demoStatus.data?.demo}`)

  const health = await request('GET', '/api/system/health')
  addCheck('/api/system/health mode=json', health.status === 200 && health.data?.mode === 'json', `status=${health.status}, mode=${health.data?.mode}`)

  const root = await request('GET', '/')
  addCheck('pagina login se incarca', root.status === 200 && String(root.raw || '').includes('InfraFlow'), `status=${root.status}`)
  addCheck('banner DEMO in HTML', String(root.raw || '').includes('DEMO - Date fictive'), '')

  const login = await request('POST', '/api/login', { body: { username: USERNAME, password: PASSWORD } })
  addCheck(`login ${USERNAME}`, login.status === 200 && Boolean(login.data?.token), `status=${login.status}, user=${login.data?.user?.username || '-'}`)
  const token = login.data?.token
  if (!token) throw new Error('Login demo fara token; opresc testul.')

  const session = await request('GET', '/api/session', { token })
  addCheck('/api/session', session.status === 200 && session.data?.user?.username === USERNAME, `status=${session.status}`)

  const materials = await request('GET', '/api/materials', { token })
  const materialCount = countFrom(materials.data, ['materials'])
  addCheck('/api/materials >= 30', materials.status === 200 && materialCount >= 30, `status=${materials.status}, count=${materialCount}`)

  const fleet = await request('GET', '/api/fleet-assets', { token })
  const fleetCount = countFrom(fleet.data, ['assets', 'fleetAssets'])
  addCheck('/api/fleet-assets >= 20', fleet.status === 200 && fleetCount >= 20, `status=${fleet.status}, count=${fleetCount}`)

  const notifications = await request('GET', '/api/notifications', { token })
  const notificationCount = countFrom(notifications.data, ['notifications'])
  addCheck('/api/notifications raspunde', notifications.status === 200, `status=${notifications.status}, count=${notificationCount}`)

  const fleetAlerts = await request('GET', '/api/fleet-alerts', { token })
  const fleetAlertCount = countFrom(fleetAlerts.data, ['alerts'])
  addCheck('/api/fleet-alerts are alerte demo', fleetAlerts.status === 200 && fleetAlertCount > 0, `status=${fleetAlerts.status}, count=${fleetAlertCount}`)

  const tripLogs = await request('GET', '/api/fleet/trip-logs', { token })
  const tripLogCount = countFrom(tripLogs.data, ['trip_logs'])
  addCheck('/api/fleet/trip-logs >= 30', tripLogs.status === 200 && tripLogCount >= 30, `status=${tripLogs.status}, count=${tripLogCount}`)

  const hrStats = await request('GET', '/api/hr/stats', { token })
  addCheck('/api/hr/stats are 15 angajati', hrStats.status === 200 && Number(hrStats.data?.total_angajati || 0) >= 15, `status=${hrStats.status}, total=${hrStats.data?.total_angajati}`)

  const referateStats = await request('GET', '/api/referate/stats', { token })
  addCheck('/api/referate/stats are referate', referateStats.status === 200 && Number(referateStats.data?.total || 0) >= 5, `status=${referateStats.status}, total=${referateStats.data?.total}`)

  const procurementOrders = await request('GET', '/api/procurement-orders', { token })
  const procurementOrderCount = countFrom(procurementOrders.data, ['orders'])
  addCheck('/api/procurement-orders >= 10', procurementOrders.status === 200 && procurementOrderCount >= 10, `status=${procurementOrders.status}, count=${procurementOrderCount}`)

  const controllingDashboard = await request('GET', '/api/controlling/dashboard', { token })
  addCheck('/api/controlling/dashboard are buget', controllingDashboard.status === 200 && Number(controllingDashboard.data?.total_buget || 0) > 0, `status=${controllingDashboard.status}, buget=${controllingDashboard.data?.total_buget}, real=${controllingDashboard.data?.total_real}`)

  const summary = {
    passed: checks.filter((item) => item.ok).length,
    failed: checks.filter((item) => !item.ok).length,
    total: checks.length
  }
  console.log(`Rezultat: ${summary.passed}/${summary.total} checks OK`)
  if (summary.failed) process.exit(1)
}

main().catch((error) => {
  console.error('[ERR] Smoke test esuat:', error.message)
  process.exit(1)
})
