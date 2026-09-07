const { Router } = require('express')
const { readDb, writeDb } = require('./db')
const { verifyPassword, hashPassword, sessions, requireAuth, tokenFrom, networkAccessAllowed, registerClientDevice } = require('./auth')
const { publicUser, effectivePermissionsForUser } = require('./permissions')
const { requiresInitialSetup, completeInitialSetup } = require('./setup')
const { addAudit } = require('./audit')
const crypto = require('crypto')
const router = Router()

function requestIp(req) {
  const raw = req.socket?.remoteAddress || ''
  if (raw.startsWith('::ffff:')) return raw.slice(7)
  if (raw === '::1') return '127.0.0.1'
  return raw
}

function authAuditDetails(req, username, result, extra = '') {
  const deviceId = String(req.body?.deviceId || req.headers['x-infraflow-device-id'] || req.headers['x-asfalt-device-id'] || '').slice(0, 80)
  return [
    `username=${String(username || '-').slice(0, 80)}`,
    `rezultat=${result}`,
    `ip=${requestIp(req) || '-'}`,
    deviceId ? `device=${deviceId}` : '',
    extra ? `motiv=${String(extra).slice(0, 120)}` : ''
  ].filter(Boolean).join(' | ')
}

router.get('/setup/status', async (req, res) => {
  try {
    const db = await readDb()
    const required = requiresInitialSetup(db)
    res.json({
      required,
      appVersion: db.settings?.appVersion || '0.2.44',
      companyName: db.settings?.companyName || '',
      stationName: db.settings?.stationName || ''
    })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

router.get('/setup/anaf/:cif', async (req, res) => {
  try {
    const cif = String(req.params.cif || '').replace(/\D/g, '')
    if (!cif)
      return res.status(400).json({ error: 'CUI/CIF invalid.' })
    const { lookupAnafPublic } = require('../modules/anaf/routes')
    res.json(await lookupAnafPublic(cif))
  } catch(e) { res.status(e.status || 404).json({ error: e.message || 'CUI negasit in ANAF.' }) }
})

router.post('/setup/complete', async (req, res) => {
  try {
    if (!networkAccessAllowed(req))
      return res.status(403).json({ error: 'Configurarea initiala este permisa doar din reteaua interna.' })
    const db = await readDb()
    if (!requiresInitialSetup(db))
      return res.status(409).json({ error: 'Aplicatia este deja configurata.' })
    const result = completeInitialSetup(db, req.body || {})
    const token = crypto.randomBytes(32).toString('hex')
    const device = registerClientDevice(result.db, result.user, req.body || {}, req)
    sessions.set(token, { userId: result.user.id, deviceId: device.id, loginAt: Date.now() })
    await writeDb(result.db)
    const permissions = effectivePermissionsForUser(result.user, result.db)
    res.status(201).json({
      token,
      user: { ...publicUser(result.user), permissions },
      permissions,
      settings: result.db.settings
    })
  } catch(e) { res.status(e.status || 500).json({ error: e.message }) }
})

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password)
      return res.status(400).json({ error: 'Utilizator si parola obligatorii.' })
    const db = await readDb()
    if (requiresInitialSetup(db))
      return res.status(409).json({ error: 'Aplicatia trebuie configurata inainte de autentificare.' })
    const user = db.users?.find(u =>
      u.username === username && u.active !== false
    )
    if (!user || !verifyPassword(user, password)) {
      addAudit(db, { id: 'security', name: 'Securitate', role: 'system' }, 'auth_login_esuat', authAuditDetails(req, username, 'respins', user ? 'parola invalida' : 'utilizator inexistent sau inactiv'))
      await writeDb(db)
      return res.status(401).json({ error: 'Autentificare necesara.' })
    }
    const token = crypto.randomBytes(32).toString('hex')
    const device = registerClientDevice(db, user, req.body || {}, req)
    sessions.set(token, { userId: user.id, deviceId: device.id, loginAt: Date.now() })
    addAudit(db, user, 'auth_login_reusit', authAuditDetails(req, username, 'acceptat', device.name || 'statie autorizata'))
    await writeDb(db)
    const permissions = effectivePermissionsForUser(user, db)
    res.json({ token, user: { ...publicUser(user), permissions }, permissions })
  } catch(e) { res.status(e.status || 500).json({ error: e.message }) }
})

router.post('/logout', async (req, res) => {
  try {
    const token = tokenFrom(req)
    const session = token ? sessions.get(token) : null
    if (token) sessions.delete(token)
    if (session) {
      const db = await readDb()
      const user = db.users?.find(u => String(u.id) === String(session.userId))
      if (user) {
        addAudit(db, user, 'auth_logout', authAuditDetails(req, user.username, 'iesire'))
        await writeDb(db)
      }
    }
    res.json({ ok: true })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

router.get('/session', async (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  const permissions = effectivePermissionsForUser(auth.user, auth.db)
  res.json({ user: { ...publicUser(auth.user), permissions }, permissions })
})

module.exports = router
