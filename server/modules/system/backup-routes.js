const { Router } = require('express')
const fs = require('fs')
const path = require('path')
const { requireAuth } = require('../../core/auth')
const { requirePermission, requireSuperadmin } = require('../../core/permissions')
const { writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const {
  buildSystemDiagnostics,
  createServerBackup,
  restoreMssqlServerBackup,
  listBackupFiles,
  backupFileInfo,
  scheduleApplicationRestart
} = require('./service')

function createSystemBackupRouter(context) {
  const {
    ROOT,
    readJsonBody,
    sendJson,
    sendBuffer,
    throwHttp,
    validateRestoreData,
    localDate
  } = context

  const router = Router()

  function latestBackupInfoLocal() {
    const dir = path.join(ROOT, 'backups')
    if (!fs.existsSync(dir)) {
      return { directory: dir, exists: false, count: 0, latest: null, items: [] }
    }
    const backups = listBackupFiles()
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    return {
      directory: dir,
      exists: true,
      count: backups.length,
      latest: backups[0] || null,
      items: backups.slice(0, 20)
    }
  }

  router.get('/system/backups', (req, res) => {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'system:view')) return
    sendJson(res, 200, { backup: latestBackupInfoLocal() })
  })

  router.post('/system/backups', (req, res) => {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'system:view')) return
    const backup = createServerBackup(auth.db, auth.user, 'Backup creat manual din Sistem')
    sendJson(res, 201, { backup, diagnostics: buildSystemDiagnostics(auth.db) })
  })

  router.post('/system/backups/:name/restore', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requireSuperadmin(auth, res)) return
      const body = await readJsonBody(req)
      if (String(body.confirm || '').trim() !== 'RESTAUREZ') {
        throwHttp(400, 'Confirmarea restaurarii este invalida.')
      }
      const backup = backupFileInfo(decodeURIComponent(req.params.name))
      if (!backup) throwHttp(404, 'Backup inexistent.')
      if (backup.name.endsWith('.bak')) {
        const result = restoreMssqlServerBackup(backup, auth.db, auth.user)
        sendJson(res, 202, {
          ok: true,
          ...result,
          message: 'Backup MSSQL restaurat. Aplicatia reporneste in cateva secunde.'
        })
        scheduleApplicationRestart()
        return
      }
      let parsed
      try {
        parsed = JSON.parse(fs.readFileSync(backup.path, 'utf8'))
      } catch {
        throwHttp(400, 'Backup invalid: fisierul nu este JSON valid.')
      }
      const restored = validateRestoreData(parsed)
      const safetyBackup = createServerBackup(auth.db, auth.user, `Backup automat inainte de restaurare server: ${backup.name}`)
      addAudit(restored, auth.user, 'restore_backup_server', `Restaurat din ${backup.name}. Backup siguranta: ${safetyBackup?.name || '-'}`)
      writeDb(restored)
      sendJson(res, 200, { ok: true, restoredFrom: backup.name, safetyBackup, settings: restored.settings, backup: latestBackupInfoLocal() })
    } catch (error) {
      next(error)
    }
  })

  router.get('/backup', (req, res) => {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'settings:manage')) return
    const backup = Buffer.from(JSON.stringify({ ...auth.db, backupCreatedAt: new Date().toISOString() }, null, 2), 'utf8')
    sendBuffer(res, 200, backup, 'application/json; charset=utf-8', `backup-asfalt-pro-${localDate(new Date())}.json`)
  })

  router.post('/backup', (req, res) => {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'settings:manage')) return
    const backup = Buffer.from(JSON.stringify({ ...auth.db, backupCreatedAt: new Date().toISOString() }, null, 2), 'utf8')
    sendBuffer(res, 200, backup, 'application/json; charset=utf-8', `backup-asfalt-pro-${localDate(new Date())}.json`)
  })

  router.post('/restore', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'settings:manage')) return
      const body = await readJsonBody(req, 20_000_000)
      const restored = validateRestoreData(body)
      const safetyBackup = createServerBackup(auth.db, auth.user, 'Backup automat inainte de restaurare din fisier JSON')
      addAudit(restored, auth.user, 'restore_date', `Date restaurate din backup JSON. Backup siguranta: ${safetyBackup?.name || '-'}`)
      writeDb(restored)
      sendJson(res, 200, { ok: true, settings: restored.settings, safetyBackup, backup: latestBackupInfoLocal() })
    } catch (error) {
      next(error)
    }
  })

  return router
}

module.exports = { createSystemBackupRouter }
