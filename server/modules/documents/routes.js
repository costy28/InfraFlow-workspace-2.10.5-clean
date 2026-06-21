const { Router } = require('express')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { readDb, writeDb, runMssqlScalar, DB_MODE, MSSQL_RELATIONAL_MODE } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const engine = require('./engine')
const router = Router()

const statuses = new Set(['draft', 'in_circuit', 'aprobat', 'respins', 'anulat', 'arhivat'])
const priorities = new Set(['normal', 'urgent', 'critic'])
const TEMPLATE_STORAGE_ROOT = path.join(__dirname, '../../../storage/document-templates')
const allowedTemplateExtensions = new Set(['.docx', '.xml', '.html', '.htm'])
const uploadTemplateModel = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

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

function ensureDocumentsDb(db) {
  db.documents = db.documents || {}
  db.documents.documentTypes = Array.isArray(db.documents.documentTypes) ? db.documents.documentTypes : []
  db.documents.documents = Array.isArray(db.documents.documents) ? db.documents.documents : []
  db.documents.circuitSteps = Array.isArray(db.documents.circuitSteps) ? db.documents.circuitSteps : []
  db.documents.circuitAudit = Array.isArray(db.documents.circuitAudit) ? db.documents.circuitAudit : []
  db.documents.documentShares = Array.isArray(db.documents.documentShares) ? db.documents.documentShares : []
  db.documents.templateFiles = Array.isArray(db.documents.templateFiles) ? db.documents.templateFiles : []
  return db.documents
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

function requireDocumentPermission(auth, res, permission) {
  if (userHasPermission(auth.db, auth.user, permission)) return true
  if (requirePermission(auth, { writeHead() {}, end() {} }, permission)) return true
  sendJson(res, 403, { error: 'Nu ai permisiune pentru aceasta actiune.' })
  return false
}

function hasDocumentPermission(auth, permission) {
  return userHasPermission(auth.db, auth.user, permission)
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function publicDocument(document) {
  return {
    id: document.id,
    uuid: document.uuid,
    tip_id: document.tip_id,
    nr_document: document.nr_document,
    titlu: document.titlu || '',
    date_json: parseJson(document.date_json, {}),
    status: document.status,
    versiune: document.versiune || 1,
    creat_de: document.creat_de,
    dept_initiatoare: document.dept_initiatoare || null,
    prioritate: document.prioritate || 'normal',
    termen_limita: document.termen_limita || null,
    fisier_draft_path: document.fisier_draft_path || null,
    fisier_final_path: document.fisier_final_path || null,
    created_at: document.created_at,
    updated_at: document.updated_at || null
  }
}

function canViewDocument(auth, document) {
  if (userHasPermission(auth.db, auth.user, 'documents:view_all')) return true
  if (document.creat_de === auth.user.id && userHasPermission(auth.db, auth.user, 'documents:view_own')) return true
  if (document.dept_initiatoare && document.dept_initiatoare === auth.user.departmentId && userHasPermission(auth.db, auth.user, 'documents:view_dept')) return true
  const docs = ensureDocumentsDb(auth.db)
  if (docs.circuitSteps.some(step => step.document_id === document.id && step.user_responsabil === auth.user.id)) return true
  return docs.documentShares.some(share => share.document_id === document.id && (share.shared_with_user === auth.user.id || share.shared_with_dept === auth.user.departmentId))
}

function documentByUuid(db, uuid) {
  const docs = ensureDocumentsDb(db)
  return docs.documents.find(item => item.uuid === uuid) || null
}

function typeById(db, id) {
  const docs = ensureDocumentsDb(db)
  return docs.documentTypes.find(item => item.id === id) || null
}

function safeTemplateId(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
}

function safeFileName(value) {
  const ext = path.extname(String(value || '')).toLowerCase()
  const base = path.basename(String(value || 'model'), ext)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'model'
  return `${base}${ext}`
}

function templatePublicFilePath(templateId, fileName) {
  return `/storage/document-templates/${safeTemplateId(templateId)}/${fileName}`
}

function resolveTemplateFilePath(publicPath) {
  const clean = String(publicPath || '').replace(/^\/+storage\/+/, '').replace(/\\/g, '/')
  return path.join(path.dirname(TEMPLATE_STORAGE_ROOT), clean)
}

function templateModelFields(template = {}) {
  const attachment = template.atasament_model || {}
  return {
    fisier_model_path: template.fisier_model_path || attachment.path || null,
    fisier_model_name: template.fisier_model_name || attachment.file_name || attachment.name || null,
    fisier_model_size: template.fisier_model_size || attachment.file_size || attachment.size || null,
    template_format: template.template_format || attachment.file_ext || 'html',
    tip_document: template.tip_document || template.tipDocument || 'generic',
    uploaded_at: template.uploaded_at || attachment.uploaded_at || null
  }
}

function publicTemplate(template = {}) {
  return { ...template, ...templateModelFields(template) }
}

function extractTemplateVariables(html) {
  const variables = new Set()
  String(html || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    variables.add(key)
    return ''
  })
  return Array.from(variables).sort((a, b) => a.localeCompare(b))
}

function publicCatalogTemplate(template = {}) {
  const fields = templateModelFields(template)
  return {
    id: template.id,
    denumire: template.denumire,
    categorie: template.categorie,
    descriere: template.descriere,
    tip_document: fields.tip_document,
    template_format: fields.template_format,
    fisier_model_name: fields.fisier_model_name,
    fisier_model_size: fields.fisier_model_size,
    serie_prefix: template.serie_prefix,
    activ: template.activ !== false,
    variables: extractTemplateVariables(template.template_html)
  }
}

function ensureTemplateSchemaMssql() {
  if (!isMssqlMode()) return
  runMssqlScalar(`
IF SCHEMA_ID(N'documents') IS NULL EXEC(N'CREATE SCHEMA documents');
IF OBJECT_ID(N'documents.document_template_files', N'U') IS NULL
BEGIN
  CREATE TABLE documents.document_template_files (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE DEFAULT NEWID(),
    template_id NVARCHAR(50) NOT NULL,
    file_path NVARCHAR(500) NOT NULL,
    file_name NVARCHAR(255) NOT NULL,
    file_size INT NULL,
    file_ext NVARCHAR(20) NULL,
    uploaded_by INT NULL,
    created_at DATETIME2 DEFAULT SYSDATETIME()
  );
END;
IF OBJECT_ID(N'documents.document_types', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH(N'documents.document_types', N'categorie') IS NULL ALTER TABLE documents.document_types ADD categorie NVARCHAR(80) NULL;
  IF COL_LENGTH(N'documents.document_types', N'descriere') IS NULL ALTER TABLE documents.document_types ADD descriere NVARCHAR(500) NULL;
  IF COL_LENGTH(N'documents.document_types', N'tip_document') IS NULL ALTER TABLE documents.document_types ADD tip_document NVARCHAR(50) NULL;
  IF COL_LENGTH(N'documents.document_types', N'template_format') IS NULL ALTER TABLE documents.document_types ADD template_format NVARCHAR(20) NULL;
  IF COL_LENGTH(N'documents.document_types', N'fisier_model_path') IS NULL ALTER TABLE documents.document_types ADD fisier_model_path NVARCHAR(500) NULL;
  IF COL_LENGTH(N'documents.document_types', N'fisier_model_name') IS NULL ALTER TABLE documents.document_types ADD fisier_model_name NVARCHAR(255) NULL;
  IF COL_LENGTH(N'documents.document_types', N'fisier_model_size') IS NULL ALTER TABLE documents.document_types ADD fisier_model_size INT NULL;
  IF COL_LENGTH(N'documents.document_types', N'uploaded_at') IS NULL ALTER TABLE documents.document_types ADD uploaded_at DATETIME2 NULL;
END;
SELECT 1 AS ok FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { jsonInput: '{}' })
}

function documentMatchesQuery(document, query) {
  if (query.tip && document.tip_id !== query.tip) return false
  if (query.status && document.status !== query.status) return false
  if (query.dept && document.dept_initiatoare !== query.dept) return false
  if (query.from && String(document.created_at || '').slice(0, 10) < query.from) return false
  if (query.to && String(document.created_at || '').slice(0, 10) > query.to) return false
  return true
}

function mssqlDocument(uuid) {
  return mssqlArray(`
DECLARE @uuid char(36) = JSON_VALUE(@p, '$.uuid');
SELECT TOP 1 id, uuid, tip_id, nr_document, titlu, date_json, status, versiune, creat_de, dept_initiatoare,
  prioritate, termen_limita, fisier_draft_path, fisier_final_path, created_at, updated_at
FROM documents.documents
WHERE uuid = @uuid
FOR JSON PATH;
`, { uuid })[0] || null
}

function mssqlDocumentDetails(uuid) {
  return mssqlJson(`
DECLARE @uuid char(36) = JSON_VALUE(@p, '$.uuid');
DECLARE @documentId int;
SELECT @documentId = id FROM documents.documents WHERE uuid = @uuid;
SELECT
  JSON_QUERY((SELECT TOP 1 id, uuid, tip_id, nr_document, titlu, date_json, status, versiune, creat_de, dept_initiatoare,
    prioritate, termen_limita, fisier_draft_path, fisier_final_path, created_at, updated_at
    FROM documents.documents WHERE id = @documentId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)) AS document,
  JSON_QUERY((SELECT id, document_id, nr_pas, tip, rol_responsabil, user_responsabil, status, comentariu, actionat_de, actionat_la, termen_ore, created_at
    FROM documents.circuit_steps WHERE document_id = @documentId ORDER BY nr_pas FOR JSON PATH)) AS steps,
  JSON_QUERY((SELECT id, document_id, user_id, actiune, status_vechi, status_nou, comentariu, ip_address, created_at
    FROM documents.circuit_audit WHERE document_id = @documentId ORDER BY created_at ASC, id ASC FOR JSON PATH)) AS audit,
  JSON_QUERY((SELECT id, document_id, shared_with_dept, shared_with_user, nivel_acces, shared_by, created_at, expires_at
    FROM documents.document_shares WHERE document_id = @documentId ORDER BY created_at ASC, id ASC FOR JSON PATH)) AS shares
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { uuid })
}

function jsonStats(docs) {
  const inCircuit = docs.documents.filter(item => item.status === 'in_circuit')
  const byStatus = {}
  docs.documents.forEach(document => { byStatus[document.status] = (byStatus[document.status] || 0) + 1 })
  return {
    total: docs.documents.length,
    in_circuit: inCircuit.length,
    urgente: docs.documents.filter(item => item.prioritate === 'urgent' || item.prioritate === 'critic').length,
    pe_status: byStatus,
    inbox_pending: docs.circuitSteps.filter(step => step.status === 'asteptare').length
  }
}

router.get('/documents/templates', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:templates')) return
    if (isMssqlMode()) {
      ensureTemplateSchemaMssql()
      const templates = mssqlArray(`SELECT id, denumire, template_html, workflow_template_id, serie_prefix, nr_curent, activ, categorie, descriere, tip_document, template_format, fisier_model_path, fisier_model_name, fisier_model_size, uploaded_at, created_at FROM documents.document_types ORDER BY id FOR JSON PATH;`)
      sendJson(res, 200, { templates })
      return
    }
    sendJson(res, 200, { templates: ensureDocumentsDb(auth.db).documentTypes.map(publicTemplate) })
  } catch (error) {
    next(error)
  }
})

router.post('/documents/templates', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:templates')) return
    const body = req.body || {}
    const id = safeTemplateId(body.id)
    if (!id) throwHttp(400, 'ID tip document obligatoriu.')
    if (isMssqlMode()) {
      ensureTemplateSchemaMssql()
      const template = mssqlJson(`
MERGE documents.document_types AS target
USING (SELECT JSON_VALUE(@p, '$.id') AS id) AS source
ON target.id = source.id
WHEN MATCHED THEN UPDATE SET denumire = JSON_VALUE(@p, '$.denumire'), template_html = JSON_VALUE(@p, '$.templateHtml'),
  workflow_template_id = NULLIF(JSON_VALUE(@p, '$.workflowTemplateId'), N''), serie_prefix = JSON_VALUE(@p, '$.seriePrefix'),
  categorie = JSON_VALUE(@p, '$.categorie'), descriere = JSON_VALUE(@p, '$.descriere'),
  tip_document = JSON_VALUE(@p, '$.tipDocument'), template_format = JSON_VALUE(@p, '$.templateFormat'),
  activ = CASE WHEN JSON_VALUE(@p, '$.activ') = N'false' THEN 0 ELSE 1 END
WHEN NOT MATCHED THEN INSERT (id, denumire, template_html, workflow_template_id, serie_prefix, nr_curent, activ)
  VALUES (JSON_VALUE(@p, '$.id'), JSON_VALUE(@p, '$.denumire'), JSON_VALUE(@p, '$.templateHtml'), NULLIF(JSON_VALUE(@p, '$.workflowTemplateId'), N''), JSON_VALUE(@p, '$.seriePrefix'), 0, CASE WHEN JSON_VALUE(@p, '$.activ') = N'false' THEN 0 ELSE 1 END);
UPDATE documents.document_types
SET categorie = JSON_VALUE(@p, '$.categorie'), descriere = JSON_VALUE(@p, '$.descriere'),
  tip_document = JSON_VALUE(@p, '$.tipDocument'), template_format = JSON_VALUE(@p, '$.templateFormat')
WHERE id = JSON_VALUE(@p, '$.id');
SELECT id, denumire, template_html, workflow_template_id, serie_prefix, nr_curent, activ, categorie, descriere, tip_document, template_format, fisier_model_path, fisier_model_name, fisier_model_size, uploaded_at, created_at FROM documents.document_types WHERE id = JSON_VALUE(@p, '$.id')
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { id, denumire: body.denumire || '', templateHtml: body.template_html || '', workflowTemplateId: body.workflow_template_id || '', seriePrefix: body.serie_prefix || id, categorie: body.categorie || 'Alt', descriere: body.descriere || '', tipDocument: body.tip_document || 'generic', templateFormat: body.template_format || 'html', activ: body.activ !== false })
      sendJson(res, 200, { template })
      return
    }
    const docs = ensureDocumentsDb(auth.db)
    let template = docs.documentTypes.find(item => item.id === id)
    if (!template) {
      template = { id, nr_curent: 0, created_at: nowIso() }
      docs.documentTypes.push(template)
    }
    Object.assign(template, {
      denumire: body.denumire || '',
      template_html: body.template_html || '',
      workflow_template_id: body.workflow_template_id || null,
      serie_prefix: body.serie_prefix || id,
      categorie: body.categorie || template.categorie || 'Alt',
      descriere: body.descriere || '',
      tip_document: body.tip_document || template.tip_document || 'generic',
      template_format: body.template_format || template.template_format || 'html',
      atasament_model: body.atasament_model || null,
      activ: body.activ !== false
    })
    addAudit(auth.db, auth.user, 'document_template_salvat', id)
    writeDb(auth.db)
    sendJson(res, 200, { template })
  } catch (error) {
    next(error)
  }
})

router.put('/documents/templates/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:templates')) return
    const id = safeTemplateId(req.params.id)
    const body = req.body || {}
    if (!id) throwHttp(400, 'ID tip document obligatoriu.')
    if (isMssqlMode()) {
      ensureTemplateSchemaMssql()
      const template = mssqlJson(`
UPDATE documents.document_types
SET denumire = COALESCE(NULLIF(JSON_VALUE(@p, '$.denumire'), N''), denumire),
  template_html = COALESCE(JSON_VALUE(@p, '$.templateHtml'), template_html),
  workflow_template_id = NULLIF(JSON_VALUE(@p, '$.workflowTemplateId'), N''),
  serie_prefix = COALESCE(NULLIF(JSON_VALUE(@p, '$.seriePrefix'), N''), serie_prefix),
  categorie = COALESCE(NULLIF(JSON_VALUE(@p, '$.categorie'), N''), categorie),
  descriere = COALESCE(JSON_VALUE(@p, '$.descriere'), descriere),
  tip_document = COALESCE(NULLIF(JSON_VALUE(@p, '$.tipDocument'), N''), tip_document),
  template_format = COALESCE(NULLIF(JSON_VALUE(@p, '$.templateFormat'), N''), template_format),
  activ = CASE WHEN JSON_VALUE(@p, '$.activ') = N'false' THEN 0 ELSE activ END
WHERE id = JSON_VALUE(@p, '$.id');
SELECT id, denumire, template_html, workflow_template_id, serie_prefix, nr_curent, activ, categorie, descriere, tip_document, template_format, fisier_model_path, fisier_model_name, fisier_model_size, uploaded_at, created_at
FROM documents.document_types WHERE id = JSON_VALUE(@p, '$.id')
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { id, denumire: body.denumire || '', templateHtml: body.template_html || '', workflowTemplateId: body.workflow_template_id || '', seriePrefix: body.serie_prefix || id, categorie: body.categorie || '', descriere: body.descriere || '', tipDocument: body.tip_document || '', templateFormat: body.template_format || '', activ: body.activ !== false })
      if (!template) throwHttp(404, 'Template-ul nu a fost gasit.')
      sendJson(res, 200, { template })
      return
    }
    const docs = ensureDocumentsDb(auth.db)
    const template = docs.documentTypes.find(item => String(item.id).toUpperCase() === id)
    if (!template) throwHttp(404, 'Template-ul nu a fost gasit.')
    Object.assign(template, {
      denumire: body.denumire ?? template.denumire,
      template_html: body.template_html ?? template.template_html,
      workflow_template_id: body.workflow_template_id ?? template.workflow_template_id,
      serie_prefix: body.serie_prefix || template.serie_prefix || id,
      categorie: body.categorie ?? template.categorie,
      descriere: body.descriere ?? template.descriere,
      tip_document: body.tip_document ?? template.tip_document ?? 'generic',
      template_format: body.template_format ?? template.template_format ?? 'html',
      atasament_model: body.atasament_model ?? template.atasament_model,
      activ: body.activ !== undefined ? body.activ !== false : template.activ,
    })
    addAudit(auth.db, auth.user, 'document_template_editat', id)
    writeDb(auth.db)
    sendJson(res, 200, { template })
  } catch (error) {
    next(error)
  }
})

router.delete('/documents/templates/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:templates')) return
    const id = String(req.params.id || '').trim().toUpperCase()
    if (!id) throwHttp(400, 'ID tip document obligatoriu.')
    if (isMssqlMode()) {
      ensureTemplateSchemaMssql()
      const template = mssqlJson(`
UPDATE documents.document_types SET activ = 0 WHERE id = JSON_VALUE(@p, '$.id');
SELECT id, denumire, template_html, workflow_template_id, serie_prefix, nr_curent, activ, categorie, descriere, tip_document, template_format, fisier_model_path, fisier_model_name, fisier_model_size, uploaded_at, created_at
FROM documents.document_types WHERE id = JSON_VALUE(@p, '$.id')
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { id })
      if (!template) throwHttp(404, 'Template-ul nu a fost gasit.')
      sendJson(res, 200, { template })
      return
    }
    const docs = ensureDocumentsDb(auth.db)
    const template = docs.documentTypes.find(item => String(item.id).toUpperCase() === id)
    if (!template) throwHttp(404, 'Template-ul nu a fost gasit.')
    template.activ = false
    template.deleted_at = nowIso()
    addAudit(auth.db, auth.user, 'document_template_dezactivat', id)
    writeDb(auth.db)
    sendJson(res, 200, { template })
  } catch (error) {
    next(error)
  }
})

router.get('/documents/template-catalog', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:create')) return
    if (isMssqlMode()) {
      ensureTemplateSchemaMssql()
      const rows = mssqlArray(`
SELECT id, denumire, categorie, descriere, tip_document, template_format, fisier_model_name, fisier_model_size, serie_prefix, activ, template_html
FROM documents.document_types
WHERE activ = 1
ORDER BY denumire
FOR JSON PATH;
`)
      sendJson(res, 200, { templates: rows.map(publicCatalogTemplate) })
      return
    }
    const templates = ensureDocumentsDb(auth.db).documentTypes
      .filter(template => template.activ !== false)
      .map(publicCatalogTemplate)
    sendJson(res, 200, { templates })
  } catch (error) {
    next(error)
  }
})

router.post('/documents/templates/:id/upload-model', uploadTemplateModel.single('file'), (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:templates')) return
    const id = safeTemplateId(req.params.id)
    if (!id) throwHttp(400, 'ID tip document obligatoriu.')
    if (!req.file) throwHttp(400, 'Selectează un fișier model.')
    const ext = path.extname(req.file.originalname || '').toLowerCase()
    if (!allowedTemplateExtensions.has(ext)) throwHttp(422, 'Sunt acceptate doar modele DOCX, XML sau HTML.')
    const dir = path.join(TEMPLATE_STORAGE_ROOT, id)
    fs.mkdirSync(dir, { recursive: true })
    const fileName = `${Date.now()}-${safeFileName(req.file.originalname)}`
    const diskPath = path.join(dir, fileName)
    fs.writeFileSync(diskPath, req.file.buffer)
    const publicPath = templatePublicFilePath(id, fileName)
    const uploadedAt = nowIso()
    const file = {
      template_id: id,
      file_path: publicPath,
      file_name: req.file.originalname,
      file_size: req.file.size,
      file_ext: ext.replace(/^\./, ''),
      uploaded_by: auth.user.id,
      created_at: uploadedAt
    }
    if (isMssqlMode()) {
      ensureTemplateSchemaMssql()
      const template = mssqlJson(`
UPDATE documents.document_types
SET fisier_model_path = JSON_VALUE(@p, '$.filePath'),
  fisier_model_name = JSON_VALUE(@p, '$.fileName'),
  fisier_model_size = CONVERT(int, JSON_VALUE(@p, '$.fileSize')),
  template_format = JSON_VALUE(@p, '$.fileExt'),
  uploaded_at = SYSDATETIME()
WHERE id = JSON_VALUE(@p, '$.id');
INSERT INTO documents.document_template_files (template_id, file_path, file_name, file_size, file_ext, uploaded_by)
VALUES (JSON_VALUE(@p, '$.id'), JSON_VALUE(@p, '$.filePath'), JSON_VALUE(@p, '$.fileName'), CONVERT(int, JSON_VALUE(@p, '$.fileSize')), JSON_VALUE(@p, '$.fileExt'), CONVERT(int, JSON_VALUE(@p, '$.uploadedBy')));
SELECT id, denumire, template_html, workflow_template_id, serie_prefix, nr_curent, activ, categorie, descriere, tip_document, template_format, fisier_model_path, fisier_model_name, fisier_model_size, uploaded_at, created_at
FROM documents.document_types WHERE id = JSON_VALUE(@p, '$.id')
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { id, filePath: publicPath, fileName: req.file.originalname, fileSize: req.file.size, fileExt: ext.replace(/^\./, ''), uploadedBy: auth.user.id })
      if (!template) throwHttp(404, 'Template-ul nu a fost găsit.')
      sendJson(res, 200, { file, template })
      return
    }
    const docs = ensureDocumentsDb(auth.db)
    const template = docs.documentTypes.find(item => String(item.id).toUpperCase() === id)
    if (!template) throwHttp(404, 'Template-ul nu a fost găsit.')
    docs.templateFiles.push({ id: nextId(docs.templateFiles), uuid: crypto.randomUUID(), ...file })
    Object.assign(template, {
      fisier_model_path: publicPath,
      fisier_model_name: req.file.originalname,
      fisier_model_size: req.file.size,
      template_format: ext.replace(/^\./, ''),
      uploaded_at: uploadedAt,
      atasament_model: {
        path: publicPath,
        file_name: req.file.originalname,
        file_size: req.file.size,
        file_ext: ext.replace(/^\./, ''),
        uploaded_at: uploadedAt
      }
    })
    addAudit(auth.db, auth.user, 'document_template_model_upload', id)
    writeDb(auth.db)
    sendJson(res, 200, { file, template: publicTemplate(template) })
  } catch (error) {
    next(error)
  }
})

router.get('/documents/templates/:id/download-model', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:templates')) return
    const id = safeTemplateId(req.params.id)
    let template = null
    if (isMssqlMode()) {
      ensureTemplateSchemaMssql()
      template = mssqlJson(`
SELECT TOP 1 id, fisier_model_path, fisier_model_name FROM documents.document_types WHERE id = JSON_VALUE(@p, '$.id')
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { id })
    } else {
      template = ensureDocumentsDb(auth.db).documentTypes.find(item => String(item.id).toUpperCase() === id)
    }
    const filePath = templateModelFields(template || {}).fisier_model_path
    if (!filePath) throwHttp(404, 'Template-ul nu are fișier model încărcat.')
    const diskPath = resolveTemplateFilePath(filePath)
    if (!fs.existsSync(diskPath)) throwHttp(404, 'Fișierul model nu mai există pe disc.')
    res.download(diskPath, templateModelFields(template).fisier_model_name || path.basename(diskPath))
  } catch (error) {
    next(error)
  }
})

router.post('/documents/templates/:id/preview', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!hasDocumentPermission(auth, 'documents:templates') && !hasDocumentPermission(auth, 'documents:create')) {
      sendJson(res, 403, { error: 'Nu ai permisiune pentru previzualizarea template-urilor.' })
      return
    }
    const id = safeTemplateId(req.params.id)
    let template = null
    if (isMssqlMode()) {
      ensureTemplateSchemaMssql()
      template = mssqlJson(`
SELECT TOP 1 id, denumire, template_html FROM documents.document_types WHERE id = JSON_VALUE(@p, '$.id')
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { id })
    } else {
      template = ensureDocumentsDb(auth.db).documentTypes.find(item => String(item.id).toUpperCase() === id)
    }
    if (!template) throwHttp(404, 'Template-ul nu a fost găsit.')
    const html = engine.generateDocumentHtml({
      uuid: `preview-${id}`,
      nr_document: `${id}-PREVIEW`,
      tip_id: id,
      titlu: template.denumire || id,
      date_json: JSON.stringify(req.body?.data || {}),
      created_at: nowIso(),
      template_html: template.template_html || '<h1>{{document.numar}}</h1><p>{{continut}}</p>'
    }, [], auth.db.settings?.company || auth.db.settings || {})
    sendJson(res, 200, { html })
  } catch (error) {
    next(error)
  }
})

router.get('/documents/stats', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:admin')) return
    if (isMssqlMode()) {
      const stats = mssqlJson(`
SELECT COUNT(1) AS total,
  SUM(CASE WHEN status = N'in_circuit' THEN 1 ELSE 0 END) AS in_circuit,
  SUM(CASE WHEN prioritate IN (N'urgent', N'critic') THEN 1 ELSE 0 END) AS urgente,
  JSON_QUERY((SELECT status, COUNT(1) AS count FROM documents.documents GROUP BY status FOR JSON PATH)) AS pe_status,
  (SELECT COUNT(1) FROM documents.circuit_steps WHERE status = N'asteptare') AS inbox_pending
FROM documents.documents
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`)
      sendJson(res, 200, stats || jsonStats({ documents: [], circuitSteps: [] }))
      return
    }
    sendJson(res, 200, jsonStats(ensureDocumentsDb(auth.db)))
  } catch (error) {
    next(error)
  }
})

router.get('/documents/inbox', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:approve')) return
    if (isMssqlMode()) {
      const documents = mssqlArray(`
DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId');
SELECT d.id, d.uuid, d.tip_id, d.nr_document, d.titlu, d.date_json, d.status, d.versiune, d.creat_de, d.dept_initiatoare,
  d.prioritate, d.termen_limita, d.fisier_draft_path, d.fisier_final_path, d.created_at, d.updated_at
FROM documents.documents d
JOIN documents.circuit_steps s ON s.document_id = d.id AND s.status = N'asteptare' AND s.user_responsabil = @userId
WHERE d.status = N'in_circuit'
ORDER BY d.created_at DESC
FOR JSON PATH;
`, { userId: auth.user.id })
      sendJson(res, 200, { documents })
      return
    }
    const docs = ensureDocumentsDb(auth.db)
    const ids = new Set(docs.circuitSteps.filter(step => step.status === 'asteptare' && step.user_responsabil === auth.user.id).map(step => step.document_id))
    sendJson(res, 200, { documents: docs.documents.filter(document => document.status === 'in_circuit' && ids.has(document.id)).map(publicDocument) })
  } catch (error) {
    next(error)
  }
})

router.get('/documents/shared', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:view_own')) return
    if (isMssqlMode()) {
      const documents = mssqlArray(`
DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId');
DECLARE @deptId nvarchar(64) = JSON_VALUE(@p, '$.deptId');
SELECT d.id, d.uuid, d.tip_id, d.nr_document, d.titlu, d.date_json, d.status, d.versiune, d.creat_de, d.dept_initiatoare,
  d.prioritate, d.termen_limita, d.fisier_draft_path, d.fisier_final_path, d.created_at, d.updated_at
FROM documents.documents d
JOIN documents.document_shares s ON s.document_id = d.id
WHERE (s.shared_with_user = @userId OR s.shared_with_dept = @deptId) AND (s.expires_at IS NULL OR s.expires_at > sysdatetime())
ORDER BY d.created_at DESC
FOR JSON PATH;
`, { userId: auth.user.id, deptId: auth.user.departmentId || '' })
      sendJson(res, 200, { documents })
      return
    }
    const docs = ensureDocumentsDb(auth.db)
    const ids = new Set(docs.documentShares.filter(share => share.shared_with_user === auth.user.id || share.shared_with_dept === auth.user.departmentId).map(share => share.document_id))
    sendJson(res, 200, { documents: docs.documents.filter(document => ids.has(document.id)).map(publicDocument) })
  } catch (error) {
    next(error)
  }
})

router.get('/documents', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:view_own')) return
    if (isMssqlMode()) {
      const canAll = userHasPermission(auth.db, auth.user, 'documents:view_all')
      const canDept = userHasPermission(auth.db, auth.user, 'documents:view_dept')
      const documents = mssqlArray(`
DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId');
DECLARE @deptId nvarchar(64) = JSON_VALUE(@p, '$.deptId');
DECLARE @canAll bit = CASE WHEN JSON_VALUE(@p, '$.canAll') = N'true' THEN 1 ELSE 0 END;
DECLARE @canDept bit = CASE WHEN JSON_VALUE(@p, '$.canDept') = N'true' THEN 1 ELSE 0 END;
DECLARE @tip nvarchar(20) = NULLIF(JSON_VALUE(@p, '$.tip'), N'');
DECLARE @status nvarchar(40) = NULLIF(JSON_VALUE(@p, '$.status'), N'');
DECLARE @dept nvarchar(64) = NULLIF(JSON_VALUE(@p, '$.dept'), N'');
SELECT id, uuid, tip_id, nr_document, titlu, date_json, status, versiune, creat_de, dept_initiatoare,
  prioritate, termen_limita, fisier_draft_path, fisier_final_path, created_at, updated_at
FROM documents.documents
WHERE (@canAll = 1 OR creat_de = @userId OR (@canDept = 1 AND dept_initiatoare = @deptId))
  AND (@tip IS NULL OR tip_id = @tip)
  AND (@status IS NULL OR status = @status)
  AND (@dept IS NULL OR dept_initiatoare = @dept)
ORDER BY created_at DESC
FOR JSON PATH;
`, { userId: auth.user.id, deptId: auth.user.departmentId || '', canAll, canDept, tip: req.query.tip || '', status: req.query.status || '', dept: req.query.dept || '' })
      sendJson(res, 200, { documents })
      return
    }
    const docs = ensureDocumentsDb(auth.db)
    const documents = docs.documents.filter(document => canViewDocument(auth, document) && documentMatchesQuery(document, req.query)).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).map(publicDocument)
    sendJson(res, 200, { documents })
  } catch (error) {
    next(error)
  }
})

router.post('/documents', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:create')) return
    const body = req.body || {}
    const tipId = String(body.tip_id || body.tipId || '').trim().toUpperCase()
    const title = String(body.titlu || '').trim()
    const priority = String(body.prioritate || 'normal').trim()
    if (!tipId) throwHttp(400, 'Tipul documentului este obligatoriu.')
    if (!priorities.has(priority)) throwHttp(400, 'Prioritate invalida.')
    const nrDocument = engine.generateDocumentNumber(tipId, auth.db)
    const uuid = crypto.randomUUID()
    const dateJson = JSON.stringify(body.date_json || body.date || {})
    if (isMssqlMode()) {
      const document = mssqlJson(`
DECLARE @created table (id int);
INSERT INTO documents.documents (uuid, tip_id, nr_document, titlu, date_json, status, versiune, creat_de, dept_initiatoare, prioritate, termen_limita, fisier_draft_path, updated_at)
OUTPUT inserted.id INTO @created
VALUES (JSON_VALUE(@p, '$.uuid'), JSON_VALUE(@p, '$.tipId'), JSON_VALUE(@p, '$.nrDocument'), JSON_VALUE(@p, '$.titlu'), JSON_VALUE(@p, '$.dateJson'),
  N'draft', 1, JSON_VALUE(@p, '$.creatDe'), NULLIF(JSON_VALUE(@p, '$.dept'), N''), JSON_VALUE(@p, '$.prioritate'), TRY_CONVERT(datetime2, NULLIF(JSON_VALUE(@p, '$.termen'), N'')), JSON_VALUE(@p, '$.draftPath'), sysdatetime());
SELECT id, uuid, tip_id, nr_document, titlu, date_json, status, versiune, creat_de, dept_initiatoare, prioritate, termen_limita, fisier_draft_path, fisier_final_path, created_at, updated_at
FROM documents.documents WHERE id = (SELECT TOP 1 id FROM @created)
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { uuid, tipId, nrDocument, titlu: title, dateJson, creatDe: auth.user.id, dept: body.dept_initiatoare || auth.user.departmentId || '', prioritate: priority, termen: body.termen_limita || '', draftPath: body.fisier_draft_path || '' })
      addAudit(auth.db, auth.user, 'document_creat', nrDocument)
      sendJson(res, 201, { document })
      return
    }
    const docs = ensureDocumentsDb(auth.db)
    const document = {
      id: nextId(docs.documents),
      uuid,
      tip_id: tipId,
      nr_document: nrDocument,
      titlu: title,
      date_json: dateJson,
      status: 'draft',
      versiune: 1,
      creat_de: auth.user.id,
      dept_initiatoare: body.dept_initiatoare || auth.user.departmentId || null,
      prioritate: priority,
      termen_limita: body.termen_limita || null,
      fisier_draft_path: body.fisier_draft_path || null,
      fisier_final_path: null,
      created_at: nowIso(),
      updated_at: nowIso()
    }
    docs.documents.push(document)
    docs.circuitAudit.push({ id: nextId(docs.circuitAudit), document_id: document.id, user_id: auth.user.id, actiune: 'creat', status_vechi: null, status_nou: 'draft', comentariu: '', ip_address: '', created_at: nowIso() })
    addAudit(auth.db, auth.user, 'document_creat', nrDocument)
    writeDb(auth.db)
    sendJson(res, 201, { document: publicDocument(document) })
  } catch (error) {
    next(error)
  }
})

router.get('/documents/:uuid', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:view_own')) return
    if (isMssqlMode()) {
      const details = mssqlDocumentDetails(req.params.uuid)
      if (!details?.document) throwHttp(404, 'Document inexistent.')
      sendJson(res, 200, details)
      return
    }
    const docs = ensureDocumentsDb(auth.db)
    const document = documentByUuid(auth.db, req.params.uuid)
    if (!document) throwHttp(404, 'Document inexistent.')
    if (!canViewDocument(auth, document)) throwHttp(403, 'Nu ai acces la document.')
    sendJson(res, 200, {
      document: publicDocument(document),
      steps: docs.circuitSteps.filter(step => step.document_id === document.id).sort((a, b) => Number(a.nr_pas) - Number(b.nr_pas)),
      audit: docs.circuitAudit.filter(item => item.document_id === document.id),
      shares: docs.documentShares.filter(item => item.document_id === document.id)
    })
  } catch (error) {
    next(error)
  }
})

router.patch('/documents/:uuid', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:create')) return
    const body = req.body || {}
    if (isMssqlMode()) {
      const document = mssqlDocument(req.params.uuid)
      if (!document) throwHttp(404, 'Document inexistent.')
      if (document.status !== 'draft') throwHttp(400, 'Se poate edita doar in draft.')
      if (document.creat_de !== auth.user.id) throwHttp(403, 'Doar initiatorul poate edita documentul.')
      const updated = mssqlJson(`
UPDATE documents.documents SET titlu = JSON_VALUE(@p, '$.titlu'), date_json = JSON_VALUE(@p, '$.dateJson'), prioritate = JSON_VALUE(@p, '$.prioritate'), updated_at = sysdatetime()
WHERE uuid = JSON_VALUE(@p, '$.uuid');
SELECT id, uuid, tip_id, nr_document, titlu, date_json, status, versiune, creat_de, dept_initiatoare, prioritate, termen_limita, fisier_draft_path, fisier_final_path, created_at, updated_at
FROM documents.documents WHERE uuid = JSON_VALUE(@p, '$.uuid')
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { uuid: req.params.uuid, titlu: body.titlu || document.titlu || '', dateJson: JSON.stringify(body.date_json || parseJson(document.date_json)), prioritate: body.prioritate || document.prioritate })
      sendJson(res, 200, { document: updated })
      return
    }
    const document = documentByUuid(auth.db, req.params.uuid)
    if (!document) throwHttp(404, 'Document inexistent.')
    if (document.status !== 'draft') throwHttp(400, 'Se poate edita doar in draft.')
    if (document.creat_de !== auth.user.id) throwHttp(403, 'Doar initiatorul poate edita documentul.')
    if (body.titlu !== undefined) document.titlu = String(body.titlu || '')
    if (body.date_json !== undefined) document.date_json = JSON.stringify(body.date_json || {})
    if (body.prioritate !== undefined) {
      if (!priorities.has(body.prioritate)) throwHttp(400, 'Prioritate invalida.')
      document.prioritate = body.prioritate
    }
    document.updated_at = nowIso()
    writeDb(auth.db)
    sendJson(res, 200, { document: publicDocument(document) })
  } catch (error) {
    next(error)
  }
})

router.post('/documents/:uuid/launch', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:create')) return
    const document = isMssqlMode() ? mssqlDocument(req.params.uuid) : documentByUuid(auth.db, req.params.uuid)
    if (!document) throwHttp(404, 'Document inexistent.')
    engine.launchDocument(document.id, auth.user.id, auth.db)
    addAudit(auth.db, auth.user, 'document_lansat', document.nr_document)
    if (!isMssqlMode()) writeDb(auth.db)
    sendJson(res, 200, { ok: true })
  } catch (error) {
    next(error)
  }
})

router.post('/documents/:uuid/approve', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:approve')) return
    const document = isMssqlMode() ? mssqlDocument(req.params.uuid) : documentByUuid(auth.db, req.params.uuid)
    if (!document) throwHttp(404, 'Document inexistent.')
    engine.processStep(document.id, auth.user.id, 'aprobare', (req.body || {}).comment || (req.body || {}).comentariu || '', auth.db)
    addAudit(auth.db, auth.user, 'document_aprobat', document.nr_document)
    if (!isMssqlMode()) writeDb(auth.db)
    sendJson(res, 200, { ok: true })
  } catch (error) {
    next(error)
  }
})

router.post('/documents/:uuid/reject', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:approve')) return
    const comment = String((req.body || {}).comment || (req.body || {}).comentariu || '').trim()
    const document = isMssqlMode() ? mssqlDocument(req.params.uuid) : documentByUuid(auth.db, req.params.uuid)
    if (!document) throwHttp(404, 'Document inexistent.')
    engine.processStep(document.id, auth.user.id, 'respingere', comment, auth.db)
    addAudit(auth.db, auth.user, 'document_respins', document.nr_document)
    if (!isMssqlMode()) writeDb(auth.db)
    sendJson(res, 200, { ok: true })
  } catch (error) {
    next(error)
  }
})

router.post('/documents/:uuid/withdraw', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    const document = isMssqlMode() ? mssqlDocument(req.params.uuid) : documentByUuid(auth.db, req.params.uuid)
    if (!document) throwHttp(404, 'Document inexistent.')
    engine.withdrawDocument(document.id, auth.user.id, auth.db)
    addAudit(auth.db, auth.user, 'document_retras', document.nr_document)
    if (!isMssqlMode()) writeDb(auth.db)
    sendJson(res, 200, { ok: true })
  } catch (error) {
    next(error)
  }
})

router.post('/documents/:uuid/share', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:share')) return
    const body = req.body || {}
    const nivel = body.nivel_acces || 'citire'
    if (!['citire', 'descarcare'].includes(nivel)) throwHttp(400, 'Nivel acces invalid.')
    const document = isMssqlMode() ? mssqlDocument(req.params.uuid) : documentByUuid(auth.db, req.params.uuid)
    if (!document) throwHttp(404, 'Document inexistent.')
    if (isMssqlMode()) {
      const share = mssqlJson(`
DECLARE @created table (id int);
INSERT INTO documents.document_shares (document_id, shared_with_dept, shared_with_user, nivel_acces, shared_by, expires_at)
OUTPUT inserted.id INTO @created
VALUES (TRY_CONVERT(int, JSON_VALUE(@p, '$.documentId')), NULLIF(JSON_VALUE(@p, '$.dept'), N''), NULLIF(JSON_VALUE(@p, '$.user'), N''), JSON_VALUE(@p, '$.nivel'), JSON_VALUE(@p, '$.sharedBy'), TRY_CONVERT(datetime2, NULLIF(JSON_VALUE(@p, '$.expires'), N'')));
SELECT id, document_id, shared_with_dept, shared_with_user, nivel_acces, shared_by, created_at, expires_at
FROM documents.document_shares WHERE id = (SELECT TOP 1 id FROM @created)
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { documentId: document.id, dept: body.shared_with_dept || '', user: body.shared_with_user || '', nivel, sharedBy: auth.user.id, expires: body.expires_at || '' })
      sendJson(res, 201, { share })
      return
    }
    const docs = ensureDocumentsDb(auth.db)
    const share = { id: nextId(docs.documentShares), document_id: document.id, shared_with_dept: body.shared_with_dept || null, shared_with_user: body.shared_with_user || null, nivel_acces: nivel, shared_by: auth.user.id, created_at: nowIso(), expires_at: body.expires_at || null }
    docs.documentShares.push(share)
    addAudit(auth.db, auth.user, 'document_partajat', document.nr_document)
    writeDb(auth.db)
    sendJson(res, 201, { share })
  } catch (error) {
    next(error)
  }
})

router.get('/documents/:uuid/pdf', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:view_own')) return
    const details = isMssqlMode() ? mssqlDocumentDetails(req.params.uuid) : null
    const document = isMssqlMode() ? details?.document : documentByUuid(auth.db, req.params.uuid)
    if (!document) throwHttp(404, 'Document inexistent.')
    const docs = ensureDocumentsDb(auth.db)
    const type = isMssqlMode() ? mssqlArray(`SELECT TOP 1 id, denumire, template_html FROM documents.document_types WHERE id = JSON_VALUE(@p, '$.id') FOR JSON PATH;`, { id: document.tip_id })[0] : typeById(auth.db, document.tip_id)
    const steps = isMssqlMode() ? details.steps || [] : docs.circuitSteps.filter(step => step.document_id === document.id).sort((a, b) => Number(a.nr_pas) - Number(b.nr_pas))
    const html = engine.generateDocumentHtml({ ...document, template_html: type?.template_html }, steps, auth.db.settings?.company || auth.db.settings || {})
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Disposition', 'inline')
    res.send(html)
  } catch (error) {
    next(error)
  }
})

router.get('/documents/:uuid/audit', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireDocumentPermission(auth, res, 'documents:view_own')) return
    if (isMssqlMode()) {
      const details = mssqlDocumentDetails(req.params.uuid)
      if (!details?.document) throwHttp(404, 'Document inexistent.')
      sendJson(res, 200, { audit: details.audit || [] })
      return
    }
    const docs = ensureDocumentsDb(auth.db)
    const document = documentByUuid(auth.db, req.params.uuid)
    if (!document) throwHttp(404, 'Document inexistent.')
    sendJson(res, 200, { audit: docs.circuitAudit.filter(item => item.document_id === document.id) })
  } catch (error) {
    next(error)
  }
})

module.exports = router
