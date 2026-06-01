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
const TICKETS_STORAGE = path.join(__dirname, '../../../storage/tickets')

function safeFileName(name) {
  return String(name || 'fisier').replace(/[^a-zA-Z0-9._-]/g, '_')
}

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const dir = req.params.uuid ? path.join(TICKETS_STORAGE, safeFileName(req.params.uuid)) : TICKETS_STORAGE
      fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename(req, file, cb) {
      cb(null, `${Date.now()}-${crypto.randomUUID()}-${safeFileName(file.originalname)}`)
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
})

const ticketTypes = new Set(['sesizare', 'idee', 'tehnic', 'admin'])
const ticketPriorities = new Set(['scazuta', 'normala', 'ridicata', 'urgenta', 'critica'])
const ticketStatuses = new Set(['deschis', 'in_lucru', 'in_asteptare', 'rezolvat', 'inchis', 'respins'])
const commentTypes = new Set(['comentariu', 'actiune', 'statuschange', 'rezolutie'])
const closedStatuses = new Set(['rezolvat', 'inchis', 'respins'])

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

function ensureTicketsDb(db) {
  db.tickets = db.tickets || {}
  db.tickets.tickets = Array.isArray(db.tickets.tickets) ? db.tickets.tickets : []
  db.tickets.comments = Array.isArray(db.tickets.comments) ? db.tickets.comments : []
  db.tickets.attachments = Array.isArray(db.tickets.attachments) ? db.tickets.attachments : []
  db.tickets.escalations = Array.isArray(db.tickets.escalations) ? db.tickets.escalations : []
  return db.tickets
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

function requireTicketPermission(auth, res, permission) {
  if (userHasPermission(auth.db, auth.user, permission)) return true
  if (requirePermission(auth, { writeHead() {}, end() {} }, permission)) return true
  sendJson(res, 403, { error: 'Nu ai permisiune pentru aceasta actiune.' })
  return false
}

function adminUsers(db) {
  return (db.users || []).filter(user => user.active !== false && userHasPermission(db, user, 'tickets:view_all'))
}

function canViewTicket(auth, ticket) {
  if (userHasPermission(auth.db, auth.user, 'tickets:view_all')) return true
  if (ticket.creat_de === auth.user.id && userHasPermission(auth.db, auth.user, 'tickets:view_own')) return true
  if (ticket.dept_sursa_id && ticket.dept_sursa_id === auth.user.departmentId && userHasPermission(auth.db, auth.user, 'tickets:view_dept')) return true
  if (ticket.dept_responsabil_id && ticket.dept_responsabil_id === auth.user.departmentId && userHasPermission(auth.db, auth.user, 'tickets:view_dept')) return true
  return ticket.asignat_la === auth.user.id
}

function publicTicket(ticket) {
  return {
    id: ticket.id,
    uuid: ticket.uuid,
    tip: ticket.tip,
    prioritate: ticket.prioritate,
    status: ticket.status,
    titlu: ticket.titlu,
    descriere: ticket.descriere || '',
    dept_sursa_id: ticket.dept_sursa_id || null,
    dept_responsabil_id: ticket.dept_responsabil_id || null,
    asignat_la: ticket.asignat_la || null,
    creat_de: ticket.creat_de,
    rezolvat_de: ticket.rezolvat_de || null,
    rezolvat_la: ticket.rezolvat_la || null,
    termen_limita: ticket.termen_limita || null,
    entitate_tip: ticket.entitate_tip || null,
    entitate_id: ticket.entitate_id || null,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at || null
  }
}

function ticketMatchesQuery(ticket, query) {
  if (query.tip && ticket.tip !== query.tip) return false
  if (query.status && ticket.status !== query.status) return false
  if (query.prioritate && ticket.prioritate !== query.prioritate) return false
  if (query.dept && ticket.dept_sursa_id !== query.dept && ticket.dept_responsabil_id !== query.dept) return false
  return true
}

function notifyAdmins(db, event, data) {
  adminUsers(db).forEach(user => notifyUser(user.id, event, data))
}

function mssqlJson(sql, params = {}) {
  const result = runMssqlScalar(`DECLARE @p nvarchar(max) = @json;\n${sql}`, { jsonInput: JSON.stringify(params) })
  if (!String(result || '').trim()) return null
  return JSON.parse(result)
}

function mssqlArray(sql, params = {}) {
  return mssqlJson(sql, params) || []
}

function mssqlTicket(uuid) {
  return mssqlArray(`
DECLARE @uuid char(36) = JSON_VALUE(@p, '$.uuid');
SELECT TOP 1 id, uuid, tip, prioritate, status, titlu, descriere, dept_sursa_id, dept_responsabil_id,
  asignat_la, creat_de, rezolvat_de, rezolvat_la, termen_limita, entitate_tip, entitate_id, created_at, updated_at
FROM tickets.tickets
WHERE uuid = @uuid
FOR JSON PATH;
`, { uuid })[0] || null
}

function mssqlTicketDetails(uuid) {
  return mssqlJson(`
DECLARE @uuid char(36) = JSON_VALUE(@p, '$.uuid');
DECLARE @ticketId int;
SELECT @ticketId = id FROM tickets.tickets WHERE uuid = @uuid;
SELECT
  JSON_QUERY((SELECT TOP 1 id, uuid, tip, prioritate, status, titlu, descriere, dept_sursa_id, dept_responsabil_id,
    asignat_la, creat_de, rezolvat_de, rezolvat_la, termen_limita, entitate_tip, entitate_id, created_at, updated_at
    FROM tickets.tickets WHERE id = @ticketId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)) AS ticket,
  JSON_QUERY((SELECT id, ticket_id, user_id, tip, continut, vizibil_pentru_autor, created_at
    FROM tickets.comments WHERE ticket_id = @ticketId ORDER BY created_at ASC, id ASC FOR JSON PATH)) AS comments,
  JSON_QUERY((SELECT id, ticket_id, comment_id, fisier_path, fisier_nume, fisier_marime, incarcat_de, created_at
    FROM tickets.attachments WHERE ticket_id = @ticketId ORDER BY created_at ASC, id ASC FOR JSON PATH)) AS attachments,
  JSON_QUERY((SELECT id, ticket_id, de_la_user_id, catre_user_id, motiv, created_at
    FROM tickets.escalations WHERE ticket_id = @ticketId ORDER BY created_at ASC, id ASC FOR JSON PATH)) AS escalations
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { uuid })
}

function createAttachmentRecord(db, ticket, file, userId, commentId = null) {
  const relativePath = path.relative(path.join(__dirname, '../../..'), file.path).replace(/\\/g, '/')
  const payload = {
    ticketId: ticket.id,
    commentId: commentId || '',
    fisierPath: relativePath,
    fisierNume: file.originalname,
    fisierMarime: file.size,
    userId
  }
  if (isMssqlMode()) {
    return mssqlJson(`
DECLARE @created table (id int);
INSERT INTO tickets.attachments (ticket_id, comment_id, fisier_path, fisier_nume, fisier_marime, incarcat_de)
OUTPUT inserted.id INTO @created
VALUES (TRY_CONVERT(int, JSON_VALUE(@p, '$.ticketId')), TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.commentId'), N'')),
  JSON_VALUE(@p, '$.fisierPath'), JSON_VALUE(@p, '$.fisierNume'), TRY_CONVERT(int, JSON_VALUE(@p, '$.fisierMarime')),
  JSON_VALUE(@p, '$.userId'));
SELECT id, ticket_id, comment_id, fisier_path, fisier_nume, fisier_marime, incarcat_de, created_at
FROM tickets.attachments WHERE id = (SELECT TOP 1 id FROM @created)
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, payload)
  }
  const ticketsDb = ensureTicketsDb(db)
  const attachment = {
    id: nextId(ticketsDb.attachments),
    ticket_id: ticket.id,
    comment_id: commentId || null,
    fisier_path: relativePath,
    fisier_nume: file.originalname,
    fisier_marime: Number(file.size || 0),
    incarcat_de: userId,
    created_at: nowIso()
  }
  ticketsDb.attachments.push(attachment)
  return attachment
}

function ticketStats(tickets, db) {
  const open = tickets.filter(ticket => !closedStatuses.has(ticket.status))
  const pe_tip = { sesizare: 0, idee: 0, tehnic: 0, admin: 0 }
  const pe_prioritate = { critica: 0, urgenta: 0, ridicata: 0, normala: 0, scazuta: 0 }
  tickets.forEach(ticket => {
    if (pe_tip[ticket.tip] !== undefined) pe_tip[ticket.tip] += 1
    if (pe_prioritate[ticket.prioritate] !== undefined) pe_prioritate[ticket.prioritate] += 1
  })
  const byDept = new Map()
  open.forEach(ticket => {
    const deptId = ticket.dept_responsabil_id || ticket.dept_sursa_id || 'neasignat'
    byDept.set(deptId, (byDept.get(deptId) || 0) + 1)
  })
  const resolved = tickets.filter(ticket => ticket.rezolvat_la && ticket.created_at)
  const avg = resolved.length
    ? resolved.reduce((sum, ticket) => sum + ((new Date(ticket.rezolvat_la) - new Date(ticket.created_at)) / 36e5), 0) / resolved.length
    : 0
  return {
    total_deschise: open.length,
    pe_tip,
    pe_prioritate,
    pe_departament: Array.from(byDept.entries()).map(([deptId, count]) => {
      const dept = (db.departments || []).find(item => item.id === deptId)
      return { dept: dept?.name || dept?.nume || deptId, count }
    }),
    timp_mediu_rezolvare_ore: Number(avg.toFixed(2)),
    fara_responsabil: open.filter(ticket => !ticket.asignat_la).length
  }
}

router.get('/tickets/stats', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireTicketPermission(auth, res, 'tickets:admin')) return
    if (isMssqlMode()) {
      const stats = mssqlJson(`
SELECT
  (SELECT COUNT(1) FROM tickets.tickets WHERE status NOT IN (N'rezolvat', N'inchis', N'respins')) AS total_deschise,
  JSON_QUERY((SELECT
    SUM(CASE WHEN tip = N'sesizare' THEN 1 ELSE 0 END) AS sesizare,
    SUM(CASE WHEN tip = N'idee' THEN 1 ELSE 0 END) AS idee,
    SUM(CASE WHEN tip = N'tehnic' THEN 1 ELSE 0 END) AS tehnic,
    SUM(CASE WHEN tip = N'admin' THEN 1 ELSE 0 END) AS admin
    FROM tickets.tickets FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)) AS pe_tip,
  JSON_QUERY((SELECT
    SUM(CASE WHEN prioritate = N'critica' THEN 1 ELSE 0 END) AS critica,
    SUM(CASE WHEN prioritate = N'urgenta' THEN 1 ELSE 0 END) AS urgenta,
    SUM(CASE WHEN prioritate = N'ridicata' THEN 1 ELSE 0 END) AS ridicata,
    SUM(CASE WHEN prioritate = N'normala' THEN 1 ELSE 0 END) AS normala,
    SUM(CASE WHEN prioritate = N'scazuta' THEN 1 ELSE 0 END) AS scazuta
    FROM tickets.tickets FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)) AS pe_prioritate,
  JSON_QUERY((SELECT COALESCE(t.dept_responsabil_id, t.dept_sursa_id, N'neasignat') AS dept, COUNT(1) AS count
    FROM tickets.tickets t
    WHERE t.status NOT IN (N'rezolvat', N'inchis', N'respins')
    GROUP BY COALESCE(t.dept_responsabil_id, t.dept_sursa_id, N'neasignat')
    FOR JSON PATH)) AS pe_departament,
  COALESCE(AVG(CASE WHEN rezolvat_la IS NOT NULL THEN DATEDIFF(minute, created_at, rezolvat_la) / 60.0 END), 0) AS timp_mediu_rezolvare_ore,
  (SELECT COUNT(1) FROM tickets.tickets WHERE status NOT IN (N'rezolvat', N'inchis', N'respins') AND asignat_la IS NULL) AS fara_responsabil
FROM tickets.tickets
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`)
      sendJson(res, 200, stats || ticketStats([], auth.db))
      return
    }
    const ticketsDb = ensureTicketsDb(auth.db)
    sendJson(res, 200, ticketStats(ticketsDb.tickets, auth.db))
  } catch (error) {
    next(error)
  }
})

router.get('/tickets/my-open', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireTicketPermission(auth, res, 'tickets:view_own')) return
    if (isMssqlMode()) {
      const tickets = mssqlArray(`
DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId');
SELECT id, uuid, tip, prioritate, status, titlu, descriere, dept_sursa_id, dept_responsabil_id,
  asignat_la, creat_de, rezolvat_de, rezolvat_la, termen_limita, entitate_tip, entitate_id, created_at, updated_at
FROM tickets.tickets
WHERE creat_de = @userId AND status NOT IN (N'rezolvat', N'inchis', N'respins')
ORDER BY created_at DESC
FOR JSON PATH;
`, { userId: auth.user.id })
      sendJson(res, 200, { tickets })
      return
    }
    const ticketsDb = ensureTicketsDb(auth.db)
    sendJson(res, 200, { tickets: ticketsDb.tickets.filter(ticket => ticket.creat_de === auth.user.id && !closedStatuses.has(ticket.status)).map(publicTicket) })
  } catch (error) {
    next(error)
  }
})

router.get('/tickets', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireTicketPermission(auth, res, 'tickets:view_own')) return
    if (isMssqlMode()) {
      const canAll = userHasPermission(auth.db, auth.user, 'tickets:view_all')
      const canDept = userHasPermission(auth.db, auth.user, 'tickets:view_dept')
      const tickets = mssqlArray(`
DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId');
DECLARE @deptId nvarchar(64) = JSON_VALUE(@p, '$.deptId');
DECLARE @canAll bit = CASE WHEN JSON_VALUE(@p, '$.canAll') = N'true' THEN 1 ELSE 0 END;
DECLARE @canDept bit = CASE WHEN JSON_VALUE(@p, '$.canDept') = N'true' THEN 1 ELSE 0 END;
DECLARE @tip nvarchar(30) = NULLIF(JSON_VALUE(@p, '$.tip'), N'');
DECLARE @status nvarchar(40) = NULLIF(JSON_VALUE(@p, '$.status'), N'');
DECLARE @prioritate nvarchar(30) = NULLIF(JSON_VALUE(@p, '$.prioritate'), N'');
DECLARE @dept nvarchar(64) = NULLIF(JSON_VALUE(@p, '$.dept'), N'');
SELECT id, uuid, tip, prioritate, status, titlu, descriere, dept_sursa_id, dept_responsabil_id,
  asignat_la, creat_de, rezolvat_de, rezolvat_la, termen_limita, entitate_tip, entitate_id, created_at, updated_at
FROM tickets.tickets
WHERE (@canAll = 1 OR creat_de = @userId OR asignat_la = @userId OR (@canDept = 1 AND (dept_sursa_id = @deptId OR dept_responsabil_id = @deptId)))
  AND (@tip IS NULL OR tip = @tip)
  AND (@status IS NULL OR status = @status)
  AND (@prioritate IS NULL OR prioritate = @prioritate)
  AND (@dept IS NULL OR dept_sursa_id = @dept OR dept_responsabil_id = @dept)
ORDER BY created_at DESC
FOR JSON PATH;
`, { userId: auth.user.id, deptId: auth.user.departmentId || '', canAll, canDept, tip: req.query.tip || '', status: req.query.status || '', prioritate: req.query.prioritate || '', dept: req.query.dept || '' })
      sendJson(res, 200, { tickets })
      return
    }
    const ticketsDb = ensureTicketsDb(auth.db)
    const tickets = ticketsDb.tickets.filter(ticket => canViewTicket(auth, ticket) && ticketMatchesQuery(ticket, req.query)).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).map(publicTicket)
    sendJson(res, 200, { tickets })
  } catch (error) {
    next(error)
  }
})

router.post('/tickets', upload.array('attachments'), (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireTicketPermission(auth, res, 'tickets:create')) return
    const body = req.body || {}
    const tip = String(body.tip || 'sesizare').trim()
    const prioritate = String(body.prioritate || 'normala').trim()
    const titlu = String(body.titlu || '').trim()
    if (!ticketTypes.has(tip)) throwHttp(400, 'Tip ticket invalid.')
    if (!ticketPriorities.has(prioritate)) throwHttp(400, 'Prioritate invalida.')
    if (!titlu) throwHttp(400, 'Titlul este obligatoriu.')
    const uuid = crypto.randomUUID()
    if (isMssqlMode()) {
      const ticket = mssqlJson(`
DECLARE @created table (id int);
INSERT INTO tickets.tickets (uuid, tip, prioritate, status, titlu, descriere, dept_sursa_id, dept_responsabil_id,
  asignat_la, creat_de, termen_limita, entitate_tip, entitate_id, updated_at)
OUTPUT inserted.id INTO @created
VALUES (JSON_VALUE(@p, '$.uuid'), JSON_VALUE(@p, '$.tip'), JSON_VALUE(@p, '$.prioritate'), N'deschis',
  JSON_VALUE(@p, '$.titlu'), JSON_VALUE(@p, '$.descriere'), NULLIF(JSON_VALUE(@p, '$.deptSursaId'), N''),
  NULLIF(JSON_VALUE(@p, '$.deptResponsabilId'), N''), NULLIF(JSON_VALUE(@p, '$.asignatLa'), N''),
  JSON_VALUE(@p, '$.creatDe'), TRY_CONVERT(datetime2, NULLIF(JSON_VALUE(@p, '$.termenLimita'), N'')),
  NULLIF(JSON_VALUE(@p, '$.entitateTip'), N''), NULLIF(JSON_VALUE(@p, '$.entitateId'), N''), sysdatetime());
SELECT id, uuid, tip, prioritate, status, titlu, descriere, dept_sursa_id, dept_responsabil_id, asignat_la,
  creat_de, rezolvat_de, rezolvat_la, termen_limita, entitate_tip, entitate_id, created_at, updated_at
FROM tickets.tickets WHERE id = (SELECT TOP 1 id FROM @created)
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { uuid, tip, prioritate, titlu, descriere: body.descriere || '', deptSursaId: body.dept_sursa_id || auth.user.departmentId || '', deptResponsabilId: body.dept_responsabil_id || '', asignatLa: body.asignat_la || '', creatDe: auth.user.id, termenLimita: body.termen_limita || '', entitateTip: body.entitate_tip || '', entitateId: body.entitate_id || '' })
      addAudit(auth.db, auth.user, 'ticket_creat', titlu)
      const attachments = (req.files || []).map(file => createAttachmentRecord(auth.db, ticket, file, auth.user.id))
      if (attachments.length) addAudit(auth.db, auth.user, 'ticket_atasamente', `${titlu}: ${attachments.length} fisiere`)
      if (prioritate === 'critica' || prioritate === 'urgenta') notifyAdmins(auth.db, 'ticket_urgent', { ticket })
      sendJson(res, 201, { ticket, attachments })
      return
    }
    const ticketsDb = ensureTicketsDb(auth.db)
    const ticket = {
      id: nextId(ticketsDb.tickets),
      uuid,
      tip,
      prioritate,
      status: 'deschis',
      titlu,
      descriere: body.descriere || '',
      dept_sursa_id: body.dept_sursa_id || auth.user.departmentId || null,
      dept_responsabil_id: body.dept_responsabil_id || null,
      asignat_la: body.asignat_la || null,
      creat_de: auth.user.id,
      rezolvat_de: null,
      rezolvat_la: null,
      termen_limita: body.termen_limita || null,
      entitate_tip: body.entitate_tip || null,
      entitate_id: body.entitate_id || null,
      created_at: nowIso(),
      updated_at: nowIso()
    }
    ticketsDb.tickets.push(ticket)
    const attachments = (req.files || []).map(file => createAttachmentRecord(auth.db, ticket, file, auth.user.id))
    addAudit(auth.db, auth.user, 'ticket_creat', titlu)
    if (attachments.length) addAudit(auth.db, auth.user, 'ticket_atasamente', `${titlu}: ${attachments.length} fisiere`)
    writeDb(auth.db)
    if (prioritate === 'critica' || prioritate === 'urgenta') notifyAdmins(auth.db, 'ticket_urgent', { ticket: publicTicket(ticket) })
    sendJson(res, 201, { ticket: publicTicket(ticket), attachments })
  } catch (error) {
    next(error)
  }
})

router.get('/tickets/:uuid', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireTicketPermission(auth, res, 'tickets:view_own')) return
    if (isMssqlMode()) {
      const details = mssqlTicketDetails(req.params.uuid)
      if (!details?.ticket) throwHttp(404, 'Ticket inexistent.')
      if (!canViewTicket(auth, details.ticket)) throwHttp(403, 'Nu ai acces la acest ticket.')
      sendJson(res, 200, details)
      return
    }
    const ticketsDb = ensureTicketsDb(auth.db)
    const ticket = ticketsDb.tickets.find(item => item.uuid === req.params.uuid)
    if (!ticket) throwHttp(404, 'Ticket inexistent.')
    if (!canViewTicket(auth, ticket)) throwHttp(403, 'Nu ai acces la acest ticket.')
    sendJson(res, 200, {
      ticket: publicTicket(ticket),
      comments: ticketsDb.comments.filter(item => item.ticket_id === ticket.id),
      attachments: ticketsDb.attachments.filter(item => item.ticket_id === ticket.id),
      escalations: ticketsDb.escalations.filter(item => item.ticket_id === ticket.id)
    })
  } catch (error) {
    next(error)
  }
})

router.post('/tickets/:uuid/comments', upload.array('attachments'), (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireTicketPermission(auth, res, 'tickets:view_own')) return
    const continut = String((req.body || {}).continut || '').trim()
    const tip = String((req.body || {}).tip || 'comentariu').trim()
    if (!continut) throwHttp(400, 'Comentariul este obligatoriu.')
    if (!commentTypes.has(tip)) throwHttp(400, 'Tip comentariu invalid.')
    if (isMssqlMode()) {
      const ticket = mssqlTicket(req.params.uuid)
      if (!ticket) throwHttp(404, 'Ticket inexistent.')
      if (!canViewTicket(auth, ticket)) throwHttp(403, 'Nu ai acces la acest ticket.')
      const comment = mssqlJson(`
DECLARE @created table (id int);
INSERT INTO tickets.comments (ticket_id, user_id, tip, continut, vizibil_pentru_autor)
OUTPUT inserted.id INTO @created
VALUES (TRY_CONVERT(int, JSON_VALUE(@p, '$.ticketId')), JSON_VALUE(@p, '$.userId'), JSON_VALUE(@p, '$.tip'), JSON_VALUE(@p, '$.continut'), CASE WHEN JSON_VALUE(@p, '$.vizibil') = N'false' THEN 0 ELSE 1 END);
UPDATE tickets.tickets SET updated_at = sysdatetime() WHERE id = TRY_CONVERT(int, JSON_VALUE(@p, '$.ticketId'));
      SELECT id, ticket_id, user_id, tip, continut, vizibil_pentru_autor, created_at FROM tickets.comments WHERE id = (SELECT TOP 1 id FROM @created)
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { ticketId: ticket.id, userId: auth.user.id, tip, continut, vizibil: (req.body || {}).vizibil_pentru_autor !== false })
      const attachments = (req.files || []).map(file => createAttachmentRecord(auth.db, ticket, file, auth.user.id, comment.id))
      notifyUser(ticket.creat_de, 'ticket_actualizat', { ticket, comment })
      sendJson(res, 201, { comment, attachments })
      return
    }
    const ticketsDb = ensureTicketsDb(auth.db)
    const ticket = ticketsDb.tickets.find(item => item.uuid === req.params.uuid)
    if (!ticket) throwHttp(404, 'Ticket inexistent.')
    if (!canViewTicket(auth, ticket)) throwHttp(403, 'Nu ai acces la acest ticket.')
    const comment = { id: nextId(ticketsDb.comments), ticket_id: ticket.id, user_id: auth.user.id, tip, continut, vizibil_pentru_autor: (req.body || {}).vizibil_pentru_autor !== false, created_at: nowIso() }
    ticketsDb.comments.push(comment)
    const attachments = (req.files || []).map(file => createAttachmentRecord(auth.db, ticket, file, auth.user.id, comment.id))
    ticket.updated_at = nowIso()
    writeDb(auth.db)
    notifyUser(ticket.creat_de, 'ticket_actualizat', { ticket: publicTicket(ticket), comment })
    sendJson(res, 201, { comment, attachments })
  } catch (error) {
    next(error)
  }
})

router.patch('/tickets/:uuid/status', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireTicketPermission(auth, res, 'tickets:resolve')) return
    const body = req.body || {}
    const status = String(body.status || '').trim()
    const comentariu = String(body.comentariu || body.comment || '').trim()
    if (!ticketStatuses.has(status)) throwHttp(400, 'Status invalid.')
    if (!comentariu) throwHttp(400, 'Comentariul este obligatoriu la schimbarea statusului.')
    if (isMssqlMode()) {
      const ticket = mssqlTicket(req.params.uuid)
      if (!ticket) throwHttp(404, 'Ticket inexistent.')
      const updated = mssqlJson(`
DECLARE @ticketId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.ticketId'));
DECLARE @status nvarchar(40) = JSON_VALUE(@p, '$.status');
DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId');
UPDATE tickets.tickets
SET status = @status,
  rezolvat_de = CASE WHEN @status = N'rezolvat' THEN @userId ELSE rezolvat_de END,
  rezolvat_la = CASE WHEN @status = N'rezolvat' THEN sysdatetime() ELSE rezolvat_la END,
  updated_at = sysdatetime()
WHERE id = @ticketId;
INSERT INTO tickets.comments (ticket_id, user_id, tip, continut, vizibil_pentru_autor)
VALUES (@ticketId, @userId, N'statuschange', JSON_VALUE(@p, '$.comentariu'), 1);
SELECT id, uuid, tip, prioritate, status, titlu, descriere, dept_sursa_id, dept_responsabil_id, asignat_la,
  creat_de, rezolvat_de, rezolvat_la, termen_limita, entitate_tip, entitate_id, created_at, updated_at
FROM tickets.tickets WHERE id = @ticketId
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { ticketId: ticket.id, status, userId: auth.user.id, comentariu })
      addAudit(auth.db, auth.user, 'ticket_status_schimbat', `${ticket.titlu}: ${ticket.status} -> ${status}`)
      notifyUser(ticket.creat_de, 'ticket_actualizat', { ticket: updated, status, comentariu })
      sendJson(res, 200, { ticket: updated })
      return
    }
    const ticketsDb = ensureTicketsDb(auth.db)
    const ticket = ticketsDb.tickets.find(item => item.uuid === req.params.uuid)
    if (!ticket) throwHttp(404, 'Ticket inexistent.')
    const oldStatus = ticket.status
    ticket.status = status
    ticket.updated_at = nowIso()
    if (status === 'rezolvat') {
      ticket.rezolvat_de = auth.user.id
      ticket.rezolvat_la = nowIso()
    }
    ticketsDb.comments.push({ id: nextId(ticketsDb.comments), ticket_id: ticket.id, user_id: auth.user.id, tip: 'statuschange', continut: comentariu, vizibil_pentru_autor: true, created_at: nowIso() })
    addAudit(auth.db, auth.user, 'ticket_status_schimbat', `${ticket.titlu}: ${oldStatus} -> ${status}`)
    writeDb(auth.db)
    notifyUser(ticket.creat_de, 'ticket_actualizat', { ticket: publicTicket(ticket), status, comentariu })
    sendJson(res, 200, { ticket: publicTicket(ticket) })
  } catch (error) {
    next(error)
  }
})

router.patch('/tickets/:uuid/assign', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireTicketPermission(auth, res, 'tickets:assign')) return
    const asignatLa = String((req.body || {}).asignat_la || '').trim()
    if (!asignatLa) throwHttp(400, 'Utilizatorul asignat este obligatoriu.')
    if (isMssqlMode()) {
      const ticket = mssqlTicket(req.params.uuid)
      if (!ticket) throwHttp(404, 'Ticket inexistent.')
      const updated = mssqlJson(`
DECLARE @ticketId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.ticketId'));
UPDATE tickets.tickets SET asignat_la = JSON_VALUE(@p, '$.asignatLa'), updated_at = sysdatetime() WHERE id = @ticketId;
INSERT INTO tickets.comments (ticket_id, user_id, tip, continut, vizibil_pentru_autor)
VALUES (@ticketId, JSON_VALUE(@p, '$.userId'), N'actiune', CONCAT(N'Asignat catre ', JSON_VALUE(@p, '$.asignatLa')), 1);
SELECT id, uuid, tip, prioritate, status, titlu, descriere, dept_sursa_id, dept_responsabil_id, asignat_la,
  creat_de, rezolvat_de, rezolvat_la, termen_limita, entitate_tip, entitate_id, created_at, updated_at
FROM tickets.tickets WHERE id = @ticketId
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { ticketId: ticket.id, asignatLa, userId: auth.user.id })
      notifyUser(asignatLa, 'ticket_asignat', { ticket: updated })
      sendJson(res, 200, { ticket: updated })
      return
    }
    const ticketsDb = ensureTicketsDb(auth.db)
    const ticket = ticketsDb.tickets.find(item => item.uuid === req.params.uuid)
    if (!ticket) throwHttp(404, 'Ticket inexistent.')
    ticket.asignat_la = asignatLa
    ticket.updated_at = nowIso()
    ticketsDb.comments.push({ id: nextId(ticketsDb.comments), ticket_id: ticket.id, user_id: auth.user.id, tip: 'actiune', continut: `Asignat catre ${asignatLa}`, vizibil_pentru_autor: true, created_at: nowIso() })
    addAudit(auth.db, auth.user, 'ticket_asignat', `${ticket.titlu}: ${asignatLa}`)
    writeDb(auth.db)
    notifyUser(asignatLa, 'ticket_asignat', { ticket: publicTicket(ticket) })
    sendJson(res, 200, { ticket: publicTicket(ticket) })
  } catch (error) {
    next(error)
  }
})

router.post('/tickets/:uuid/escalate', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireTicketPermission(auth, res, 'tickets:assign')) return
    const body = req.body || {}
    const motiv = String(body.motiv || '').trim()
    if (!motiv) throwHttp(400, 'Motivul escaladarii este obligatoriu.')
    const catreUserId = String(body.catre_user_id || '').trim() || null
    if (isMssqlMode()) {
      const ticket = mssqlTicket(req.params.uuid)
      if (!ticket) throwHttp(404, 'Ticket inexistent.')
      const escalation = mssqlJson(`
DECLARE @created table (id int);
INSERT INTO tickets.escalations (ticket_id, de_la_user_id, catre_user_id, motiv)
OUTPUT inserted.id INTO @created
VALUES (TRY_CONVERT(int, JSON_VALUE(@p, '$.ticketId')), JSON_VALUE(@p, '$.fromUserId'), NULLIF(JSON_VALUE(@p, '$.toUserId'), N''), JSON_VALUE(@p, '$.motiv'));
UPDATE tickets.tickets SET updated_at = sysdatetime() WHERE id = TRY_CONVERT(int, JSON_VALUE(@p, '$.ticketId'));
SELECT id, ticket_id, de_la_user_id, catre_user_id, motiv, created_at FROM tickets.escalations WHERE id = (SELECT TOP 1 id FROM @created)
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { ticketId: ticket.id, fromUserId: auth.user.id, toUserId: catreUserId || '', motiv })
      if (catreUserId) notifyUser(catreUserId, 'ticket_escalat', { ticket, escalation })
      else notifyAdmins(auth.db, 'ticket_escalat', { ticket, escalation })
      sendJson(res, 201, { escalation })
      return
    }
    const ticketsDb = ensureTicketsDb(auth.db)
    const ticket = ticketsDb.tickets.find(item => item.uuid === req.params.uuid)
    if (!ticket) throwHttp(404, 'Ticket inexistent.')
    const escalation = { id: nextId(ticketsDb.escalations), ticket_id: ticket.id, de_la_user_id: auth.user.id, catre_user_id: catreUserId, motiv, created_at: nowIso() }
    ticketsDb.escalations.push(escalation)
    ticket.updated_at = nowIso()
    addAudit(auth.db, auth.user, 'ticket_escalat', `${ticket.titlu}: ${motiv}`)
    writeDb(auth.db)
    if (catreUserId) notifyUser(catreUserId, 'ticket_escalat', { ticket: publicTicket(ticket), escalation })
    else notifyAdmins(auth.db, 'ticket_escalat', { ticket: publicTicket(ticket), escalation })
    sendJson(res, 201, { escalation })
  } catch (error) {
    next(error)
  }
})

router.post('/tickets/:uuid/attach', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireTicketPermission(auth, res, 'tickets:view_own')) return
    const body = req.body || {}
    if (isMssqlMode()) {
      const ticket = mssqlTicket(req.params.uuid)
      if (!ticket) throwHttp(404, 'Ticket inexistent.')
      if (!canViewTicket(auth, ticket)) throwHttp(403, 'Nu ai acces la acest ticket.')
      const attachment = mssqlJson(`
DECLARE @created table (id int);
INSERT INTO tickets.attachments (ticket_id, comment_id, fisier_path, fisier_nume, fisier_marime, incarcat_de)
OUTPUT inserted.id INTO @created
VALUES (TRY_CONVERT(int, JSON_VALUE(@p, '$.ticketId')), TRY_CONVERT(int, NULLIF(JSON_VALUE(@p, '$.commentId'), N'')),
  JSON_VALUE(@p, '$.fisierPath'), JSON_VALUE(@p, '$.fisierNume'), TRY_CONVERT(int, JSON_VALUE(@p, '$.fisierMarime')),
  JSON_VALUE(@p, '$.userId'));
UPDATE tickets.tickets SET updated_at = sysdatetime() WHERE id = TRY_CONVERT(int, JSON_VALUE(@p, '$.ticketId'));
SELECT id, ticket_id, comment_id, fisier_path, fisier_nume, fisier_marime, incarcat_de, created_at
FROM tickets.attachments WHERE id = (SELECT TOP 1 id FROM @created)
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { ticketId: ticket.id, commentId: body.comment_id || '', fisierPath: body.fisier_path || '', fisierNume: body.fisier_nume || '', fisierMarime: body.fisier_marime || 0, userId: auth.user.id })
      sendJson(res, 201, { attachment })
      return
    }
    const ticketsDb = ensureTicketsDb(auth.db)
    const ticket = ticketsDb.tickets.find(item => item.uuid === req.params.uuid)
    if (!ticket) throwHttp(404, 'Ticket inexistent.')
    if (!canViewTicket(auth, ticket)) throwHttp(403, 'Nu ai acces la acest ticket.')
    const attachment = { id: nextId(ticketsDb.attachments), ticket_id: ticket.id, comment_id: body.comment_id || null, fisier_path: body.fisier_path || '', fisier_nume: body.fisier_nume || '', fisier_marime: Number(body.fisier_marime || 0), incarcat_de: auth.user.id, created_at: nowIso() }
    ticketsDb.attachments.push(attachment)
    ticket.updated_at = nowIso()
    addAudit(auth.db, auth.user, 'ticket_atasament', `${ticket.titlu}: ${attachment.fisier_nume}`)
    writeDb(auth.db)
    sendJson(res, 201, { attachment })
  } catch (error) {
    next(error)
  }
})

router.get('/tickets/:uuid/attachments/:filename', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireTicketPermission(auth, res, 'tickets:view_own')) return
    const filename = safeFileName(req.params.filename)
    let ticket
    let attachment
    if (isMssqlMode()) {
      ticket = mssqlTicket(req.params.uuid)
      if (!ticket) throwHttp(404, 'Ticket inexistent.')
      if (!canViewTicket(auth, ticket)) throwHttp(403, 'Nu ai acces la acest ticket.')
      attachment = mssqlArray(`
SELECT TOP 1 a.id, a.ticket_id, a.comment_id, a.fisier_path, a.fisier_nume, a.fisier_marime, a.incarcat_de, a.created_at
FROM tickets.attachments a
JOIN tickets.tickets t ON t.id = a.ticket_id
WHERE t.uuid = JSON_VALUE(@p, '$.uuid') AND a.fisier_nume = JSON_VALUE(@p, '$.filename')
FOR JSON PATH;
`, { uuid: req.params.uuid, filename: req.params.filename })[0]
    } else {
      const ticketsDb = ensureTicketsDb(auth.db)
      ticket = ticketsDb.tickets.find(item => item.uuid === req.params.uuid)
      if (!ticket) throwHttp(404, 'Ticket inexistent.')
      if (!canViewTicket(auth, ticket)) throwHttp(403, 'Nu ai acces la acest ticket.')
      attachment = ticketsDb.attachments.find(item => item.ticket_id === ticket.id && item.fisier_nume === req.params.filename)
    }
    if (!attachment) throwHttp(404, 'Fisier inexistent.')
    const filePath = path.resolve(path.join(__dirname, '../../..'), attachment.fisier_path || '')
    const storageRoot = path.resolve(TICKETS_STORAGE)
    if (!filePath.startsWith(storageRoot) || !fs.existsSync(filePath)) throwHttp(404, 'Fisier inexistent.')
    res.download(filePath, filename)
  } catch (error) {
    next(error)
  }
})

module.exports = router
