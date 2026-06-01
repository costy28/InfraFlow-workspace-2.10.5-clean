const { notifyUser } = require('../messaging/routes')
const { runMssqlScalar, DB_MODE, MSSQL_RELATIONAL_MODE } = require('../../core/db')

const closedStatuses = new Set(['rezolvat', 'inchis', 'respins'])

function nowMs() {
  return Date.now()
}

function hoursSince(value) {
  if (!value) return 0
  return (nowMs() - new Date(value).getTime()) / 36e5
}

function ensureTicketsDb(db) {
  db.tickets = db.tickets || {}
  db.tickets.tickets = Array.isArray(db.tickets.tickets) ? db.tickets.tickets : []
  db.tickets.comments = Array.isArray(db.tickets.comments) ? db.tickets.comments : []
  db.tickets.escalations = Array.isArray(db.tickets.escalations) ? db.tickets.escalations : []
  return db.tickets
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

function notifyAdmins(db, event, data) {
  ;(db.users || [])
    .filter(user => user.active !== false && userHasPermission(db, user, 'tickets:admin'))
    .forEach(user => notifyUser(user.id, event, data))
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

function checkMssqlTicketAlerts(db) {
  const alerts = mssqlArray(`
DECLARE @now datetime2 = sysdatetime();
SELECT id, uuid, tip, prioritate, status, titlu, descriere, dept_sursa_id, dept_responsabil_id,
  asignat_la, creat_de, rezolvat_de, rezolvat_la, termen_limita, entitate_tip, entitate_id, created_at, updated_at,
  N'critic_neasignat' AS alert_type
FROM tickets.tickets t
WHERE t.status NOT IN (N'rezolvat', N'inchis', N'respins')
  AND t.prioritate = N'critica'
  AND t.asignat_la IS NULL
  AND DATEDIFF(hour, t.created_at, @now) >= 4
  AND NOT EXISTS (SELECT 1 FROM tickets.escalations e WHERE e.ticket_id = t.id AND CHARINDEX(N'[auto:critic_neasignat]', e.motiv) > 0)
UNION ALL
SELECT id, uuid, tip, prioritate, status, titlu, descriere, dept_sursa_id, dept_responsabil_id,
  asignat_la, creat_de, rezolvat_de, rezolvat_la, termen_limita, entitate_tip, entitate_id, created_at, updated_at,
  N'fara_update_48h' AS alert_type
FROM tickets.tickets t
WHERE t.status = N'in_lucru'
  AND t.asignat_la IS NOT NULL
  AND DATEDIFF(hour, COALESCE((SELECT MAX(c.created_at) FROM tickets.comments c WHERE c.ticket_id = t.id), t.updated_at, t.created_at), @now) >= 48
  AND NOT EXISTS (SELECT 1 FROM tickets.escalations e WHERE e.ticket_id = t.id AND CHARINDEX(N'[auto:fara_update_48h]', e.motiv) > 0)
UNION ALL
SELECT id, uuid, tip, prioritate, status, titlu, descriere, dept_sursa_id, dept_responsabil_id,
  asignat_la, creat_de, rezolvat_de, rezolvat_la, termen_limita, entitate_tip, entitate_id, created_at, updated_at,
  N'termen_depasit' AS alert_type
FROM tickets.tickets t
WHERE t.status NOT IN (N'rezolvat', N'inchis', N'respins')
  AND t.termen_limita IS NOT NULL
  AND t.termen_limita < @now
  AND NOT EXISTS (SELECT 1 FROM tickets.escalations e WHERE e.ticket_id = t.id AND CHARINDEX(N'[auto:termen_depasit]', e.motiv) > 0)
FOR JSON PATH;
`)
  const escalations = alerts.map(ticket => {
    const motiv = ticket.alert_type === 'critic_neasignat'
      ? '[auto:critic_neasignat] Ticket critic fara asignare dupa 4h'
      : ticket.alert_type === 'fara_update_48h'
        ? '[auto:fara_update_48h] Ticket in lucru fara update dupa 48h'
        : '[auto:termen_depasit] Termen limita depasit'
    const escalation = mssqlJson(`
DECLARE @created table (id int);
INSERT INTO tickets.escalations (ticket_id, de_la_user_id, catre_user_id, motiv)
OUTPUT inserted.id INTO @created
VALUES (TRY_CONVERT(int, JSON_VALUE(@p, '$.ticketId')), NULL, NULLIF(JSON_VALUE(@p, '$.toUserId'), N''), JSON_VALUE(@p, '$.motiv'));
SELECT id, ticket_id, de_la_user_id, catre_user_id, motiv, created_at FROM tickets.escalations WHERE id = (SELECT TOP 1 id FROM @created)
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { ticketId: ticket.id, toUserId: ticket.alert_type === 'fara_update_48h' || ticket.alert_type === 'termen_depasit' ? ticket.asignat_la || '' : '', motiv })
    if (ticket.alert_type === 'fara_update_48h' && ticket.asignat_la) notifyUser(ticket.asignat_la, 'ticket_alerta', { ticket, escalation })
    if (ticket.alert_type === 'termen_depasit' && ticket.asignat_la) notifyUser(ticket.asignat_la, 'ticket_escalat', { ticket, escalation })
    notifyAdmins(db, ticket.alert_type === 'critic_neasignat' ? 'ticket_alerta' : 'ticket_escalat', { ticket, escalation })
    return escalation
  })
  return { checked: alerts.length, escalations }
}

function lastCommentAt(ticketsDb, ticketId) {
  return ticketsDb.comments
    .filter(comment => comment.ticket_id === ticketId)
    .map(comment => comment.created_at)
    .sort()
    .pop()
}

function escalationExists(ticketsDb, ticketId, marker) {
  return ticketsDb.escalations.some(item => item.ticket_id === ticketId && String(item.motiv || '').includes(marker))
}

function checkTicketAlerts(db) {
  if (isMssqlMode()) return checkMssqlTicketAlerts(db)
  const ticketsDb = ensureTicketsDb(db)
  const created = []
  ticketsDb.tickets.forEach(ticket => {
    if (closedStatuses.has(ticket.status)) return
    if (ticket.prioritate === 'critica' && !ticket.asignat_la && hoursSince(ticket.created_at) >= 4 && !escalationExists(ticketsDb, ticket.id, '[auto:critic_neasignat]')) {
      const escalation = { id: ticketsDb.escalations.length + 1, ticket_id: ticket.id, de_la_user_id: null, catre_user_id: null, motiv: '[auto:critic_neasignat] Ticket critic fara asignare dupa 4h', created_at: new Date().toISOString() }
      ticketsDb.escalations.push(escalation)
      created.push(escalation)
      notifyAdmins(db, 'ticket_alerta', { ticket, escalation })
    }
    if (ticket.status === 'in_lucru' && ticket.asignat_la && hoursSince(lastCommentAt(ticketsDb, ticket.id) || ticket.updated_at || ticket.created_at) >= 48 && !escalationExists(ticketsDb, ticket.id, '[auto:fara_update_48h]')) {
      const escalation = { id: ticketsDb.escalations.length + 1, ticket_id: ticket.id, de_la_user_id: null, catre_user_id: ticket.asignat_la, motiv: '[auto:fara_update_48h] Ticket in lucru fara update dupa 48h', created_at: new Date().toISOString() }
      ticketsDb.escalations.push(escalation)
      created.push(escalation)
      notifyUser(ticket.asignat_la, 'ticket_alerta', { ticket, escalation })
    }
    if (ticket.termen_limita && new Date(ticket.termen_limita).getTime() < nowMs() && !escalationExists(ticketsDb, ticket.id, '[auto:termen_depasit]')) {
      const escalation = { id: ticketsDb.escalations.length + 1, ticket_id: ticket.id, de_la_user_id: null, catre_user_id: ticket.asignat_la || null, motiv: '[auto:termen_depasit] Termen limita depasit', created_at: new Date().toISOString() }
      ticketsDb.escalations.push(escalation)
      created.push(escalation)
      if (ticket.asignat_la) notifyUser(ticket.asignat_la, 'ticket_escalat', { ticket, escalation })
      notifyAdmins(db, 'ticket_escalat', { ticket, escalation })
    }
  })
  return { checked: ticketsDb.tickets.length, escalations: created }
}

module.exports = { checkTicketAlerts }
