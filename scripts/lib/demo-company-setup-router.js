'use strict'
// Test adapter only; never mounted in server/app.js.
const { Router } = require('../../server/node_modules/express')
const { requireAuth } = require('../../server/core/auth')
function createSyntheticSetupRouter({ store, trialId }) {
  if (process.env.NODE_ENV !== 'test') throw new Error('synthetic_test_only')
  const router = Router()
  const handler = write => async (req, res) => {
    const auth = requireAuth(req, res)
    if (!auth) return
    try {
      // Neither identity, tenant, time nor entitlements can come from HTTP input.
      const context = { trialId, user: auth.user, now: Date.now() }
      if (write) {
        const body = req.body
        if (!body || Array.isArray(body) || typeof body !== 'object' || !Object.keys(body).every(k => ['step','input','expectedRevision'].includes(k))) {
          return res.status(400).json({ error: 'Câmpuri de configurare invalide.', code: 'invalid_fields' })
        }
        const setup = await store.configureSetup({ ...context, command: body })
        return res.json({ setup })
      }
      return res.json(await store.readSetupView(context))
    } catch (e) {
      const code = e.code || 'setup_failed'
      const status = ['trial_not_active','wrong_company_or_owner','forbidden_role'].includes(code) ? 403
        : ['revision_conflict','setup_completed'].includes(code) ? 409
          : ['invalid_fields','invalid_company_name','invalid_country','invalid_currency','invalid_region','module_not_allowed','profile_required','setup_incomplete','unknown_step'].includes(code) ? 400 : 503
      return res.status(status).json({ error: 'Configurarea nu a putut fi procesată.', code })
    }
  }
  router.get('/demo-company/setup', handler(false))
  router.patch('/demo-company/setup', handler(true))
  return router
}
module.exports = { createSyntheticSetupRouter }
