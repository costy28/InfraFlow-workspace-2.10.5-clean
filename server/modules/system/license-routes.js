const { Router } = require('express')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const { verificaLicenta, incarcaLicenta } = require('../../core/license')

const licenseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
})

function publicLicenseStatus(status) {
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
    zile_gratie: status.zile_gratie ?? null
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
      const status = incarcaLicenta()
      sendJson(res, 200, { license: publicLicenseStatus(status) })
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
      sendJson(res, 200, { license: publicLicenseStatus(status) })
    } catch (error) {
      next(error)
    }
  })

  return router
}

module.exports = { createSystemLicenseRouter }
