const { Router } = require('express')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { readDb, writeDb, runMssqlScalar, DB_MODE, MSSQL_RELATIONAL_MODE } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const { sendEmail, getEmailSettings } = require('./email')
const router = Router()

const sseClients = new Map()
let mssqlMessagingDisabled = false

function notifyUser(userId, event, data) {
  const clients = sseClients.get(userId) || []
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  clients.forEach(res => res.write(payload))
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

function isMssqlMode() {
  return !mssqlMessagingDisabled && MSSQL_RELATIONAL_MODE && (DB_MODE === 'mssql' || DB_MODE === 'sqlserver')
}

function tryMssqlMessaging(operation) {
  if (!isMssqlMode()) return null
  try {
    return operation()
  } catch (error) {
    mssqlMessagingDisabled = true
    console.warn('[MESSAGING] MSSQL relational indisponibil; folosesc app_state JSON pentru Mesaje.', error.message)
    return null
  }
}

function requireMessaging(auth, res, permission) {
  if (auth.user.role === 'superadmin' || auth.user.role === 'admin') return true
  const direct = new Set(auth.user.permissions || [])
  const role = new Set(auth.db?.settings?.rolePermissions?.[auth.user.role] || [])
  if (direct.has(permission) || role.has(permission)) return true
  if (requirePermission(auth, { writeHead() {}, end() {} }, permission)) return true
  sendJson(res, 403, { error: 'Nu ai permisiune pentru aceasta actiune.' })
  return false
}

function ensureMessagingDb(db) {
  db.messaging = db.messaging || {}
  db.messaging.channels = Array.isArray(db.messaging.channels) ? db.messaging.channels : []
  db.messaging.channelMembers = Array.isArray(db.messaging.channelMembers) ? db.messaging.channelMembers : []
  db.messaging.messages = Array.isArray(db.messaging.messages) ? db.messaging.messages : []
  db.messaging.mentions = Array.isArray(db.messaging.mentions) ? db.messaging.mentions : []
  db.messaging.emailCategories = Array.isArray(db.messaging.emailCategories) ? db.messaging.emailCategories : []
  db.messaging.emailMessages = Array.isArray(db.messaging.emailMessages) ? db.messaging.emailMessages : []
  return db.messaging
}

const DEFAULT_EMAIL_CATEGORIES = [
  { id: 'general', label: 'General', icon: '📥', color: 'slate', module: 'core', system: true },
  { id: 'contracte', label: 'Contracte', icon: '📑', color: 'emerald', module: 'contract_management', system: true },
  { id: 'achizitii', label: 'Achiziții', icon: '🛒', color: 'amber', module: 'procurement', system: true },
  { id: 'contabilitate', label: 'Contabilitate', icon: '🏦', color: 'blue', module: 'accounting', system: true },
  { id: 'hr', label: 'HR', icon: '👥', color: 'purple', module: 'hr', system: true },
  { id: 'documente', label: 'Documente', icon: '🗂️', color: 'indigo', module: 'documents', system: true },
  { id: 'sesizari', label: 'Sesizări', icon: '🎫', color: 'rose', module: 'tickets', system: true }
]

const EMAIL_IMPORTANCE = ['low', 'normal', 'high', 'urgent']
const EMAIL_DIRECTIONS = ['inbound', 'outbound', 'draft']
const EMAIL_STATUSES = ['unread', 'read', 'archived', 'draft', 'sent']

function emailCategories(messaging) {
  const custom = messaging.emailCategories.filter(item => item && item.id)
  const byId = new Map(DEFAULT_EMAIL_CATEGORIES.concat(custom).map(item => [String(item.id), item]))
  return Array.from(byId.values())
}

function publicEmailCategory(category) {
  return {
    id: String(category.id),
    label: category.label || category.name || String(category.id),
    icon: category.icon || '📥',
    color: category.color || 'slate',
    module: category.module || null,
    system: category.system === true
  }
}

function publicEmailMessage(message, categories = DEFAULT_EMAIL_CATEGORIES) {
  const category = categories.find(item => String(item.id) === String(message.category || 'general')) || DEFAULT_EMAIL_CATEGORIES[0]
  return {
    id: message.id,
    direction: message.direction || 'inbound',
    status: message.status || 'unread',
    from: message.from || '',
    to: message.to || '',
    cc: message.cc || '',
    bcc: message.bcc ? '***' : '',
    subject: message.subject || '',
    preview: message.preview || String(message.body || '').replace(/\s+/g, ' ').trim().slice(0, 180),
    body: message.body || '',
    category: category.id,
    category_label: category.label,
    category_icon: category.icon,
    importance: EMAIL_IMPORTANCE.includes(message.importance) ? message.importance : 'normal',
    has_attachments: Boolean(message.has_attachments || (Array.isArray(message.attachments) && message.attachments.length)),
    attachments_count: Array.isArray(message.attachments) ? message.attachments.length : Number(message.attachments_count || 0),
    attachments: normalizeEmailAttachments(message.attachments),
    source_type: message.source_type || null,
    source_id: message.source_id || null,
    source_label: message.source_label || null,
    source_url: message.source_url || null,
    received_at: message.received_at || message.created_at,
    created_at: message.created_at,
    created_by: message.created_by || null,
    updated_at: message.updated_at || null
  }
}

function normalizeEmailImportance(value) {
  const text = String(value || 'normal').trim().toLowerCase()
  return EMAIL_IMPORTANCE.includes(text) ? text : 'normal'
}

function safeInternalUrl(value) {
  const text = String(value || '').trim()
  if (!text || !text.startsWith('/') || text.startsWith('//')) return null
  return text
}

function normalizeEmailAttachments(value) {
  return Array.isArray(value) ? value.map(item => ({
    name: String(item?.name || item?.filename || '').trim(),
    size: Number(item?.size || 0),
    type: String(item?.type || '').trim()
  })).filter(item => item.name) : []
}

function normalizeOutgoingAttachments(value) {
  return Array.isArray(value) ? value.map(item => {
    const filename = String(item?.filename || item?.name || '').trim()
    const content = String(item?.content || '').trim()
    if (!filename || !content) return null
    return {
      filename,
      content,
      encoding: String(item?.encoding || 'base64'),
      contentType: String(item?.contentType || item?.type || '').trim() || undefined
    }
  }).filter(Boolean) : []
}

function emailStats(messages) {
  return {
    total: messages.length,
    unread: messages.filter(item => item.status === 'unread').length,
    important: messages.filter(item => ['high', 'urgent'].includes(item.importance)).length,
    with_attachments: messages.filter(item => item.has_attachments).length
  }
}

async function createDefaultChannels(dbInput) {
  const db = dbInput || readDb()
  const messaging = ensureMessagingDb(db)
  if (messaging.channels.length > 0) return { created: 0 }
  const canale = [
    { cod: 'general',    denumire: 'General',    descriere: 'Canal general pentru toată firma',                    tip: 'public',     icon: '💬', default: true },
    { cod: 'anunturi',   denumire: 'Anunțuri',   descriere: 'Anunțuri oficiale — doar admin poate posta',          tip: 'anunturi',   icon: '📢', readonly: true, default: true },
    { cod: 'it-support', denumire: 'IT & Suport', descriere: 'Probleme tehnice și suport aplicație',               tip: 'public',     icon: '🛠️', default: true },
    { cod: 'mecanizare', denumire: 'Mecanizare', descriere: 'Canal departament Mecanizare',                        tip: 'departament', icon: '🔧' },
    { cod: 'tehnic',     denumire: 'Tehnic',     descriere: 'Canal departament Tehnic',                            tip: 'departament', icon: '🏗️' },
    { cod: 'achizitii',  denumire: 'Achiziții',  descriere: 'Canal departament Achiziții',                         tip: 'departament', icon: '🛒' },
    { cod: 'gestiune',   denumire: 'Gestiune',   descriere: 'Canal departament Gestiune',                          tip: 'departament', icon: '📦' },
    { cod: 'hr',         denumire: 'HR',         descriere: 'Canal departament Resurse Umane',                     tip: 'departament', icon: '👥' },
    { cod: 'salubrizare',denumire: 'Salubrizare',descriere: 'Canal departament Salubrizare',                       tip: 'departament', icon: '🧹' }
  ]
  let created = 0
  for (const canal of canale) {
    if (messaging.channels.some(channel => channel.cod === canal.cod || channel.nume === canal.denumire)) continue
    const channel = {
      id: nextId(messaging.channels),
      cod: canal.cod,
      tip: canal.tip,
      nume: canal.denumire,
      descriere: canal.descriere,
      icon: canal.icon || '💬',
      readonly: Boolean(canal.readonly),
      default: Boolean(canal.default),
      creat_automat: true,
      entitate_tip: null,
      entitate_id: null,
      creat_de: 'system',
      activ: true,
      created_at: nowIso()
    }
    messaging.channels.push(channel)
    ;(db.users || []).filter(user => user.active !== false).forEach(user => ensureJsonMembership(messaging, channel.id, user.id, user.role === 'superadmin' ? 'admin' : 'member'))
    created += 1
  }
  if (!dbInput && created) writeDb(db)
  return { created }
}

// ── Helper: creează canal pentru un departament (dacă nu există deja) ─────────
function createDepartmentChannel(db, dept) {
  const messaging = ensureMessagingDb(db)
  const deptId = String(dept.id || dept.departamentId || '')
  const deptName = String(dept.name || dept.nume || '').trim()
  if (!deptName) return null
  // Nu duplica dacă există deja
  const exists = messaging.channels.find(ch =>
    ch.tip === 'departament' &&
    (
      (deptId && String(ch.departament_id || '') === deptId) ||
      String(ch.nume || '').toLowerCase() === deptName.toLowerCase()
    )
  )
  if (exists) return exists
  const channel = {
    id: nextId(messaging.channels),
    cod: `dept-${deptId || deptName.toLowerCase().replace(/\s+/g, '-')}`,
    tip: 'departament',
    nume: deptName,
    descriere: `Canal oficial departament ${deptName}`,
    icon: dept.icon || '👥',
    readonly: false,
    departament_id: deptId || null,
    creat_automat: true,
    entitate_tip: 'departament',
    entitate_id: deptId || null,
    creat_de: 'system',
    activ: true,
    created_at: nowIso()
  }
  messaging.channels.push(channel)
  // Înscrie utilizatorii cu departamentul respectiv
  ;(db.users || [])
    .filter(u => u.active !== false && (
      (deptId && String(u.departmentId || '') === deptId) ||
      String(u.department || '').toLowerCase() === deptName.toLowerCase()
    ))
    .forEach(u => ensureJsonMembership(messaging, channel.id, String(u.id), 'member'))
  return channel
}

// ── Helper: înscrie utilizator în canalul General ─────────────────────────────
function ensureUserInGeneralChannel(db, userId) {
  const messaging = ensureMessagingDb(db)
  const general = messaging.channels.find(ch =>
    ch.cod === 'general' || (ch.tip === 'public' && ch.activ !== false && !ch.departament_id)
  )
  if (general) ensureJsonMembership(messaging, general.id, String(userId), 'member')
}

// ── Helper: înscrie utilizator în canalul departamentului ─────────────────────
function ensureUserInDepartmentChannel(db, userId, departmentId, departmentName) {
  if (!departmentId && !departmentName) return
  const messaging = ensureMessagingDb(db)
  const canal = messaging.channels.find(ch =>
    ch.tip === 'departament' && ch.activ !== false && (
      (departmentId && String(ch.departament_id || '') === String(departmentId)) ||
      (departmentName && String(ch.nume || '').toLowerCase() === String(departmentName).toLowerCase())
    )
  )
  if (canal) ensureJsonMembership(messaging, canal.id, String(userId), 'member')
}

// ── Helper: scoate utilizator dintr-un canal departament ─────────────────────
function removeUserFromDepartmentChannel(db, userId, departmentId, departmentName) {
  if (!departmentId && !departmentName) return
  const messaging = ensureMessagingDb(db)
  const canal = messaging.channels.find(ch =>
    ch.tip === 'departament' && (
      (departmentId && String(ch.departament_id || '') === String(departmentId)) ||
      (departmentName && String(ch.nume || '').toLowerCase() === String(departmentName).toLowerCase())
    )
  )
  if (!canal) return
  messaging.channelMembers = messaging.channelMembers.filter(
    m => !(String(m.channel_id) === String(canal.id) && String(m.user_id) === String(userId))
  )
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1
}

function publicChannel(channel) {
  return {
    id: channel.id,
    cod: channel.cod || null,
    tip: channel.tip,
    nume: channel.nume || '',
    descriere: channel.descriere || '',
    icon: channel.icon || null,
    readonly: channel.readonly === true,
    departament_id: channel.departament_id || null,
    creat_automat: channel.creat_automat === true,
    default: channel.default === true,
    entitate_tip: channel.entitate_tip || null,
    entitate_id: channel.entitate_id || null,
    creat_de: channel.creat_de || null,
    activ: channel.activ !== false,
    created_at: channel.created_at
  }
}

function publicMessage(message) {
  return {
    id: message.id,
    channel_id: message.channel_id,
    sender_id: message.sender_id,
    tip: message.tip,
    continut: message.sters_la ? '' : message.continut || '',
    fisier_path: message.sters_la ? null : message.fisier_path || null,
    fisier_nume: message.sters_la ? null : message.fisier_nume || null,
    fisier_marime: message.sters_la ? null : message.fisier_marime || null,
    reply_to_id: message.reply_to_id || null,
    citit_de: Array.isArray(message.citit_de) ? message.citit_de : [],
    editat_la: message.editat_la || null,
    sters_la: message.sters_la || null,
    created_at: message.created_at
  }
}

function userChannelIds(messaging, userId) {
  return new Set(messaging.channelMembers.filter(member => member.user_id === userId).map(member => String(member.channel_id)))
}

function ensureJsonMembership(messaging, channelId, userId, rol = 'member') {
  if (!messaging.channelMembers.some(member => String(member.channel_id) === String(channelId) && member.user_id === userId)) {
    messaging.channelMembers.push({ channel_id: channelId, user_id: userId, rol, joined_at: nowIso(), last_read_at: null, created_at: nowIso() })
  }
}

function channelMessages(messaging, channelId, limit = 20) {
  return messaging.messages
    .filter(message => String(message.channel_id) === String(channelId))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || Number(b.id || 0) - Number(a.id || 0))
    .slice(0, limit)
    .reverse()
    .map(publicMessage)
}

function parseMentions(content, db) {
  const usernames = new Set(String(content || '').match(/@([a-zA-Z0-9._-]+)/g)?.map(item => item.slice(1).toLowerCase()) || [])
  return (db.users || []).filter(user => usernames.has(String(user.username || '').toLowerCase()))
}

function notifyChannelMembers(messaging, channelId, event, data) {
  messaging.channelMembers
    .filter(member => String(member.channel_id) === String(channelId))
    .forEach(member => notifyUser(member.user_id, event, data))
}

function mssqlJson(sql, params = {}) {
  const result = runMssqlScalar(`DECLARE @p nvarchar(max) = @json;\n${sql}`, { jsonInput: JSON.stringify(params) })
  if (!String(result || '').trim()) return null
  return JSON.parse(result)
}

function mssqlArray(sql, params = {}) {
  return mssqlJson(sql, params) || []
}

function mssqlMessages(channelId, limit = 20) {
  return mssqlArray(`
DECLARE @channelId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.channelId'));
DECLARE @limit int = ISNULL(TRY_CONVERT(int, JSON_VALUE(@p, '$.limit')), 20);
SELECT * FROM (
  SELECT TOP (@limit) id, channel_id, sender_id, tip, continut, fisier_path, fisier_nume, fisier_marime, reply_to_id,
    JSON_QUERY(ISNULL(citit_de, N'[]')) AS citit_de, editat_la, sters_la, created_at
  FROM messaging.messages
  WHERE channel_id = @channelId
  ORDER BY created_at DESC, id DESC
) rows
ORDER BY created_at ASC, id ASC
FOR JSON PATH;
`, { channelId, limit })
}

function mssqlMembers(channelId) {
  return mssqlArray(`
DECLARE @channelId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.channelId'));
SELECT channel_id, user_id, rol, joined_at, last_read_at, created_at
FROM messaging.channel_members
WHERE channel_id = @channelId
FOR JSON PATH;
`, { channelId })
}

function mssqlChannelForUser(channelId, userId) {
  return mssqlArray(`
DECLARE @channelId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.channelId'));
DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId');
SELECT c.id, c.tip, c.nume, c.entitate_tip, c.entitate_id, c.creat_de, c.activ, c.created_at
FROM messaging.channels c
WHERE c.id = @channelId
  AND EXISTS (SELECT 1 FROM messaging.channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = @userId)
FOR JSON PATH;
`, { channelId, userId })[0] || null
}

router.get('/messaging/stream', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const userId = auth.user.id
  if (!sseClients.has(userId)) sseClients.set(userId, [])
  sseClients.get(userId).push(res)

  req.on('close', () => {
    const clients = sseClients.get(userId) || []
    sseClients.set(userId, clients.filter(c => c !== res))
  })
})

router.post('/messaging/email/send', async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'messaging:send')) return
    const { to, cc, bcc, subject, body, attachments, draft_id } = req.body || {}
    if (!to || !subject || !body) return sendJson(res, 400, { error: 'Destinatarul, subiectul si continutul sunt obligatorii.' })
    const outgoingAttachments = normalizeOutgoingAttachments(attachments)
    await sendEmail({ to, cc, bcc, subject, body, attachments: outgoingAttachments }, auth.db)
    const messaging = ensureMessagingDb(auth.db)
    const categories = emailCategories(messaging)
    const category = categories.some(item => String(item.id) === String(req.body?.category || 'general')) ? String(req.body?.category || 'general') : 'general'
    const settings = getEmailSettings(auth.db)
    const normalizedAttachments = normalizeEmailAttachments(attachments)
    const sentEmail = {
      id: nextId(messaging.emailMessages),
      direction: 'outbound',
      status: 'read',
      from: settings.smtp_user || auth.user.email || '',
      to: String(to || '').trim(),
      cc: String(cc || '').trim(),
      bcc: String(bcc || '').trim(),
      subject: String(subject || '').trim(),
      preview: String(req.body?.preview || '').trim(),
      body: String(body || '').trim(),
      category,
      importance: normalizeEmailImportance(req.body?.importance),
      attachments: normalizedAttachments,
      has_attachments: normalizedAttachments.length > 0,
      source_type: String(req.body?.source_type || '').trim() || null,
      source_id: String(req.body?.source_id || '').trim() || null,
      source_label: String(req.body?.source_label || '').trim() || null,
      source_url: safeInternalUrl(req.body?.source_url),
      received_at: nowIso(),
      created_by: auth.user.id,
      created_at: nowIso()
    }
    messaging.emailMessages.push(sentEmail)
    if (draft_id) {
      const draft = messaging.emailMessages.find(item => String(item.id) === String(draft_id) && item.direction === 'draft' && !item.cancelled_at)
      if (draft) {
        draft.status = 'sent'
        draft.cancelled_at = nowIso()
        draft.cancelled_by = auth.user.id
        draft.updated_at = nowIso()
      }
    }
    addAudit(auth.db, auth.user, 'email_sent', subject)
    writeDb(auth.db)
    sendJson(res, 200, { ok: true, email: publicEmailMessage(sentEmail, categories) })
  } catch (error) {
    next(error)
  }
})

router.post('/messaging/email/drafts', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireMessaging(auth, res, 'messaging:send')) return
    const messaging = ensureMessagingDb(auth.db)
    const body = req.body || {}
    const to = String(body.to || '').trim()
    const cc = String(body.cc || '').trim()
    const bcc = String(body.bcc || '').trim()
    const subject = String(body.subject || '').trim()
    const textBody = String(body.body || '').trim()
    if (!to && !cc && !bcc && !subject && !textBody) return sendJson(res, 400, { error: 'Completeaza macar un camp pentru a salva draftul.' })
    const categories = emailCategories(messaging)
    const category = categories.some(item => String(item.id) === String(body.category || 'general')) ? String(body.category || 'general') : 'general'
    const settings = getEmailSettings(auth.db)
    const existing = body.id || body.draft_id
      ? messaging.emailMessages.find(item => String(item.id) === String(body.id || body.draft_id) && item.direction === 'draft' && !item.cancelled_at)
      : null
    if (existing) {
      existing.status = 'draft'
      existing.from = settings.smtp_user || auth.user.email || ''
      existing.to = to
      existing.cc = cc
      existing.bcc = bcc
      existing.subject = subject || '(fara subiect)'
      existing.preview = String(body.preview || textBody).trim()
      existing.body = textBody
      existing.category = category
      existing.importance = normalizeEmailImportance(body.importance)
      existing.attachments = normalizeEmailAttachments(body.attachments)
      existing.has_attachments = existing.attachments.length > 0
      existing.source_type = String(body.source_type || '').trim() || null
      existing.source_id = String(body.source_id || '').trim() || null
      existing.source_label = String(body.source_label || '').trim() || null
      existing.source_url = safeInternalUrl(body.source_url)
      existing.updated_at = nowIso()
      addAudit(auth.db, auth.user, 'messaging_email_draft_update', `${existing.id} / ${existing.subject}`)
      writeDb(auth.db)
      return sendJson(res, 200, { draft: publicEmailMessage(existing, categories) })
    }
    const draft = {
      id: nextId(messaging.emailMessages),
      direction: 'draft',
      status: 'draft',
      from: settings.smtp_user || auth.user.email || '',
      to,
      cc,
      bcc,
      subject: subject || '(fara subiect)',
      preview: String(body.preview || textBody).trim(),
      body: textBody,
      category,
      importance: normalizeEmailImportance(body.importance),
      attachments: normalizeEmailAttachments(body.attachments),
      has_attachments: normalizeEmailAttachments(body.attachments).length > 0,
      source_type: String(body.source_type || '').trim() || null,
      source_id: String(body.source_id || '').trim() || null,
      source_label: String(body.source_label || '').trim() || null,
      source_url: safeInternalUrl(body.source_url),
      received_at: nowIso(),
      created_by: auth.user.id,
      created_at: nowIso()
    }
    messaging.emailMessages.push(draft)
    addAudit(auth.db, auth.user, 'messaging_email_draft_create', draft.subject)
    writeDb(auth.db)
    sendJson(res, 201, { draft: publicEmailMessage(draft, categories) })
  } catch (error) {
    next(error)
  }
})

router.post('/messaging/email/send-bulk', async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'messaging:send')) return
    const { recipients, subject, body } = req.body || {}
    const list = Array.isArray(recipients) ? recipients.filter(Boolean) : []
    if (!list.length || !subject || !body) return sendJson(res, 400, { error: 'Lista de destinatari, subiectul si continutul sunt obligatorii.' })
    for (const to of list) {
      await sendEmail({ to, subject, body }, auth.db)
    }
    addAudit(auth.db, auth.user, 'email_bulk_sent', `${list.length} destinatari`)
    writeDb(auth.db)
    sendJson(res, 200, { ok: true, sent: list.length })
  } catch (error) {
    next(error)
  }
})

router.get('/messaging/email/categories', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireMessaging(auth, res, 'messaging:view')) return
    const messaging = ensureMessagingDb(auth.db)
    sendJson(res, 200, { categories: emailCategories(messaging).map(publicEmailCategory) })
  } catch (error) {
    next(error)
  }
})

router.get('/messaging/email/inbox', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireMessaging(auth, res, 'messaging:view')) return
    const messaging = ensureMessagingDb(auth.db)
    const categories = emailCategories(messaging)
    const query = String(req.query.q || '').trim().toLowerCase()
    const category = String(req.query.category || '').trim()
    const importance = String(req.query.importance || '').trim().toLowerCase()
    const status = String(req.query.status || '').trim().toLowerCase()
    const direction = String(req.query.direction || '').trim().toLowerCase()
    const sourceType = String(req.query.source_type || '').trim()
    const hasAttachments = String(req.query.has_attachments || '').trim()
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 80)))

    let rows = messaging.emailMessages.filter(item => !item.cancelled_at).map(item => publicEmailMessage(item, categories))
    if (query) {
      rows = rows.filter(item => [item.from, item.to, item.cc, item.subject, item.preview, item.source_label].join(' ').toLowerCase().includes(query))
    }
    if (category) rows = rows.filter(item => String(item.category) === category)
    if (importance) rows = rows.filter(item => item.importance === importance)
    if (status) rows = rows.filter(item => item.status === status)
    if (EMAIL_DIRECTIONS.includes(direction)) rows = rows.filter(item => item.direction === direction)
    if (sourceType) rows = rows.filter(item => String(item.source_type || '') === sourceType)
    if (hasAttachments === 'true') rows = rows.filter(item => item.has_attachments)
    if (hasAttachments === 'false') rows = rows.filter(item => !item.has_attachments)

    rows = rows.sort((a, b) => String(b.received_at || '').localeCompare(String(a.received_at || ''))).slice(0, limit)
    sendJson(res, 200, {
      emails: rows,
      categories: categories.map(publicEmailCategory),
      stats: emailStats(rows)
    })
  } catch (error) {
    next(error)
  }
})

router.post('/messaging/email/inbox', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireMessaging(auth, res, 'messaging:send')) return
    const messaging = ensureMessagingDb(auth.db)
    const body = req.body || {}
    const subject = String(body.subject || '').trim()
    const from = String(body.from || '').trim()
    if (!subject || !from) return sendJson(res, 400, { error: 'Expeditorul si subiectul sunt obligatorii.' })
    const categories = emailCategories(messaging)
    const category = categories.some(item => String(item.id) === String(body.category || 'general')) ? String(body.category || 'general') : 'general'
    const attachments = normalizeEmailAttachments(body.attachments)
    const email = {
      id: nextId(messaging.emailMessages),
      direction: EMAIL_DIRECTIONS.includes(body.direction) ? body.direction : 'inbound',
      status: EMAIL_STATUSES.includes(body.status) ? body.status : 'unread',
      from,
      to: String(body.to || '').trim(),
      cc: String(body.cc || '').trim(),
      bcc: String(body.bcc || '').trim(),
      subject,
      preview: String(body.preview || '').trim(),
      body: String(body.body || '').trim(),
      category,
      importance: normalizeEmailImportance(body.importance),
      attachments,
      has_attachments: attachments.length > 0 || Boolean(body.has_attachments),
      source_type: String(body.source_type || '').trim() || null,
      source_id: String(body.source_id || '').trim() || null,
      source_label: String(body.source_label || '').trim() || null,
      source_url: safeInternalUrl(body.source_url),
      received_at: body.received_at || nowIso(),
      created_by: auth.user.id,
      created_at: nowIso()
    }
    messaging.emailMessages.push(email)
    addAudit(auth.db, auth.user, 'messaging_email_inbox_add', `${email.category} / ${email.subject}`)
    writeDb(auth.db)
    sendJson(res, 201, { email: publicEmailMessage(email, categories) })
  } catch (error) {
    next(error)
  }
})

router.patch('/messaging/email/inbox/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireMessaging(auth, res, 'messaging:send')) return
    const messaging = ensureMessagingDb(auth.db)
    const email = messaging.emailMessages.find(item => String(item.id) === String(req.params.id))
    if (!email) throwHttp(404, 'Email inexistent.')
    const body = req.body || {}
    const categories = emailCategories(messaging)
    if (body.category !== undefined && categories.some(item => String(item.id) === String(body.category))) email.category = String(body.category)
    if (body.importance !== undefined) email.importance = normalizeEmailImportance(body.importance)
    if (body.status !== undefined && EMAIL_STATUSES.includes(String(body.status))) email.status = String(body.status)
    if (body.source_type !== undefined) email.source_type = String(body.source_type || '').trim() || null
    if (body.source_id !== undefined) email.source_id = String(body.source_id || '').trim() || null
    if (body.source_label !== undefined) email.source_label = String(body.source_label || '').trim() || null
    if (body.source_url !== undefined) email.source_url = safeInternalUrl(body.source_url)
    email.updated_at = nowIso()
    addAudit(auth.db, auth.user, 'messaging_email_inbox_update', `${email.id} / ${email.subject}`)
    writeDb(auth.db)
    sendJson(res, 200, { email: publicEmailMessage(email, categories) })
  } catch (error) {
    next(error)
  }
})

router.get('/messaging/channels', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireMessaging(auth, res, 'messaging:view')) return
    if (isMssqlMode()) {
      const channels = tryMssqlMessaging(() => mssqlArray(`
DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId');
SELECT c.id, c.tip, c.nume, c.entitate_tip, c.entitate_id, c.creat_de, c.activ, c.created_at
FROM messaging.channels c
JOIN messaging.channel_members cm ON cm.channel_id = c.id AND cm.user_id = @userId
WHERE c.activ = 1
ORDER BY c.created_at DESC
FOR JSON PATH;
`, { userId: auth.user.id }))
      if (channels) {
        sendJson(res, 200, { channels })
        return
      }
    }
    const messaging = ensureMessagingDb(auth.db)
    // Auto-înscrie utilizatorul la canalele publice/departament dacă nu e deja membru
    const publicTypes = ['public', 'departament', 'anunturi']
    const publicChannels = messaging.channels.filter(ch => publicTypes.includes(ch.tip) && ch.activ !== false)
    let enrolled = false
    publicChannels.forEach(ch => {
      const isMember = messaging.channelMembers.some(m => String(m.channel_id) === String(ch.id) && m.user_id === auth.user.id)
      if (!isMember) {
        ensureJsonMembership(messaging, ch.id, auth.user.id, 'member')
        enrolled = true
      }
    })
    if (enrolled) writeDb(auth.db)
    const ids = userChannelIds(messaging, auth.user.id)
    const visibleChannels = messaging.channels
      .filter(channel => ids.has(String(channel.id)) && channel.activ !== false)
      .map(channel => {
        const membership = messaging.channelMembers.find(m => String(m.channel_id) === String(channel.id) && m.user_id === auth.user.id)
        const lastRead = membership?.last_read_at || null
        const unread = lastRead
          ? messaging.messages.filter(m => String(m.channel_id) === String(channel.id) && !m.sters_la && m.sender_id !== auth.user.id && String(m.created_at || '') > String(lastRead)).length
          : 0
        return { ...publicChannel(channel), unread }
      })
    sendJson(res, 200, { channels: visibleChannels })
  } catch (error) {
    next(error)
  }
})

router.post('/messaging/channels', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireMessaging(auth, res, 'messaging:admin')) return
    const body = req.body || {}
    const tip = String(body.tip || 'direct').trim()
    if (!['direct', 'departament', 'contextual', 'public', 'anunturi'].includes(tip)) throwHttp(400, 'Tip canal invalid.')
    const readonly = tip === 'anunturi' ? true : Boolean(body.readonly)
    // Pentru canale publice/anunturi — toți userii activi sunt membri
    const allActiveUsers = (auth.db.users || []).filter(u => u.active !== false).map(u => String(u.id))
    const baseMembers = ['public', 'anunturi'].includes(tip) ? allActiveUsers : []
    const memberIds = [...new Set([auth.user.id].concat(baseMembers).concat(Array.isArray(body.members) ? body.members : []).map(String).filter(Boolean))]
    if (isMssqlMode()) {
      const channel = mssqlJson(`
DECLARE @tip nvarchar(30) = JSON_VALUE(@p, '$.tip');
DECLARE @nume nvarchar(200) = JSON_VALUE(@p, '$.nume');
DECLARE @entitateTip nvarchar(80) = JSON_VALUE(@p, '$.entitateTip');
DECLARE @entitateId nvarchar(64) = JSON_VALUE(@p, '$.entitateId');
DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId');
DECLARE @created table (id int);
INSERT INTO messaging.channels (tip, nume, entitate_tip, entitate_id, creat_de)
OUTPUT inserted.id INTO @created
VALUES (@tip, @nume, NULLIF(@entitateTip, N''), NULLIF(@entitateId, N''), @userId);
INSERT INTO messaging.channel_members (channel_id, user_id, rol)
SELECT (SELECT TOP 1 id FROM @created), [value], CASE WHEN [value] = @userId THEN N'admin' ELSE N'member' END
FROM OPENJSON(@p, '$.memberIds');
SELECT c.id, c.tip, c.nume, c.entitate_tip, c.entitate_id, c.creat_de, c.activ, c.created_at
FROM messaging.channels c WHERE c.id = (SELECT TOP 1 id FROM @created)
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { tip, nume: body.nume || '', entitateTip: body.entitate_tip || '', entitateId: body.entitate_id || '', userId: auth.user.id, memberIds })
      addAudit(auth.db, auth.user, 'messaging_canal_creat', `${tip} / ${channel.id}`)
      sendJson(res, 201, { channel })
      return
    }
    const messaging = ensureMessagingDb(auth.db)
    const channel = { id: nextId(messaging.channels), tip, nume: body.nume || '', readonly, descriere: body.descriere || '', entitate_tip: body.entitate_tip || null, entitate_id: body.entitate_id || null, creat_de: auth.user.id, activ: true, created_at: nowIso() }
    messaging.channels.push(channel)
    memberIds.forEach(userId => ensureJsonMembership(messaging, channel.id, userId, userId === auth.user.id ? 'admin' : 'member'))
    addAudit(auth.db, auth.user, 'messaging_canal_creat', `${tip} / ${channel.id}`)
    writeDb(auth.db)
    sendJson(res, 201, { channel: publicChannel(channel) })
  } catch (error) {
    next(error)
  }
})

router.get('/messaging/channels/:id/messages', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireMessaging(auth, res, 'messaging:view')) return
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)))
    if (isMssqlMode()) {
      const channel = mssqlChannelForUser(req.params.id, auth.user.id)
      if (!channel) throwHttp(404, 'Canal inexistent.')
      sendJson(res, 200, { channel, messages: mssqlMessages(req.params.id, limit) })
      return
    }
    const messaging = ensureMessagingDb(auth.db)
    const channel = messaging.channels.find(item => String(item.id) === String(req.params.id))
    if (!channel) throwHttp(404, 'Canal inexistent.')
    if (!userChannelIds(messaging, auth.user.id).has(String(channel.id))) throwHttp(403, 'Nu ai acces la acest canal.')
    sendJson(res, 200, { channel: publicChannel(channel), messages: channelMessages(messaging, channel.id, limit) })
  } catch (error) {
    next(error)
  }
})

router.post('/messaging/channels/:id/messages', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireMessaging(auth, res, 'messaging:send')) return
    const body = req.body || {}
    const tip = String(body.tip || 'text').trim()
    if (!['text', 'fisier', 'sistem', 'aprobare_ceruta'].includes(tip)) throwHttp(400, 'Tip mesaj invalid.')
    if (isMssqlMode()) {
      const channel = mssqlChannelForUser(req.params.id, auth.user.id)
      if (!channel) throwHttp(404, 'Canal inexistent.')
      const message = mssqlJson(`
DECLARE @channelId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.channelId'));
DECLARE @senderId nvarchar(64) = JSON_VALUE(@p, '$.senderId');
DECLARE @tip nvarchar(40) = JSON_VALUE(@p, '$.tip');
DECLARE @continut nvarchar(max) = JSON_VALUE(@p, '$.continut');
DECLARE @created table (id bigint);
INSERT INTO messaging.messages (channel_id, sender_id, tip, continut, fisier_path, fisier_nume, fisier_marime, reply_to_id, citit_de)
OUTPUT inserted.id INTO @created
VALUES (@channelId, @senderId, @tip, @continut, JSON_VALUE(@p, '$.fisierPath'), JSON_VALUE(@p, '$.fisierNume'), TRY_CONVERT(int, JSON_VALUE(@p, '$.fisierMarime')), TRY_CONVERT(bigint, JSON_VALUE(@p, '$.replyToId')), CONCAT(N'["', @senderId, N'"]'));
SELECT id, channel_id, sender_id, tip, continut, fisier_path, fisier_nume, fisier_marime, reply_to_id, JSON_QUERY(citit_de) AS citit_de, editat_la, sters_la, created_at
FROM messaging.messages WHERE id = (SELECT TOP 1 id FROM @created)
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
`, { channelId: req.params.id, senderId: auth.user.id, tip, continut: body.continut || '', fisierPath: body.fisier_path || null, fisierNume: body.fisier_nume || null, fisierMarime: body.fisier_marime || null, replyToId: body.reply_to_id || null })
      const members = mssqlMembers(req.params.id)
      parseMentions(body.continut, auth.db).filter(user => members.some(member => member.user_id === user.id)).forEach(user => {
        mssqlJson(`DECLARE @messageId bigint = TRY_CONVERT(bigint, JSON_VALUE(@p, '$.messageId')); DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId'); IF NOT EXISTS (SELECT 1 FROM messaging.mentions WHERE message_id = @messageId AND user_id = @userId) INSERT INTO messaging.mentions (message_id, user_id) VALUES (@messageId, @userId); SELECT 1 AS ok FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`, { messageId: message.id, userId: user.id })
        notifyUser(user.id, 'mention', { channel, message })
      })
      members.forEach(member => notifyUser(member.user_id, 'message', { channel, message }))
      sendJson(res, 201, { message })
      return
    }
    const messaging = ensureMessagingDb(auth.db)
    const channel = messaging.channels.find(item => String(item.id) === String(req.params.id))
    if (!channel) throwHttp(404, 'Canal inexistent.')
    if (!userChannelIds(messaging, auth.user.id).has(String(channel.id))) throwHttp(403, 'Nu ai acces la acest canal.')
    const message = { id: nextId(messaging.messages), channel_id: channel.id, sender_id: auth.user.id, tip, continut: body.continut || '', fisier_path: body.fisier_path || null, fisier_nume: body.fisier_nume || null, fisier_marime: body.fisier_marime || null, reply_to_id: body.reply_to_id || null, citit_de: [auth.user.id], editat_la: null, sters_la: null, created_at: nowIso() }
    messaging.messages.push(message)
    const members = messaging.channelMembers.filter(member => String(member.channel_id) === String(channel.id))
    parseMentions(message.continut, auth.db).filter(user => members.some(member => member.user_id === user.id)).forEach(user => {
      messaging.mentions.push({ message_id: message.id, user_id: user.id, created_at: nowIso() })
      notifyUser(user.id, 'mention', { channel: publicChannel(channel), message: publicMessage(message) })
    })
    addAudit(auth.db, auth.user, 'messaging_mesaj_trimite', `${channel.nume || channel.id}`)
    writeDb(auth.db)
    notifyChannelMembers(messaging, channel.id, 'message', { channel: publicChannel(channel), message: publicMessage(message) })
    sendJson(res, 201, { message: publicMessage(message) })
  } catch (error) {
    next(error)
  }
})

router.patch('/messaging/messages/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireMessaging(auth, res, 'messaging:send')) return
    if (isMssqlMode()) {
      const message = mssqlJson(`DECLARE @id bigint = TRY_CONVERT(bigint, JSON_VALUE(@p, '$.id')); DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId'); UPDATE messaging.messages SET continut = JSON_VALUE(@p, '$.continut'), editat_la = sysdatetime() WHERE id = @id AND sender_id = @userId AND sters_la IS NULL; SELECT id, channel_id, sender_id, tip, continut, fisier_path, fisier_nume, fisier_marime, reply_to_id, JSON_QUERY(citit_de) AS citit_de, editat_la, sters_la, created_at FROM messaging.messages WHERE id = @id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`, { id: req.params.id, userId: auth.user.id, continut: (req.body || {}).continut || '' })
      if (!message) throwHttp(404, 'Mesaj inexistent.')
      sendJson(res, 200, { message })
      return
    }
    const messaging = ensureMessagingDb(auth.db)
    const message = messaging.messages.find(item => String(item.id) === String(req.params.id))
    if (!message) throwHttp(404, 'Mesaj inexistent.')
    if (message.sender_id !== auth.user.id) throwHttp(403, 'Poti edita doar mesajele proprii.')
    message.continut = String((req.body || {}).continut || '')
    message.editat_la = nowIso()
    writeDb(auth.db)
    sendJson(res, 200, { message: publicMessage(message) })
  } catch (error) {
    next(error)
  }
})

router.delete('/messaging/messages/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireMessaging(auth, res, 'messaging:send')) return
    if (isMssqlMode()) {
      const message = mssqlJson(`DECLARE @id bigint = TRY_CONVERT(bigint, JSON_VALUE(@p, '$.id')); DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId'); UPDATE messaging.messages SET sters_la = sysdatetime() WHERE id = @id AND sender_id = @userId AND sters_la IS NULL; SELECT id, channel_id, sender_id, tip, continut, fisier_path, fisier_nume, fisier_marime, reply_to_id, JSON_QUERY(citit_de) AS citit_de, editat_la, sters_la, created_at FROM messaging.messages WHERE id = @id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`, { id: req.params.id, userId: auth.user.id })
      if (!message) throwHttp(404, 'Mesaj inexistent.')
      sendJson(res, 200, { message })
      return
    }
    const messaging = ensureMessagingDb(auth.db)
    const message = messaging.messages.find(item => String(item.id) === String(req.params.id))
    if (!message) throwHttp(404, 'Mesaj inexistent.')
    if (message.sender_id !== auth.user.id) throwHttp(403, 'Poti sterge doar mesajele proprii.')
    message.sters_la = nowIso()
    writeDb(auth.db)
    sendJson(res, 200, { message: publicMessage(message) })
  } catch (error) {
    next(error)
  }
})

router.post('/messaging/channels/:id/read', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireMessaging(auth, res, 'messaging:view')) return
    if (isMssqlMode()) {
      mssqlJson(`DECLARE @channelId int = TRY_CONVERT(int, JSON_VALUE(@p, '$.channelId')); DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId'); UPDATE messaging.channel_members SET last_read_at = sysdatetime() WHERE channel_id = @channelId AND user_id = @userId; SELECT 1 AS ok FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`, { channelId: req.params.id, userId: auth.user.id })
      sendJson(res, 200, { ok: true })
      return
    }
    const messaging = ensureMessagingDb(auth.db)
    const member = messaging.channelMembers.find(item => String(item.channel_id) === String(req.params.id) && item.user_id === auth.user.id)
    if (!member) throwHttp(404, 'Canal inexistent.')
    member.last_read_at = nowIso()
    messaging.messages.filter(message => String(message.channel_id) === String(req.params.id)).forEach(message => {
      message.citit_de = Array.isArray(message.citit_de) ? message.citit_de : []
      if (!message.citit_de.includes(auth.user.id)) message.citit_de.push(auth.user.id)
    })
    writeDb(auth.db)
    sendJson(res, 200, { ok: true })
  } catch (error) {
    next(error)
  }
})

router.get('/messaging/channels/:id/members', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireMessaging(auth, res, 'messaging:view')) return
    const messaging = ensureMessagingDb(auth.db)
    const members = messaging.channelMembers
      .filter(m => String(m.channel_id) === String(req.params.id))
      .map(m => ({ user_id: m.user_id, rol: m.rol, joined_at: m.joined_at, last_read_at: m.last_read_at }))
    sendJson(res, 200, { members })
  } catch (error) {
    next(error)
  }
})

router.delete('/messaging/channels/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireMessaging(auth, res, 'messaging:admin')) return
    const messaging = ensureMessagingDb(auth.db)
    const channelId = String(req.params.id)
    const channel = messaging.channels.find(c => String(c.id) === channelId)
    if (!channel) throwHttp(404, 'Canal inexistent.')
    // Soft delete — marchează ca inactiv
    channel.activ = false
    channel.deleted_at = nowIso()
    writeDb(auth.db)
    sendJson(res, 200, { ok: true })
  } catch (error) {
    next(error)
  }
})

router.get('/messaging/unread-count', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireMessaging(auth, res, 'messaging:view')) return
    if (isMssqlMode()) {
      const result = mssqlJson(`DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId'); SELECT COUNT(1) AS unread FROM messaging.channel_members cm JOIN messaging.messages m ON m.channel_id = cm.channel_id WHERE cm.user_id = @userId AND m.sender_id <> @userId AND m.sters_la IS NULL AND m.created_at > ISNULL(cm.last_read_at, '19000101') FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`, { userId: auth.user.id })
      sendJson(res, 200, { unread: Number(result?.unread || 0) })
      return
    }
    const messaging = ensureMessagingDb(auth.db)
    const ids = userChannelIds(messaging, auth.user.id)
    const unread = messaging.messages.filter(message => ids.has(String(message.channel_id)) && message.sender_id !== auth.user.id && !message.sters_la && !(message.citit_de || []).includes(auth.user.id)).length
    sendJson(res, 200, { unread })
  } catch (error) {
    next(error)
  }
})

router.get('/messaging/context/:entitate_tip/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requireMessaging(auth, res, 'messaging:view')) return
    const entitateTip = String(req.params.entitate_tip || '').trim()
    const entitateId = String(req.params.id || '').trim()
    if (isMssqlMode()) {
      let channel = mssqlArray(`DECLARE @tip nvarchar(80) = JSON_VALUE(@p, '$.tip'); DECLARE @id nvarchar(64) = JSON_VALUE(@p, '$.id'); SELECT TOP 1 id, tip, nume, entitate_tip, entitate_id, creat_de, activ, created_at FROM messaging.channels WHERE entitate_tip = @tip AND entitate_id = @id AND activ = 1 FOR JSON PATH;`, { tip: entitateTip, id: entitateId })[0]
      if (!channel) {
        channel = mssqlJson(`DECLARE @tip nvarchar(80) = JSON_VALUE(@p, '$.tip'); DECLARE @id nvarchar(64) = JSON_VALUE(@p, '$.id'); DECLARE @userId nvarchar(64) = JSON_VALUE(@p, '$.userId'); DECLARE @created table (id int); INSERT INTO messaging.channels (tip, nume, entitate_tip, entitate_id, creat_de) OUTPUT inserted.id INTO @created VALUES (N'contextual', CONCAT(@tip, N' #', @id), @tip, @id, @userId); INSERT INTO messaging.channel_members (channel_id, user_id, rol) VALUES ((SELECT TOP 1 id FROM @created), @userId, N'admin'); SELECT id, tip, nume, entitate_tip, entitate_id, creat_de, activ, created_at FROM messaging.channels WHERE id = (SELECT TOP 1 id FROM @created) FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`, { tip: entitateTip, id: entitateId, userId: auth.user.id })
      }
      sendJson(res, 200, { channel, messages: mssqlMessages(channel.id, 20) })
      return
    }
    const messaging = ensureMessagingDb(auth.db)
    let channel = messaging.channels.find(item => item.entitate_tip === entitateTip && item.entitate_id === entitateId && item.activ !== false)
    if (!channel) {
      channel = { id: nextId(messaging.channels), tip: 'contextual', nume: `${entitateTip} #${entitateId}`, entitate_tip: entitateTip, entitate_id: entitateId, creat_de: auth.user.id, activ: true, created_at: nowIso() }
      messaging.channels.push(channel)
      addAudit(auth.db, auth.user, 'messaging_canal_contextual_creat', `${entitateTip} / ${entitateId}`)
    }
    ensureJsonMembership(messaging, channel.id, auth.user.id, 'admin')
    writeDb(auth.db)
    sendJson(res, 200, { channel: publicChannel(channel), messages: channelMessages(messaging, channel.id, 20) })
  } catch (error) {
    next(error)
  }
})

module.exports = {
  router,
  notifyUser,
  createDefaultChannels,
  createDepartmentChannel,
  ensureUserInGeneralChannel,
  ensureUserInDepartmentChannel,
  removeUserFromDepartmentChannel,
  ensureMessagingDb,
  ensureJsonMembership,
}
