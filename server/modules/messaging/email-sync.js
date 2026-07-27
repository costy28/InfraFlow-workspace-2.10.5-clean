const { writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const { fetchIncomingEmails } = require('./imap')

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

function nowIso() {
  return new Date().toISOString()
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1
}

function ensureMessagingDb(db) {
  db.messaging = db.messaging || {}
  db.messaging.channels = Array.isArray(db.messaging.channels) ? db.messaging.channels : []
  db.messaging.channelMembers = Array.isArray(db.messaging.channelMembers) ? db.messaging.channelMembers : []
  db.messaging.messages = Array.isArray(db.messaging.messages) ? db.messaging.messages : []
  db.messaging.mentions = Array.isArray(db.messaging.mentions) ? db.messaging.mentions : []
  db.messaging.emailCategories = Array.isArray(db.messaging.emailCategories) ? db.messaging.emailCategories : []
  db.messaging.emailMessages = Array.isArray(db.messaging.emailMessages) ? db.messaging.emailMessages : []
  db.messaging.emailSync = db.messaging.emailSync || {}
  return db.messaging
}

function emailCategories(messaging) {
  const custom = messaging.emailCategories.filter(item => item && item.id)
  const byId = new Map(DEFAULT_EMAIL_CATEGORIES.concat(custom).map(item => [String(item.id), item]))
  return Array.from(byId.values())
}

function normalizeEmailImportance(value) {
  const text = String(value || 'normal').trim().toLowerCase()
  return EMAIL_IMPORTANCE.includes(text) ? text : 'normal'
}

function syncActor(actor) {
  return actor || { id: 'system-email-sync', name: 'InfraFlow Email Sync', role: 'system' }
}

function publicEmailSyncStatus(db) {
  const messaging = ensureMessagingDb(db)
  const sync = messaging.emailSync || {}
  const settings = db?.settings || {}
  const enabled = settings.email_sync_enabled === true
  const intervalMin = Math.max(5, Math.min(1440, Number(settings.email_sync_interval_min || 15)))
  const lastAuto = sync.last_auto_sync_at || ''
  const lastStarted = sync.last_auto_sync_started_at || ''
  let nextAutoSyncAt = ''
  if (enabled && (lastStarted || lastAuto)) {
    const base = new Date(lastStarted || lastAuto).getTime()
    if (!Number.isNaN(base)) nextAutoSyncAt = new Date(base + intervalMin * 60 * 1000).toISOString()
  }
  return {
    enabled,
    interval_min: intervalMin,
    limit: Math.max(1, Math.min(50, Number(settings.email_sync_limit || 20))),
    last_manual_sync_at: sync.last_manual_sync_at || '',
    last_manual_sync_by: sync.last_manual_sync_by || '',
    last_manual_sync_host: sync.last_manual_sync_host || '',
    last_manual_sync_imported: Number(sync.last_manual_sync_imported || 0),
    last_manual_sync_scanned: Number(sync.last_manual_sync_scanned || 0),
    last_manual_sync_error: sync.last_manual_sync_error || '',
    last_auto_sync_started_at: lastStarted,
    last_auto_sync_at: lastAuto,
    last_auto_sync_host: sync.last_auto_sync_host || '',
    last_auto_sync_imported: Number(sync.last_auto_sync_imported || 0),
    last_auto_sync_scanned: Number(sync.last_auto_sync_scanned || 0),
    last_auto_sync_error: sync.last_auto_sync_error || '',
    last_auto_sync_error_at: sync.last_auto_sync_error_at || '',
    next_auto_sync_at: nextAutoSyncAt
  }
}

async function syncIncomingEmails(db, { actor, limit = 20, mode = 'manual', persist = true } = {}) {
  const messaging = ensureMessagingDb(db)
  const sync = messaging.emailSync
  const key = mode === 'auto' ? 'auto' : 'manual'
  const currentActor = syncActor(actor)
  sync[`last_${key}_sync_started_at`] = nowIso()
  sync[`last_${key}_sync_error`] = ''
  try {
    const result = await fetchIncomingEmails(db, { limit: Number(limit || 20) })
    const categories = emailCategories(messaging)
    const existingKeys = new Set(messaging.emailMessages.flatMap(email => [
      String(email.external_id || '').trim(),
      String(email.message_id || '').trim(),
      String(email.source_id || '').trim()
    ].filter(Boolean)))
    const imported = []
    for (const incoming of result.emails) {
      const externalId = String(incoming.external_id || '').trim()
      const uidKey = `imap:${result.host}:${result.user}:${incoming.uid}`
      if ((externalId && existingKeys.has(externalId)) || existingKeys.has(uidKey)) continue
      const email = {
        id: nextId(messaging.emailMessages),
        direction: 'inbound',
        status: 'unread',
        from: incoming.from || '',
        to: incoming.to || result.user || '',
        cc: incoming.cc || '',
        bcc: '',
        subject: incoming.subject || '(fără subiect)',
        preview: incoming.preview || '',
        body: incoming.body || incoming.preview || '',
        category: categories.some(item => String(item.id) === String(incoming.category)) ? incoming.category : 'general',
        importance: normalizeEmailImportance(incoming.importance),
        attachments: [],
        has_attachments: Boolean(incoming.has_attachments),
        attachments_count: Number(incoming.attachments_count || 0),
        external_id: externalId || uidKey,
        message_id: externalId || null,
        source_type: 'email_imap',
        source_id: uidKey,
        source_label: incoming.source_label || `IMAP ${result.user}`,
        source_url: '/mesaje',
        received_at: incoming.received_at || nowIso(),
        created_by: currentActor.id,
        created_at: nowIso()
      }
      messaging.emailMessages.push(email)
      existingKeys.add(email.external_id)
      existingKeys.add(email.source_id)
      imported.push(email)
    }
    sync[`last_${key}_sync_at`] = nowIso()
    sync[`last_${key}_sync_by`] = currentActor.id
    sync[`last_${key}_sync_host`] = result.host
    sync[`last_${key}_sync_imported`] = imported.length
    sync[`last_${key}_sync_scanned`] = result.emails.length
    sync[`last_${key}_sync_error`] = ''
    addAudit(db, currentActor, key === 'auto' ? 'messaging_email_imap_auto_sync' : 'messaging_email_imap_sync', `${imported.length} emailuri importate din ${result.host}`)
    if (persist) writeDb(db)
    return { ok: true, imported, scanned: result.emails.length, provider: result.provider, host: result.host, user: result.user, mode: key }
  } catch (error) {
    sync[`last_${key}_sync_error`] = String(error?.imapDiagnostic?.error || error?.message || error)
    sync[`last_${key}_sync_error_at`] = nowIso()
    if (persist) writeDb(db)
    throw error
  }
}

module.exports = { syncIncomingEmails, publicEmailSyncStatus, ensureMessagingDb, emailCategories }
