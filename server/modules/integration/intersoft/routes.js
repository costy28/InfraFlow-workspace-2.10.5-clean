const { Router } = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { requireAuth } = require('../../../core/auth')
const { requirePermission } = require('../../../core/permissions')
const { readDb, writeDb, runMssqlScalar, DB_MODE } = require('../../../core/db')
const { addAudit } = require('../../../core/audit')
const {
  parseDevizExcel,
  parseSituatieExcel,
  generateCantitatiExcel
} = require('./parser')

const router = Router()
const tempDir = path.join(__dirname, '../../../storage/temp/')
fs.mkdirSync(tempDir, { recursive: true })
const upload = multer({
  dest: tempDir,
  limits: { fileSize: 20 * 1024 * 1024 }
})

function isMssqlMode() {
  return DB_MODE === 'mssql' || DB_MODE === 'sqlserver'
}

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

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function mssqlJson(sql, params = {}) {
  const result = runMssqlScalar(`DECLARE @p nvarchar(max) = @json;\n${sql}`, { jsonInput: JSON.stringify(params) })
  if (!String(result || '').trim()) return null
  return JSON.parse(result)
}

function mssqlArray(sql, params = {}) {
  return mssqlJson(sql, params) || []
}

function mssqlObject(sql, params = {}) {
  return mssqlArray(sql, params)[0] || null
}

function ensureIntegrationDb(db) {
  db.integration = db.integration || {}
  db.integration.intersoftProjects = Array.isArray(db.integration.intersoftProjects) ? db.integration.intersoftProjects : []
  db.integration.intersoftArticles = Array.isArray(db.integration.intersoftArticles) ? db.integration.intersoftArticles : []
  db.integration.intersoftSyncLog = Array.isArray(db.integration.intersoftSyncLog) ? db.integration.intersoftSyncLog : []
  db.integration.situationImports = Array.isArray(db.integration.situationImports) ? db.integration.situationImports : []
  db.integration.situationItems = Array.isArray(db.integration.situationItems) ? db.integration.situationItems : []
  return db.integration
}

function ensureDocumentsDb(db) {
  db.documents = db.documents || {}
  db.documents.documentTypes = Array.isArray(db.documents.documentTypes) ? db.documents.documentTypes : []
  db.documents.documents = Array.isArray(db.documents.documents) ? db.documents.documents : []
  return db.documents
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1
}

function companyIdFor(auth) {
  return auth.user.company_id || auth.user.companyId || auth.user.company || null
}

function projectCompanyId(db, santierId) {
  const projects = db.work?.projects || db.projects || []
  const project = projects.find(item => String(item.id) === String(santierId))
  return project?.company_id || project?.companyId || null
}

function visibleProject(auth, project) {
  const companyId = companyIdFor(auth)
  if (!companyId) return true
  return !project.company_id || String(project.company_id) === String(companyId)
}

function validateExcelFile(file) {
  if (!file) throwHttp(400, 'Fisierul Excel este obligatoriu.')
  const ext = path.extname(file.originalname || '').toLowerCase()
  if (!['.xlsx', '.xls'].includes(ext)) throwHttp(400, 'Fisierul trebuie sa fie .xlsx sau .xls.')
}

function cleanupUpload(file) {
  if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path)
}

function jsonProject(project, articles) {
  return {
    id: project.id,
    santier_id: project.santier_id,
    denumire_intersoft: project.denumire_intersoft,
    data_import: project.data_import,
    nr_articole: articles.filter(article => Number(article.project_id) === Number(project.id)).length,
    versiune_deviz: project.versiune_deviz || '',
    activ: project.activ !== false
  }
}

router.get('/integration/intersoft/projects', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'integration:intersoft_view')) return

    if (isMssqlMode()) {
      const projects = mssqlArray(`
DECLARE @companyId nvarchar(64) = JSON_VALUE(@p, '$.companyId');
SELECT ip.id, ip.santier_id, ip.denumire_intersoft, ip.data_import, COUNT(ia.id) AS nr_articole,
  ip.versiune_deviz, ip.activ
FROM integration.intersoft_projects ip
LEFT JOIN integration.intersoft_articles ia ON ia.project_id = ip.id
LEFT JOIN work.projects wp ON wp.id = ip.santier_id
WHERE @companyId IS NULL OR CONVERT(nvarchar(64), wp.company_id) = @companyId
GROUP BY ip.id, ip.santier_id, ip.denumire_intersoft, ip.data_import, ip.versiune_deviz, ip.activ
ORDER BY ip.created_at DESC
FOR JSON PATH;
`, { companyId: companyIdFor(auth) })
      sendJson(res, 200, projects)
      return
    }

    const db = readDb()
    const integration = ensureIntegrationDb(db)
    const projects = integration.intersoftProjects
      .filter(project => visibleProject(auth, project))
      .map(project => jsonProject(project, integration.intersoftArticles))
    sendJson(res, 200, projects)
  } catch (error) {
    next(error)
  }
})

router.post('/integration/intersoft/projects', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'integration:intersoft_import')) return

    const body = req.body || {}
    if (!body.santier_id || !body.denumire_intersoft) throwHttp(400, 'Santierul si denumirea Intersoft sunt obligatorii.')

    if (isMssqlMode()) {
      const project = mssqlObject(`
DECLARE @santierId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.santier_id'));
DECLARE @denumire nvarchar(300) = JSON_VALUE(@p, '$.denumire_intersoft');
DECLARE @versiune nvarchar(50) = JSON_VALUE(@p, '$.versiune_deviz');
DECLARE @created table (id int);
INSERT INTO integration.intersoft_projects (santier_id, denumire_intersoft, data_import, versiune_deviz)
OUTPUT inserted.id INTO @created
VALUES (@santierId, @denumire, CONVERT(date, sysdatetime()), @versiune);
SELECT id, santier_id, denumire_intersoft, data_import, versiune_deviz, activ
FROM integration.intersoft_projects
WHERE id = (SELECT TOP 1 id FROM @created)
FOR JSON PATH;
`, body)
      addAudit(auth.db, auth.user, 'intersoft_project_created', project?.denumire_intersoft || body.denumire_intersoft)
      sendJson(res, 201, project)
      return
    }

    const db = readDb()
    const integration = ensureIntegrationDb(db)
    const project = {
      id: nextId(integration.intersoftProjects),
      santier_id: body.santier_id,
      company_id: projectCompanyId(db, body.santier_id) || companyIdFor(auth),
      denumire_intersoft: String(body.denumire_intersoft || '').trim(),
      cale_fisier: null,
      data_import: todayIso(),
      versiune_deviz: body.versiune_deviz || '',
      activ: true,
      created_at: nowIso()
    }
    integration.intersoftProjects.push(project)
    addAudit(db, auth.user, 'intersoft_project_created', project.denumire_intersoft)
    writeDb(db)
    sendJson(res, 201, jsonProject(project, integration.intersoftArticles))
  } catch (error) {
    next(error)
  }
})

router.post('/integration/intersoft/projects/:id/import-deviz', upload.single('file'), (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'integration:intersoft_import')) return
    validateExcelFile(req.file)

    const projectId = Number(req.params.id)
    const result = parseDevizExcel(req.file.path)
    const status = result.errors.length > 0 ? 'partial' : 'ok'
    const message = JSON.stringify(result.errors)

    if (isMssqlMode()) {
      mssqlJson(`
DECLARE @projectId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.projectId'));
DELETE FROM integration.intersoft_articles WHERE project_id = @projectId;

INSERT INTO integration.intersoft_articles (project_id, cod_articol, simbol, denumire, um, cantitate_deviz, pret_unitar, valoare_totala, sort_order)
SELECT @projectId, cod_articol, simbol, denumire, um, cantitate_deviz, pret_unitar, valoare_totala, sort_order
FROM OPENJSON(@p, '$.articles')
WITH (
  cod_articol nvarchar(30) '$.cod_articol',
  simbol nvarchar(100) '$.simbol',
  denumire nvarchar(500) '$.denumire',
  um nvarchar(20) '$.um',
  cantitate_deviz decimal(12,3) '$.cantitate_deviz',
  pret_unitar decimal(12,4) '$.pret_unitar',
  valoare_totala decimal(15,2) '$.valoare_totala',
  sort_order int '$.sort_order'
);

INSERT INTO integration.intersoft_sync_log (project_id, tip, fisier_sursa, nr_articole, status, mesaj, efectuat_de)
VALUES (@projectId, N'import_deviz', JSON_VALUE(@p, '$.fisier_sursa'), TRY_CONVERT(int, JSON_VALUE(@p, '$.nr_articole')),
  JSON_VALUE(@p, '$.status'), JSON_VALUE(@p, '$.mesaj'), JSON_VALUE(@p, '$.efectuat_de'));

SELECT 1 AS ok FOR JSON PATH;
`, {
        projectId,
        articles: result.articles,
        fisier_sursa: req.file.originalname,
        nr_articole: result.articles.length,
        status,
        mesaj: message,
        efectuat_de: auth.user.id
      })
      addAudit(auth.db, auth.user, 'intersoft_deviz_imported', `${projectId}: ${result.articles.length} articole`)
      sendJson(res, 200, { articole: result.articles.length, erori: result.errors })
      return
    }

    const db = readDb()
    const integration = ensureIntegrationDb(db)
    const project = integration.intersoftProjects.find(item => Number(item.id) === projectId)
    if (!project) throwHttp(404, 'Proiectul Intersoft nu exista.')

    integration.intersoftArticles = integration.intersoftArticles.filter(article => Number(article.project_id) !== projectId)
    const startId = nextId(integration.intersoftArticles)
    result.articles.forEach((article, index) => {
      integration.intersoftArticles.push({
        id: startId + index,
        project_id: projectId,
        cod_articol: article.cod_articol,
        simbol: article.simbol || article.cod_articol,
        denumire: article.denumire,
        um: article.um,
        cantitate_deviz: article.cantitate_deviz,
        pret_unitar: article.pret_unitar,
        valoare_totala: article.valoare_totala,
        capitol: article.capitol || null,
        deviz_cod: article.deviz_cod || null,
        sort_order: article.sort_order || index + 1,
        created_at: nowIso()
      })
    })
    integration.intersoftSyncLog.push({
      id: nextId(integration.intersoftSyncLog),
      project_id: projectId,
      tip: 'import_deviz',
      fisier_sursa: req.file.originalname,
      nr_articole: result.articles.length,
      status,
      mesaj: message,
      efectuat_de: auth.user.id,
      created_at: nowIso()
    })
    addAudit(db, auth.user, 'intersoft_deviz_imported', `${projectId}: ${result.articles.length} articole`)
    writeDb(db)
    sendJson(res, 200, { articole: result.articles.length, erori: result.errors })
  } catch (error) {
    next(error)
  } finally {
    cleanupUpload(req.file)
  }
})

router.post('/integration/intersoft/projects/:id/preview-deviz', upload.single('file'), (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'integration:intersoft_import')) return
    validateExcelFile(req.file)

    const result = parseDevizExcel(req.file.path)
    sendJson(res, 200, {
      articole: result.articles.length,
      primele_articole: result.articles.slice(0, 5),
      erori: result.errors
    })
  } catch (error) {
    next(error)
  } finally {
    cleanupUpload(req.file)
  }
})

router.get('/integration/intersoft/projects/:id/export-cantitati', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'integration:intersoft_export')) return

    const { de_la, pana_la } = req.query
    if (!isIsoDate(de_la) || !isIsoDate(pana_la)) throwHttp(400, 'Parametrii de_la si pana_la sunt obligatorii in format YYYY-MM-DD.')
    const projectId = Number(req.params.id)

    if (isMssqlMode()) {
      const payload = mssqlObject(`
DECLARE @projectId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.projectId'));
DECLARE @deLa date = TRY_CONVERT(date, JSON_VALUE(@p, '$.de_la'));
DECLARE @panaLa date = TRY_CONVERT(date, JSON_VALUE(@p, '$.pana_la'));
SELECT
  JSON_QUERY((SELECT id, project_id, cod_articol, simbol, denumire, um, cantitate_deviz, pret_unitar, valoare_totala, sort_order
    FROM integration.intersoft_articles WHERE project_id = @projectId ORDER BY sort_order, id FOR JSON PATH)) AS articles,
  JSON_QUERY((SELECT ja.articol_deviz AS cod_articol, SUM(ja.cantitate_executata) AS total
    FROM field.journal_activities ja
    JOIN field.site_journals sj ON sj.id = ja.journal_id
    WHERE sj.santier_id = (SELECT santier_id FROM integration.intersoft_projects WHERE id = @projectId)
      AND sj.data BETWEEN @deLa AND @panaLa
      AND ja.articol_deviz IS NOT NULL
    GROUP BY ja.articol_deviz
    FOR JSON PATH)) AS realizari
FOR JSON PATH;
`, { projectId, de_la, pana_la })
      const articles = payload?.articles || []
      const realizari = Object.fromEntries((payload?.realizari || []).map(item => [item.cod_articol, Number(item.total || 0)]))
      const buffer = generateCantitatiExcel(articles, realizari, { de_la, pana_la })
      mssqlJson(`
DECLARE @projectId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.projectId'));
INSERT INTO integration.intersoft_sync_log (project_id, tip, fisier_sursa, nr_articole, status, mesaj, efectuat_de)
VALUES (@projectId, N'export_cantitati', N'cantitati_realizate.xlsx', TRY_CONVERT(int, JSON_VALUE(@p, '$.nr_articole')),
  N'ok', JSON_VALUE(@p, '$.mesaj'), JSON_VALUE(@p, '$.efectuat_de'));
SELECT 1 AS ok FOR JSON PATH;
`, { projectId, nr_articole: articles.length, mesaj: JSON.stringify({ de_la, pana_la }), efectuat_de: auth.user.id })
      addAudit(auth.db, auth.user, 'intersoft_cantitati_exported', `${projectId}: ${de_la} - ${pana_la}`)
      sendXlsx(res, buffer)
      return
    }

    const db = readDb()
    const integration = ensureIntegrationDb(db)
    const project = integration.intersoftProjects.find(item => Number(item.id) === projectId)
    if (!project) throwHttp(404, 'Proiectul Intersoft nu exista.')
    const articles = integration.intersoftArticles.filter(article => Number(article.project_id) === projectId)
    const realizari = calculateJsonRealizari(db, project.santier_id, de_la, pana_la)
    const buffer = generateCantitatiExcel(articles, realizari, { de_la, pana_la })
    integration.intersoftSyncLog.push({
      id: nextId(integration.intersoftSyncLog),
      project_id: projectId,
      tip: 'export_cantitati',
      fisier_sursa: 'cantitati_realizate.xlsx',
      nr_articole: articles.length,
      status: 'ok',
      mesaj: JSON.stringify({ de_la, pana_la }),
      efectuat_de: auth.user.id,
      created_at: nowIso()
    })
    addAudit(db, auth.user, 'intersoft_cantitati_exported', `${projectId}: ${de_la} - ${pana_la}`)
    writeDb(db)
    sendXlsx(res, buffer)
  } catch (error) {
    next(error)
  }
})

router.post('/integration/intersoft/projects/:id/import-situatie', upload.single('file'), (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'integration:intersoft_import')) return
    validateExcelFile(req.file)

    const projectId = Number(req.params.id)
    const { situatie, items } = parseSituatieExcel(req.file.path)
    const nrSituatie = situatie.nr_situatie || `SIT-${Date.now()}`

    if (isMssqlMode()) {
      const created = mssqlObject(`
DECLARE @projectId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.projectId'));
DECLARE @situatieId table (id int);
DECLARE @documentId table (id int);

IF NOT EXISTS (SELECT 1 FROM documents.document_types WHERE id = N'SITLUC')
BEGIN
  THROW 51000, 'Tipul de document SITLUC nu exista.', 1;
END;

INSERT INTO integration.situation_imports (uuid, project_id, nr_situatie, data_situatie, tip, fisier_original_path,
  total_fara_tva, tva, total_cu_tva, status)
OUTPUT inserted.id INTO @situatieId
VALUES (JSON_VALUE(@p, '$.uuid'), @projectId, JSON_VALUE(@p, '$.nr_situatie'), TRY_CONVERT(date, JSON_VALUE(@p, '$.data_situatie')),
  N'realizat', JSON_VALUE(@p, '$.fisier_original_path'), TRY_CONVERT(decimal(15,2), JSON_VALUE(@p, '$.total_fara_tva')),
  TRY_CONVERT(decimal(15,2), JSON_VALUE(@p, '$.tva')), TRY_CONVERT(decimal(15,2), JSON_VALUE(@p, '$.total_cu_tva')), N'importat');

INSERT INTO integration.situation_items (situatie_id, article_id, cantitate_realizata, cantitate_renuntata, valoare_realizata, valoare_renuntata)
SELECT (SELECT TOP 1 id FROM @situatieId), ia.id, item.cant_realizata, item.cant_renuntata, item.valoare_realizata, item.valoare_renuntata
FROM OPENJSON(@p, '$.items')
WITH (
  cod_articol nvarchar(30) '$.cod_articol',
  cant_realizata decimal(12,3) '$.cant_realizata',
  cant_renuntata decimal(12,3) '$.cant_renuntata',
  valoare_realizata decimal(15,2) '$.valoare_realizata',
  valoare_renuntata decimal(15,2) '$.valoare_renuntata'
) item
JOIN integration.intersoft_articles ia ON ia.project_id = @projectId AND ia.cod_articol = item.cod_articol;

INSERT INTO documents.documents (uuid, tip_id, nr_document, titlu, date_json, status, creat_de, dept_initiatoare)
OUTPUT inserted.id INTO @documentId
VALUES (JSON_VALUE(@p, '$.document_uuid'), N'SITLUC', JSON_VALUE(@p, '$.nr_situatie'),
  JSON_VALUE(@p, '$.titlu'), JSON_QUERY(@p, '$.situatie_json'), N'draft',
  JSON_VALUE(@p, '$.creat_de'), JSON_VALUE(@p, '$.dept_initiatoare'));

UPDATE integration.situation_imports
SET document_id = (SELECT TOP 1 id FROM @documentId)
WHERE id = (SELECT TOP 1 id FROM @situatieId);

INSERT INTO integration.intersoft_sync_log (project_id, tip, fisier_sursa, nr_articole, status, mesaj, efectuat_de)
VALUES (@projectId, N'import_situatie', JSON_VALUE(@p, '$.fisier_original_path'), TRY_CONVERT(int, JSON_VALUE(@p, '$.nr_articole')),
  N'ok', JSON_VALUE(@p, '$.mesaj'), JSON_VALUE(@p, '$.creat_de'));

SELECT (SELECT TOP 1 id FROM @situatieId) AS situatie_id, (SELECT TOP 1 id FROM @documentId) AS document_id,
  JSON_VALUE(@p, '$.nr_situatie') AS nr_situatie
FOR JSON PATH;
`, {
        projectId,
        uuid: crypto.randomUUID(),
        nr_situatie: nrSituatie,
        data_situatie: situatie.data_situatie || null,
        fisier_original_path: req.file.originalname,
        total_fara_tva: situatie.total_fara_tva || 0,
        tva: situatie.tva || 0,
        total_cu_tva: situatie.total_cu_tva || 0,
        items,
        document_uuid: crypto.randomUUID(),
        titlu: `Situație lucrări ${nrSituatie}`,
        situatie_json: situatie,
        creat_de: auth.user.id,
        dept_initiatoare: auth.user.department_id || auth.user.departmentId || null,
        nr_articole: items.length,
        mesaj: JSON.stringify([])
      })
      addAudit(auth.db, auth.user, 'intersoft_situatie_imported', nrSituatie)
      sendJson(res, 201, created)
      return
    }

    const db = readDb()
    const integration = ensureIntegrationDb(db)
    const docs = ensureDocumentsDb(db)
    if (!docs.documentTypes.some(item => item.id === 'SITLUC')) throwHttp(404, 'Tipul de document SITLUC nu exista.')
    const project = integration.intersoftProjects.find(item => Number(item.id) === projectId)
    if (!project) throwHttp(404, 'Proiectul Intersoft nu exista.')

    const situatieImport = {
      id: nextId(integration.situationImports),
      uuid: crypto.randomUUID(),
      project_id: projectId,
      nr_situatie: nrSituatie,
      data_situatie: situatie.data_situatie || null,
      tip: 'realizat',
      fisier_original_path: req.file.originalname,
      total_fara_tva: situatie.total_fara_tva || 0,
      tva: situatie.tva || 0,
      total_cu_tva: situatie.total_cu_tva || 0,
      status: 'importat',
      document_id: null,
      created_at: nowIso()
    }
    integration.situationImports.push(situatieImport)
    const startItemId = nextId(integration.situationItems)
    items.forEach((item, index) => {
      const article = integration.intersoftArticles.find(entry => Number(entry.project_id) === projectId && entry.cod_articol === item.cod_articol)
      if (!article) return
      integration.situationItems.push({
        id: startItemId + index,
        situatie_id: situatieImport.id,
        article_id: article.id,
        cantitate_realizata: item.cant_realizata || 0,
        cantitate_renuntata: item.cant_renuntata || 0,
        cantitate_suplimentata: 0,
        valoare_realizata: item.valoare_realizata || 0,
        valoare_renuntata: item.valoare_renuntata || 0,
        valoare_suplimentata: 0,
        created_at: nowIso()
      })
    })
    const document = {
      id: nextId(docs.documents),
      uuid: crypto.randomUUID(),
      tip_id: 'SITLUC',
      nr_document: nrSituatie,
      titlu: `Situație lucrări ${nrSituatie}`,
      date_json: JSON.stringify(situatie),
      status: 'draft',
      versiune: 1,
      creat_de: auth.user.id,
      dept_initiatoare: auth.user.department_id || auth.user.departmentId || null,
      prioritate: 'normal',
      termen_limita: null,
      fisier_draft_path: null,
      fisier_final_path: null,
      created_at: nowIso(),
      updated_at: null
    }
    docs.documents.push(document)
    situatieImport.document_id = document.id
    integration.intersoftSyncLog.push({
      id: nextId(integration.intersoftSyncLog),
      project_id: projectId,
      tip: 'import_situatie',
      fisier_sursa: req.file.originalname,
      nr_articole: items.length,
      status: 'ok',
      mesaj: JSON.stringify([]),
      efectuat_de: auth.user.id,
      created_at: nowIso()
    })
    addAudit(db, auth.user, 'intersoft_situatie_imported', nrSituatie)
    writeDb(db)
    sendJson(res, 201, { situatie_id: situatieImport.id, document_id: document.id, nr_situatie: nrSituatie })
  } catch (error) {
    next(error)
  } finally {
    cleanupUpload(req.file)
  }
})

router.post('/integration/intersoft/projects/:id/preview-situatie', upload.single('file'), (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'integration:intersoft_import')) return
    validateExcelFile(req.file)

    const result = parseSituatieExcel(req.file.path)
    sendJson(res, 200, {
      situatie: {
        ...result.situatie,
        total_cu_tva: Number(result.situatie.total_fara_tva || 0) + Number(result.situatie.tva || 0)
      },
      primele_articole: result.items.slice(0, 5),
      articole: result.items.length,
      erori: result.errors
    })
  } catch (error) {
    next(error)
  } finally {
    cleanupUpload(req.file)
  }
})

router.get('/integration/intersoft/projects/:id/progress', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'integration:intersoft_view')) return
    const projectId = Number(req.params.id)

    if (isMssqlMode()) {
      const rows = mssqlArray(`
DECLARE @projectId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.projectId'));
SELECT
  ia.cod_articol,
  ia.denumire,
  ia.um,
  ia.cantitate_deviz,
  COALESCE(SUM(ja.cantitate_executata), 0) as cant_realizata,
  ROUND(COALESCE(SUM(ja.cantitate_executata), 0)
    / NULLIF(ia.cantitate_deviz, 0) * 100, 1) as procent
FROM integration.intersoft_articles ia
LEFT JOIN field.journal_activities ja
  ON ja.articol_deviz = ia.cod_articol
LEFT JOIN field.site_journals sj ON sj.id = ja.journal_id
  AND sj.santier_id = (
    SELECT santier_id FROM integration.intersoft_projects WHERE id = @projectId
  )
WHERE ia.project_id = @projectId
GROUP BY ia.id, ia.cod_articol, ia.denumire, ia.um, ia.cantitate_deviz
FOR JSON PATH;
`, { projectId })
      sendJson(res, 200, buildProgress(rows))
      return
    }

    const db = readDb()
    const integration = ensureIntegrationDb(db)
    const project = integration.intersoftProjects.find(item => Number(item.id) === projectId)
    if (!project) throwHttp(404, 'Proiectul Intersoft nu exista.')
    const rows = progressRowsJson(db, project, integration.intersoftArticles.filter(article => Number(article.project_id) === projectId))
    sendJson(res, 200, buildProgress(rows))
  } catch (error) {
    next(error)
  }
})

router.get('/integration/intersoft/projects/:id/sync-log', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'integration:intersoft_view')) return
    const projectId = Number(req.params.id)

    if (isMssqlMode()) {
      const logs = mssqlArray(`
DECLARE @projectId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.projectId'));
SELECT TOP 20 *
FROM integration.intersoft_sync_log
WHERE project_id = @projectId
ORDER BY created_at DESC
FOR JSON PATH;
`, { projectId })
      sendJson(res, 200, logs)
      return
    }

    const db = readDb()
    const integration = ensureIntegrationDb(db)
    const logs = integration.intersoftSyncLog
      .filter(item => Number(item.project_id) === projectId)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .slice(0, 20)
    sendJson(res, 200, logs)
  } catch (error) {
    next(error)
  }
})

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function sendXlsx(res, buffer) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename=cantitati_realizate.xlsx')
  res.send(buffer)
}

function calculateJsonRealizari(db, santierId, deLa, panaLa) {
  const journals = db.field?.siteJournals || []
  const activities = db.field?.journalActivities || []
  const journalIds = new Set(journals
    .filter(journal => String(journal.santier_id) === String(santierId) && journal.data >= deLa && journal.data <= panaLa)
    .map(journal => journal.id))
  return activities.reduce((acc, activity) => {
    if (!journalIds.has(activity.journal_id) || !activity.articol_deviz) return acc
    acc[activity.articol_deviz] = (acc[activity.articol_deviz] || 0) + Number(activity.cantitate_executata || 0)
    return acc
  }, {})
}

function progressRowsJson(db, project, articles) {
  const realizari = calculateJsonRealizari(db, project.santier_id, '0000-01-01', '9999-12-31')
  return articles.map(article => {
    const cantRealizata = Number(realizari[article.cod_articol] || 0)
    const cantDeviz = Number(article.cantitate_deviz || 0)
    return {
      cod_articol: article.cod_articol,
      denumire: article.denumire,
      um: article.um,
      cantitate_deviz: cantDeviz,
      cant_realizata: cantRealizata,
      procent: cantDeviz ? Math.round((cantRealizata / cantDeviz) * 1000) / 10 : null
    }
  })
}

function buildProgress(rows) {
  const totalCantitateDeviz = rows.reduce((sum, row) => sum + Number(row.cantitate_deviz || 0), 0)
  const progres = totalCantitateDeviz
    ? rows.reduce((sum, row) => sum + (Number(row.procent || 0) * (Number(row.cantitate_deviz || 0) / totalCantitateDeviz)), 0)
    : 0
  return {
    total_articole: rows.length,
    articole_cu_realizari: rows.filter(row => Number(row.cant_realizata || 0) > 0).length,
    progres_fizic_procent: Math.round(progres * 10) / 10,
    pe_articol: rows
  }
}

module.exports = router
