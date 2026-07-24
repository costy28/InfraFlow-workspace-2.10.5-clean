const { Router } = require('express')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const { requireAuth } = require('../../core/auth')
const { writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')

const router = Router()
const TASK_EVIDENCE_ROOT = path.join(__dirname, '../../../storage/task-evidence')
const taskUpload = multer({ dest: path.join(__dirname, '../../../storage/temp/'), limits: { fileSize: 10 * 1024 * 1024 } })
;[TASK_EVIDENCE_ROOT, path.join(__dirname, '../../../storage/temp/')].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
})

const OPEN_STATUSES = new Set(['open', 'in_progress', 'blocked'])
const FINAL_STATUSES = new Set(['done', 'cancelled'])
const VALID_STATUSES = new Set([...OPEN_STATUSES, ...FINAL_STATUSES])
const VALID_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent'])
const TASK_SOURCE_TYPES = [
  { value: 'contract', label: 'Contract', route: '/contracte' },
  { value: 'document', label: 'Document', route: '/documente' },
  { value: 'referat', label: 'Referat', route: '/referate' },
  { value: 'hr_employee', label: 'Angajat HR', route: '/hr' },
  { value: 'ticket', label: 'Sesizare', route: '/sesizari' },
  { value: 'inventory', label: 'Gestiune', route: '/gestiune' },
  { value: 'procurement', label: 'Achiziții', route: '/achizitii' },
  { value: 'accounting', label: 'Contabilitate', route: '/contabilitate' },
  { value: 'fleet', label: 'Mecanizare', route: '/mecanizare' },
  { value: 'email', label: 'Email ERP', route: '/mesaje' },
  { value: 'template', label: 'Șablon task', route: '/taskuri' },
]

const SYSTEM_TASK_TEMPLATES = [
  {
    id: 'tpl-verify-document',
    name: 'Verifică document',
    title: 'Verifică documentul primit',
    description: 'Verifică dacă documentul este complet, are atașamentele necesare și notează ce lipsește.',
    priority: 'normal',
    due_days: 1,
    source_type: 'template',
    category: 'Documente',
    system: true,
  },
  {
    id: 'tpl-upload-proof',
    name: 'Încarcă dovadă',
    title: 'Încarcă dovada pentru activitatea primită',
    description: 'Încarcă poză/PDF/document ca dovadă și adaugă un comentariu scurt cu ce s-a făcut.',
    priority: 'normal',
    due_days: 0,
    source_type: 'template',
    category: 'Operațional',
    system: true,
  },
  {
    id: 'tpl-daily-report',
    name: 'Raport zilnic',
    title: 'Completează raportul zilnic',
    description: 'Completează situația zilei: activități realizate, probleme întâlnite și ce rămâne de făcut.',
    priority: 'normal',
    due_days: 0,
    source_type: 'template',
    category: 'Raportare',
    system: true,
  },
  {
    id: 'tpl-contract-followup',
    name: 'Urmărire contract',
    title: 'Verifică stadiul contractului',
    description: 'Verifică valoarea consumată, termenul, documentele lipsă și marchează riscurile sau acțiunile necesare.',
    priority: 'high',
    due_days: 2,
    source_type: 'contract',
    category: 'Contracte',
    system: true,
  },
  {
    id: 'tpl-inventory-check',
    name: 'Verificare gestiune',
    title: 'Verifică stocul / gestiunea',
    description: 'Verifică stocul fizic față de evidența din aplicație și atașează dovada sau observațiile.',
    priority: 'normal',
    due_days: 3,
    source_type: 'inventory',
    category: 'Gestiune',
    system: true,
  },
]

function nowIso() {
  return new Date().toISOString()
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
}

function ensureTasksDb(db) {
  if (!db.taskManagement || typeof db.taskManagement !== 'object') db.taskManagement = {}
  db.taskManagement.tasks = Array.isArray(db.taskManagement.tasks) ? db.taskManagement.tasks : []
  db.taskManagement.comments = Array.isArray(db.taskManagement.comments) ? db.taskManagement.comments : []
  db.taskManagement.attachments = Array.isArray(db.taskManagement.attachments) ? db.taskManagement.attachments : []
  db.taskManagement.templates = Array.isArray(db.taskManagement.templates) ? db.taskManagement.templates : []
  return db.taskManagement
}

function compactText(value, max = 300) {
  return String(value || '').trim().slice(0, max)
}

function userId(user) {
  return String(user?.id || user?.userId || user?.username || '')
}

function userLabel(user) {
  return user?.name || user?.fullName || user?.username || userId(user)
}

function sourceTypeInfo(type) {
  return TASK_SOURCE_TYPES.find(item => item.value === String(type || '')) || null
}

function safeRelativeUrl(value) {
  const text = compactText(value, 300)
  if (!text || !text.startsWith('/') || text.startsWith('//')) return ''
  return text
}

function sourceUrl(sourceType, sourceId, explicitUrl = '') {
  const safe = safeRelativeUrl(explicitUrl)
  if (safe) return safe
  const info = sourceTypeInfo(sourceType)
  if (!info) return ''
  const idText = compactText(sourceId, 120)
  if (!idText) return info.route
  const param = encodeURIComponent(idText)
  if (sourceType === 'contract') return `${info.route}?contract=${param}`
  if (sourceType === 'document') return `${info.route}?document=${param}`
  if (sourceType === 'referat') return `${info.route}?referat=${param}`
  if (sourceType === 'hr_employee') return `${info.route}?employee=${param}`
  if (sourceType === 'ticket') return `${info.route}?ticket=${param}`
  return `${info.route}?source=${param}`
}

function sourceLabel(sourceType, sourceId, explicitLabel = '') {
  const label = compactText(explicitLabel, 180)
  if (label) return label
  const info = sourceTypeInfo(sourceType)
  if (!info) return ''
  const idText = compactText(sourceId, 80)
  return idText ? `${info.label} #${idText}` : info.label
}

function userMap(db) {
  const users = Array.isArray(db.users) ? db.users : []
  return new Map(users.map(user => [userId(user), user]))
}

function departmentId(user) {
  return String(user?.departmentId || user?.department_id || user?.department || user?.departament || '').trim()
}

function managerId(user) {
  return String(user?.manager_id || user?.managerId || user?.reports_to || user?.reportsTo || '').trim()
}

function isActiveUser(user) {
  return user && user.active !== false && user.active !== 0
}

function canManageAllTasks(user, permissions = []) {
  const roles = new Set([user?.role, ...(Array.isArray(user?.roles) ? user.roles : [])].filter(Boolean).map(String))
  return ['superadmin', 'admin', 'manager'].some(role => roles.has(role)) ||
    permissions.includes('tasks:manage') ||
    permissions.includes('users:manage')
}

function canManageDepartmentTasks(user, permissions = []) {
  const roles = new Set([user?.role, ...(Array.isArray(user?.roles) ? user.roles : [])].filter(Boolean).map(String))
  return canManageAllTasks(user, permissions) ||
    ['sef_departament', 'sef-departament'].some(role => roles.has(role)) ||
    permissions.includes('department:manage') ||
    permissions.includes('tasks:delegate_department')
}

function sameDepartment(a, b) {
  const left = departmentId(a)
  const right = departmentId(b)
  return Boolean(left && right && left === right)
}

function isDirectReportOf(manager, candidate) {
  return Boolean(manager && candidate && managerId(candidate) && managerId(candidate) === userId(manager))
}

function hasDirectReports(db, user) {
  return (Array.isArray(db.users) ? db.users : []).some(item => isActiveUser(item) && isDirectReportOf(user, item))
}

function assignableUsers(db, user, permissions = []) {
  const users = (Array.isArray(db.users) ? db.users : []).filter(isActiveUser)
  if (canManageAllTasks(user, permissions)) return users
  if (canManageDepartmentTasks(user, permissions)) {
    const ownDept = departmentId(user)
    return users.filter(item => userId(item) === userId(user) || isDirectReportOf(user, item) || (ownDept && departmentId(item) === ownDept))
  }
  return users.filter(item => userId(item) === userId(user) || isDirectReportOf(user, item))
}

function canAssignTo(db, user, permissions, targetUserId) {
  const allowed = new Set(assignableUsers(db, user, permissions).map(item => userId(item)))
  return allowed.has(String(targetUserId))
}

function canSeeTask(db, task, user, permissions = []) {
  const uid = userId(user)
  if (canManageAllTasks(user, permissions)) return true
  if (canManageDepartmentTasks(user, permissions)) {
    const users = userMap(db)
    const creator = users.get(String(task.created_by))
    const assignee = users.get(String(task.assigned_to))
    return sameDepartment(user, creator) || sameDepartment(user, assignee) || isDirectReportOf(user, creator) || isDirectReportOf(user, assignee) || String(task.created_by) === uid || String(task.assigned_to) === uid
  }
  const users = userMap(db)
  const creator = users.get(String(task.created_by))
  const assignee = users.get(String(task.assigned_to))
  return isDirectReportOf(user, creator) || isDirectReportOf(user, assignee) || String(task.created_by) === uid || String(task.assigned_to) === uid
}

function enrichTask(task, users) {
  const creator = users.get(String(task.created_by))
  const assignee = users.get(String(task.assigned_to))
  return {
    ...task,
    created_by_name: task.created_by_name || userLabel(creator),
    assigned_to_name: task.assigned_to_name || userLabel(assignee),
    source_type_label: sourceTypeInfo(task.source_type)?.label || labelSourceFallback(task.source_type),
    source_label: sourceLabel(task.source_type, task.source_id, task.source_label),
    source_url: sourceUrl(task.source_type, task.source_id, task.source_url),
  }
}

function labelSourceFallback(value) {
  return compactText(value, 80).replace(/_/g, ' ')
}

function safeTaskFilename(name) {
  return String(name || 'fisier').replace(/[^\w.\-ăâîșțĂÂÎȘȚ ]+/g, '_').slice(0, 120)
}

function saveTaskAttachmentFile(file, taskId) {
  const ext = path.extname(file.originalname || '') || ''
  const storedName = `${taskId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`
  const finalPath = path.join(TASK_EVIDENCE_ROOT, storedName)
  fs.renameSync(file.path, finalPath)
  return { storedName, finalPath }
}

function dueDateFromTemplate(template, explicitDueDate = '') {
  const explicit = compactText(explicitDueDate, 20)
  if (explicit) return explicit
  const days = Number(template?.due_days ?? template?.dueDays ?? 0)
  if (!Number.isFinite(days)) return ''
  const date = new Date()
  date.setDate(date.getDate() + Math.max(0, Math.trunc(days)))
  return date.toISOString().slice(0, 10)
}

function taskTemplateCatalog(db) {
  const store = ensureTasksDb(db)
  const customTemplates = store.templates
    .filter(template => !template.cancelled_at)
    .map(template => ({ ...template, system: false }))
  const customIds = new Set(customTemplates.map(template => String(template.id)))
  return [
    ...customTemplates,
    ...SYSTEM_TASK_TEMPLATES.filter(template => !customIds.has(String(template.id))),
  ].sort((a, b) => String(a.category || '').localeCompare(String(b.category || ''), 'ro') || String(a.name || '').localeCompare(String(b.name || ''), 'ro'))
}

function taskTemplatePayload(body) {
  const name = compactText(body.name || body.nume, 120)
  const title = compactText(body.title || body.titlu || name, 180)
  if (!name || !title) {
    const err = new Error('Numele și titlul șablonului sunt obligatorii.')
    err.status = 400
    throw err
  }
  const dueDays = Number(body.due_days ?? body.dueDays ?? 0)
  return {
    name,
    title,
    description: compactText(body.description || body.descriere, 1500),
    priority: VALID_PRIORITIES.has(String(body.priority || body.prioritate)) ? String(body.priority || body.prioritate) : 'normal',
    due_days: Number.isFinite(dueDays) ? Math.max(0, Math.min(365, Math.trunc(dueDays))) : 0,
    source_type: compactText(body.source_type || body.entitate_tip || 'template', 80),
    category: compactText(body.category || body.categorie || 'Personalizat', 80),
  }
}

function attachmentUrl(attachment) {
  return `/api/tasks/${encodeURIComponent(String(attachment.task_id))}/attachments/${encodeURIComponent(String(attachment.id))}/download`
}

function visibleTasks(db, user, permissions, query = {}) {
  const store = ensureTasksDb(db)
  const users = userMap(db)
  const uid = userId(user)
  let rows = store.tasks.filter(task => canSeeTask(db, task, user, permissions))

  if (query.scope === 'assigned') rows = rows.filter(task => String(task.assigned_to) === uid)
  if (query.scope === 'created') rows = rows.filter(task => String(task.created_by) === uid)
  if (query.scope === 'team') {
    const teamIds = new Set(assignableUsers(db, user, permissions)
      .map(item => userId(item))
      .filter(id => id && id !== uid))
    rows = rows.filter(task => teamIds.has(String(task.assigned_to)) || teamIds.has(String(task.created_by)))
  }
  if (query.scope === 'open') rows = rows.filter(task => OPEN_STATUSES.has(String(task.status || 'open')))
  if (query.status) rows = rows.filter(task => String(task.status || 'open') === String(query.status))
  if (query.source_type) rows = rows.filter(task => String(task.source_type || '') === String(query.source_type))
  if (query.source_id) rows = rows.filter(task => String(task.source_id || '') === String(query.source_id))

  return rows
    .map(task => enrichTask(task, users))
    .sort((a, b) => {
      const aDue = a.due_date || '9999-12-31'
      const bDue = b.due_date || '9999-12-31'
      if (aDue !== bDue) return aDue.localeCompare(bDue)
      return String(b.created_at || '').localeCompare(String(a.created_at || ''))
    })
}

function taskPayload(body, fallbackAssignee, user, db) {
  const title = compactText(body.title || body.titlu, 180)
  if (!title) {
    const err = new Error('Titlul task-ului este obligatoriu.')
    err.status = 400
    throw err
  }
  const users = userMap(db)
  const assigned_to = compactText(body.assigned_to || body.assignee_id || fallbackAssignee, 80)
  if (!assigned_to || !users.has(String(assigned_to))) {
    const err = new Error('Alege un responsabil valid pentru task.')
    err.status = 400
    throw err
  }
  const priority = VALID_PRIORITIES.has(String(body.priority || body.prioritate)) ? String(body.priority || body.prioritate) : 'normal'
  const due = compactText(body.due_date || body.scadenta, 20)
  return {
    title,
    description: compactText(body.description || body.descriere, 1500),
    assigned_to,
    assigned_to_name: userLabel(users.get(String(assigned_to))),
    priority,
    status: 'open',
    due_date: due || '',
    source_type: compactText(body.source_type || body.entitate_tip, 80),
    source_id: compactText(body.source_id || body.entitate_id, 120),
    source_label: compactText(body.source_label || body.entitate_label, 180),
    source_url: safeRelativeUrl(body.source_url || body.entitate_url),
    created_by: userId(user),
    created_by_name: userLabel(user),
  }
}

function pushTaskNotification(db, task, actor, event = 'created') {
  if (!task?.assigned_to) return
  if (!Array.isArray(db.notifications)) db.notifications = []
  const actorName = userLabel(actor)
  const verb = event === 'reassigned' ? 'ți-a reasignat un task' : 'ți-a trimis un task'
  db.notifications.push({
    id: id('notification'),
    type: 'task',
    user_id: String(task.assigned_to),
    task_id: task.id,
    message: `${actorName} ${verb}: ${task.title}${task.due_date ? ` · termen ${task.due_date}` : ''}`,
    created_at: nowIso(),
    read: false,
  })
}

router.get('/tasks', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  const rows = visibleTasks(auth.db, auth.user, auth.permissions, req.query)
  res.json({ tasks: rows })
})

router.get('/tasks/my-open', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  const uid = userId(auth.user)
  const rows = visibleTasks(auth.db, auth.user, auth.permissions, { scope: 'open' })
    .filter(task => String(task.assigned_to) === uid || String(task.created_by) === uid)
    .filter(task => OPEN_STATUSES.has(String(task.status || 'open')))
  res.json({ tasks: rows })
})

router.get('/tasks/assignees', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  const rows = assignableUsers(auth.db, auth.user, auth.permissions)
    .map(user => ({
      id: userId(user),
      name: userLabel(user),
      username: user.username || '',
      role: user.role || '',
      department: user.department || user.department_name || user.departament || '',
      departmentId: departmentId(user),
      manager_id: managerId(user),
      direct_report: isDirectReportOf(auth.user, user),
      self: userId(user) === userId(auth.user),
    }))
    .sort((a, b) => Number(b.self) - Number(a.self) || String(a.name).localeCompare(String(b.name), 'ro'))
  res.json({
    users: rows,
    scope: canManageAllTasks(auth.user, auth.permissions)
      ? 'all'
      : (canManageDepartmentTasks(auth.user, auth.permissions) ? 'department' : (hasDirectReports(auth.db, auth.user) ? 'hierarchy' : 'self')),
  })
})

router.get('/tasks/source-types', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  res.json({ source_types: TASK_SOURCE_TYPES })
})

router.get('/tasks/templates', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  res.json({ templates: taskTemplateCatalog(auth.db), can_manage_templates: canManageDepartmentTasks(auth.user, auth.permissions) })
})

router.post('/tasks/templates', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canManageDepartmentTasks(auth.user, auth.permissions)) return res.status(403).json({ error: 'Nu poți administra șabloane de task.' })
  const store = ensureTasksDb(auth.db)
  try {
    const template = {
      id: id('task-template'),
      ...taskTemplatePayload(req.body || {}),
      created_by: userId(auth.user),
      created_by_name: userLabel(auth.user),
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    store.templates.push(template)
    addAudit(auth.db, auth.user, 'tasks:template_create', { templateId: template.id, name: template.name })
    writeDb(auth.db)
    res.status(201).json({ template: { ...template, system: false } })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Șablonul nu a putut fi creat.' })
  }
})

router.get('/tasks/:id', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  const store = ensureTasksDb(auth.db)
  const task = store.tasks.find(item => String(item.id) === String(req.params.id))
  if (!task || !canSeeTask(auth.db, task, auth.user, auth.permissions)) return res.status(404).json({ error: 'Task-ul nu a fost găsit.' })
  const users = userMap(auth.db)
  const comments = store.comments
    .filter(comment => String(comment.task_id) === String(task.id))
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
  const attachments = store.attachments
    .filter(attachment => String(attachment.task_id) === String(task.id) && !attachment.cancelled_at)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .map(attachment => ({ ...attachment, url: attachmentUrl(attachment) }))
  res.json({ task: { ...enrichTask(task, users), attachment_count: attachments.length }, comments, attachments })
})

router.get('/tasks/:id/attachments/:attachmentId/download', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  const store = ensureTasksDb(auth.db)
  const task = store.tasks.find(item => String(item.id) === String(req.params.id))
  if (!task || !canSeeTask(auth.db, task, auth.user, auth.permissions)) return res.status(404).json({ error: 'Task-ul nu a fost găsit.' })
  const attachment = store.attachments.find(item => String(item.id) === String(req.params.attachmentId) && String(item.task_id) === String(task.id) && !item.cancelled_at)
  if (!attachment) return res.status(404).json({ error: 'Atașamentul nu a fost găsit.' })
  const filePath = path.join(TASK_EVIDENCE_ROOT, attachment.stored_name || '')
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fișierul nu mai există în storage.' })
  res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.file_name || 'dovada')}"`)
  fs.createReadStream(filePath).pipe(res)
})

router.post('/tasks', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  const store = ensureTasksDb(auth.db)
  try {
    const payload = taskPayload(req.body || {}, userId(auth.user), auth.user, auth.db)
    if (!canAssignTo(auth.db, auth.user, auth.permissions, payload.assigned_to)) {
      return res.status(403).json({ error: 'Nu poți delega task-uri către acest utilizator.' })
    }
    const task = {
      id: id('task'),
      ...payload,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    store.tasks.push(task)
    pushTaskNotification(auth.db, task, auth.user, 'created')
    addAudit(auth.db, auth.user, 'tasks:create', { taskId: task.id, assigned_to: task.assigned_to, title: task.title })
    writeDb(auth.db)
    res.status(201).json({ task: enrichTask(task, userMap(auth.db)) })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Task-ul nu a putut fi creat.' })
  }
})

router.post('/tasks/from-template', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  const body = req.body || {}
  const template = taskTemplateCatalog(auth.db).find(item => String(item.id) === String(body.template_id || body.templateId))
  if (!template) return res.status(404).json({ error: 'Șablonul de task nu a fost găsit.' })
  const users = userMap(auth.db)
  const assigned_to = compactText(body.assigned_to || body.assignee_id || userId(auth.user), 80)
  if (!assigned_to || !users.has(String(assigned_to))) return res.status(400).json({ error: 'Alege un responsabil valid pentru task.' })
  if (!canAssignTo(auth.db, auth.user, auth.permissions, assigned_to)) return res.status(403).json({ error: 'Nu poți delega task-uri către acest utilizator.' })
  const store = ensureTasksDb(auth.db)
  const task = {
    id: id('task'),
    title: compactText(body.title || template.title || template.name, 180),
    description: compactText(body.description || template.description, 1500),
    assigned_to,
    assigned_to_name: userLabel(users.get(String(assigned_to))),
    priority: VALID_PRIORITIES.has(String(body.priority || template.priority)) ? String(body.priority || template.priority) : 'normal',
    status: 'open',
    due_date: dueDateFromTemplate(template, body.due_date),
    source_type: compactText(body.source_type || template.source_type || 'template', 80),
    source_id: compactText(body.source_id || template.id, 120),
    source_label: compactText(body.source_label || template.source_label || template.name, 180),
    source_url: safeRelativeUrl(body.source_url || template.source_url),
    template_id: template.id,
    created_by: userId(auth.user),
    created_by_name: userLabel(auth.user),
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  store.tasks.push(task)
  pushTaskNotification(auth.db, task, auth.user, 'created')
  addAudit(auth.db, auth.user, 'tasks:create_from_template', { taskId: task.id, templateId: template.id, assigned_to: task.assigned_to })
  writeDb(auth.db)
  res.status(201).json({ task: enrichTask(task, users) })
})

router.patch('/tasks/templates/:id', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canManageDepartmentTasks(auth.user, auth.permissions)) return res.status(403).json({ error: 'Nu poți administra șabloane de task.' })
  const store = ensureTasksDb(auth.db)
  const template = store.templates.find(item => String(item.id) === String(req.params.id))
  if (!template || template.cancelled_at) return res.status(404).json({ error: 'Șablonul personalizat nu a fost găsit.' })
  const body = req.body || {}
  if (body.cancelled || body.active === false || body.status === 'cancelled') {
    template.cancelled_at = nowIso()
    template.cancelled_by = userId(auth.user)
    template.cancelled_reason = compactText(body.reason || body.cancelled_reason || 'Dezactivat din interfața Task-uri.', 500)
    template.updated_at = nowIso()
    addAudit(auth.db, auth.user, 'tasks:template_cancel', { templateId: template.id, name: template.name })
    writeDb(auth.db)
    return res.json({ ok: true, template })
  }
  try {
    Object.assign(template, taskTemplatePayload(body), { updated_at: nowIso(), updated_by: userId(auth.user) })
    addAudit(auth.db, auth.user, 'tasks:template_update', { templateId: template.id, name: template.name })
    writeDb(auth.db)
    res.json({ template: { ...template, system: false } })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Șablonul nu a putut fi actualizat.' })
  }
})

router.patch('/tasks/:id', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  const store = ensureTasksDb(auth.db)
  const task = store.tasks.find(item => String(item.id) === String(req.params.id))
  if (!task || !canSeeTask(auth.db, task, auth.user, auth.permissions)) return res.status(404).json({ error: 'Task-ul nu a fost găsit.' })
  const uid = userId(auth.user)
  const canEditAll = canManageAllTasks(auth.user, auth.permissions) || String(task.created_by) === uid
  const body = req.body || {}
  const previousAssignee = String(task.assigned_to || '')
  if (body.status != null) {
    const status = String(body.status)
    if (!VALID_STATUSES.has(status)) return res.status(400).json({ error: 'Status task invalid.' })
    task.status = status
    if (status === 'done') task.completed_at = nowIso()
    if (status === 'cancelled') {
      task.cancelled_at = nowIso()
      task.cancelled_by = uid
      task.cancelled_reason = compactText(body.reason || body.cancelled_reason || body.note, 500)
    }
  }
  if (canEditAll) {
    if (body.title != null) task.title = compactText(body.title, 180) || task.title
    if (body.description != null) task.description = compactText(body.description, 1500)
    if (body.due_date != null) task.due_date = compactText(body.due_date, 20)
    if (body.priority != null && VALID_PRIORITIES.has(String(body.priority))) task.priority = String(body.priority)
    if (body.source_type != null) task.source_type = compactText(body.source_type, 80)
    if (body.source_id != null) task.source_id = compactText(body.source_id, 120)
    if (body.source_label != null) task.source_label = compactText(body.source_label, 180)
    if (body.source_url != null) task.source_url = safeRelativeUrl(body.source_url)
    if (body.assigned_to != null) {
      const users = userMap(auth.db)
      const assigned_to = compactText(body.assigned_to, 80)
      if (!users.has(String(assigned_to))) return res.status(400).json({ error: 'Responsabil invalid.' })
      if (!canAssignTo(auth.db, auth.user, auth.permissions, assigned_to)) return res.status(403).json({ error: 'Nu poți reasigna task-ul către acest utilizator.' })
      task.assigned_to = assigned_to
      task.assigned_to_name = userLabel(users.get(String(assigned_to)))
    }
  }
  task.updated_at = nowIso()
  if (String(task.assigned_to || '') !== previousAssignee) {
    pushTaskNotification(auth.db, task, auth.user, 'reassigned')
  }
  addAudit(auth.db, auth.user, 'tasks:update', { taskId: task.id, status: task.status })
  writeDb(auth.db)
  res.json({ task: enrichTask(task, userMap(auth.db)) })
})

router.post('/tasks/:id/comments', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  const store = ensureTasksDb(auth.db)
  const task = store.tasks.find(item => String(item.id) === String(req.params.id))
  if (!task || !canSeeTask(auth.db, task, auth.user, auth.permissions)) return res.status(404).json({ error: 'Task-ul nu a fost găsit.' })
  const text = compactText(req.body?.text || req.body?.comment || req.body?.comentariu, 1500)
  if (!text) return res.status(400).json({ error: 'Comentariul este obligatoriu.' })
  const comment = {
    id: id('task-comment'),
    task_id: task.id,
    text,
    created_by: userId(auth.user),
    created_by_name: userLabel(auth.user),
    created_at: nowIso(),
  }
  store.comments.push(comment)
  task.updated_at = nowIso()
  addAudit(auth.db, auth.user, 'tasks:comment', { taskId: task.id, commentId: comment.id })
  writeDb(auth.db)
  res.status(201).json({ comment })
})

router.post('/tasks/:id/attachments', taskUpload.single('file'), (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
    return
  }
  const store = ensureTasksDb(auth.db)
  const task = store.tasks.find(item => String(item.id) === String(req.params.id))
  if (!task || !canSeeTask(auth.db, task, auth.user, auth.permissions)) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
    return res.status(404).json({ error: 'Task-ul nu a fost găsit.' })
  }
  if (!req.file) return res.status(400).json({ error: 'Fișierul este obligatoriu.' })
  const saved = saveTaskAttachmentFile(req.file, task.id)
  const attachment = {
    id: id('task-file'),
    task_id: task.id,
    file_name: safeTaskFilename(req.file.originalname),
    stored_name: saved.storedName,
    mime_type: req.file.mimetype,
    file_size: req.file.size,
    note: compactText(req.body?.note, 500),
    created_by: userId(auth.user),
    created_by_name: userLabel(auth.user),
    created_at: nowIso(),
    source: 'erp',
  }
  store.attachments.push(attachment)
  task.updated_at = nowIso()
  addAudit(auth.db, auth.user, 'tasks:attachment', { taskId: task.id, attachmentId: attachment.id, file: attachment.file_name })
  writeDb(auth.db)
  res.status(201).json({ attachment: { ...attachment, url: attachmentUrl(attachment) } })
})

module.exports = router
