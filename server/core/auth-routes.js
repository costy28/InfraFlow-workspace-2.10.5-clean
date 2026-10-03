const { Router } = require('express')
const { readDb, writeDb } = require('./db')
const { verifyPassword, hashPassword, sessions, requireAuth, tokenFrom, networkAccessAllowed, registerClientDevice, assertPasswordPolicy, demoAccessExpiryStatus } = require('./auth')
const { publicUser, effectivePermissionsForUser, ensureDefaultCustomRoles } = require('./permissions')
const { requiresInitialSetup, completeInitialSetup } = require('./setup')
const { addAudit } = require('./audit')
const { encryptSettingSecret, decryptSettingSecret } = require('./settings-crypto')
const { createTotpSecret, verifyTotp, createRecoveryCodes, hashRecoveryCode, verifyRecoveryCode, otpAuthUri } = require('./two-factor')
const crypto = require('crypto')
const fs = require('fs')
const { isIsolatedCommercialDemo } = require('../shared/commercialDemo')
const router = Router()

const DEMO_INVITE_TTL_MS = 24 * 60 * 60 * 1000
const DEMO_ACCESS_DEFAULT_DAYS = 15
const DEMO_WEBHOOK_MAX_SKEW_SECONDS = 5 * 60
const TWO_FACTOR_CHALLENGE_TTL_MS = 5 * 60 * 1000
const TWO_FACTOR_SETUP_TTL_MS = 10 * 60 * 1000
const TWO_FACTOR_MAX_ATTEMPTS = 5
const twoFactorLoginChallenges = new Map()
const twoFactorSetupChallenges = new Map()

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

function isSuperadmin(user) {
  return user?.role === 'superadmin' || (Array.isArray(user?.roles) && user.roles.includes('superadmin'))
}

function twoFactorEnabled(user) {
  return Boolean(user?.twoFactorSecretEncrypted && user?.twoFactorEnabledAt)
}

function cleanupTwoFactorChallenges() {
  const now = Date.now()
  for (const [token, challenge] of twoFactorLoginChallenges) if (challenge.expiresAt <= now) twoFactorLoginChallenges.delete(token)
  for (const [token, challenge] of twoFactorSetupChallenges) if (challenge.expiresAt <= now) twoFactorSetupChallenges.delete(token)
}

function newChallengeToken() {
  return crypto.randomBytes(32).toString('base64url')
}

function secondFactorResult(user, code) {
  let secret = ''
  try { secret = decryptSettingSecret(user.twoFactorSecretEncrypted) } catch { return { ok: false } }
  if (verifyTotp(secret, code)) return { ok: true, method: 'totp' }
  const recoveryCodes = Array.isArray(user.twoFactorRecoveryCodeHashes) ? user.twoFactorRecoveryCodeHashes : []
  const index = recoveryCodes.findIndex(hash => verifyRecoveryCode(hash, code))
  return index >= 0 ? { ok: true, method: 'recovery', recoveryCodeIndex: index } : { ok: false }
}

function completeLogin(req, db, user, auditSuffix = '') {
  const token = crypto.randomBytes(32).toString('hex')
  const device = registerClientDevice(db, user, req.body || {}, req)
  sessions.set(token, { userId: user.id, deviceId: device.id, loginAt: Date.now() })
  addAudit(db, user, 'auth_login_reusit', authAuditDetails(req, user.username, 'acceptat', `${device.name || 'statie autorizata'}${auditSuffix}`))
  const permissions = effectivePermissionsForUser(user, db)
  return { token, user: { ...publicUser(user), permissions }, permissions }
}

function demoInviteSecret() {
  const file = String(process.env.INFRAFLOW_DEMO_LEADS_WEBHOOK_SECRET_FILE || '').trim()
  if (file) {
    try { return fs.readFileSync(file, 'utf8').trim() } catch { return '' }
  }
  return String(process.env.INFRAFLOW_DEMO_LEADS_WEBHOOK_SECRET || '').trim()
}

function normalizedDemoInvitePayload(body = {}) {
  return {
    leadId: String(body.lead_id || '').trim(),
    name: String(body.name || '').trim().slice(0, 120),
    company: String(body.company || '').trim().slice(0, 160),
    email: String(body.email || '').trim().toLowerCase().slice(0, 254),
    source: String(body.source || '').trim(),
  }
}

function demoInviteSignature(timestamp, payload) {
  return [timestamp, payload.leadId, payload.name, payload.company, payload.email, payload.source].join('\n')
}

function safeSecretEquals(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8')
  const b = Buffer.from(String(right || ''), 'utf8')
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b)
}

function assertDemoLeadWebhook(req, payload) {
  const secret = demoInviteSecret()
  if (!secret) {
    const error = new Error('Integrarea lead-uri Demo nu este configurată.')
    error.status = 503
    throw error
  }
  const timestamp = String(req.headers['x-infraflow-timestamp'] || '').trim()
  const signature = String(req.headers['x-infraflow-signature'] || '').trim()
  const timestampSeconds = Number(timestamp)
  if (!Number.isInteger(timestampSeconds) || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > DEMO_WEBHOOK_MAX_SKEW_SECONDS) {
    const error = new Error('Cererea de invitație a expirat.')
    error.status = 401
    throw error
  }
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(demoInviteSignature(timestamp, payload), 'utf8').digest('hex')}`
  if (!safeSecretEquals(signature, expected)) {
    const error = new Error('Semnătura invitației este invalidă.')
    error.status = 401
    throw error
  }
}

function demoUsername(db, email) {
  const base = String(email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '').slice(0, 20) || 'demo'
  const taken = new Set((db.users || []).map(user => String(user.username || '').toLowerCase()))
  for (let index = 1; index < 1000; index += 1) {
    const suffix = index === 1 ? '-demo' : `-demo${index}`
    const candidate = `${base.slice(0, 32 - suffix.length)}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
  return `demo-${crypto.randomBytes(6).toString('hex')}`
}

function demoPublicUrl() {
  const configured = String(process.env.INFRAFLOW_DEMO_PUBLIC_URL || 'https://demo.infraflow.ro').trim().replace(/\/$/, '')
  try {
    const url = new URL(configured)
    return url.protocol === 'https:' ? url.toString().replace(/\/$/, '') : ''
  } catch { return '' }
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

router.post('/demo/invites', async (req, res) => {
  try {
    const payload = normalizedDemoInvitePayload(req.body)
    assertDemoLeadWebhook(req, payload)
    if (!payload.leadId || !payload.name || !payload.company || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || payload.source !== 'website_demo') {
      return res.status(400).json({ error: 'Datele invitației Demo sunt incomplete.' })
    }
    // Cererea vine dintr-un sistem extern. Nu decide conflictul pe un snapshot
    // MSSQL rămas în memorie după o modificare administrativă a stării Demo.
    const db = await readDb({ fresh: true })
    if (!isIsolatedCommercialDemo(db)) return res.status(404).json({ error: 'Accesul Demo nu este disponibil pentru această instalație.' })
    if (!db.settings || typeof db.settings !== 'object') db.settings = {}
    ensureDefaultCustomRoles(db.settings)
    if (!Array.isArray(db.demoInvites)) db.demoInvites = []
    const existingUser = (db.users || []).find(user => String(user.email || '').trim().toLowerCase() === payload.email)
    const username = String(existingUser?.username || demoUsername(db, payload.email)).trim()
    if (existingUser && existingUser.active !== false) {
      const existingUsername = String(existingUser.username || '').trim() || 'necunoscut'
      return res.status(409).json({
        error: `Există deja un cont activ pentru adresa transmisă: ${payload.email} (utilizator: ${existingUsername}).`,
        code: 'demo_active_account_exists'
      })
    }
    const now = new Date()
    const token = crypto.randomBytes(32).toString('base64url')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(now.getTime() + DEMO_INVITE_TTL_MS).toISOString()
    let userId = ''
    const invite = {
      id: `demo-invite-${crypto.randomUUID()}`,
      tokenHash,
      leadId: payload.leadId,
      email: payload.email,
      username,
      name: payload.name,
      company: payload.company,
      source: payload.source,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt,
    }
    if (existingUser) {
      userId = existingUser.id
      existingUser.name = payload.name
      existingUser.username = username
      existingUser.role = 'demo-admin'
      existingUser.roles = ['demo-admin']
      existingUser.active = false
      existingUser.demoInvitePending = true
      existingUser.createdBy = 'demo-leads-webhook'
      delete existingUser.demoAccessExpiresAt
      existingUser.demoAccessDurationDays = DEMO_ACCESS_DEFAULT_DAYS
      existingUser.updatedAt = now.toISOString()
    } else {
      const user = {
        id: `user-${crypto.randomUUID()}`,
        name: payload.name,
        username: invite.username,
        email: payload.email,
        passwordHash: hashPassword(crypto.randomBytes(32).toString('base64url')),
        role: 'demo-admin',
        roles: ['demo-admin'],
        active: false,
        demoInvitePending: true,
        demoAccessDurationDays: DEMO_ACCESS_DEFAULT_DAYS,
        createdBy: 'demo-leads-webhook',
        createdAt: now.toISOString(),
      }
      db.users.push(user)
      userId = user.id
    }
    invite.userId = userId
    db.demoInvites = db.demoInvites.filter(item => String(item.email || '').toLowerCase() !== payload.email || item.status !== 'pending')
    db.demoInvites.push(invite)
    addAudit(db, { id: 'demo-leads-webhook', name: 'Site InfraFlow', role: 'system' }, 'demo_invite_creata', `Lead ${payload.leadId} aprobat pentru utilizatorul ${username}`)
    await writeDb(db)
    const baseUrl = demoPublicUrl()
    if (!baseUrl) return res.status(503).json({ error: 'URL-ul public al Demo nu este configurat corect.' })
    res.status(201).json({
      activation_url: `${baseUrl}/activare-demo?token=${encodeURIComponent(token)}`,
      username: invite.username,
      expires_at: expiresAt,
    })
  } catch (error) { res.status(error.status || 500).json({ error: error.message || 'Nu am putut crea invitația Demo.' }) }
})

router.post('/demo/invites/activate', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim()
    const password = String(req.body?.password || '')
    const passwordConfirmation = String(req.body?.password_confirmation || '')
    if (!token || !password || !passwordConfirmation) return res.status(400).json({ error: 'Linkul și parola sunt obligatorii.' })
    if (password !== passwordConfirmation) return res.status(400).json({ error: 'Parolele nu coincid.' })
    const db = await readDb()
    if (!isIsolatedCommercialDemo(db)) return res.status(404).json({ error: 'Accesul Demo nu este disponibil pentru această instalație.' })
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const invite = (db.demoInvites || []).find(item => item.tokenHash === tokenHash && item.status === 'pending')
    if (!invite || Date.parse(invite.expiresAt) < Date.now()) return res.status(400).json({ error: 'Linkul de activare este invalid sau a expirat.' })
    const user = (db.users || []).find(item => String(item.id) === String(invite.userId) || String(item.email || '').trim().toLowerCase() === String(invite.email || '').toLowerCase())
    if (!user) return res.status(404).json({ error: 'Contul Demo nu mai este disponibil.' })
    assertPasswordPolicy(password, { username: user.username, name: user.name }, db.settings || {})
    user.passwordHash = hashPassword(password)
    user.active = true
    user.demoInvitePending = false
    user.updatedAt = new Date().toISOString()
    user.demoAccessExpiresAt = new Date(Date.parse(user.updatedAt) + DEMO_ACCESS_DEFAULT_DAYS * 24 * 60 * 60 * 1000).toISOString()
    user.demoAccessDurationDays = DEMO_ACCESS_DEFAULT_DAYS
    invite.status = 'activated'
    invite.activatedAt = user.updatedAt
    invite.demoAccessExpiresAt = user.demoAccessExpiresAt
    addAudit(db, { id: user.id, name: user.name, role: 'demo-admin' }, 'demo_invite_activata', `Lead ${invite.leadId} și-a activat accesul Demo pentru ${DEMO_ACCESS_DEFAULT_DAYS} zile.`)
    await writeDb(db)
    res.json({ ok: true, username: user.username })
  } catch (error) { res.status(error.status || 500).json({ error: error.message || 'Nu am putut activa accesul Demo.' }) }
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
    if (demoAccessExpiryStatus(user).expired) {
      addAudit(db, { id: 'security', name: 'Securitate', role: 'system' }, 'auth_login_esuat', authAuditDetails(req, username, 'respins', 'acces Demo expirat'))
      await writeDb(db)
      return res.status(403).json({ error: 'Accesul Demo a expirat. Contactează administratorul pentru prelungire.' })
    }
    cleanupTwoFactorChallenges()
    if (isSuperadmin(user) && twoFactorEnabled(user)) {
      const challengeToken = newChallengeToken()
      const expiresAt = Date.now() + TWO_FACTOR_CHALLENGE_TTL_MS
      twoFactorLoginChallenges.set(challengeToken, { userId: user.id, expiresAt, attempts: 0 })
      addAudit(db, user, 'auth_login_2fa_cerut', authAuditDetails(req, username, 'pas suplimentar cerut'))
      await writeDb(db)
      return res.status(202).json({ twoFactorRequired: true, challengeToken, expiresAt: new Date(expiresAt).toISOString() })
    }
    const response = completeLogin(req, db, user)
    await writeDb(db)
    res.json(response)
  } catch(e) { res.status(e.status || 500).json({ error: e.message }) }
})

router.post('/login/2fa', async (req, res) => {
  try {
    cleanupTwoFactorChallenges()
    const challengeToken = String(req.body?.challengeToken || '').trim()
    const challenge = twoFactorLoginChallenges.get(challengeToken)
    if (!challenge) return res.status(401).json({ error: 'Sesiunea de autentificare în doi pași a expirat. Reia autentificarea.' })
    const db = await readDb()
    const user = (db.users || []).find(item => String(item.id) === String(challenge.userId))
    if (!user || user.active === false || !isSuperadmin(user) || !twoFactorEnabled(user) || demoAccessExpiryStatus(user).expired) {
      twoFactorLoginChallenges.delete(challengeToken)
      return res.status(401).json({ error: 'Autentificarea nu mai poate fi finalizată. Reia autentificarea.' })
    }
    const factor = secondFactorResult(user, req.body?.code)
    if (!factor.ok) {
      challenge.attempts += 1
      if (challenge.attempts >= TWO_FACTOR_MAX_ATTEMPTS) twoFactorLoginChallenges.delete(challengeToken)
      addAudit(db, user, 'auth_login_2fa_respins', authAuditDetails(req, user.username, 'respins', 'cod 2FA invalid'))
      await writeDb(db)
      return res.status(401).json({ error: challenge.attempts >= TWO_FACTOR_MAX_ATTEMPTS ? 'Prea multe coduri invalide. Reia autentificarea.' : 'Codul de autentificare este invalid.' })
    }
    if (factor.method === 'recovery') user.twoFactorRecoveryCodeHashes.splice(factor.recoveryCodeIndex, 1)
    twoFactorLoginChallenges.delete(challengeToken)
    addAudit(db, user, 'auth_login_2fa_reusit', authAuditDetails(req, user.username, 'acceptat', factor.method === 'recovery' ? 'cod recuperare utilizat' : 'cod authenticator valid'))
    const response = completeLogin(req, db, user, ' | 2FA validat')
    await writeDb(db)
    res.json(response)
  } catch (error) { res.status(error.status || 500).json({ error: error.message || 'Nu am putut verifica autentificarea în doi pași.' }) }
})

router.get('/auth/2fa/status', async (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!isSuperadmin(auth.user)) return res.status(403).json({ error: 'Doar superadmin-ul poate administra autentificarea în doi pași.' })
  res.json({
    enabled: twoFactorEnabled(auth.user),
    enabledAt: auth.user.twoFactorEnabledAt || '',
    recoveryCodesRemaining: Array.isArray(auth.user.twoFactorRecoveryCodeHashes) ? auth.user.twoFactorRecoveryCodeHashes.length : 0,
  })
})

router.post('/auth/2fa/setup', async (req, res) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!isSuperadmin(auth.user)) return res.status(403).json({ error: 'Doar superadmin-ul poate configura autentificarea în doi pași.' })
    if (twoFactorEnabled(auth.user)) return res.status(409).json({ error: 'Autentificarea în doi pași este deja activă.' })
    cleanupTwoFactorChallenges()
    const setupToken = newChallengeToken()
    const secret = createTotpSecret()
    const expiresAt = Date.now() + TWO_FACTOR_SETUP_TTL_MS
    twoFactorSetupChallenges.set(setupToken, { userId: auth.user.id, secret, expiresAt })
    res.json({ setupToken, secret, otpAuthUri: otpAuthUri({ secret, username: auth.user.username }), expiresAt: new Date(expiresAt).toISOString() })
  } catch (error) { res.status(error.status || 500).json({ error: error.message || 'Nu am putut începe configurarea 2FA.' }) }
})

router.post('/auth/2fa/confirm', async (req, res) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!isSuperadmin(auth.user)) return res.status(403).json({ error: 'Doar superadmin-ul poate configura autentificarea în doi pași.' })
    cleanupTwoFactorChallenges()
    const setupToken = String(req.body?.setupToken || '').trim()
    const setup = twoFactorSetupChallenges.get(setupToken)
    if (!setup || String(setup.userId) !== String(auth.user.id)) return res.status(400).json({ error: 'Configurarea 2FA a expirat. Începe din nou.' })
    if (!verifyTotp(setup.secret, req.body?.code)) return res.status(400).json({ error: 'Codul din aplicația Authenticator este invalid.' })
    const db = await readDb({ fresh: true })
    const user = (db.users || []).find(item => String(item.id) === String(auth.user.id))
    if (!user || !isSuperadmin(user)) return res.status(404).json({ error: 'Contul superadmin nu mai este disponibil.' })
    const recoveryCodes = createRecoveryCodes()
    user.twoFactorSecretEncrypted = encryptSettingSecret(setup.secret)
    user.twoFactorRecoveryCodeHashes = recoveryCodes.map(hashRecoveryCode)
    user.twoFactorEnabledAt = new Date().toISOString()
    user.updatedAt = user.twoFactorEnabledAt
    twoFactorSetupChallenges.delete(setupToken)
    addAudit(db, user, 'auth_2fa_activat', 'Autentificare în doi pași activată; au fost generate coduri de recuperare.')
    await writeDb(db)
    res.json({ ok: true, recoveryCodes })
  } catch (error) { res.status(error.status || 500).json({ error: error.message || 'Nu am putut activa autentificarea în doi pași.' }) }
})

router.post('/auth/2fa/recovery-codes', async (req, res) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!isSuperadmin(auth.user) || !twoFactorEnabled(auth.user)) return res.status(400).json({ error: 'Autentificarea în doi pași nu este activă pentru acest cont.' })
    const db = await readDb({ fresh: true })
    const user = (db.users || []).find(item => String(item.id) === String(auth.user.id))
    const factor = secondFactorResult(user, req.body?.code)
    if (!factor.ok) return res.status(400).json({ error: 'Confirmă cu un cod valid din aplicația Authenticator sau cu un cod de recuperare.' })
    const recoveryCodes = createRecoveryCodes()
    user.twoFactorRecoveryCodeHashes = recoveryCodes.map(hashRecoveryCode)
    user.updatedAt = new Date().toISOString()
    addAudit(db, user, 'auth_2fa_coduri_regenerate', 'Codurile de recuperare 2FA au fost regenerate.')
    await writeDb(db)
    res.json({ ok: true, recoveryCodes })
  } catch (error) { res.status(error.status || 500).json({ error: error.message || 'Nu am putut genera codurile de recuperare.' }) }
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
