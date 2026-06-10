const { Router } = require('express')
const childProcess = require('child_process')
const path = require('path')
const pkg = require('../../../package.json')
const { databaseHealth, readDb, writeDb } = require('../../core/db')
const { requireAuth } = require('../../core/auth')
const { addAudit } = require('../../core/audit')

const router = Router()

router.get('/demo-status', (_req, res) => {
  res.json({
    demo: process.env.DEMO_MODE === 'true' || process.env.NODE_ENV === 'demo',
    reset_hour: Number(process.env.DEMO_RESET_HOUR || 3),
    version: pkg.version
  })
})

router.get('/demo-health', (_req, res) => {
  res.json({
    status: 'ok',
    ...databaseHealth(),
    demo: process.env.DEMO_MODE === 'true' || process.env.NODE_ENV === 'demo',
    version: pkg.version,
    uptime: process.uptime()
  })
})

router.post('/demo-reset', (req, res, next) => {
  try {
    const demoMode = process.env.DEMO_MODE === 'true' || process.env.NODE_ENV === 'demo'
    if (!demoMode) return res.status(403).json({ error: 'Resetul demo este disponibil doar in modul demo.' })
    const auth = requireAuth(req, res)
    if (!auth) return
    const isAllowed = auth.user?.role === 'superadmin' || auth.user?.username === 'demo'
    if (!isAllowed) return res.status(403).json({ error: 'Doar adminul demo poate reseta datele demo.' })

    const root = path.resolve(__dirname, '../../../')
    const resetScript = path.join(root, 'scripts', 'reset-demo-data.js')
    const result = childProcess.spawnSync(process.execPath, [resetScript], {
      cwd: root,
      env: {
        ...process.env,
        DB_MODE: 'json',
        INFRAFLOW_DB_PROVIDER: 'json',
        DEMO_MODE: 'true'
      },
      encoding: 'utf8'
    })
    if (result.status !== 0) {
      return res.status(500).json({ error: 'Resetul demo a esuat.', details: result.stderr || result.stdout || '' })
    }

    const db = readDb()
    addAudit(db, auth.user, 'demo_reset_manual', 'Reset date demo din UI')
    writeDb(db)
    res.json({ ok: true, reset_at: new Date().toISOString(), output: String(result.stdout || '').trim().slice(-1000) })
  } catch (error) {
    next(error)
  }
})

module.exports = router
