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
  verificaCatalogCentralUpdate,
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
  const isLinuxRuntime = process.platform === 'linux'
  const linuxUpdateInbox = path.join(ROOT, 'runtime', 'update-inbox')

  function linuxPackageVersion(fileName) {
    const match = String(fileName || '').match(/^InfraFlow-update-v(\d+(?:\.\d+){2,})-linux\.tar\.gz$/i)
    return match ? match[1] : ''
  }

  function moveUpdatePackage(sourcePath, targetPath) {
    try {
      fs.renameSync(sourcePath, targetPath)
    } catch (error) {
      if (error?.code !== 'EXDEV') throw error
      fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL)
      fs.unlinkSync(sourcePath)
    }
  }

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

  function readRestartLogStatus() {
    const logPath = path.join(ROOT, 'runtime', 'restart-last.log')
    if (!fs.existsSync(logPath)) {
      return {
        exists: false,
        path: logPath,
        status: 'never_run',
        status_label: 'Fără restart înregistrat',
        updated_at: null,
        lines: []
      }
    }
    const stat = fs.statSync(logPath)
    const text = fs.readFileSync(logPath, 'utf8')
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(-40)
    const lower = lines.join('\n').toLowerCase()
    let status = 'pending'
    let statusLabel = 'Restart înregistrat'
    if (lower.includes('health ok')) {
      status = 'ok'
      statusLabel = 'Server revenit după restart'
    } else if (lower.includes('eroare:') || lower.includes('avertisment: serverul nu a raspuns')) {
      status = 'warning'
      statusLabel = 'Restart cu avertisment'
    } else if (lower.includes('restart helper pornit') || lower.includes('comanda de restart executata')) {
      status = 'running'
      statusLabel = 'Restart în curs / verificare în așteptare'
    }
    return {
      exists: true,
      path: logPath,
      status,
      status_label: statusLabel,
      updated_at: stat.mtime.toISOString(),
      lines
    }
  }

  function readLinuxUpdateStatus() {
    const logPath = path.join(ROOT, 'runtime', 'update-last.log')
    if (!fs.existsSync(logPath)) return null
    const stat = fs.statSync(logPath)
    const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(-40)
    const text = lines.join('\n').toLowerCase()
    return {
      updated_at: stat.mtime.toISOString(),
      status: text.includes('ok: update aplicat') ? 'ok' : text.includes('eroare:') ? 'warning' : 'running',
      lines
    }
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
      const forceRefresh = ['1', 'true'].includes(String(req.query?.force || '').trim().toLowerCase())
      if (forceRefresh || !updateCheckCache.data || updateCheckCache.data.versiune_curenta !== currentVersion || now - updateCheckCache.at > 60 * 60 * 1000) {
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

  router.get('/system/update/catalog-status', async (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'system:view')) return
      sendJson(res, 200, await verificaCatalogCentralUpdate(global.LICENTA))
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
      const originalName = String(req.file.originalname || '')
      if (isLinuxRuntime) {
        const version = linuxPackageVersion(originalName)
        if (!version) {
          fs.unlink(req.file.path, () => {})
          return sendJson(res, 400, { error: 'Pe Linux încarcă numai InfraFlow-update-vX.Y.Z-linux.tar.gz' })
        }
        const current = readRuntimeVersion()
        if (compareVersions(version, current) <= 0) {
          fs.unlink(req.file.path, () => {})
          return sendJson(res, 400, { error: `Versiunea ${version} nu e mai nouă decât ${current}` })
        }
        const storedName = `${version}--${req.file.filename}`
        fs.renameSync(req.file.path, path.join(updateUploadDir, storedName))
        addAudit(auth.db, auth.user, 'update_linux_incarcat', `Pachet ${version} / ${originalName}`)
        writeDb(auth.db)
        return sendJson(res, 200, {
          ok: true,
          filename: storedName,
          versiune_noua: version,
          versiune_curenta: current,
          changelog: 'Pachet Linux verificat. Backupul și repornirea se execută după confirmare.',
          marime_mb: Math.round(req.file.size / 1024 / 1024 * 10) / 10,
          linux_managed: true
        })
      }
      if (!originalName.toLowerCase().endsWith('.zip')) {
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
      if (isLinuxRuntime) {
        const version = String(filename).match(/^(\d+(?:\.\d+){2,})--/)?.[1]
        if (!version) throwHttp(400, 'Pachet Linux invalid.')
        fs.mkdirSync(linuxUpdateInbox, { recursive: true })
        const target = path.join(linuxUpdateInbox, `InfraFlow-update-v${version}-linux.tar.gz`)
        moveUpdatePackage(archivePath, target)
        addAudit(auth.db, auth.user, 'update_linux_programat', `Update Linux programat: ${version}`)
        writeDb(auth.db)
        return sendJson(res, 202, { ok: true, versiune: version, restart_in: 20, message: 'Update Linux programat. Backupul și repornirea sunt gestionate de systemd.' })
      }
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
      copyDir(path.join(packageRoot, 'docs'), path.join(ROOT, 'docs'))
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

  router.get('/system/update/status', (req, res, next) => {
    try {
      const auth = requireAuth(req, res)
      if (!auth) return
      if (!requirePermission(auth, res, 'system:view')) return
      const history = Array.isArray(auth.db.settings?.update_history) ? auth.db.settings.update_history : []
      sendJson(res, 200, {
        ok: true,
        version: readRuntimeVersion(),
        last_update: history[0] || null,
        restart: readRestartLogStatus(),
        linux_update: readLinuxUpdateStatus(),
        checked_at: new Date().toISOString()
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}

module.exports = { createSystemUpdateRouter }
