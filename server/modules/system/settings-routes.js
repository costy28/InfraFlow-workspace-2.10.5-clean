const { Router } = require('express')
const multer = require('multer')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const { sendEmail } = require('../messaging/email')

const settingsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
})

function createSystemSettingsRouter(context) {
  const {
    readJsonBody,
    sendJson,
    throwHttp,
    publicSettings,
    updateSettings,
    sanitizeEnabledModules,
    sanitizeModuleFeatures,
    allowedModulesForLicense,
    decryptSettingSecret,
    buildDeviceRegistry
  } = context

  const router = Router()

  router.get('/settings', (req, res) => {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'settings:manage')) return
    sendJson(res, 200, { settings: publicSettings(auth.db.settings) })
  })

  router.patch('/settings', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'settings:manage')) return
      const body = await readJsonBody(req)
      auth.db.settings = updateSettings(auth.db.settings, body)
      addAudit(auth.db, auth.user, 'setari_modificate', `${auth.db.settings.companyName} / ${auth.db.settings.stationName || ''}`)
      writeDb(auth.db)
      sendJson(res, 200, { settings: publicSettings(auth.db.settings) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/settings', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'settings:manage')) return
      const body = await readJsonBody(req)
      auth.db.settings = updateSettings(auth.db.settings, body)
      addAudit(auth.db, auth.user, 'setari_modificate', `${auth.db.settings.companyName} / ${auth.db.settings.stationName || ''}`)
      writeDb(auth.db)
      sendJson(res, 200, { settings: publicSettings(auth.db.settings) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/settings/modules', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'settings:manage')) return
      const body = await readJsonBody(req)
      const modules = sanitizeEnabledModules(body.modules_enabled, global.LICENTA || auth.db.settings?.license || {})
      auth.db.settings = auth.db.settings || {}
      auth.db.settings.modules_enabled = modules
      if (Object.prototype.hasOwnProperty.call(body, 'module_features')) {
        auth.db.settings.module_features = sanitizeModuleFeatures(body.module_features, global.LICENTA || auth.db.settings?.license || {})
      }
      auth.db.settings.modules_enabled_updated_at = new Date().toISOString()
      auth.db.settings.modules_enabled_updated_by = auth.user.id
      addAudit(auth.db, auth.user, 'module_actualizate', modules.join(', '))
      writeDb(auth.db)
      sendJson(res, 200, {
        settings: publicSettings(auth.db.settings),
        modules_enabled: modules,
        modules_allowed: allowedModulesForLicense(global.LICENTA || auth.db.settings?.license || {})
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/settings/email/test', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'settings:manage')) return
      const body = await readJsonBody(req)
      const to = body.to || auth.user.email || auth.db.settings?.email || auth.db.settings?.smtp_user
      if (!to) throwHttp(400, 'Nu exista destinatar pentru emailul de test.')
      await sendEmail({
        to,
        subject: 'Test configurare email InfraFlow',
        body: '<p>Configurarea SMTP InfraFlow functioneaza.</p>'
      }, auth.db)
      sendJson(res, 200, { ok: true, message: 'Email de test trimis.' })
    } catch (error) {
      next(error)
    }
  })

  router.get('/admin/branding', (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'settings:manage')) return
      sendJson(res, 200, { branding: auth.db.settings?.branding || {} })
    } catch (error) {
      next(error)
    }
  })

  router.post('/admin/branding', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'settings:manage')) return
      const body = await readJsonBody(req)
      auth.db.settings = auth.db.settings || {}
      auth.db.settings.branding = {
        ...(auth.db.settings.branding || {}),
        logo: body.logo || body.logoData || auth.db.settings.branding?.logo || '',
        primaryColor: body.primaryColor || body.primary_color || body.culoare_primara || '#0F6E56',
        culoare_primara: body.culoare_primara || body.primaryColor || body.primary_color || '#0F6E56',
        culoare_secundara: body.culoare_secundara || body.secondaryColor || body.primaryColor || '#1a56db',
        docHeader: Array.isArray(body.docHeader) ? body.docHeader : [
          body.doc_header_linie1 || '',
          body.doc_header_linie2 || '',
          body.doc_header_linie3 || '',
          body.doc_header_linie4 || ''
        ],
        docFooter: {
          left: body.footerLeft || body.footer_left || body.doc_footer_stanga || '',
          center: body.footerCenter || body.footer_center || body.doc_footer_centru || '',
          right: body.footerRight || body.footer_right || body.doc_footer_dreapta || ''
        },
        doc_header_linie1: body.doc_header_linie1 || body.docHeader?.[0] || '',
        doc_header_linie2: body.doc_header_linie2 || body.docHeader?.[1] || '',
        doc_header_linie3: body.doc_header_linie3 || body.docHeader?.[2] || '',
        doc_header_linie4: body.doc_header_linie4 || body.docHeader?.[3] || '',
        doc_footer_stanga: body.doc_footer_stanga || body.footerLeft || body.footer_left || '',
        doc_footer_centru: body.doc_footer_centru || body.footerCenter || body.footer_center || '',
        doc_footer_dreapta: body.doc_footer_dreapta || body.footerRight || body.footer_right || ''
      }
      addAudit(auth.db, auth.user, 'branding_modificat', 'Setări aspect documente actualizate')
      writeDb(auth.db)
      sendJson(res, 200, { branding: auth.db.settings.branding })
    } catch (error) {
      next(error)
    }
  })

  router.post('/admin/branding/logo', settingsUpload.single('file'), async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'settings:manage')) return
      if (!req.file) throwHttp(400, 'Fișierul logo este obligatoriu.')
      const type = String(req.file.mimetype || '').toLowerCase()
      const name = String(req.file.originalname || '').toLowerCase()
      if (!['image/png', 'image/svg+xml'].includes(type) && !name.endsWith('.png') && !name.endsWith('.svg')) {
        throwHttp(400, 'Logo-ul trebuie să fie PNG sau SVG.')
      }
      auth.db.settings = auth.db.settings || {}
      auth.db.settings.branding = auth.db.settings.branding || {}
      auth.db.settings.branding.logo = `data:${type || (name.endsWith('.svg') ? 'image/svg+xml' : 'image/png')};base64,${req.file.buffer.toString('base64')}`
      addAudit(auth.db, auth.user, 'branding_logo_modificat', req.file.originalname || 'logo')
      writeDb(auth.db)
      sendJson(res, 200, { branding: auth.db.settings.branding })
    } catch (error) {
      next(error)
    }
  })

  router.get('/integration/gps/test', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'settings:manage')) return
      const settings = auth.db.settings || {}
      const url = settings.gps_api_url || settings.gpsApiUrl || ''
      if (!url) throwHttp(400, 'URL API GPS lipsa.')
      const response = await fetch(url, {
        headers: settings.gps_api_key ? { Authorization: `Bearer ${decryptSettingSecret(settings.gps_api_key)}` } : {},
        signal: AbortSignal.timeout(8000)
      })
      sendJson(res, response.ok ? 200 : 502, {
        ok: response.ok,
        status: response.status,
        message: response.ok ? 'Conexiune reusita' : 'Verifica URL si cheia API'
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/devices', (req, res) => {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'settings:manage')) return
    sendJson(res, 200, buildDeviceRegistry(auth.db))
  })

  return router
}

module.exports = { createSystemSettingsRouter }
