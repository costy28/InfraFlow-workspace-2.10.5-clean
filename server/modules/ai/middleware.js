const { isAiEnabled } = require('./key-manager')

function requireAiEnabled(req, res, next) {
  const auth = req.auth // setat de requireAuth
  if (!auth?.db) return res.status(401).json({ error: 'Autentificare necesară.' })
  if (!isAiEnabled(auth.db)) {
    return res.status(402).json({
      error: 'Modulul AI nu este activat.',
      actiune: 'Contactează administratorul pentru activare.',
      cod: 'AI_NOT_ENABLED'
    })
  }
  next()
}

module.exports = { requireAiEnabled }
