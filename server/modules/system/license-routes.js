const { Router } = require('express')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const { verificaLicenta, incarcaLicenta } = require('../../core/license')
const { isIsolatedCommercialDemo, commercialDemoLicense } = require('../../shared/commercialDemo')

const licenseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
})

// Catalog comercial vizibil în aplicație. Nu conține prețuri, costuri sau alte
// informații interne; licența semnată rămâne sursa de adevăr pentru drepturi.
const COMMERCIAL_PROFILES = [
  { key: 'start', label: 'Start', maxUsers: 5, modules: ['core', 'documents', 'messaging', 'tickets'], description: 'Utilizatori, documente, aprobări, mesaje, solicitări și audit.' },
  { key: 'business', label: 'Business', maxUsers: 10, modules: ['core', 'documents', 'messaging', 'tickets', 'crm', 'inventory', 'procurement', 'contract_management'], description: 'Start plus CRM, oferte, comenzi, stocuri, achiziții și contracte.' },
  { key: 'operations', label: 'Operations', maxUsers: 20, modules: ['core', 'documents', 'messaging', 'tickets', 'crm', 'inventory', 'procurement', 'contract_management', 'production', 'fleet', 'technical', 'field', 'controlling'], description: 'Business plus producție, teren, flotă, echipamente și controlling.' },
  { key: 'enterprise', label: 'Enterprise', maxUsers: 30, modules: ['core', 'documents', 'messaging', 'tickets', 'crm', 'inventory', 'procurement', 'contract_management', 'production', 'fleet', 'technical', 'field', 'controlling', 'hr', 'accounting', 'legal', 'archive', 'secretariat'], description: 'Operations plus HR, contabilitate, juridic, registratură și arhivă.' },
]

function commercialProfile(license = {}) {
  const normalized = String(license.pachet || '').trim().toLowerCase()
  if (normalized === 'demo complet') {
    return {
      key: 'demo',
      label: 'Demo complet',
      maxUsers: null,
      modules: COMMERCIAL_PROFILES.find(profile => profile.key === 'enterprise')?.modules || [],
      description: 'Mediu demonstrativ cu acces la modulele comerciale, operaționale și administrative.',
    }
  }
  return COMMERCIAL_PROFILES.find(profile => profile.key === normalized) || null
}

function userUsage(db, license = {}) {
  const active = (db?.users || []).filter(user => user.active !== false).length
  const limit = Number(license.limite?.max_utilizatori || license.limite?.maxUsers || 0)
  const remaining = limit > 0 ? Math.max(0, limit - active) : null
  const status = limit <= 0 ? 'unknown' : active > limit ? 'over' : active === limit ? 'at_limit' : remaining <= 1 ? 'near_limit' : 'within'
  return { active, limit, remaining, status, blocking: false }
}

function publicLicenseStatus(status, db) {
  const license = status.licenta || {}
  return {
    valida: !!status.valida,
    demo: !!status.demo,
    in_gratie: !!status.in_gratie,
    expirata: !!status.expirata,
    eroare: status.eroare || null,
    licenseId: license.licenseId || null,
    client: {
      nume: license.client?.nume || '',
      localitate: license.client?.localitate || ''
    },
    pachet: license.pachet || null,
    tip: license.valabilitate?.tip || null,
    module_active: [...(license.module || []), ...(license.addons || [])],
    module: license.module || [],
    addons: license.addons || [],
    limite: license.limite || {},
    valabilitate: {
      emis_la: license.valabilitate?.emis_la || null,
      expira_la: license.valabilitate?.expira_la || null,
      tip: license.valabilitate?.tip || null
    },
    zile_pana_expirare: status.zile_pana_expirare ?? null,
    zile_gratie: status.zile_gratie ?? null,
    commercialProfile: commercialProfile(license),
    commercialProfiles: COMMERCIAL_PROFILES,
    usage: userUsage(db, license),
  }
}

function createSystemLicenseRouter(context) {
  const {
    ROOT,
    readJsonBody,
    sendJson,
    throwHttp
  } = context

  const router = Router()

  router.get('/license/status', (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      const runtimeStatus = incarcaLicenta()
      const status = isIsolatedCommercialDemo(auth.db)
        ? { valida: true, demo: true, in_gratie: false, expirata: false, licenta: commercialDemoLicense(auth.db, runtimeStatus.licenta) }
        : runtimeStatus
      sendJson(res, 200, { license: publicLicenseStatus(status, auth.db) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/license/import', licenseUpload.single('file'), async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'settings:manage')) return
      const body = await readJsonBody(req, 5_000_000)
      let licenseText = null
      if (req.file) {
        if (!String(req.file.originalname || '').toLowerCase().endsWith('.iflic')) {
          throwHttp(400, 'Fișierul trebuie să aibă extensia .iflic.')
        }
        licenseText = req.file.buffer.toString('utf8')
      } else {
        licenseText = typeof body.licenseText === 'string'
          ? body.licenseText
          : typeof body.license === 'string'
            ? body.license
            : JSON.stringify(body.license || body)
      }
      const status = verificaLicenta(licenseText)
      if (!status.valida) throwHttp(400, status.eroare || 'Licența nu este validă.')
      const target = path.join(ROOT, 'licenta.iflic')
      fs.writeFileSync(target, licenseText, 'utf8')
      global.LICENTA = status.licenta
      addAudit(auth.db, auth.user, 'licenta_importata', `${status.licenta.client?.nume || '-'} / ${status.licenta.pachet || '-'}`)
      writeDb(auth.db)
      sendJson(res, 200, { license: publicLicenseStatus(status, auth.db) })
    } catch (error) {
      next(error)
    }
  })

  return router
}

module.exports = { createSystemLicenseRouter }
