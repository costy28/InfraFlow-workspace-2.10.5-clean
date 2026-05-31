const { Router } = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { requireAuth } = require('../../../core/auth')
const { requirePermission } = require('../../../core/permissions')
const { readDb, writeDb } = require('../../../core/db')
const { addAudit } = require('../../../core/audit')
const { importFromBackup, previewBackup } = require('./importer')

const router = Router()
const tempDir = path.join(__dirname, '../../../storage/temp/')
fs.mkdirSync(tempDir, { recursive: true })

const upload = multer({
  dest: tempDir,
  limits: { fileSize: 100 * 1024 * 1024 }
})

function validateJsonUpload(file) {
  if (!file) {
    const error = new Error('Fisierul backup .json este obligatoriu.')
    error.status = 400
    throw error
  }
  if (path.extname(file.originalname || '').toLowerCase() !== '.json') {
    const error = new Error('Sunt acceptate doar fisiere .json.')
    error.status = 400
    throw error
  }
}

function cleanup(file) {
  if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path)
}

function readUpload(file) {
  return fs.readFileSync(file.path, 'utf8')
}

router.post('/integration/legacy/preview', upload.single('file'), (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'settings:manage')) return

    validateJsonUpload(req.file)
    const summary = previewBackup(readUpload(req.file))
    res.json(summary)
  } catch (error) {
    next(error)
  } finally {
    cleanup(req.file)
  }
})

router.post('/integration/legacy/import', upload.single('file'), async (req, res, next) => {
  const start = Date.now()
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'settings:manage')) return

    validateJsonUpload(req.file)
    const backupJson = readUpload(req.file)
    const preview = previewBackup(backupJson)
    const db = readDb()
    const result = await importFromBackup(backupJson, db)
    addAudit(db, auth.user, 'legacy_import', `Backup ${preview.backup_data}`)
    writeDb(db)

    res.json({
      ok: true,
      importat: result,
      backup_data: preview.backup_data,
      durata_ms: Date.now() - start
    })
  } catch (error) {
    next(error)
  } finally {
    cleanup(req.file)
  }
})

module.exports = router
