const { Router } = require('express')
const crypto = require('crypto')
const { readDb, writeDb } = require('../../core/db')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { addAudit } = require('../../core/audit')
const { encryptSettingSecret, decryptSettingSecret } = require('../../core/settings-crypto')
const crmRepository = require('../crm/repository')
const { normalizeLeadPayload, isCrmModuleEnabled } = require('../crm/service')

const router = Router()
const webhookRouter = Router()

function sendJson(res, status, value) { res.status(status).json(value) }
function nowIso() { return new Date().toISOString() }
function clean(value, max = 1000) { return String(value || '').trim().slice(0, max) }

function ensureWhatsApp(db) {
  db.messaging = db.messaging || {}
  db.messaging.whatsapp = db.messaging.whatsapp || {}
  const store = db.messaging.whatsapp
  store.messages = Array.isArray(store.messages) ? store.messages : []
  store.events = Array.isArray(store.events) ? store.events : []
  return store
}

function settingsFor(db) {
  const settings = db.settings || {}
  const source = settings.whatsapp_business || {}
  return {
    enabled: source.enabled === true,
    phone_number_id: clean(source.phone_number_id, 100),
    display_phone_number: clean(source.display_phone_number, 80),
    verify_token: decryptSettingSecret(source.verify_token),
    app_secret: decryptSettingSecret(source.app_secret),
    access_token: decryptSettingSecret(source.access_token),
    created_at: source.created_at || null,
    updated_at: source.updated_at || null,
    updated_by: source.updated_by || null,
  }
}

function publicSettings(db) {
  const config = settingsFor(db)
  return {
    enabled: config.enabled,
    phone_number_id: config.phone_number_id,
    display_phone_number: config.display_phone_number,
    verify_token_set: Boolean(config.verify_token),
    app_secret_set: Boolean(config.app_secret),
    access_token_set: Boolean(config.access_token),
    webhook_url: '/webhooks/whatsapp',
    ready: Boolean(config.enabled && config.phone_number_id && config.verify_token && config.app_secret && config.access_token),
    updated_at: config.updated_at,
    updated_by: config.updated_by,
  }
}

function hasMessagingPermission(auth, res, permission) {
  if (auth.user.role === 'superadmin' || auth.user.role === 'admin') return true
  return requirePermission(auth, res, permission)
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8')
  const b = Buffer.from(String(right || ''), 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function signatureIsValid(req, appSecret) {
  const signature = String(req.get('x-hub-signature-256') || '')
  if (!appSecret || !signature.startsWith('sha256=')) return false
  const body = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(JSON.stringify(req.body || {}), 'utf8')
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(body).digest('hex')}`
  return safeEqual(signature, expected)
}

function messageText(message) {
  if (message.type === 'text') return clean(message.text?.body, 4000)
  if (message.type === 'button') return clean(message.button?.text, 1000)
  if (message.type === 'interactive') return clean(message.interactive?.button_reply?.title || message.interactive?.list_reply?.title, 1000)
  return ''
}

function attachmentFor(message) {
  const type = clean(message.type, 40)
  if (!['image', 'document', 'video', 'audio', 'sticker'].includes(type)) return null
  const media = message[type] || {}
  return {
    type,
    media_id: clean(media.id, 200),
    mime_type: clean(media.mime_type, 160),
    filename: clean(media.filename || `${type}-${message.id || 'atasament'}`, 300),
    caption: clean(media.caption, 1000),
    sha256: clean(media.sha256, 200),
    status: 'pending_download',
  }
}

function normalizeWebhookMessages(payload) {
  const rows = []
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value || {}
      const contacts = new Map((Array.isArray(value.contacts) ? value.contacts : []).map(contact => [String(contact.wa_id || ''), contact]))
      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        const phone = clean(message.from, 80)
        const contact = contacts.get(phone) || {}
        rows.push({
          provider_message_id: clean(message.id, 300),
          phone_number_id: clean(value.metadata?.phone_number_id, 100),
          from_phone: phone,
          contact_name: clean(contact.profile?.name, 300),
          message_type: clean(message.type, 40),
          body: messageText(message),
          attachment: attachmentFor(message),
          received_at: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : nowIso(),
          raw_type: clean(change?.field, 80),
        })
      }
    }
  }
  return rows
}

function storeWebhook(payload, db = readDb()) {
  const store = ensureWhatsApp(db)
  const eventHash = crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex')
  if (store.events.some(event => event.hash === eventHash)) return { imported: 0, duplicate: true }
  const received = normalizeWebhookMessages(payload)
  let imported = 0
  for (const message of received) {
    if (!message.provider_message_id || store.messages.some(row => row.provider_message_id === message.provider_message_id)) continue
    store.messages.unshift({ id: crypto.randomUUID(), ...message, status: 'unread', lead_id: null, cancelled_at: null, created_at: nowIso() })
    imported += 1
  }
  store.events.unshift({ id: crypto.randomUUID(), hash: eventHash, received_at: nowIso(), messages: received.length })
  store.events = store.events.slice(0, 500)
  store.messages = store.messages.slice(0, 5000)
  return { imported, duplicate: false }
}

webhookRouter.get('/', (req, res) => {
  const config = settingsFor(readDb())
  const mode = clean(req.query?.['hub.mode'], 40)
  const token = clean(req.query?.['hub.verify_token'], 300)
  const challenge = String(req.query?.['hub.challenge'] || '')
  if (mode === 'subscribe' && config.verify_token && safeEqual(token, config.verify_token)) return res.status(200).send(challenge)
  return res.status(403).send('Webhook WhatsApp neverificat.')
})

webhookRouter.post('/', (req, res) => {
  const db = readDb()
  const config = settingsFor(db)
  if (!config.enabled || !config.app_secret || !signatureIsValid(req, config.app_secret)) return res.status(401).send('Semnătură WhatsApp invalidă.')
  const result = storeWebhook(req.body || {}, db)
  addAudit(db, { id: 'whatsapp-webhook', name: 'WhatsApp Business' }, 'whatsapp_webhook_received', `${result.imported} mesaje primite`)
  writeDb(db)
  return sendJson(res, 200, { ok: true })
})

router.get('/messaging/whatsapp/status', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !hasMessagingPermission(auth, res, 'messaging:admin')) return
    const store = ensureWhatsApp(auth.db)
    sendJson(res, 200, { settings: publicSettings(auth.db), unread: store.messages.filter(row => row.status === 'unread' && !row.cancelled_at).length, total: store.messages.filter(row => !row.cancelled_at).length })
  } catch (error) { next(error) }
})

router.put('/messaging/whatsapp/settings', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !hasMessagingPermission(auth, res, 'messaging:admin')) return
    const previous = settingsFor(auth.db)
    const body = req.body || {}
    const mergeSecret = (key) => body[key] === undefined || clean(body[key], 1000) === '' ? previous[key] : clean(body[key], 1000)
    auth.db.settings = auth.db.settings || {}
    auth.db.settings.whatsapp_business = {
      enabled: body.enabled === true,
      phone_number_id: clean(body.phone_number_id, 100),
      display_phone_number: clean(body.display_phone_number, 80),
      verify_token: encryptSettingSecret(mergeSecret('verify_token')),
      app_secret: encryptSettingSecret(mergeSecret('app_secret')),
      access_token: encryptSettingSecret(mergeSecret('access_token')),
      created_at: previous.created_at || nowIso(),
      updated_at: nowIso(),
      updated_by: auth.user.id,
    }
    addAudit(auth.db, auth.user, 'whatsapp_business_settings_updated', `Integrare WhatsApp Business ${body.enabled ? 'activată' : 'dezactivată'}`)
    writeDb(auth.db)
    sendJson(res, 200, { settings: publicSettings(auth.db) })
  } catch (error) { next(error) }
})

router.get('/messaging/whatsapp/inbox', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !hasMessagingPermission(auth, res, 'messaging:view')) return
    const status = clean(req.query?.status, 30)
    const q = clean(req.query?.q, 200).toLowerCase()
    const rows = ensureWhatsApp(auth.db).messages.filter(row => !row.cancelled_at)
      .filter(row => !status || row.status === status)
      .filter(row => !q || [row.contact_name, row.from_phone, row.body, row.attachment?.filename].join(' ').toLowerCase().includes(q))
      .slice(0, 300)
    sendJson(res, 200, { messages: rows, settings: publicSettings(auth.db) })
  } catch (error) { next(error) }
})

router.patch('/messaging/whatsapp/inbox/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !hasMessagingPermission(auth, res, 'messaging:view')) return
    const message = ensureWhatsApp(auth.db).messages.find(row => String(row.id) === String(req.params.id) && !row.cancelled_at)
    if (!message) return sendJson(res, 404, { error: 'Mesajul WhatsApp nu a fost găsit.' })
    const status = clean(req.body?.status, 30)
    if (!['unread', 'read', 'archived'].includes(status)) return sendJson(res, 400, { error: 'Status WhatsApp invalid.' })
    message.status = status
    message.updated_at = nowIso()
    writeDb(auth.db)
    sendJson(res, 200, { message })
  } catch (error) { next(error) }
})

router.post('/messaging/whatsapp/inbox/:id/lead', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !hasMessagingPermission(auth, res, 'messaging:view')) return
    if (!requirePermission(auth, res, 'crm:lead_create')) return
    if (!isCrmModuleEnabled(auth.db, global.LICENTA || {})) return sendJson(res, 409, { error: 'Modulul CRM trebuie activat înainte de crearea lead-urilor din WhatsApp.' })
    const message = ensureWhatsApp(auth.db).messages.find(row => String(row.id) === String(req.params.id) && !row.cancelled_at)
    if (!message) return sendJson(res, 404, { error: 'Mesajul WhatsApp nu a fost găsit.' })
    if (message.lead_id) return sendJson(res, 200, { lead_id: message.lead_id, already_linked: true })
    const title = clean(req.body?.title || `Solicitare WhatsApp — ${message.contact_name || message.from_phone || 'contact nou'}`, 300)
    const description = [message.body, message.attachment?.filename ? `Atașament WhatsApp: ${message.attachment.filename}` : '', `Număr WhatsApp: ${message.from_phone || '-'}`].filter(Boolean).join('\n')
    const payload = normalizeLeadPayload({ source: 'whatsapp', title, description, source_reference: message.provider_message_id })
    const lead = crmRepository.createLead(payload, auth.user.id)
    message.lead_id = lead.id
    message.updated_at = nowIso()
    addAudit(auth.db, auth.user, 'whatsapp_lead_created', `Lead #${lead.id} creat din mesaj WhatsApp ${message.provider_message_id}`)
    writeDb(auth.db)
    sendJson(res, 201, { lead, message })
  } catch (error) { next(error) }
})

module.exports = { router, webhookRouter, ensureWhatsApp, normalizeWebhookMessages, signatureIsValid, publicSettings }
