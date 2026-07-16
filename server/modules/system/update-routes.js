const { Router } = require('express')
const express = require('express')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const { requireAuth } = require('../../core/auth')
const { requirePermission, requireSuperadmin } = require('../../core/permissions')
const { writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const {
  createServerBackup,
  installUpdatePackage,
  scheduleApplicationRestart,
  verificaUpdateDisponibil,
  instaleazaUpdateOnline
} = require('./service')

function createSystemUpdateRouter(context) {
  const {
    ROOT,
    UPDATE_UPLOAD_MAX_BYTES,
    readRuntimeVersion,
    makeUrl,
    readJsonBody,
    readBinaryBody,
    sendJson,
    throwHttp,
    openUpdateZip,
    findUpdateVersionEntry,
    parseUpdateVersion,
    compareVersions,
    validateZipEntries,
    resolveExtractedUpdateRoot,
    copyDirExcept,
    copyDir,
    copyNewMigrations,
    copyFileIfExists
  } = context

  const router = Router()
  let updateCheckCache = { at: 0, data: null }
  const updateUploadDir = path.join(ROOT, 'storage', 'updates')
  fs.mkdirSync(updateUploadDir, { recursive: true })
  const updateUpload = multer({
    dest: updateUploadDir,
    limits: { fileSize: 500 * 1024 * 1024 }
  })

  function updateJsonVersionFile(filePath, version) {
    if (!fs.existsSync(filePath)) return
    try {
      const info = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      info.version = version
      fs.writeFileSync(filePath, `${JSON.stringify(info, null, 2)}\n`)
      delete require.cache[require.resolve(filePath)]
    } catch {
      // Nu blocăm update-ul dacă un package auxiliar lipsește sau este parțial.
    }
  }

  function syncRuntimeVersionFiles(version, versionInfo = {}) {
    const normalized = String(version || '').trim()
    if (!normalized) return
    const versionPath = path.join(ROOT, 'version.json')
    if (!fs.existsSync(versionPath)) {
      fs.writeFileSync(versionPath, `${JSON.stringify({
        version: normalized,
        date: new Date().toISOString().slice(0, 10),
        changelog: versionInfo.changelog || ''
      }, null, 2)}\n`)
    } else {
      updateJsonVersionFile(versionPath, normalized)
    }
    [
      path.join(ROOT, 'package.json'),
      path.join(ROOT, 'server', 'package.json'),
      path.join(ROOT, 'client', 'package.json'),
      path.join(ROOT, 'electron', 'package.json')
    ].forEach((filePath) => updateJsonVersionFile(filePath, normalized))
    updateCheckCache = { at: 0, data: null }
  }

  function buildLocalChangelog() {
    const updatesDir = path.join(ROOT, 'updates')
    const legacyPath = path.join(ROOT, 'CHANGELOG.md')
    const legacy = fs.existsSync(legacyPath) ? fs.readFileSync(legacyPath, 'utf8') : ''
    if (!fs.existsSync(updatesDir)) return legacy
    const updateFiles = fs.readdirSync(updatesDir)
      .filter((name) => /^UPDATE_\d+.*\.md$/i.test(name))
      .sort((a, b) => b.localeCompare(a, 'ro', { numeric: true }))
      .slice(0, 80)
    if (!updateFiles.length) return legacy
    const sections = updateFiles.map((name) => {
      const text = fs.readFileSync(path.join(updatesDir, name), 'utf8').trim()
      return `<!-- ${name} -->\n${text}`
    })
    return `# Changelog InfraFlow\n\n${sections.join('\n\n---\n\n')}\n\n---\n\n## Istoric vechi\n\n${legacy.replace(/^# Changelog\s*/i, '').trim()}`
  }

  router.post('/system/update-package', express.raw({ type: ['application/zip', 'application/octet-stream'], limit: UPDATE_UPLOAD_MAX_BYTES }), async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      const url = makeUrl(req)
      if (!requireSuperadmin(auth, res)) return
      const archive = await readBinaryBody(req, UPDATE_UPLOAD_MAX_BYTES)
      const result = installUpdatePackage(auth.db, auth.user, archive, {
        fileName: decodeURIComponent(url.searchParams.get('fileName') || 'update.zip')
      })
      writeDb(auth.db)
      sendJson(res, 200, result)
    } catch (error) {
      next(error)
    }
  })

  router.get(['/system/update/check', '/system/update-check'], async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'system:view')) return
      const now = Date.now()
      const currentVersion = readRuntimeVersion()
      if (!updateCheckCache.data || updateCheckCache.data.versiune_curenta !== currentVersion || now - updateCheckCache.at > 60 * 60 * 1000) {
        updateCheckCache = {
          at: now,
          data: await verificaUpdateDisponibil(global.LICENTA)
        }
      }
      updateCheckCache.data.versiune_curenta = currentVersion
      sendJson(res, 200, updateCheckCache.data)
    } catch (error) {
      next(error)
    }
  })

  router.get('/system/update/changelog', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'system:view')) return
      if (String(req.query?.local || '') === '1') {
        const text = buildLocalChangelog()
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        return res.send(text)
      }
      const response = await fetch('https://updates.infraflow.ro/changelog/latest', {
        signal: AbortSignal.timeout(5000)
      })
      const text = await response.text()
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.send(text)
    } catch (error) {
      next(error)
    }
  })

  router.post('/system/update/install', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requireSuperadmin(auth, res)) return
      const body = await readJsonBody(req)
      const result = await instaleazaUpdateOnline(auth.db, auth.user, global.LICENTA, body.versiune || body.versiune_noua)
      addAudit(auth.db, auth.user, 'update_online_instalat', `Versiune ${result.versiune}`)
      writeDb(auth.db)
      sendJson(res, 200, { ok: true, versiune: result.versiune })
    } catch (error) {
      next(error)
    }
  })

  router.post(['/system/update/upload', '/system/update-upload'], updateUpload.single('update_package'), async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'system:update')) return
      if (!req.file) throwHttp(400, 'Fișierul de update este obligatoriu.')
      if (!String(req.file.originalname || '').toLowerCase().endsWith('.zip')) {
        fs.unlink(req.file.path, () => {})
        return sendJson(res, 400, { error: 'Doar fișiere .zip sunt acceptate' })
      }
      const zip = openUpdateZip(req.file.path)
      const versionEntry = findUpdateVersionEntry(zip)
      if (!versionEntry) {
        fs.unlink(req.file.path, () => {})
        return sendJson(res, 400, { error: 'Fișier .zip invalid — lipsește version.json' })
      }
      const versionInfo = parseUpdateVersion(versionEntry)
      const current = readRuntimeVersion()
      if (compareVersions(versionInfo.version, current) <= 0) {
        fs.unlink(req.file.path, () => {})
        return sendJson(res, 400, {
          error: `Versiunea ${versionInfo.version} nu e mai nouă decât ${current}`
        })
      }
      addAudit(auth.db, auth.user, 'update_manual_incarcat', `Pachet ${versionInfo.version} / ${req.file.originalname}`)
      writeDb(auth.db)
      sendJson(res, 200, {
        ok: true,
        filename: req.file.filename,
        versiune_noua: versionInfo.version,
        versiune_curenta: current,
        changelog: versionInfo.changelog || '',
        marime_mb: Math.round(req.file.size / 1024 / 1024 * 10) / 10
      })
    } catch (error) {
      if (req.file?.path) fs.unlink(req.file.path, () => {})
      next(error)
    }
  })

  router.post('/system/update/apply', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'system:update')) return
      const body = await readJsonBody(req)
      const filename = path.basename(String(body.filename || ''))
      if (!filename) throwHttp(400, 'Numele fișierului de update este obligatoriu.')
      const archivePath = path.join(updateUploadDir, filename)
      if (!fs.existsSync(archivePath)) throwHttp(404, 'Pachetul de update nu a fost găsit.')
      const zip = openUpdateZip(archivePath)
      const versionEntry = findUpdateVersionEntry(zip)
      if (!versionEntry) throwHttp(400, 'Fișier .zip invalid — lipsește version.json')
      const versionInfo = parseUpdateVersion(versionEntry)
      const current = readRuntimeVersion()
      if (compareVersions(versionInfo.version, current) <= 0) {
        throwHttp(400, `Versiunea ${versionInfo.version} nu e mai nouă decât ${current}`)
      }

      const backup = createServerBackup(auth.db, auth.user, `Backup automat pre-update ${current} -> ${versionInfo.version}`)
      const tmpDir = path.join(ROOT, 'storage', 'updates', 'tmp', Date.now().toString())
      fs.mkdirSync(tmpDir, { recursive: true })
      validateZipEntries(zip)
      zip.extractAllTo(tmpDir, true)
      const packageRoot = resolveExtractedUpdateRoot(tmpDir)

      copyDirExcept(path.join(packageRoot, 'server'), path.join(ROOT, 'server'), ['node_modules', '.env', 'data'])
      copyDir(path.join(packageRoot, 'client', 'dist'), path.join(ROOT, 'client', 'dist'))
      copyNewMigrations(path.join(packageRoot, 'db', 'migrations'), path.join(ROOT, 'db', 'migrations'))
      copyDir(path.join(packageRoot, 'db', 'seeds'), path.join(ROOT, 'db', 'seeds'))
      copyDir(path.join(packageRoot, 'db', 'templates'), path.join(ROOT, 'db', 'templates'))
      copyDir(path.join(packageRoot, 'db', 'sqlserver'), path.join(ROOT, 'db', 'sqlserver'))
      copyDir(path.join(packageRoot, 'scripts'), path.join(ROOT, 'scripts'))
      copyDir(path.join(packageRoot, 'updates'), path.join(ROOT, 'updates'))
      copyFileIfExists(path.join(packageRoot, 'version.json'), path.join(ROOT, 'version.json'))
      copyFileIfExists(path.join(packageRoot, 'package.json'), path.join(ROOT, 'package.json'))
      copyFileIfExists(path.join(packageRoot, 'client', 'package.json'), path.join(ROOT, 'client', 'package.json'))
      copyFileIfExists(path.join(packageRoot, 'electron', 'package.json'), path.join(ROOT, 'electron', 'package.json'))
      copyFileIfExists(path.join(packageRoot, 'CHANGELOG.md'), path.join(ROOT, 'CHANGELOG.md'))

      syncRuntimeVersionFiles(versionInfo.version, versionInfo)

      auth.db.settings = auth.db.settings || {}
      auth.db.settings.update_history = Array.isArray(auth.db.settings.update_history) ? auth.db.settings.update_history : []
      auth.db.settings.update_history.unshift({
        version: versionInfo.version,
        previous_version: current,
        applied_at: new Date().toISOString(),
        applied_by: auth.user.name || auth.user.username || auth.user.id,
        backup: backup?.name || backup?.path || null
      })
      auth.db.settings.update_history = auth.db.settings.update_history.slice(0, 50)
      addAudit(auth.db, auth.user, 'update_manual_instalat', `Update ${current} -> ${versionInfo.version}`)
      writeDb(auth.db)

      fs.rmSync(tmpDir, { recursive: true, force: true })
      fs.unlinkSync(archivePath)
      sendJson(res, 200, { ok: true, versiune: versionInfo.version, restart_in: 12 })
      scheduleApplicationRestart()
    } catch (error) {
      next(error)
    }
  })

  router.get('/system/update/history', (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'system:view')) return
      const history = Array.isArray(auth.db.settings?.update_history) ? auth.db.settings.update_history : []
      sendJson(res, 200, { history: history.slice(0, 10) })
    } catch (error) {
      next(error)
    }
  })

  return router
}

module.exports = { createSystemUpdateRouter }
