const fs = require('fs')
const path = require('path')
const { runMssqlScalar, DB_MODE, MSSQL_RELATIONAL_MODE } = require('../../core/db')
const { notifyUser } = require('../messaging/routes')

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

function throwHttp(status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

function nowIso() {
  return new Date().toISOString()
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

function parseJson(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function documentTypeFor(db, tipId) {
  const docs = ensureDocumentsDb(db)
  return docs.documentTypes.find(item => item.id === tipId) || null
}

function jsonWorkflowSteps(db, templateId) {
  const workflow = db.workflow || {}
  const template = (db.workflowTemplates || workflow.templates || []).find(item => item.id === templateId || item.type === templateId)
  const rawSteps = template?.steps || workflow.steps || db.workflowSteps || []
  return rawSteps
    .filter(step => !templateId || !step.template_id || step.template_id === templateId || step.templateId === templateId)
    .sort((a, b) => Number(a.nr_pas || a.step_order || a.order || a.nrPas || 0) - Number(b.nr_pas || b.step_order || b.order || b.nrPas || 0))
}

function compactKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeRoleRef(value) {
  const key = compactKey(value)
  const aliases = {
    achizitii: 'procurement',
    aprovizionare: 'procurement',
    contabilitate: 'accounting',
    contabil: 'accounting',
    hr: 'hr',
    resurse_umane: 'hr',
    juridic: 'legal',
    legal: 'legal',
    manager: 'manager',
    administrare: 'admin',
    administrator: 'admin',
    superadmin: 'superadmin',
    documente: 'admin',
    secretariat: 'secretariat',
  }
  return aliases[key] || key || null
}

function userRoles(user) {
  return Array.from(new Set([...(Array.isArray(user?.roles) ? user.roles : []), user?.role].map(item => String(item || '').trim()).filter(Boolean)))
}

function activeUsers(db) {
  return (db.users || []).filter(user => user && user.active !== false)
}

function userById(db, id) {
  return activeUsers(db).find(user => String(user.id) === String(id)) || null
}

function findUserByRole(db, role) {
  const normalized = normalizeRoleRef(role)
  return activeUsers(db).find(user => userRoles(user).some(item => compactKey(item) === compactKey(normalized)))
    || activeUsers(db).find(user => userRoles(user).some(item => compactKey(item) === compactKey(role)))
    || null
}

function findUserByDepartment(db, departmentRef) {
  const target = compactKey(departmentRef)
  if (!target) return null
  const department = (db.departments || []).find(item => compactKey(item.id) === target || compactKey(item.name) === target || compactKey(item.denumire) === target)
  const departmentId = department?.id || departmentRef
  return activeUsers(db).find(user => compactKey(user.departmentId || user.department_id || user.department) === compactKey(departmentId))
    || activeUsers(db).find(user => compactKey(user.department || '') === target)
    || null
}

function resolveWorkflowActor(db, document, step) {
  const actorType = String(step.actor_type || step.actorType || 'role').trim()
  const actorRef = String(step.actor_ref || step.actorRef || '').trim()
  if (actorType === 'manager') {
    const creator = userById(db, document.creat_de)
    const manager = creator ? userById(db, creator.manager_id || creator.managerId) : null
    return { role: null, user: manager?.id || null }
  }
  if (actorType === 'user') {
    const user = userById(db, actorRef)
      || activeUsers(db).find(item => compactKey(item.name) === compactKey(actorRef) || compactKey(item.username) === compactKey(actorRef))
    return { role: null, user: user?.id || null }
  }
  if (actorType === 'department') {
    const user = findUserByDepartment(db, actorRef || document.dept_initiatoare)
    return { role: null, user: user?.id || null }
  }
  const role = normalizeRoleRef(actorRef || step.name)
  const user = findUserByRole(db, role)
  return { role, user: user?.id || null }
}

function workflowDocumentType(document, type) {
  return compactKey(type?.tip_document || type?.tipDocument || document.tip_document || document.tip_id || '')
}

function workflowFlowForDocument(db, document, type) {
  const configured = Array.isArray(db.settings?.workflow_document_flows) ? db.settings.workflow_document_flows : []
  const documentKeys = new Set([
    workflowDocumentType(document, type),
    compactKey(document.tip_id),
    compactKey(type?.id),
    compactKey(type?.denumire),
    compactKey(document.titlu),
  ].filter(Boolean))
  return configured.find(flow => flow && flow.active !== false && (
    documentKeys.has(compactKey(flow.document_type || flow.documentType))
    || documentKeys.has(compactKey(flow.id))
    || documentKeys.has(compactKey(flow.label))
  )) || null
}

function buildWorkflowSnapshot(db, document, type) {
  const flow = workflowFlowForDocument(db, document, type)
  if (!flow || !Array.isArray(flow.steps) || !flow.steps.length) return null
  const steps = flow.steps.map((step, index) => {
    const resolved = resolveWorkflowActor(db, document, step)
    return {
      nr_pas: index + 1,
      name: String(step.name || `Pas ${index + 1}`).trim(),
      actor_type: String(step.actor_type || 'role').trim(),
      actor_ref: String(step.actor_ref || '').trim(),
      condition: String(step.condition || 'mereu').trim(),
      condition_rule: step.condition_rule || step.conditionRule || null,
      required: step.required !== false,
      tip: 'aprobare',
      rol_responsabil: resolved.role,
      user_responsabil: resolved.user,
      termen_ore: Math.max(1, Number(step.deadline_days || step.deadlineDays || 1) * 24),
    }
  })
  return {
    source: 'settings.workflow_document_flows',
    flow_id: String(flow.id || '').trim(),
    document_type: String(flow.document_type || flow.documentType || '').trim(),
    label: String(flow.label || '').trim(),
    version: Math.max(1, Number(flow.version || 1)),
    escalation_days: Math.max(0, Number(flow.escalation_days || flow.escalationDays || 0)),
    captured_at: nowIso(),
    steps,
  }
}

function attachWorkflowSnapshot(document, snapshot) {
  if (!snapshot) return parseJson(document.date_json, {})
  const data = parseJson(document.date_json, {})
  data.workflow_snapshot = snapshot
  data.workflow_flow_id = snapshot.flow_id
  data.workflow_flow_version = snapshot.version
  document.date_json = JSON.stringify(data)
  return data
}

function stepsFromSnapshot(snapshot) {
  return (snapshot?.steps || []).map((step, index) => ({
    nr_pas: Number(step.nr_pas || index + 1),
    tip: step.tip || 'aprobare',
    rol_responsabil: step.rol_responsabil || null,
    user_responsabil: step.user_responsabil || null,
    termen_ore: Number(step.termen_ore || 48),
    workflow_name: step.name || '',
    workflow_condition: step.condition || '',
    workflow_actor_type: step.actor_type || '',
    workflow_actor_ref: step.actor_ref || '',
  }))
}

function defaultStepForDocument(db, document) {
  const user = (db.users || []).find(item => item.role === 'admin' || item.role === 'superadmin') || (db.users || []).find(item => item.id !== document.creat_de)
  return [{
    nr_pas: 1,
    tip: 'aprobare',
    rol_responsabil: user?.role || 'admin',
    user_responsabil: user?.id || document.creat_de,
    status: 'asteptare',
    termen_ore: 48
  }]
}

function activeStep(steps) {
  return steps
    .filter(step => step.status === 'asteptare')
    .sort((a, b) => Number(a.nr_pas || 0) - Number(b.nr_pas || 0))[0] || null
}

function addCircuitAudit(docs, documentId, userId, action, oldStatus, newStatus, comment = '') {
  docs.circuitAudit.push({
    id: nextId(docs.circuitAudit),
    document_id: documentId,
    user_id: userId,
    actiune: action,
    status_vechi: oldStatus || null,
    status_nou: newStatus || null,
    comentariu: comment || '',
    ip_address: '',
    created_at: nowIso()
  })
}

function sendSystemMessage(db, document, content) {
  const messaging = db.messaging
  if (!messaging) return
  const channel = (messaging.channels || []).find(item => item.entitate_tip === 'document' && item.entitate_id === String(document.uuid || document.id))
  if (!channel) return
  const messages = Array.isArray(messaging.messages) ? messaging.messages : []
  messages.push({
    id: nextId(messages),
    channel_id: channel.id,
    sender_id: 'system',
    tip: 'sistem',
    continut: content,
    fisier_path: null,
    fisier_nume: null,
    fisier_marime: null,
    reply_to_id: null,
    citit_de: [],
    editat_la: null,
    sters_la: null,
    created_at: nowIso()
  })
}

function saveFinalHtml(document, html) {
  const dir = path.join(__dirname, '../../../storage/documents')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${document.uuid || document.id}-final.html`)
  fs.writeFileSync(file, html, 'utf8')
  return file
}

function flattenValues(source, prefix = '', target = {}) {
  Object.entries(source || {}).forEach(([key, value]) => {
    const pathKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenValues(value, pathKey, target)
      return
    }
    target[pathKey] = value
  })
  return target
}

function generateDocumentNumber(tipId, db) {
  const year = new Date().getFullYear()
  if (isMssqlMode()) {
    const result = mssqlJson(`
DECLARE @tipId nvarchar(20) = JSON_VALUE(@p, '$.tipId');
DECLARE @current int;
SELECT @current = nr_curent FROM documents.document_types WHERE id = @tipId;
IF @current IS NULL THROW 51000, 'Tip document inexistent.', 1;
UPDATE documents.document_types SET nr_curent = nr_curent + 1 WHERE id = @tipId;
SELECT CONCAT(@tipId, N'-', YEAR(sysdatetime()), N'-', RIGHT(CONCAT(N'0000', CONVERT(nvarchar(20), @current + 1)), 4)) AS nr_document
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { tipId })
    return result.nr_document
  }
  const type = documentTypeFor(db, tipId)
  if (!type) throwHttp(404, 'Tip document inexistent.')
  const current = Number(type.nr_curent || 0) + 1
  type.nr_curent = current
  return `${tipId}-${year}-${String(current).padStart(4, '0')}`
}

function generateDocumentHtml(document, steps, company = {}) {
  const data = parseJson(document.date_json, {})
  const an = new Date(document.created_at || Date.now()).getFullYear()
  const currentDate = String(document.created_at || new Date().toISOString()).slice(0, 10)
  const companyName = company.name || company.nume || company.companyName || company.company_name || ''
  const companyAddress = company.address || company.adresa || company.location || ''
  const values = {
    ...data,
    ...flattenValues(data),
    nr_document: document.nr_document || '',
    data: currentDate,
    data_document: currentDate,
    data_emitere: data.data_emitere || currentDate,
    initiator: document.initiator || document.creat_de || '',
    departament: document.departament || document.dept_initiatoare || '',
    companie: companyName,
    firma: companyName,
    cui: company.cui || company.companyCui || company.company_cif || company.companyCif || '',
    adresa: companyAddress,
    telefon: company.phone || company.telefon || '',
    angajat_nume: data.angajat_nume || data.angajat || '',
    angajat_marca: data.angajat_marca || data.marca || '',
    angajat_functie: data.angajat_functie || data.functie || '',
    angajat_departament: data.angajat_departament || data.departament || '',
    data_angajare: data.data_angajare || '',
    salariu_net: data.salariu_net || '',
    nr_zile_co: data.nr_zile_co || '',
    valabil_pana: data.valabil_pana || '',
    semnatura_director: data.semnatura_director || company.semnatura_director || '',
    semnatura_hr: data.semnatura_hr || company.semnatura_hr || '',
    stampila: data.stampila || company.stampila || '',
    an
  }
  Object.assign(values, {
    'societate.nume': companyName,
    'societate.cui': values.cui,
    'societate.adresa': companyAddress,
    'societate.telefon': values.telefon,
    'document.numar': document.nr_document || '',
    'document.data': currentDate,
    'document.titlu': document.titlu || '',
    'document.tip': document.tip_id || '',
    'document.continut': data.continut || data.descriere || document.continut || '',
    'furnizor.denumire': data.furnizor_denumire || data.furnizor?.denumire || data.tert_denumire || '',
    'client.denumire': data.client_denumire || data.client?.denumire || data.tert_denumire || '',
    'factura.numar': data.factura_numar || data.nr_factura || '',
    'factura.data': data.factura_data || data.data_factura || '',
    'factura.total': data.factura_total || data.total || data.valoare_totala || '',
    'utilaj.cod': data.utilaj_cod || data.utilaj?.cod || data.asset_cod || '',
    'utilaj.denumire': data.utilaj_denumire || data.utilaj?.denumire || data.asset_name || '',
    'sofer.nume': data.sofer_nume || data.operator_name || data.operator || '',
    total: data.total || data.valoare_totala || data.suma || '',
    intocmit_de: data.intocmit_de || data.initiator || document.initiator || document.creat_de || '',
    continut: data.continut || data.descriere || document.continut || ''
  })
  const template = document.template_html || '<h1>{{nr_document}}</h1><h2>{{titlu}}</h2><div>{{continut}}</div>'
  const body = template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => escapeHtml(values[key] ?? document[key] ?? ''))
  const approvalRows = (steps || []).map(step => `
      <tr>
        <td>${escapeHtml(step.nr_pas || '')}</td>
        <td>${escapeHtml(step.user_responsabil || step.rol_responsabil || '')}</td>
        <td>${escapeHtml(step.status || '')}</td>
        <td>${escapeHtml(step.actionat_la || '')}</td>
        <td>${escapeHtml(step.comentariu || '')}</td>
      </tr>`).join('')
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(document.nr_document || document.titlu || 'Document')}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; margin: 32px; line-height: 1.45; }
    h1, h2, h3 { margin: 0 0 12px; }
    .aprobari { width: 100%; border-collapse: collapse; margin-top: 32px; font-size: 13px; }
    .aprobari th, .aprobari td { border: 1px solid #999; padding: 8px; text-align: left; vertical-align: top; }
    .aprobari th { background: #f2f2f2; }
  </style>
</head>
<body>
${body}
<table class="aprobari">
  <tr><th>Pas</th><th>Responsabil</th><th>Status</th><th>Data</th><th>Comentariu</th></tr>${approvalRows}
</table>
</body>
</html>`
}

function launchDocument(documentId, userId, db) {
  if (isMssqlMode()) {
    const documentInfo = mssqlJson(`
DECLARE @documentId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.documentId'));
DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId');
SELECT TOP 1 d.id, d.uuid, d.tip_id, d.nr_document, d.titlu, d.date_json, d.status, d.versiune, d.creat_de, d.dept_initiatoare,
  d.prioritate, d.termen_limita, d.fisier_draft_path, d.fisier_final_path, d.created_at, d.updated_at,
  dt.denumire, dt.tip_document, dt.workflow_template_id
FROM documents.documents d JOIN documents.document_types dt ON dt.id = d.tip_id
WHERE d.id = @documentId AND d.creat_de = @userId
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { documentId, userId })
    if (!documentInfo) throwHttp(404, 'Document inexistent.')
    if (documentInfo.status !== 'draft') throwHttp(400, 'Documentul nu este in draft.')
    const snapshot = buildWorkflowSnapshot(db, documentInfo, {
      id: documentInfo.tip_id,
      denumire: documentInfo.denumire,
      tip_document: documentInfo.tip_document,
      workflow_template_id: documentInfo.workflow_template_id,
    })
    const configuredSteps = stepsFromSnapshot(snapshot)
    if (snapshot && configuredSteps.length) {
      const data = parseJson(documentInfo.date_json, {})
      data.workflow_snapshot = snapshot
      data.workflow_flow_id = snapshot.flow_id
      data.workflow_flow_version = snapshot.version
      const result = mssqlJson(`
DECLARE @documentId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.documentId'));
DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId');
DECLARE @oldStatus nvarchar(30);
DECLARE @firstUser nvarchar(64);
SELECT @oldStatus = status FROM documents.documents WHERE id = @documentId AND creat_de = @userId;
IF @oldStatus IS NULL THROW 51000, 'Document inexistent.', 1;
IF @oldStatus <> N'draft' THROW 51000, 'Documentul nu este in draft.', 1;
UPDATE documents.documents SET status = N'in_circuit', date_json = CONVERT(nvarchar(max), JSON_QUERY(@p, '$.dateJson')), updated_at = sysdatetime() WHERE id = @documentId;
INSERT INTO documents.circuit_steps (document_id, nr_pas, tip, rol_responsabil, user_responsabil, status, termen_ore)
SELECT
  @documentId,
  TRY_CONVERT(tinyint, JSON_VALUE(value, '$.nr_pas')),
  N'aprobare',
  NULL,
  TRY_CONVERT(uniqueidentifier, NULLIF(JSON_VALUE(value, '$.user_responsabil'), N'')),
  N'asteptare',
  COALESCE(TRY_CONVERT(int, JSON_VALUE(value, '$.termen_ore')), 48)
FROM OPENJSON(@p, '$.steps');
INSERT INTO documents.circuit_audit (document_id, user_id, actiune, status_vechi, status_nou, comentariu)
VALUES (@documentId, @userId, N'submis', @oldStatus, N'in_circuit', CONCAT(N'Lansat in circuit configurabil: ', JSON_VALUE(@p, '$.flowLabel')));
SELECT TOP 1 @firstUser = user_responsabil FROM documents.circuit_steps WHERE document_id = @documentId ORDER BY nr_pas;
SELECT @firstUser AS firstUser FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { documentId, userId, dateJson: data, steps: configuredSteps, flowLabel: snapshot.label })
      if (result?.firstUser) notifyUser(result.firstUser, 'aprobare_ceruta', { documentId })
      return
    }
    const result = mssqlJson(`
DECLARE @documentId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.documentId'));
DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId');
DECLARE @oldStatus nvarchar(30);
DECLARE @templateId nvarchar(64);
DECLARE @firstUser nvarchar(64);
SELECT @oldStatus = d.status, @templateId = dt.workflow_template_id
FROM documents.documents d JOIN documents.document_types dt ON dt.id = d.tip_id
WHERE d.id = @documentId AND d.creat_de = @userId;
IF @oldStatus IS NULL THROW 51000, 'Document inexistent.', 1;
IF @oldStatus <> N'draft' THROW 51000, 'Documentul nu este in draft.', 1;
UPDATE documents.documents SET status = N'in_circuit', updated_at = sysdatetime() WHERE id = @documentId;
IF OBJECT_ID(N'workflow.steps', N'U') IS NOT NULL
BEGIN
  DECLARE @insertSteps nvarchar(max) = N'
INSERT INTO documents.circuit_steps (document_id, nr_pas, tip, rol_responsabil, user_responsabil, status, termen_ore)
SELECT @documentId, ROW_NUMBER() OVER (ORDER BY id), N''aprobare'', NULL, NULL, N''asteptare'', 48
FROM workflow.steps WHERE template_id = TRY_CONVERT(uniqueidentifier, @templateId);';
  EXEC sp_executesql @insertSteps, N'@documentId int, @templateId nvarchar(64)', @documentId = @documentId, @templateId = @templateId;
END
IF NOT EXISTS (SELECT 1 FROM documents.circuit_steps WHERE document_id = @documentId)
  INSERT INTO documents.circuit_steps (document_id, nr_pas, tip, rol_responsabil, user_responsabil, status, termen_ore)
  VALUES (@documentId, 1, N'aprobare', N'admin', @userId, N'asteptare', 48);
INSERT INTO documents.circuit_audit (document_id, user_id, actiune, status_vechi, status_nou, comentariu)
VALUES (@documentId, @userId, N'submis', @oldStatus, N'in_circuit', N'Lansat in circuit');
SELECT TOP 1 @firstUser = user_responsabil FROM documents.circuit_steps WHERE document_id = @documentId ORDER BY nr_pas;
SELECT @firstUser AS firstUser FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { documentId, userId })
    if (result?.firstUser) notifyUser(result.firstUser, 'aprobare_ceruta', { documentId })
    return
  }
  const docs = ensureDocumentsDb(db)
  const document = docs.documents.find(item => String(item.id) === String(documentId))
  if (!document) throwHttp(404, 'Document inexistent.')
  if (document.status !== 'draft') throwHttp(400, 'Documentul nu este in draft.')
  if (document.creat_de !== userId) throwHttp(403, 'Doar initiatorul poate lansa documentul.')
  const type = documentTypeFor(db, document.tip_id)
  const snapshot = buildWorkflowSnapshot(db, document, type)
  attachWorkflowSnapshot(document, snapshot)
  const configuredSteps = stepsFromSnapshot(snapshot)
  const steps = configuredSteps.length
    ? configuredSteps
    : (jsonWorkflowSteps(db, type?.workflow_template_id).length ? jsonWorkflowSteps(db, type?.workflow_template_id) : defaultStepForDocument(db, document))
  steps.forEach((step, index) => {
    docs.circuitSteps.push({
      id: nextId(docs.circuitSteps),
      document_id: document.id,
      nr_pas: Number(step.nr_pas || step.order || step.step_order || index + 1),
      tip: step.tip || step.step_type || 'aprobare',
      rol_responsabil: step.rol_responsabil || step.role_id || step.roleId || null,
      user_responsabil: step.user_responsabil || step.user_id || step.userId || null,
      status: 'asteptare',
      comentariu: '',
      actionat_de: null,
      actionat_la: null,
      termen_ore: Number(step.termen_ore || step.deadline_hours || 48),
      created_at: nowIso()
    })
  })
  const oldStatus = document.status
  document.status = 'in_circuit'
  document.updated_at = nowIso()
  addCircuitAudit(docs, document.id, userId, 'submis', oldStatus, 'in_circuit', snapshot ? `Lansat in circuit configurabil: ${snapshot.label}` : 'Lansat in circuit')
  const first = activeStep(docs.circuitSteps.filter(step => step.document_id === document.id))
  if (first?.user_responsabil) notifyUser(first.user_responsabil, 'aprobare_ceruta', { document })
}

function processStep(documentId, userId, action, comment, db) {
  if (!['aprobare', 'respingere', 'avizare'].includes(action)) throwHttp(400, 'Actiune invalida.')
  if (action === 'respingere' && !String(comment || '').trim()) throwHttp(400, 'Comentariul este obligatoriu la respingere.')
  if (isMssqlMode()) {
    const result = mssqlJson(`
DECLARE @documentId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.documentId'));
DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId');
DECLARE @action nvarchar(30) = JSON_VALUE(@p, '$.action');
DECLARE @comment nvarchar(max) = JSON_VALUE(@p, '$.comment');
DECLARE @stepId int;
DECLARE @oldStatus nvarchar(30);
DECLARE @newStatus nvarchar(30);
DECLARE @creator nvarchar(64);
SELECT @oldStatus = status, @creator = creat_de FROM documents.documents WHERE id = @documentId;
SELECT TOP 1 @stepId = id FROM documents.circuit_steps WHERE document_id = @documentId AND status = N'asteptare' ORDER BY nr_pas;
IF @stepId IS NULL THROW 51000, 'Nu exista pas activ.', 1;
IF NOT EXISTS (SELECT 1 FROM documents.circuit_steps WHERE id = @stepId AND (user_responsabil = @userId OR user_responsabil IS NULL)) THROW 51000, 'Nu esti responsabilul pasului curent.', 1;
IF @action = N'respingere'
BEGIN
  UPDATE documents.circuit_steps SET status = N'respins', comentariu = @comment, actionat_de = @userId, actionat_la = sysdatetime() WHERE id = @stepId;
  UPDATE documents.documents SET status = N'respins', updated_at = sysdatetime() WHERE id = @documentId;
  SET @newStatus = N'respins';
END
ELSE
BEGIN
  UPDATE documents.circuit_steps SET status = CASE WHEN @action = N'avizare' THEN N'avizat' ELSE N'aprobat' END, comentariu = @comment, actionat_de = @userId, actionat_la = sysdatetime() WHERE id = @stepId;
  IF EXISTS (SELECT 1 FROM documents.circuit_steps WHERE document_id = @documentId AND status = N'asteptare')
    SET @newStatus = N'in_circuit';
  ELSE
  BEGIN
    UPDATE documents.documents SET status = N'aprobat', fisier_final_path = CONCAT(N'storage/documents/', uuid, N'-final.html'), updated_at = sysdatetime() WHERE id = @documentId;
    SET @newStatus = N'aprobat';
  END
END
INSERT INTO documents.circuit_audit (document_id, user_id, actiune, status_vechi, status_nou, comentariu)
VALUES (@documentId, @userId, CASE WHEN @action = N'respingere' THEN N'respins' WHEN @action = N'avizare' THEN N'avizat' ELSE N'aprobat' END, @oldStatus, @newStatus, @comment);
SELECT @creator AS creator, @newStatus AS status_nou,
  (SELECT TOP 1 user_responsabil FROM documents.circuit_steps WHERE document_id = @documentId AND status = N'asteptare' ORDER BY nr_pas) AS nextUser
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { documentId, userId, action, comment: comment || '' })
    if (result?.status_nou === 'respins' && result.creator) notifyUser(result.creator, 'respins', { documentId, comment })
    if (result?.nextUser) notifyUser(result.nextUser, 'aprobare_ceruta', { documentId })
    return
  }
  const docs = ensureDocumentsDb(db)
  const document = docs.documents.find(item => String(item.id) === String(documentId))
  if (!document) throwHttp(404, 'Document inexistent.')
  if (document.status !== 'in_circuit') throwHttp(400, 'Documentul nu este in circuit.')
  const steps = docs.circuitSteps.filter(step => step.document_id === document.id).sort((a, b) => Number(a.nr_pas) - Number(b.nr_pas))
  const step = activeStep(steps)
  if (!step) throwHttp(400, 'Nu exista pas activ.')
  if (step.user_responsabil && step.user_responsabil !== userId) throwHttp(403, 'Nu esti responsabilul pasului curent.')
  const oldStatus = document.status
  if (action === 'respingere') {
    step.status = 'respins'
    step.comentariu = comment || ''
    step.actionat_de = userId
    step.actionat_la = nowIso()
    document.status = 'respins'
    document.updated_at = nowIso()
    addCircuitAudit(docs, document.id, userId, 'respins', oldStatus, 'respins', comment)
    notifyUser(document.creat_de, 'respins', { document, comment })
    sendSystemMessage(db, document, `Document respins: ${comment}`)
    return
  }
  step.status = action === 'avizare' ? 'avizat' : 'aprobat'
  step.comentariu = comment || ''
  step.actionat_de = userId
  step.actionat_la = nowIso()
  const next = activeStep(steps)
  if (next) {
    addCircuitAudit(docs, document.id, userId, action === 'avizare' ? 'avizat' : 'aprobat', oldStatus, 'in_circuit', comment)
    if (next.user_responsabil) notifyUser(next.user_responsabil, 'aprobare_ceruta', { document })
    sendSystemMessage(db, document, `Pas ${step.nr_pas} finalizat`)
    return
  }
  document.status = 'aprobat'
  document.updated_at = nowIso()
  const type = documentTypeFor(db, document.tip_id)
  const company = db.settings?.company || db.settings || {}
  const html = generateDocumentHtml({ ...document, template_html: type?.template_html }, steps, company)
  document.fisier_final_path = saveFinalHtml(document, html)
  addCircuitAudit(docs, document.id, userId, 'aprobat', oldStatus, 'aprobat', comment)
  sendSystemMessage(db, document, 'Document aprobat final')
}

function withdrawDocument(documentId, userId, db) {
  if (isMssqlMode()) {
    mssqlJson(`
DECLARE @documentId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.documentId'));
DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId');
DECLARE @oldStatus nvarchar(30);
SELECT @oldStatus = status FROM documents.documents WHERE id = @documentId AND creat_de = @userId;
IF @oldStatus IS NULL THROW 51000, 'Document inexistent.', 1;
IF @oldStatus <> N'in_circuit' THROW 51000, 'Documentul nu este in circuit.', 1;
UPDATE documents.documents SET status = N'anulat', updated_at = sysdatetime() WHERE id = @documentId;
INSERT INTO documents.circuit_audit (document_id, user_id, actiune, status_vechi, status_nou, comentariu)
VALUES (@documentId, @userId, N'retras', @oldStatus, N'anulat', N'Retras de initiator');
SELECT 1 AS ok FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { documentId, userId })
    return
  }
  const docs = ensureDocumentsDb(db)
  const document = docs.documents.find(item => String(item.id) === String(documentId))
  if (!document) throwHttp(404, 'Document inexistent.')
  if (document.creat_de !== userId) throwHttp(403, 'Doar initiatorul poate retrage documentul.')
  if (document.status !== 'in_circuit') throwHttp(400, 'Documentul nu este in circuit.')
  const oldStatus = document.status
  document.status = 'anulat'
  document.updated_at = nowIso()
  addCircuitAudit(docs, document.id, userId, 'retras', oldStatus, 'anulat', 'Retras de initiator')
}

module.exports = {
  generateDocumentNumber,
  generateDocumentHtml,
  launchDocument,
  processStep,
  withdrawDocument
}
