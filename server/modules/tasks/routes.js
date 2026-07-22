const { Router } = require('express')
const crypto = require('crypto')
const { requireAuth } = require('../../core/auth')
const { writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')

const router = Router()

const OPEN_STATUSES = new Set(['open', 'in_progress', 'blocked'])
const FINAL_STATUSES = new Set(['done', 'cancelled'])
const VALID_STATUSES = new Set([...OPEN_STATUSES, ...FINAL_STATUSES])
const VALID_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent'])

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
  }
}

function visibleTasks(db, user, permissions, query = {}) {
  const store = ensureTasksDb(db)
  const users = userMap(db)
  const uid = userId(user)
  let rows = store.tasks.filter(task => canSeeTask(db, task, user, permissions))

  if (query.scope === 'assigned') rows = rows.filter(task => String(task.assigned_to) === uid)
  if (query.scope === 'created') rows = rows.filter(task => String(task.created_by) === uid)
  if (query.scope === 'open') rows = rows.filter(task => OPEN_STATUSES.has(String(task.status || 'open')))
  if (query.status) rows = rows.filter(task => String(task.status || 'open') === String(query.status))

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
    created_by: userId(user),
    created_by_name: userLabel(user),
  }
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
  res.json({ task: enrichTask(task, users), comments })
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
    addAudit(auth.db, auth.user, 'tasks:create', { taskId: task.id, assigned_to: task.assigned_to, title: task.title })
    writeDb(auth.db)
    res.status(201).json({ task: enrichTask(task, userMap(auth.db)) })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Task-ul nu a putut fi creat.' })
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

module.exports = router
