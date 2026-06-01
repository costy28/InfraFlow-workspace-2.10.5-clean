const { Router } = require('express')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { readDb, writeDb, runMssqlScalar, DB_MODE, MSSQL_RELATIONAL_MODE } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const { notifyUser } = require('../messaging/routes')
const router = Router()

const storageRoot = path.join(__dirname, '../../../storage')

function sendJson(res, status, data) {
  res.status(status).json(data)
}

function throwHttp(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

function nowIso() {
  return new Date().toISOString()
}

function todayPath() {
  const d = new Date()
  return [String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')]
}

function isMssqlMode() {
  return MSSQL_RELATIONAL_MODE && (DB_MODE === 'mssql' || DB_MODE === 'sqlserver')
}

function mssqlJson(sql, params = {}) {
  const result = runMssqlScalar(`DECLARE @p nvarchar(max) = @json;\n${sql}`, { jsonInput: JSON.stringify(params) })
  if (!String(result || '').trim()) return null
  return JSON.parse(result)
}

function mssqlArray(sql, params = {}) {
  return mssqlJson(sql, params) || []
}

function ensureFieldDb(db) {
  db.field = db.field || {}
  db.field.siteJournals = Array.isArray(db.field.siteJournals) ? db.field.siteJournals : []
  db.field.journalActivities = Array.isArray(db.field.journalActivities) ? db.field.journalActivities : []
  db.field.journalPhotos = Array.isArray(db.field.journalPhotos) ? db.field.journalPhotos : []
  db.field.journalCrew = Array.isArray(db.field.journalCrew) ? db.field.journalCrew : []
  db.field.projectMilestones = Array.isArray(db.field.projectMilestones) ? db.field.projectMilestones : []
  db.field.projectProgress = Array.isArray(db.field.projectProgress) ? db.field.projectProgress : []
  db.field.siteIssues = Array.isArray(db.field.siteIssues) ? db.field.siteIssues : []
  db.field.signTokens = Array.isArray(db.field.signTokens) ? db.field.signTokens : []
  db.field.lastSyncAt = db.field.lastSyncAt || null
  return db.field
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1
}

function rolePermissions(db, role) {
  const settings = db.settings || {}
  return new Set((settings.rolePermissionOverrides?.[role] || settings.rolePermissions?.[role] || []).map(String))
}

function userHasPermission(db, user, permission) {
  if (!user) return false
  if (user.role === 'superadmin' || user.role === 'admin') return true
  if ((user.permissions || []).includes(permission)) return true
  if (rolePermissions(db, user.role).has(permission)) return true
  const dept = (db.departments || []).find(item => item.id === user.departmentId)
  return Array.isArray(dept?.permissions) && dept.permissions.includes(permission)
}

function requireFieldPermission(auth, res, permission) {
  if (userHasPermission(auth.db, auth.user, permission)) return true
  if (requirePermission(auth, { writeHead() {}, end() {} }, permission)) return true
  sendJson(res, 403, { error: 'Nu ai permisiune pentru aceasta actiune.' })
  return false
}

function approverUsers(db) {
  return (db.users || []).filter(user => user.active !== false && userHasPermission(db, user, 'field:journal_approve'))
}

function notifyApprovers(db, event, data) {
  approverUsers(db).forEach(user => notifyUser(user.id, event, data))
}

function journalByUuid(field, uuid) {
  return field.siteJournals.find(item => item.uuid === uuid) || null
}

function publicJournal(journal) {
  return { ...journal }
}

function activitiesFor(field, journalId) {
  return field.journalActivities.filter(item => String(item.journal_id) === String(journalId) && !item.sters_la)
}

function photosFor(field, journalId) {
  return field.journalPhotos.filter(item => String(item.journal_id) === String(journalId) && !item.sters_la)
}

function issuesForProject(field, projectId) {
  return field.siteIssues.filter(item => String(item.santier_id) === String(projectId))
}

function recalculateProjectProgress(field, journal) {
  const activities = activitiesFor(field, journal.id).filter(item => item.articol_deviz)
  if (!activities.length) return null
  const total = activities.reduce((sum, item) => sum + Number(item.cantitate_executata || 0), 0)
  const progress = Math.max(0, Math.min(100, total))
  const row = {
    id: nextId(field.projectProgress),
    santier_id: journal.santier_id,
    data: String(journal.data || nowIso()).slice(0, 10),
    progres_fizic_procent: Number(progress.toFixed(2)),
    progres_valoric_procent: null,
    snapshot_json: JSON.stringify({ activities }),
    calculat_la: nowIso(),
    calculat_de: 'automat',
    created_at: nowIso()
  }
  field.projectProgress.push(row)
  return row
}

function saveSignature(base64Png) {
  const dir = path.join(storageRoot, 'signatures')
  fs.mkdirSync(dir, { recursive: true })
  const filename = `signature-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.png`
  const file = path.join(dir, filename)
  const data = String(base64Png || '').replace(/^data:image\/png;base64,/, '')
  fs.writeFileSync(file, Buffer.from(data, 'base64'))
  return file
}

function readDbOrNull() {
  try {
    return readDb()
  } catch {
    return null
  }
}

function createTicketForBlockingIssue(db, issue, user) {
  db.tickets = db.tickets || {}
  db.tickets.tickets = Array.isArray(db.tickets.tickets) ? db.tickets.tickets : []
  const ticket = {
    id: nextId(db.tickets.tickets),
    uuid: crypto.randomUUID(),
    tip: 'sesizare',
    prioritate: 'critica',
    status: 'deschis',
    titlu: issue.titlu,
    descriere: issue.descriere || '',
    dept_sursa_id: user.departmentId || null,
    dept_responsabil_id: null,
    asignat_la: null,
    creat_de: user.id,
    rezolvat_de: null,
    rezolvat_la: null,
    termen_limita: null,
    entitate_tip: 'field_issue',
    entitate_id: issue.uuid,
    created_at: nowIso(),
    updated_at: nowIso()
  }
  db.tickets.tickets.push(ticket)
  return ticket
}

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const dir = path.join(storageRoot, 'field-photos', ...todayPath())
      fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename(req, file, cb) {
      const safe = String(file.originalname || 'photo').replace(/[^a-zA-Z0-9._-]/g, '_')
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`)
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
})

router.get('/field/sign/:token', (req, res, next) => {
  try {
    if (isMssqlMode()) {
      const data = mssqlJson(`
DECLARE @token char(64) = JSON_VALUE(@p, '$.token');
SELECT TOP 1 st.id AS token_id, st.token, st.expires_at, j.id AS journal_id, j.uuid, j.santier_id, j.data, j.descriere_lucrari, j.status
FROM field.sign_tokens st
JOIN field.site_journals j ON j.id = st.journal_id
WHERE st.token = @token AND st.expires_at > sysdatetime() AND st.used_at IS NULL
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { token: req.params.token })
      if (!data) throwHttp(404, 'Token invalid sau expirat.')
      sendJson(res, 200, { token: data })
      return
    }
    const db = readDbOrNull()
    if (!db) throwHttp(404, 'Token invalid sau expirat.')
    const field = ensureFieldDb(db)
    const token = field.signTokens.find(item => item.token === req.params.token && !item.used_at && new Date(item.expires_at).getTime() > Date.now())
    if (!token) throwHttp(404, 'Token invalid sau expirat.')
    const journal = field.siteJournals.find(item => item.id === token.journal_id)
    sendJson(res, 200, { token, journal })
  } catch (error) {
    next(error)
  }
})

router.post('/field/sign/:token', (req, res, next) => {
  try {
    const db = readDbOrNull()
    if (!db && !isMssqlMode()) throwHttp(404, 'Token invalid sau expirat.')
    if (isMssqlMode()) {
      const signaturePath = saveSignature((req.body || {}).semnatura || (req.body || {}).signature)
      const result = mssqlJson(`
DECLARE @token char(64) = JSON_VALUE(@p, '$.token');
DECLARE @journalId int;
SELECT @journalId = journal_id FROM field.sign_tokens WHERE token = @token AND expires_at > sysdatetime() AND used_at IS NULL;
IF @journalId IS NULL THROW 51000, 'Token invalid sau expirat.', 1;
UPDATE field.site_journals
SET semnat_diriginte_la = sysdatetime(), diriginte_nume = JSON_VALUE(@p, '$.nume'), diriginte_semnatura_path = JSON_VALUE(@p, '$.path'), status = N'aprobat', updated_at = sysdatetime()
WHERE id = @journalId;
UPDATE field.sign_tokens SET used_at = sysdatetime() WHERE token = @token;
SELECT id, uuid, sef_santier_id, santier_id FROM field.site_journals WHERE id = @journalId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { token: req.params.token, nume: (req.body || {}).nume || '', path: signaturePath })
      if (result?.sef_santier_id) notifyUser(result.sef_santier_id, 'field_journal_signed', { journal: result })
      notifyApprovers(db || { users: [] }, 'field_journal_signed', { journal: result })
      sendJson(res, 200, { ok: true })
      return
    }
    const field = ensureFieldDb(db)
    const token = field.signTokens.find(item => item.token === req.params.token && !item.used_at && new Date(item.expires_at).getTime() > Date.now())
    if (!token) throwHttp(404, 'Token invalid sau expirat.')
    const journal = field.siteJournals.find(item => item.id === token.journal_id)
    if (!journal) throwHttp(404, 'Jurnal inexistent.')
    const signaturePath = saveSignature((req.body || {}).semnatura || (req.body || {}).signature)
    journal.semnat_diriginte_la = nowIso()
    journal.diriginte_nume = (req.body || {}).nume || ''
    journal.diriginte_semnatura_path = signaturePath
    journal.status = 'aprobat'
    journal.updated_at = nowIso()
    token.used_at = nowIso()
    writeDb(db)
    if (journal.sef_santier_id) notifyUser(journal.sef_santier_id, 'field_journal_signed', { journal })
    notifyApprovers(db, 'field_journal_signed', { journal })
    sendJson(res, 200, { ok: true })
  } catch (error) {
    next(error)
  }
})

router.get('/field/sync/last', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    const field = ensureFieldDb(auth.db)
    sendJson(res, 200, { last_sync_at: field.lastSyncAt })
  } catch (error) {
    next(error)
  }
})

router.post('/field/sync', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:journal_create')) return
    const body = req.body || {}
    const field = ensureFieldDb(auth.db)
    const errors = []
    let synced = 0
    ;(Array.isArray(body.journals) ? body.journals : []).forEach(input => {
      try {
        const uuid = input.uuid || crypto.randomUUID()
        let journal = field.siteJournals.find(item => item.uuid === uuid)
        if (!journal) {
          journal = { id: nextId(field.siteJournals), uuid, created_at: nowIso() }
          field.siteJournals.push(journal)
        }
        Object.assign(journal, {
          santier_id: input.santier_id || input.santierId || journal.santier_id,
          data: input.data || journal.data || nowIso().slice(0, 10),
          tura: input.tura || journal.tura || 'zi',
          sef_santier_id: input.sef_santier_id || input.sefSantierId || auth.user.id,
          status: input.status || journal.status || 'draft',
          temperatura_min: input.temperatura_min ?? journal.temperatura_min ?? null,
          temperatura_max: input.temperatura_max ?? journal.temperatura_max ?? null,
          conditii_meteo: input.conditii_meteo || journal.conditii_meteo || null,
          conditii_lucru: input.conditii_lucru || journal.conditii_lucru || null,
          descriere_lucrari: input.descriere_lucrari || journal.descriere_lucrari || '',
          probleme_intalnite: input.probleme_intalnite || journal.probleme_intalnite || '',
          masuri_luate: input.masuri_luate || journal.masuri_luate || '',
          observatii: input.observatii || journal.observatii || '',
          sync_status: 'synced',
          updated_at: nowIso()
        })
        synced += 1
      } catch (error) {
        errors.push({ uuid: input.uuid, error: error.message })
      }
    })
    ;(Array.isArray(body.activities) ? body.activities : []).forEach(input => {
      try {
        const journal = field.siteJournals.find(item => item.uuid === input.journal_uuid || item.id === input.journal_id)
        if (!journal) throw new Error('Jurnal lipsa')
        let activity = field.journalActivities.find(item => String(item.id) === String(input.id) && item.journal_id === journal.id)
        if (!activity) {
          activity = { id: nextId(field.journalActivities), journal_id: journal.id, created_at: nowIso() }
          field.journalActivities.push(activity)
        }
        Object.assign(activity, {
          tip: input.tip || activity.tip || 'lucrare',
          descriere: input.descriere || activity.descriere || '',
          articol_deviz: input.articol_deviz || activity.articol_deviz || null,
          um: input.um || activity.um || null,
          cantitate_executata: Number(input.cantitate_executata ?? activity.cantitate_executata ?? 0),
          utilaj_id: input.utilaj_id || activity.utilaj_id || null,
          material_id: input.material_id || activity.material_id || null,
          ore_lucrate: input.ore_lucrate || activity.ore_lucrate || null,
          sort_order: Number(input.sort_order || activity.sort_order || 0)
        })
        synced += 1
      } catch (error) {
        errors.push({ id: input.id, error: error.message })
      }
    })
    field.lastSyncAt = nowIso()
    writeDb(auth.db)
    sendJson(res, 200, { synced, errors })
  } catch (error) {
    next(error)
  }
})

router.get('/field/journals', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:view')) return
    const field = ensureFieldDb(auth.db)
    const journals = field.siteJournals.filter(item => !req.query.santier_id || item.santier_id === req.query.santier_id).map(publicJournal)
    sendJson(res, 200, { journals })
  } catch (error) {
    next(error)
  }
})

router.post('/field/journals', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:journal_create')) return
    const body = req.body || {}
    const field = ensureFieldDb(auth.db)
    const uuid = body.uuid || crypto.randomUUID()
    let journal = field.siteJournals.find(item => item.uuid === uuid)
    if (!journal) {
      journal = { id: nextId(field.siteJournals), uuid, created_at: nowIso() }
      field.siteJournals.push(journal)
    }
    Object.assign(journal, {
      santier_id: body.santier_id || journal.santier_id,
      data: body.data || journal.data || nowIso().slice(0, 10),
      tura: body.tura || journal.tura || 'zi',
      sef_santier_id: body.sef_santier_id || journal.sef_santier_id || auth.user.id,
      status: body.status || journal.status || 'draft',
      temperatura_min: body.temperatura_min ?? journal.temperatura_min ?? null,
      temperatura_max: body.temperatura_max ?? journal.temperatura_max ?? null,
      conditii_meteo: body.conditii_meteo || journal.conditii_meteo || null,
      conditii_lucru: body.conditii_lucru || journal.conditii_lucru || null,
      descriere_lucrari: body.descriere_lucrari || journal.descriere_lucrari || '',
      probleme_intalnite: body.probleme_intalnite || journal.probleme_intalnite || '',
      masuri_luate: body.masuri_luate || journal.masuri_luate || '',
      observatii: body.observatii || journal.observatii || '',
      sync_status: 'synced',
      updated_at: nowIso()
    })
    addAudit(auth.db, auth.user, 'field_journal_salvat', journal.uuid)
    writeDb(auth.db)
    sendJson(res, 200, { journal: publicJournal(journal) })
  } catch (error) {
    next(error)
  }
})

router.get('/field/journals/:uuid', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:view')) return
    const field = ensureFieldDb(auth.db)
    const journal = journalByUuid(field, req.params.uuid)
    if (!journal) throwHttp(404, 'Jurnal inexistent.')
    sendJson(res, 200, {
      journal,
      activities: activitiesFor(field, journal.id),
      photos: photosFor(field, journal.id),
      crew: field.journalCrew.filter(item => item.journal_id === journal.id)
    })
  } catch (error) {
    next(error)
  }
})

router.post('/field/journals/:uuid/submit', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:journal_submit')) return
    const field = ensureFieldDb(auth.db)
    const journal = journalByUuid(field, req.params.uuid)
    if (!journal) throwHttp(404, 'Jurnal inexistent.')
    journal.status = 'trimis'
    journal.semnat_sef_santier_la = nowIso()
    journal.updated_at = nowIso()
    const progress = recalculateProjectProgress(field, journal)
    addAudit(auth.db, auth.user, 'field_journal_trimis', journal.uuid)
    writeDb(auth.db)
    notifyApprovers(auth.db, 'field_journal_submitted', { journal })
    sendJson(res, 200, { journal, progress })
  } catch (error) {
    next(error)
  }
})

router.post('/field/journals/:uuid/approve', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:journal_approve')) return
    const field = ensureFieldDb(auth.db)
    const journal = journalByUuid(field, req.params.uuid)
    if (!journal) throwHttp(404, 'Jurnal inexistent.')
    journal.status = 'aprobat'
    journal.aprobat_de = auth.user.id
    journal.aprobat_la = nowIso()
    journal.updated_at = nowIso()
    addAudit(auth.db, auth.user, 'field_journal_aprobat', journal.uuid)
    writeDb(auth.db)
    sendJson(res, 200, { journal })
  } catch (error) {
    next(error)
  }
})

router.post('/field/journals/:uuid/sign-request', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:sign_request')) return
    const field = ensureFieldDb(auth.db)
    const journal = journalByUuid(field, req.params.uuid)
    if (!journal) throwHttp(404, 'Jurnal inexistent.')
    const token = crypto.randomBytes(32).toString('hex')
    const record = { id: nextId(field.signTokens), journal_id: journal.id, token, expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), used_at: null, created_at: nowIso() }
    field.signTokens.push(record)
    writeDb(auth.db)
    sendJson(res, 201, { token: record })
  } catch (error) {
    next(error)
  }
})

router.post('/field/journals/:uuid/activities', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:journal_create')) return
    const field = ensureFieldDb(auth.db)
    const journal = journalByUuid(field, req.params.uuid)
    if (!journal) throwHttp(404, 'Jurnal inexistent.')
    const body = req.body || {}
    const activity = { id: nextId(field.journalActivities), journal_id: journal.id, tip: body.tip || 'lucrare', descriere: body.descriere || '', articol_deviz: body.articol_deviz || null, um: body.um || null, cantitate_executata: Number(body.cantitate_executata || 0), utilaj_id: body.utilaj_id || null, material_id: body.material_id || null, ore_lucrate: body.ore_lucrate || null, sort_order: Number(body.sort_order || 0), created_at: nowIso() }
    field.journalActivities.push(activity)
    writeDb(auth.db)
    sendJson(res, 201, { activity })
  } catch (error) {
    next(error)
  }
})

router.patch('/field/journals/:uuid/activities/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:journal_create')) return
    const field = ensureFieldDb(auth.db)
    const journal = journalByUuid(field, req.params.uuid)
    if (!journal) throwHttp(404, 'Jurnal inexistent.')
    const activity = field.journalActivities.find(item => String(item.id) === String(req.params.id) && item.journal_id === journal.id)
    if (!activity) throwHttp(404, 'Activitate inexistenta.')
    Object.assign(activity, req.body || {})
    writeDb(auth.db)
    sendJson(res, 200, { activity })
  } catch (error) {
    next(error)
  }
})

router.delete('/field/journals/:uuid/activities/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:journal_create')) return
    const field = ensureFieldDb(auth.db)
    const activity = field.journalActivities.find(item => String(item.id) === String(req.params.id))
    if (!activity) throwHttp(404, 'Activitate inexistenta.')
    activity.sters_la = nowIso()
    activity.sters_de = auth.user.id
    writeDb(auth.db)
    sendJson(res, 200, { activity })
  } catch (error) {
    next(error)
  }
})

router.post('/field/photos/upload', upload.single('file'), (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:photo_upload')) return
    if (!req.file) throwHttp(400, 'Fisier lipsa.')
    const field = ensureFieldDb(auth.db)
    const journal = field.siteJournals.find(item => String(item.id) === String(req.body.journal_id) || item.uuid === req.body.journal_uuid)
    if (!journal) throwHttp(404, 'Jurnal inexistent.')
    const thumb = req.file.path.replace(/(\.[^.]+)?$/, '-thumb$1')
    fs.copyFileSync(req.file.path, thumb)
    const photo = { id: nextId(field.journalPhotos), journal_id: journal.id, activity_id: req.body.activity_id || null, fisier_path: req.file.path, fisier_thumb_path: thumb, denumire: req.body.denumire || req.file.originalname, locatie_gps: req.body.locatie_gps || null, incarcat_de: auth.user.id, created_at: nowIso() }
    field.journalPhotos.push(photo)
    writeDb(auth.db)
    sendJson(res, 201, { photo })
  } catch (error) {
    next(error)
  }
})

router.get('/field/photos/:id/thumb', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    const photo = ensureFieldDb(auth.db).journalPhotos.find(item => String(item.id) === String(req.params.id))
    if (!photo) throwHttp(404, 'Foto inexistenta.')
    res.sendFile(path.resolve(photo.fisier_thumb_path || photo.fisier_path))
  } catch (error) {
    next(error)
  }
})

router.get('/field/photos/:id/full', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    const photo = ensureFieldDb(auth.db).journalPhotos.find(item => String(item.id) === String(req.params.id))
    if (!photo) throwHttp(404, 'Foto inexistenta.')
    res.sendFile(path.resolve(photo.fisier_path))
  } catch (error) {
    next(error)
  }
})

router.delete('/field/photos/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:photo_upload')) return
    const photo = ensureFieldDb(auth.db).journalPhotos.find(item => String(item.id) === String(req.params.id))
    if (!photo) throwHttp(404, 'Foto inexistenta.')
    photo.sters_la = nowIso()
    photo.sters_de = auth.user.id
    writeDb(auth.db)
    sendJson(res, 200, { photo })
  } catch (error) {
    next(error)
  }
})

router.get('/field/issues', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:view')) return
    sendJson(res, 200, { issues: ensureFieldDb(auth.db).siteIssues })
  } catch (error) {
    next(error)
  }
})

router.post('/field/issues', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:issue_report')) return
    const body = req.body || {}
    const field = ensureFieldDb(auth.db)
    const issue = { id: nextId(field.siteIssues), uuid: crypto.randomUUID(), santier_id: body.santier_id, journal_id: body.journal_id || null, tip: body.tip || 'altul', gravitate: body.gravitate || 'minora', titlu: body.titlu || '', descriere: body.descriere || '', status: 'deschisa', raportat_de: auth.user.id, asignat_la: null, rezolvat_la: null, rezolvat_prin: null, created_at: nowIso(), updated_at: nowIso() }
    field.siteIssues.push(issue)
    let ticket = null
    if (issue.gravitate === 'blocanta') {
      ticket = createTicketForBlockingIssue(auth.db, issue, auth.user)
      notifyApprovers(auth.db, 'field_blocking_issue', { issue, ticket })
    }
    addAudit(auth.db, auth.user, 'field_issue_creata', issue.titlu)
    writeDb(auth.db)
    sendJson(res, 201, { issue, ticket })
  } catch (error) {
    next(error)
  }
})

router.patch('/field/issues/:uuid/assign', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:issue_resolve')) return
    const issue = ensureFieldDb(auth.db).siteIssues.find(item => item.uuid === req.params.uuid)
    if (!issue) throwHttp(404, 'Problema inexistenta.')
    issue.asignat_la = (req.body || {}).asignat_la || null
    issue.status = 'in_lucru'
    issue.updated_at = nowIso()
    writeDb(auth.db)
    sendJson(res, 200, { issue })
  } catch (error) {
    next(error)
  }
})

router.patch('/field/issues/:uuid/resolve', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:issue_resolve')) return
    const issue = ensureFieldDb(auth.db).siteIssues.find(item => item.uuid === req.params.uuid)
    if (!issue) throwHttp(404, 'Problema inexistenta.')
    issue.status = 'rezolvata'
    issue.rezolvat_la = nowIso()
    issue.rezolvat_prin = (req.body || {}).rezolvat_prin || ''
    issue.updated_at = nowIso()
    writeDb(auth.db)
    sendJson(res, 200, { issue })
  } catch (error) {
    next(error)
  }
})

router.get('/field/projects', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:progress_view')) return
    const field = ensureFieldDb(auth.db)
    const projects = (auth.db.projects || []).filter(item => item.status !== 'closed').map(project => ({
      ...project,
      journals_count: field.siteJournals.filter(journal => journal.santier_id === project.id).length,
      photos_count: field.journalPhotos.filter(photo => field.siteJournals.some(journal => journal.id === photo.journal_id && journal.santier_id === project.id)).length,
      issues_open: issuesForProject(field, project.id).filter(issue => !['rezolvata', 'inchisa'].includes(issue.status)).length,
      progress: field.projectProgress.filter(row => row.santier_id === project.id).sort((a, b) => String(b.data).localeCompare(String(a.data)))[0] || null
    }))
    sendJson(res, 200, { projects })
  } catch (error) {
    next(error)
  }
})

router.get('/field/projects/:id/progress', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:progress_view')) return
    const progress = ensureFieldDb(auth.db).projectProgress.filter(item => item.santier_id === req.params.id)
    sendJson(res, 200, { progress })
  } catch (error) {
    next(error)
  }
})

router.get('/field/projects/:id/gallery', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:view')) return
    const field = ensureFieldDb(auth.db)
    const journalIds = new Set(field.siteJournals.filter(item => item.santier_id === req.params.id).map(item => item.id))
    sendJson(res, 200, { photos: field.journalPhotos.filter(item => journalIds.has(item.journal_id) && !item.sters_la) })
  } catch (error) {
    next(error)
  }
})

router.get('/field/projects/:id/timeline', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireFieldPermission(auth, res, 'field:view')) return
    const field = ensureFieldDb(auth.db)
    sendJson(res, 200, {
      journals: field.siteJournals.filter(item => item.santier_id === req.params.id),
      milestones: field.projectMilestones.filter(item => item.santier_id === req.params.id),
      issues: issuesForProject(field, req.params.id)
    })
  } catch (error) {
    next(error)
  }
})

module.exports = router
