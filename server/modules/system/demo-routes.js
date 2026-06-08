const { Router } = require('express')
const pkg = require('../../../package.json')
const { databaseHealth } = require('../../core/db')

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

module.exports = router
