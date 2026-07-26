const { Router } = require('express')
const multer = require('multer')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const { sendEmail, describeSmtpError } = require('../messaging/email')
const { testIncomingEmailConnection, describeImapError } = require('../messaging/imap')
const { getAllCountryRules, getCountryProfiles, getCountryRules } = require('../../shared/countryRules')

const moduleCatalogGroups = [
  {
    title: 'PRINCIPALE',
    locked: true,
    modules: [
      { key: 'core', label: 'Core', description: 'Autentificare, roluri, audit, backup și update.' },
      { key: 'production', label: 'Producție', description: 'Rețete, consumuri și planificare producție.' },
      { key: 'inventory', label: 'Stocuri', description: 'Materiale, intrări, ieșiri și gestiune.' },
      { key: 'reports', label: 'Rapoarte', description: 'Rapoarte standard și exporturi.' },
    ],
  },
  {
    title: 'OPERAȚIONALE',
    modules: [
      { key: 'fleet', label: 'Flotă / Mecanizare', description: 'Vehicule, utilaje, foi parcurs, FAZ și GPS.' },
      { key: 'technical', label: 'Tehnic', description: 'Lucrări, teren, vânzări asfalt și raport tehnic.' },
      { key: 'procurement', label: 'Achiziții', description: 'Comenzi, recepții, referate, PAAP și CPV.' },
      { key: 'contract_management', label: 'Contract Management', description: 'Contracte, consum valoric, CPV, manageri și alerte de prag/termen.' },
      { key: 'hr', label: 'HR', description: 'Angajați, pontaj, concedii, dosar personal și Kiosk.' },
      { key: 'controlling', label: 'Controlling', description: 'Centre cost/profit și costuri operaționale.' },
      { key: 'accounting', label: 'Contabilitate', description: 'Plan conturi, facturi, jurnale, declarații și SAF-T.' },
    ],
  },
  {
    title: 'SERVICII',
    modules: [
      { key: 'sanitation', label: 'Salubrizare', description: 'Rute, colectări și rapoarte.' },
      { key: 'traffic_safety', label: 'Siguranța Circulației', description: 'Indicatoare, marcaje și intervenții.' },
      { key: 'environment', label: 'Protecția Mediului', description: 'Autorizații, deșeuri, emisii și incidente.' },
      { key: 'snow_removal', label: 'Deszăpezire', description: 'Planuri, intervenții și consumuri sezoniere.' },
    ],
  },
  {
    title: 'SUPORT',
    modules: [
      { key: 'documents', label: 'Documente și aprobare', description: 'Șabloane, circuit documente și arhivare.' },
      { key: 'messaging', label: 'Mesaje interne', description: 'Canale, notificări și comunicare internă.' },
      { key: 'tickets', label: 'Sesizări', description: 'Tichete, comentarii și urmărire rezolvare.' },
      { key: 'field', label: 'Teren / Șantiere', description: 'Lucrări mobile, rapoarte și activitate teren.' },
      { key: 'legal', label: 'Juridic', description: 'Dosare, termene și documente juridice.' },
      { key: 'archive', label: 'Arhivă', description: 'Arhivare și regăsire documente.' },
      { key: 'secretariat', label: 'Secretariat', description: 'Intrări/ieșiri documente și registre.' },
    ],
  },
  {
    title: 'OPȚIONAL',
    modules: [
      { key: 'ai', label: 'AI Assistant', description: 'Asistent contextual peste datele organizației.' },
    ],
  },
]

const commercialPackages = [
  { key: 'core', label: 'Core', modules: ['documents', 'messaging', 'tickets'], description: 'Baza pentru documente, notificări, utilizatori și audit.' },
  { key: 'hr', label: 'HR', modules: ['hr', 'documents', 'messaging'], description: 'Angajați, pontaj, dosar personal, concedii și Kiosk.' },
  { key: 'operational', label: 'Operațional', modules: ['fleet', 'technical', 'field', 'controlling', 'documents'], description: 'Flotă, lucrări, teren și controlling operațional.' },
  { key: 'gestiune_achizitii', label: 'Gestiune + Achiziții', modules: ['procurement', 'contract_management', 'documents', 'tickets'], description: 'Stocuri, referate, comenzi, recepții, PAAP, contracte și furnizori.' },
  { key: 'accounting', label: 'Contabilitate', modules: ['accounting', 'controlling', 'contract_management', 'documents'], description: 'Contabilitate, declarații, dosar fiscal, contracte și costuri.' },
  { key: 'city_services', label: 'City Services', modules: ['sanitation', 'traffic_safety', 'snow_removal', 'environment', 'field', 'fleet', 'contract_management', 'tickets'], description: 'Servicii publice locale într-un pachet operațional.' },
  { key: 'enterprise', label: 'Enterprise', modules: ['fleet', 'technical', 'procurement', 'contract_management', 'hr', 'controlling', 'accounting', 'sanitation', 'traffic_safety', 'environment', 'snow_removal', 'documents', 'messaging', 'tickets', 'field', 'legal', 'archive', 'secretariat', 'ai'], description: 'Toate modulele pentru organizații mari.' },
]

function buildModulesCatalog(settings = {}, license = {}, allowedModulesForLicense) {
  const allowed = new Set(allowedModulesForLicense(license))
  const configurableKeys = moduleCatalogGroups
    .flatMap(group => group.modules)
    .filter(module => module.key && !['core', 'inventory', 'production', 'reports'].includes(module.key))
    .map(module => module.key)
  const enabled = Array.isArray(settings.modules_enabled)
    ? settings.modules_enabled.map(item => String(item || '').trim().toLowerCase()).filter(Boolean)
    : configurableKeys.filter(key => allowed.has(key))
  const enabledSet = new Set(enabled)

  return {
    groups: moduleCatalogGroups.map(group => ({
      ...group,
      modules: group.modules.map(module => ({
        ...module,
        locked: group.locked || ['core', 'inventory', 'production', 'reports'].includes(module.key),
        allowed: allowed.has(module.key),
        enabled: group.locked || enabledSet.has(module.key),
        features_configurable: module.key && module.key !== 'core',
      })),
    })),
    packages: commercialPackages,
    allowed_modules: Array.from(allowed),
    enabled_modules: enabled,
    updated_at: settings.modules_enabled_updated_at || null,
    updated_by: settings.modules_enabled_updated_by || null,
  }
}

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

  router.get('/settings/modules/catalog', (req, res) => {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'settings:manage')) return
    const license = global.LICENTA || auth.db.settings?.license || {}
    sendJson(res, 200, {
      catalog: buildModulesCatalog(auth.db.settings || {}, license, allowedModulesForLicense)
    })
  })

  router.get('/settings/country-profiles', (req, res) => {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'settings:manage')) return
    sendJson(res, 200, { countries: getCountryProfiles() })
  })

  router.get('/settings/country-rules', (req, res) => {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'settings:manage')) return
    const requestedCountry = req.url.includes('?')
      ? new URL(req.url, 'http://infraflow.local').searchParams.get('country')
      : ''
    const country = requestedCountry || auth.db.settings?.country || 'RO'
    sendJson(res, 200, {
      current: getCountryRules(country),
      countries: getAllCountryRules(),
    })
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
    let auth = null
    try {
      auth = requireAuth(req, res)
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
      if (error?.smtpDiagnostic) {
        const diagnostic = describeSmtpError(error, auth?.db?.settings || {})
        sendJson(res, diagnostic.status || 422, diagnostic)
        return
      }
      next(error)
    }
  })

  router.post('/settings/email/imap/test', async (req, res, next) => {
    let auth = null
    try {
      auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'settings:manage')) return
      const result = await testIncomingEmailConnection(auth.db)
      sendJson(res, 200, {
        ...result,
        message: result.scanned > 0
          ? `Conexiune IMAP OK. Am citit ${result.scanned} email de probă.`
          : 'Conexiune IMAP OK. Inboxul este accesibil.'
      })
    } catch (error) {
      if (error?.imapDiagnostic) {
        sendJson(res, 422, describeImapError(error))
        return
      }
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
