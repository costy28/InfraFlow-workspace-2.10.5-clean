'use strict'
// Synthetic adapter only. No email delivery, no route in server/app.js.
const { Router } = require('../../server/node_modules/express')
const { ROLE } = require('./demo-company-setup')
const { hashPassword, verifyPassword, assertPasswordPolicy } = require('../../server/core/auth')
const { addAudit } = require('../../server/core/audit')
function failure(code) { const e = new Error(code); e.code = code; throw e }
function createSyntheticInvitationRouter({ store, trialId }) {
  const db = require('../../server/core/db'), path = require('node:path'), os = require('node:os')
  const dir = path.dirname(path.resolve(db.DB_FILE))
  if (process.env.NODE_ENV !== 'test' || db.DB_MODE !== 'json' || path.dirname(dir) !== path.resolve(os.tmpdir())
    || !path.basename(dir).startsWith('infraflow-trial-store-')) failure('synthetic_test_only')
  const router = Router()
  router.post('/demo-company/activate', async (req, res) => {
    try {
      const body = req.body
      if (!body || Array.isArray(body) || typeof body !== 'object' || !Object.keys(body).every(k => ['token','password','confirmPassword'].includes(k))
        || typeof body.password !== 'string' || body.password.length > 256 || body.password !== body.confirmPassword) failure('activation_input_invalid')
      let username
      const result = await store.consumeInvitation({ trialId, token: body.token, now: Date.now(), activate: context => {
        const state = db.readDb({ fresh: true }), user = state.users.find(u => u.id === context.ownerId)
        if (state.settings.demoTrialId !== trialId || !user || user.role !== ROLE
          || (user.roles || []).some(role => role !== ROLE && role !== 'angajat')) failure('activation_binding_invalid')
        username = user.username
        const previous = state.demoTrialActivation
        if (previous) {
          if (previous.invitationId !== context.invitationId || previous.tokenHash !== context.tokenHash
            || previous.userId !== user.id || !verifyPassword(user.passwordHash, body.password)) failure('activation_conflict')
          return previous
        }
        if (user.active !== false && user.active !== 0) failure('activation_conflict')
        assertPasswordPolicy(body.password, user, state.settings)
        user.passwordHash = hashPassword(body.password); user.active = true
        user.demoAccessExpiresAt = new Date(context.now + 15 * 86400000).toISOString()
        state.demoTrialActivation = { invitationId: context.invitationId, tokenHash: context.tokenHash, userId: user.id, activatedAt: context.now }
        addAudit(state, user, 'demo_trial_activated', `trial=${trialId}`)
        db.writeDb(state)
        return state.demoTrialActivation
      } })
      res.json({ ok: true, ...result, username })
    } catch (e) {
      const code = e.code || 'activation_input_invalid'
      const status = code === 'invitation_invalid' ? 401 : code === 'activation_input_invalid' ? 400 : 409
      res.status(status).json({ error: 'Invitația sau activarea nu poate fi procesată.', code })
    }
  })
  return router
}
module.exports = { createSyntheticInvitationRouter }
