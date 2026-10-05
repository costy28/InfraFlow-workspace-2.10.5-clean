
const express = require('express')
const path = require('path')
const fs = require('fs')
const { requireAuth } = require('./core/auth')
const { DB_MODE, ensureDatabase, readDb, writeDb, syncMssqlCpvCodes, getMssqlPool, closeMssqlPool, databaseHealth } = require('./core/db')
const { incarcaLicenta } = require('./core/license')
const { bootstrapCpvCatalog } = require('./modules/nomenclator/service')
const { isIsolatedCommercialDemo, commercialDemoLicense } = require('./shared/commercialDemo')

process.on('uncaughtException', (err) => {
  console.error('[CRASH] Uncaught exception:', err)
})
process.on('unhandledRejection', (err) => {
  console.error('[CRASH] Unhandled rejection:', err)
})
async function shutdown(signal) {
  console.log(`[SERVER] ${signal}: închidere controlată.`)
  await closeMssqlPool()
  process.exit(0)
}
process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))

ensureDatabase()

const licentaStatus = incarcaLicenta()
if (!licentaStatus.valida) {
  console.error('LICENȚĂ INVALIDĂ:', licentaStatus.eroare)
  process.exit(1)
}
if (isIsolatedCommercialDemo(readDb())) {
  console.log('InfraFlow pornit în DEMO comercial complet (date fictive, bază izolată).')
} else if (licentaStatus.demo) {
  console.log('InfraFlow pornit în modul DEMO (3 utilizatori, module limitate)')
}
if (licentaStatus.in_gratie) {
  console.warn(`ATENȚIE: Licență expirată! ${licentaStatus.zile_gratie} zile grație rămase`)
}
global.LICENTA = commercialDemoLicense(readDb(), licentaStatus.licenta)

const app = express()
// Meta semnează corpul brut al webhook-ului WhatsApp. Ruta publică este montată
// înaintea parserului general, astfel încât semnătura nu depinde de reserializare.
const whatsappModule = require('./modules/messaging/whatsapp')
const whatsappRouter = whatsappModule.router
app.use('/webhooks/whatsapp', express.json({ limit: '10mb', verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer) } }), whatsappModule.webhookRouter)
app.use(express.json({ limit: '10mb' }))
const STORAGE_ROOT = path.resolve(__dirname, '../storage')

function sendProtectedStorageFile(req, res) {
  const auth = requireAuth(req, res)
  if (!auth) return
  let relativePath = ''
  try {
    relativePath = decodeURIComponent(String(req.path || '')).replace(/^[/\\]+/, '')
  } catch {
    res.status(400).json({ error: 'Cale fisier invalida.' })
    return
  }
  const diskPath = path.resolve(STORAGE_ROOT, relativePath)
  if (!diskPath.startsWith(STORAGE_ROOT + path.sep) && diskPath !== STORAGE_ROOT) {
    res.status(403).json({ error: 'Acces interzis la fisier.' })
    return
  }
  if (!fs.existsSync(diskPath) || !fs.statSync(diskPath).isFile()) {
    res.status(404).json({ error: 'Fisier inexistent.' })
    return
  }
  res.sendFile(diskPath)
}

app.use('/storage', sendProtectedStorageFile)
app.get('/api/v1/health', (_req, res) => res.json({ ok: true, status: 'healthy' }))
app.get('/api/health', (_req, res) => res.json({ ok: true, status: 'healthy' }))
app.get('/api/system/health', (_req, res) => {
  try {
    res.json(databaseHealth())
  } catch (error) {
    res.status(503).json({ ok: false, mode: 'mssql', error: 'SQL Server indisponibil' })
  }
})

// Deschidem pool-ul la pornire, separat de fluxul cererii utilizatorului. Rutele
// legacy care folosesc încă executorul sincron PowerShell rămân compatibile, iar
// rutele relaționale/noi pot reutiliza imediat pool-ul MSSQL.
if (["mssql", "sqlserver"].includes(DB_MODE)) {
  getMssqlPool()
    .then(() => console.log('[DB] Pool MSSQL pregătit.'))
    .catch((error) => console.warn('[DB] Pool MSSQL indisponibil; compatibilitatea PowerShell rămâne activă:', error.message))
}

Promise.resolve()
  .then(() => require('./modules/messaging/routes').createDefaultChannels())
  .catch(err => console.warn('Canalele implicite nu au putut fi create:', err.message))

// Păstrăm în jurnal numai erorile și cererile lente. Logarea fiecărei încărcări
// normale produce I/O inutil, mai ales în ecranele operaționale cu refresh-uri.
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    // Tokenul unei oferte publice este o credențială temporară: nu îl lăsăm în logurile serverului.
    const loggedPath = /^\/public\/quote\/[^/]+/.test(req.path)
      ? req.path.replace(/(\/public\/quote\/)[^/]+/, '$1[redacted]')
      : req.path
    const elapsedMs = Date.now() - start
    const slowThresholdMs = Math.max(100, Number(process.env.INFRAFLOW_SLOW_REQUEST_MS || 500))
    if (res.statusCode >= 400 || elapsedMs >= slowThresholdMs) {
      console.log(`[${res.statusCode >= 400 ? 'HTTP' : 'SLOW'}] ${req.method} ${loggedPath} ${res.statusCode} ${elapsedMs}ms`)
    }
  })
  next()
})

// Routere module (placeholder — vor fi completate rând pe rând)
app.use('/public', require('./modules/crm/public-routes'))
app.use('/api', require('./core/auth-routes'))
app.use('/api', require('./modules/referate/routes'))
app.use('/api', require('./modules/nomenclator/routes'))
app.use('/api', require('./modules/procurement/paap-routes'))
app.use('/api', require('./modules/inventory/routes'))
app.use('/api', require('./modules/production/routes'))
app.use('/api', require('./modules/procurement/routes'))
app.use('/api', require('./modules/fleet/routes'))
app.use('/api', require('./modules/fleet/trip-routes'))
app.use('/api', require('./modules/fleet/fc-routes'))
app.use('/api', require('./modules/fleet/faz-routes'))
app.use('/api', require('./modules/fleet/asset-routes'))
app.use('/api', require('./modules/fleet/import-routes'))
app.use('/api', require('./modules/technical/routes'))
app.use('/api', require('./modules/workflow/routes'))
app.use('/api', require('./modules/system/routes'))
if (process.env.DEMO_MODE === 'true' || process.env.NODE_ENV === 'demo') {
  const demoRoutesPath = path.join(__dirname, 'modules', 'system', 'demo-routes.js')
  if (fs.existsSync(demoRoutesPath)) {
    app.use('/api', require('./modules/system/demo-routes'))
  } else {
    console.warn('[DEMO] Rutele tehnice demo nu sunt incluse în acest pachet.')
  }
}
app.use('/api', require('./modules/messaging/routes').router)
app.use('/api', whatsappRouter)
app.use('/api', require('./modules/tasks/routes'))
app.use('/api', require('./modules/tickets/routes'))
app.use('/api', require('./modules/documents/routes'))
app.use('/api', require('./modules/field/routes'))
app.use('/api', require('./modules/integration/intersoft/routes'))
app.use('/api', require('./modules/integration/legacy/routes'))
app.use('/api', require('./modules/integration/autominder/routes'))
app.use('/api', require('./modules/integration/autominder/full-import'))
app.use('/api', require('./modules/integration/gps/routes'))
const piusiIntegration = require('./modules/integration/piusi')
app.use('/api', piusiIntegration)
app.use('/api', require('./modules/controlling/routes'))
app.use('/api', require('./modules/contracts/routes'))
app.use('/api', require('./modules/logistics/routes'))
app.use('/api', require('./modules/crm/routes'))
app.use('/api', require('./modules/accounting/accounting-routes'))
app.use('/api', require('./modules/hr/echipamente-routes'))
app.use('/api', require('./modules/hr/payroll-routes'))
app.use('/api', require('./modules/hr/payroll-advanced-routes'))
app.use('/api', require('./modules/hr/payroll-payment-routes'))
app.use('/api', require('./modules/hr/payroll-obligation-routes'))
app.use('/api', require('./modules/hr/timesheet-lock-routes'))
app.use('/api', require('./modules/hr/employee-file-routes'))
app.use('/api', require('./modules/accounting/end-to-end-audit-routes'))
app.use('/api', require('./modules/hr/routes'))
app.use('/api', require('./modules/mechanization/routes'))
app.use('/api', require('./modules/gestiune/routes'))
app.use('/api', require('./modules/asternere/routes'))
app.use('/api', require('./modules/anaf/routes'))
app.use('/api', require('./modules/sanitation/routes'))
app.use('/api', require('./modules/traffic-safety/routes'))
app.use('/api', require('./modules/environment/routes'))
app.use('/api', require('./modules/legal/routes'))
app.use('/api', require('./modules/archive/routes'))
app.use('/api', require('./modules/secretariat/routes'))
app.use('/api', require('./modules/snow-removal/routes'))
app.use('/api', require('./modules/ai/routes'))

// SPA fallback — caută client/dist în mai multe locații posibile (dev, prod, installer)
const clientPaths = [
  path.join(__dirname, '../client/dist'),
  path.join(__dirname, '../public'),
  path.join(__dirname, 'public'),
]
const clientDistPath = clientPaths.find(p =>
  fs.existsSync(path.join(p, 'index.html'))
)
if (clientDistPath) {
  app.use('/oferta', (_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Content-Security-Policy': "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
    })
    next()
  })
  app.use(express.static(clientDistPath))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(clientDistPath, 'index.html'))
  })
}

// Error handler
app.use((err, req, res, next) => {
  console.error(err)
  const raw = String(err.message || err || 'Eroare internă')
  const loginMatch = raw.match(/Login failed for user ['"]?([^'".<]+)['"]?/i)
  const message = loginMatch
    ? `Autentificare SQL esuata pentru utilizatorul "${loginMatch[1]}". Verifica user/parola si drepturile pe baza de date.`
    : (/#<\s*CLIXML/i.test(raw)
      ? 'Eroare SQL Server returnata prin PowerShell. Verifica credentialele si reporneste serverul dupa update.'
      : raw)
  res.status(err.status || 500).json({ error: message })
})

// Bootstrap: creare user admin la prima pornire (dacă db.users e gol)
try {
  const _db = readDb()
  const cpvResult = bootstrapCpvCatalog(_db, syncMssqlCpvCodes)
  if (cpvResult.imported || cpvResult.synced) {
    writeDb(_db)
    console.log(`[STARTUP] CPV import: ${cpvResult.imported} importate, ${cpvResult.duplicates} duplicate, ${cpvResult.synced} sincronizate MSSQL.`)
  }
  if (!Array.isArray(_db.users) || _db.users.length === 0) {
    _db.users = [{
      id: 'admin-' + Date.now(),
      username: 'admin',
      password: 'admin123',
      name: 'Administrator',
      email: 'admin@infraflow.ro',
      role: 'superadmin',
      active: true,
      mustChangePassword: true,
      created_at: new Date().toISOString()
    }]
    writeDb(_db)
    console.log('✅ User admin creat automat. Parola: admin123')
    console.log('⚠️  Schimbă parola după primul login!')
  }
} catch (err) {
  console.warn('Bootstrap admin skip:', err.message)
}
require('./scheduler')
piusiIntegration.startPiusiScheduler()

const PORT = Number(process.env.PORT || 4180) // port implicit 4180
// Pe Linux hosted, aplicația rămâne în spatele tunnel-ului și nu ascultă pe
// interfața publică. Instalările Windows existente își păstrează comportamentul
// LAN dacă nu configurează explicit INFRAFLOW_HOST/HOST.
const HOST = String(process.env.INFRAFLOW_HOST || process.env.HOST || (process.platform === 'win32' ? '' : '127.0.0.1')).trim()
if (require.main === module) {
  const onListen = () => {
    console.log(`InfraFlow app.js pornit pe ${HOST || 'toate interfețele'}:${PORT}`)
  }
  const server = HOST ? app.listen(PORT, HOST, onListen) : app.listen(PORT, onListen)
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Portul ${PORT} e ocupat. Incearca: $env:PORT=${PORT+1} ; node server/app.js`)
      return
    }
    console.error('[SERVER] Listener error:', err)
  })
}

module.exports = app
