const { Router } = require('express')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { DB_MODE, getMssqlRelationalStatus, writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const taskRouter = require('../tasks/routes')
const repository = require('./repository')
const quoteRepository = require('./quote-repository')
const orderRepository = require('./order-repository')
const inventoryCheckRepository = require('./inventory-check-repository')
const { inventoryPort, procurementPort, billingPort } = require('./ports')
const billingDocumentRepository = require('./billing-document-repository')
const { testConnection: testOblioConnection, emitInvoice: emitOblioInvoice, emitProforma: emitOblioProforma } = require('./ports/oblio')
const { normalizeQuote } = require('./quote-service')
const { sendEmail, recordOutboundEmail } = require('../messaging/email')
const { persistQuoteDocument, readQuoteDocument } = require('./quote-document')
const { createPublicToken, tokenHash } = require('./public-service')
const {
  buildCrmHealth, compactText, isValidEmail,
  normalizeLeadPayload, normalizeAccountPayload, normalizeContactPayload, normalizeActivityPayload
} = require('./service')

const router = Router()

function actorId(user) { return String(user?.id || user?.userId || user?.username || '') }
function taskRows(db) { return Array.isArray(db?.taskManagement?.tasks) ? db.taskManagement.tasks : [] }
function apiError(res, error, fallback) {
  const status = Number(error?.status)
  if (status >= 400 && status < 500) return res.status(status).json({ error: error?.message || fallback })
  // Detaliile driverului MSSQL pot expune SQL intern și nu trebuie trimise în browser.
  console.error(`[CRM] ${fallback}`, error)
  return res.status(500).json({ error: fallback })
}

function requireCrm(req, res, permission = 'crm:view') {
  const auth = requireAuth(req, res)
  if (!auth) return null
  if (!requirePermission(auth, res, permission)) return null
  const health = buildCrmHealth({
    db: auth.db,
    license: global.LICENTA || auth.db.settings?.license || {},
    dbMode: DB_MODE,
    relationalStatus: ['mssql', 'sqlserver'].includes(DB_MODE) ? getMssqlRelationalStatus() : null
  })
  if (!health.module_enabled) {
    res.status(403).json({ error: 'Modulul CRM nu este activ pentru această organizație.', code: 'CRM_MODULE_DISABLED', ...health })
    return null
  }
  if (!health.schema.ready) {
    res.status(503).json({ error: health.schema.reason, code: 'CRM_RELATIONAL_SCHEMA_UNAVAILABLE', ...health })
    return null
  }
  return auth
}

function ensureActiveUser(db, userId) {
  if (!userId) return
  const found = (db.users || []).find(user => String(user.id || user.userId || user.username) === String(userId) && user.active !== false && user.active !== 0)
  if (!found) throw Object.assign(new Error('Responsabilul selectat nu este un utilizator activ.'), { status: 422 })
}

function ensureLeadRelations(payload) {
  if (payload.lead_id != null) {
    const lead = repository.getLead(payload.lead_id, [])
    if (!lead) throw Object.assign(new Error('Lead-ul selectat nu există.'), { status: 422 })
  }
  if (payload.account_id != null) {
    const account = repository.findAccount(payload.account_id)
    if (!account || account.cancelled_at) throw Object.assign(new Error('Prospectul/clientul selectat nu există.'), { status: 422 })
  }
  if (payload.contact_id != null) {
    const contact = repository.findContact(payload.contact_id)
    if (!contact || contact.cancelled_at) throw Object.assign(new Error('Contactul selectat nu există.'), { status: 422 })
    if (payload.account_id != null && String(contact.account_id) !== String(payload.account_id)) throw Object.assign(new Error('Contactul nu aparține prospectului/clientului selectat.'), { status: 422 })
  }
}

function auditWrite(auth, action, details) {
  addAudit(auth.db, auth.user, action, details)
  writeDb(auth.db)
}

function publicBaseUrl(req, db) {
  const configured = String(db?.settings?.publicUrl || db?.settings?.public_url || db?.settings?.cloudflareTunnelUrl || '').trim().replace(/\/+$/, '')
  if (/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^?#]*)?$/i.test(configured)) return configured
  const host = String(req.get('host') || '').trim()
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) throw Object.assign(new Error('Adresa publică a aplicației nu este configurată corect.'), { status: 422 })
  const forwarded = String(req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase()
  return `${forwarded === 'https' || req.protocol === 'https' ? 'https' : 'http'}://${host}`
}

function publicLinkExpiry(value) {
  const raw = value == null || value === '' ? 14 : Number(value)
  if (!Number.isInteger(raw) || raw < 1 || raw > 90) throw Object.assign(new Error('Valabilitatea linkului trebuie să fie între 1 și 90 de zile.'), { status: 422 })
  return new Date(Date.now() + raw * 24 * 60 * 60 * 1000).toISOString()
}

function publicLinkResponse(req, db, token, link) {
  return { link, url: `${publicBaseUrl(req, db)}/oferta/${encodeURIComponent(token)}` }
}

function decorateLeadsWithTasks(leads, db) {
  const tasks = taskRows(db).filter(task => String(task.source_type) === 'crm_lead' && ['open', 'in_progress', 'blocked'].includes(String(task.status || 'open')))
  return (leads || []).map(lead => {
    const next = tasks.filter(task => String(task.source_id) === String(lead.id)).sort((a, b) => String(a.due_date || '9999-12-31').localeCompare(String(b.due_date || '9999-12-31')))[0]
    return { ...lead, next_follow_up: next?.due_date || null }
  })
}

function leadAudit(db, leadId) {
  return (Array.isArray(db?.audit) ? db.audit : [])
    .filter(entry => String(entry?.action || '').startsWith('crm:') && String(JSON.stringify(entry?.details || {})).includes(`\"leadId\":${Number(leadId)}`))
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
    .slice(0, 30)
}
function quoteAudit(db, quoteId) {
  return (Array.isArray(db?.audit) ? db.audit : [])
    .filter(entry => String(entry?.action || '').startsWith('crm:') && String(JSON.stringify(entry?.details || {})).includes(`\"quoteId\":${Number(quoteId)}`))
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
    .slice(0, 50)
}

router.get('/crm/health', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'crm:view')) return
  const health = buildCrmHealth({ db: auth.db, license: global.LICENTA || auth.db.settings?.license || {}, dbMode: DB_MODE, relationalStatus: ['mssql', 'sqlserver'].includes(DB_MODE) ? getMssqlRelationalStatus() : null })
  if (!health.module_enabled) return res.status(403).json({ error: 'Modulul CRM nu este activ pentru această organizație.', code: 'CRM_MODULE_DISABLED', ...health })
  if (!health.schema.ready) return res.status(503).json({ error: health.schema.reason, code: 'CRM_RELATIONAL_SCHEMA_UNAVAILABLE', ...health })
  return res.status(200).json({ ok: true, ...health })
})

router.get('/crm/dashboard', (req, res) => {
  const auth = requireCrm(req, res)
  if (!auth) return
  try {
    const quoteCounts = quoteRepository.listQuotes({}).reduce((counts, quote) => ({ ...counts, [quote.status]: (counts[quote.status] || 0) + 1 }), {})
    const orderCounts = orderRepository.listOrders({}).reduce((counts, order) => ({ ...counts, [order.status]: (counts[order.status] || 0) + 1 }), {})
    return res.json({
      pipeline: {
        pending_approval: quoteCounts.pending_approval || 0,
        awaiting_customer: (quoteCounts.approved || 0) + (quoteCounts.sent || 0),
        accepted: quoteCounts.accepted || 0,
        confirmed_orders: orderCounts.confirmed || 0
      }
    })
  } catch (error) { return apiError(res, error, 'Fluxul comercial nu a putut fi încărcat.') }
})

router.get('/crm/leads', (req, res) => {
  const auth = requireCrm(req, res)
  if (!auth) return
  try { res.json({ leads: decorateLeadsWithTasks(repository.listLeads(req.query || {}), auth.db) }) } catch (error) { apiError(res, error, 'Lead-urile nu au putut fi încărcate.') }
})

router.post('/crm/leads', (req, res) => {
  const auth = requireCrm(req, res, 'crm:lead_create')
  if (!auth) return
  try {
    const payload = normalizeLeadPayload(req.body || {})
    ensureLeadRelations(payload)
    ensureActiveUser(auth.db, payload.assigned_to)
    const lead = repository.createLead(payload, actorId(auth.user))
    auditWrite(auth, 'crm:lead_created', { leadId: lead.id, source: lead.source, assigned_to: lead.assigned_to })
    res.status(201).json({ lead })
  } catch (error) { apiError(res, error, 'Lead-ul nu a putut fi creat.') }
})

router.get('/crm/leads/:id', (req, res) => {
  const auth = requireCrm(req, res)
  if (!auth) return
  try {
    const lead = repository.getLead(req.params.id, taskRows(auth.db))
    if (!lead) return res.status(404).json({ error: 'Lead-ul nu a fost găsit.' })
    return res.json({ lead: { ...lead, audit: leadAudit(auth.db, lead.id) } })
  } catch (error) { return apiError(res, error, 'Fișa lead-ului nu a putut fi încărcată.') }
})

function editLead(req, res) {
  const auth = requireCrm(req, res, 'crm:lead_manage')
  if (!auth) return
  try {
    const previous = repository.getLead(req.params.id, taskRows(auth.db))
    if (!previous) return res.status(404).json({ error: 'Lead-ul nu a fost găsit.' })
    const payload = normalizeLeadPayload(req.body || {}, { partial: true })
    ensureLeadRelations(payload)
    ensureActiveUser(auth.db, payload.assigned_to)
    const lead = repository.updateLead(req.params.id, payload, actorId(auth.user))
    if (!lead) return res.status(404).json({ error: 'Lead-ul nu mai este disponibil.' })
    const statusChanged = payload.status && payload.status !== previous.status
    const assigneeChanged = Object.prototype.hasOwnProperty.call(payload, 'assigned_to') && String(payload.assigned_to || '') !== String(previous.assigned_to || '')
    addAudit(auth.db, auth.user, 'crm:lead_updated', { leadId: lead.id })
    if (statusChanged) addAudit(auth.db, auth.user, 'crm:lead_status_changed', { leadId: lead.id, previous_status: previous.status, status: lead.status })
    if (assigneeChanged) addAudit(auth.db, auth.user, 'crm:lead_assignee_changed', { leadId: lead.id, assigned_to: lead.assigned_to })
    writeDb(auth.db)
    return res.json({ lead })
  } catch (error) { return apiError(res, error, 'Lead-ul nu a putut fi actualizat.') }
}
router.put('/crm/leads/:id', editLead)
router.patch('/crm/leads/:id', editLead)

router.post('/crm/leads/:id/cancel', (req, res) => {
  const auth = requireCrm(req, res, 'crm:lead_manage')
  if (!auth) return
  try {
    const reason = compactText(req.body?.reason || req.body?.cancelled_reason, 500)
    if (!reason) return res.status(422).json({ error: 'Motivul anulării este obligatoriu.' })
    const result = repository.cancelLead(req.params.id, reason, actorId(auth.user))
    if (!result?.cancelled) return res.status(404).json({ error: 'Lead-ul nu a fost găsit sau era deja anulat.' })
    auditWrite(auth, 'crm:lead_cancelled', { leadId: req.params.id, reason })
    return res.json({ ok: true })
  } catch (error) { return apiError(res, error, 'Lead-ul nu a putut fi anulat.') }
})

router.post('/crm/leads/:id/convert', (req, res) => {
  const auth = requireCrm(req, res, 'crm:lead_manage')
  if (!auth) return
  try {
    const existing = repository.getLead(req.params.id, taskRows(auth.db))
    if (!existing) return res.status(404).json({ error: 'Lead-ul nu a fost găsit.' })
    const body = req.body || {}
    const account = body.account || {}
    const contact = body.contact || {}
    if (account.email && !isValidEmail(account.email)) return res.status(422).json({ error: 'Emailul prospectului este invalid.' })
    if (contact.email && !isValidEmail(contact.email)) return res.status(422).json({ error: 'Emailul contactului este invalid.' })
    const status = ['qualified', 'converted'].includes(String(body.status || 'qualified')) ? String(body.status || 'qualified') : null
    if (!status) return res.status(422).json({ error: 'Statusul conversiei este invalid.' })
    const requestedAccountId = body.account_id === '' || body.account_id == null ? null : Number(body.account_id)
    const requestedContactId = body.contact_id === '' || body.contact_id == null ? null : Number(body.contact_id)
    if (requestedAccountId != null || requestedContactId != null) {
      if (requestedAccountId != null && (!Number.isInteger(requestedAccountId) || requestedAccountId < 1)) return res.status(422).json({ error: 'Prospectul selectat este invalid.' })
      if (requestedContactId != null && (!Number.isInteger(requestedContactId) || requestedContactId < 1)) return res.status(422).json({ error: 'Contactul selectat este invalid.' })
      const accountId = requestedAccountId ?? existing.account_id
      const contactId = requestedContactId ?? existing.contact_id
      ensureLeadRelations({ account_id: accountId, contact_id: contactId })
      const lead = repository.updateLead(req.params.id, { account_id: accountId, contact_id: contactId, status, qualification_status: 'qualified' }, actorId(auth.user))
      auditWrite(auth, 'crm:lead_converted', { leadId: lead.id, accountId: lead.account_id, contactId: lead.contact_id, status: lead.status, linked_existing: true })
      return res.json({ lead })
    }
    const lead = repository.convertLead(req.params.id, { account, contact, status }, actorId(auth.user))
    if (!lead) return res.status(404).json({ error: 'Lead-ul nu a putut fi convertit.' })
    if (!existing.account_id) addAudit(auth.db, auth.user, 'crm:account_created', { accountId: lead.account_id, source: 'lead_conversion' })
    if (!existing.contact_id && lead.contact_id) addAudit(auth.db, auth.user, 'crm:contact_created', { contactId: lead.contact_id, accountId: lead.account_id, source: 'lead_conversion' })
    auditWrite(auth, 'crm:lead_converted', { leadId: lead.id, accountId: lead.account_id, contactId: lead.contact_id, status: lead.status })
    return res.json({ lead })
  } catch (error) { return apiError(res, error, 'Conversia lead-ului nu a putut fi finalizată.') }
})

router.post('/crm/leads/:id/follow-up', (req, res) => {
  const auth = requireCrm(req, res, 'crm:lead_manage')
  if (!auth) return
  try {
    const lead = repository.getLead(req.params.id, taskRows(auth.db))
    if (!lead) return res.status(404).json({ error: 'Lead-ul nu a fost găsit.' })
    const body = req.body || {}
    const assignedTo = body.assigned_to || lead.assigned_to || actorId(auth.user)
    ensureActiveUser(auth.db, assignedTo)
    const task = taskRouter.createLinkedTask({
      db: auth.db,
      user: auth.user,
      permissions: auth.permissions,
      payload: {
        title: body.title || `Follow-up: ${lead.title}`,
        description: body.description || `Urmărește lead-ul CRM #${lead.id}: ${lead.title}`,
        assigned_to: assignedTo,
        priority: body.priority || 'normal',
        due_date: body.due_date,
        source_type: 'crm_lead',
        source_id: String(lead.id),
        source_label: lead.title,
        source_url: `/crm/leads/${lead.id}`
      }
    })
    const activity = repository.createActivity(normalizeActivityPayload({
      lead_id: lead.id,
      account_id: lead.account_id,
      contact_id: lead.contact_id,
      activity_type: 'follow_up_result',
      subject: 'Follow-up creat',
      notes: body.notes || null,
      task_reference: task.id
    }), actorId(auth.user))
    auditWrite(auth, 'crm:follow_up_created', { leadId: lead.id, taskId: task.id, activityId: activity.id, assigned_to: task.assigned_to })
    return res.status(201).json({ task, activity })
  } catch (error) { return apiError(res, error, 'Follow-up-ul nu a putut fi creat.') }
})

router.get('/crm/accounts', (req, res) => {
  const auth = requireCrm(req, res)
  if (!auth) return
  try { res.json({ accounts: repository.listAccounts(req.query || {}) }) } catch (error) { apiError(res, error, 'Prospectele nu au putut fi încărcate.') }
})

router.post('/crm/accounts', (req, res) => {
  const auth = requireCrm(req, res, 'crm:lead_manage')
  if (!auth) return
  try {
    const payload = normalizeAccountPayload(req.body || {})
    ensureActiveUser(auth.db, payload.owner_user_id)
    const account = repository.createAccount(payload, actorId(auth.user))
    auditWrite(auth, 'crm:account_created', { accountId: account.id, name: account.name })
    res.status(201).json({ account })
  } catch (error) { apiError(res, error, 'Prospectul/clientul nu a putut fi creat.') }
})

router.get('/crm/accounts/:id', (req, res) => {
  const auth = requireCrm(req, res)
  if (!auth) return
  try {
    const account = repository.getAccount(req.params.id)
    if (!account) return res.status(404).json({ error: 'Prospectul/clientul nu a fost găsit.' })
    return res.json({ account, contacts: repository.listContacts({ account_id: req.params.id }) })
  } catch (error) { return apiError(res, error, 'Fișa prospectului nu a putut fi încărcată.') }
})

function editAccount(req, res) {
  const auth = requireCrm(req, res, 'crm:lead_manage')
  if (!auth) return
  try {
    const payload = normalizeAccountPayload(req.body || {}, { partial: true })
    ensureActiveUser(auth.db, payload.owner_user_id)
    const account = repository.updateAccount(req.params.id, payload, actorId(auth.user))
    if (!account) return res.status(404).json({ error: 'Prospectul/clientul nu a fost găsit.' })
    auditWrite(auth, 'crm:account_updated', { accountId: account.id, name: account.name })
    return res.json({ account })
  } catch (error) { return apiError(res, error, 'Prospectul/clientul nu a putut fi actualizat.') }
}
router.put('/crm/accounts/:id', editAccount)
router.patch('/crm/accounts/:id', editAccount)

router.get('/crm/contacts', (req, res) => {
  const auth = requireCrm(req, res)
  if (!auth) return
  try { res.json({ contacts: repository.listContacts(req.query || {}) }) } catch (error) { apiError(res, error, 'Contactele nu au putut fi încărcate.') }
})

router.post('/crm/contacts', (req, res) => {
  const auth = requireCrm(req, res, 'crm:lead_manage')
  if (!auth) return
  try {
    const payload = normalizeContactPayload(req.body || {})
    if (payload.account_id != null) ensureLeadRelations({ account_id: payload.account_id })
    const contact = repository.createContact(payload, actorId(auth.user))
    auditWrite(auth, 'crm:contact_created', { contactId: contact.id, accountId: contact.account_id, name: contact.display_name })
    res.status(201).json({ contact })
  } catch (error) { apiError(res, error, 'Contactul nu a putut fi creat.') }
})

function editContact(req, res) {
  const auth = requireCrm(req, res, 'crm:lead_manage')
  if (!auth) return
  try {
    const payload = normalizeContactPayload(req.body || {}, { partial: true })
    if (payload.account_id != null) ensureLeadRelations({ account_id: payload.account_id })
    const contact = repository.updateContact(req.params.id, payload, actorId(auth.user))
    if (!contact) return res.status(404).json({ error: 'Contactul nu a fost găsit.' })
    auditWrite(auth, 'crm:contact_updated', { contactId: contact.id, accountId: contact.account_id, name: contact.display_name })
    return res.json({ contact })
  } catch (error) { return apiError(res, error, 'Contactul nu a putut fi actualizat.') }
}
router.put('/crm/contacts/:id', editContact)
router.patch('/crm/contacts/:id', editContact)

router.get('/crm/activities', (req, res) => {
  const auth = requireCrm(req, res)
  if (!auth) return
  try { res.json({ activities: repository.listActivities(req.query || {}) }) } catch (error) { apiError(res, error, 'Activitățile nu au putut fi încărcate.') }
})

router.post('/crm/activities', (req, res) => {
  const auth = requireCrm(req, res, 'crm:lead_manage')
  if (!auth) return
  try {
    const payload = normalizeActivityPayload(req.body || {})
    ensureLeadRelations(payload)
    const activity = repository.createActivity(payload, actorId(auth.user))
    auditWrite(auth, 'crm:activity_created', { activityId: activity.id, leadId: activity.lead_id, type: activity.activity_type })
    res.status(201).json({ activity })
  } catch (error) { apiError(res, error, 'Activitatea nu a putut fi adăugată.') }
})

router.get('/crm/quotes', (req, res) => {
  const auth = requireCrm(req, res); if (!auth) return
  try { return res.json({ quotes: quoteRepository.listQuotes(req.query || {}) }) } catch (error) { return apiError(res, error, 'Ofertele nu au putut fi încărcate.') }
})

// Ecranul Oferte are nevoie de listă, clienți, contacte și uneori de fișa
// selectată. Le citim într-o singură execuție SQL ca să nu serializăm procese
// PowerShell pe instalările cu autentificare Windows.
router.get('/crm/quotes/workspace', (req, res) => {
  const auth = requireCrm(req, res); if (!auth) return
  try {
    const workspace = quoteRepository.quoteWorkspace(req.query || {})
    const customerOrder = workspace.quote ? orderRepository.getOrderForQuote(workspace.quote.id) : null
    const inventoryCheck = customerOrder ? inventoryCheckRepository.latestCheck(customerOrder.id) : null
    const procurementRequirements = customerOrder
      ? (auth.db.departmentRequests || []).filter(item => String(item.source_type) === 'crm_customer_order' && String(item.source_id) === String(customerOrder.id) && !item.cancelled_at && !item.cancelledAt)
      : []
    return res.json({
      quotes: workspace.quotes || [],
      accounts: workspace.accounts || [],
      contacts: workspace.contacts || [],
      quote: workspace.quote || null,
      public_links: workspace.public_links || [],
      customer_order: customerOrder,
      inventory_check: inventoryCheck,
      procurement_requirements: procurementRequirements,
      audit: workspace.quote ? quoteAudit(auth.db, workspace.quote.id) : []
    })
  } catch (error) { return apiError(res, error, 'Spațiul de lucru pentru oferte nu a putut fi încărcat.') }
})

router.post('/crm/quotes', (req, res) => {
  const auth = requireCrm(req, res, 'crm:quote_create'); if (!auth) return
  try {
    const payload = normalizeQuote(req.body || {})
    if (!payload.lines?.length) return res.status(422).json({ error: 'Oferta trebuie să conțină cel puțin o poziție.' })
    ensureLeadRelations(payload); ensureActiveUser(auth.db, payload.responsible_user_id)
    const id = quoteRepository.createQuote(payload, actorId(auth.user))
    const quote = quoteRepository.getQuote(id)
    auditWrite(auth, 'crm:quote_created', { quoteId: id, quote_number: quote?.quote_number, lines: payload.lines.length })
    return res.status(201).json({ quote })
  } catch (error) { return apiError(res, error, 'Oferta nu a putut fi creată.') }
})

router.get('/crm/quotes/:id', (req, res) => {
  const auth = requireCrm(req, res); if (!auth) return
  try { const quote = quoteRepository.getQuote(req.params.id); if (!quote) return res.status(404).json({ error: 'Oferta nu a fost găsită.' }); return res.json({ quote, audit: quoteAudit(auth.db, req.params.id) }) } catch (error) { return apiError(res, error, 'Fișa ofertei nu a putut fi încărcată.') }
})

router.patch('/crm/quotes/:id', (req, res) => {
  const auth = requireCrm(req, res, 'crm:quote_create'); if (!auth) return
  try { const existing = quoteRepository.getQuote(req.params.id); if (!existing) return res.status(404).json({ error: 'Oferta nu a fost găsită.' }); if (existing.status !== 'draft') return res.status(409).json({ error: 'Oferta aprobată sau trimisă nu se editează; creează o revizie nouă.' }); const payload = normalizeQuote(req.body || {}); if (!payload.lines?.length) return res.status(422).json({ error: 'Oferta trebuie să conțină cel puțin o poziție.' }); ensureLeadRelations(payload); const id = quoteRepository.updateQuote(existing.id, payload, actorId(auth.user)); addAudit(auth.db, auth.user, 'crm:quote_updated', { quoteId: existing.id, revision: existing.revision_number }); addAudit(auth.db, auth.user, 'crm:quote_lines_changed', { quoteId: existing.id, lines: payload.lines.length }); writeDb(auth.db); return res.json({ quote: quoteRepository.getQuote(id) }) } catch (error) { return apiError(res, error, 'Oferta nu a putut fi actualizată.') }
})

router.post('/crm/quotes/:id/revision', (req, res) => {
  const auth = requireCrm(req, res, 'crm:quote_create'); if (!auth) return
  try { const existing = quoteRepository.getQuote(req.params.id); if (!existing) return res.status(404).json({ error: 'Oferta nu a fost găsită.' }); if (!['approved', 'sent', 'accepted', 'declined', 'rejected_internal'].includes(existing.status)) return res.status(409).json({ error: 'Revizia nouă se creează dintr-o ofertă finalizată sau respinsă.' }); const id = quoteRepository.createRevision(existing.id, actorId(auth.user)); const quote = quoteRepository.getQuote(id); auditWrite(auth, 'crm:quote_revision_created', { quoteId: id, sourceQuoteId: existing.id, revision: quote?.revision_number }); return res.status(201).json({ quote }) } catch (error) { return apiError(res, error, 'Revizia nu a putut fi creată.') }
})

router.get('/crm/quotes/:id/public-links', (req, res) => {
  const auth = requireCrm(req, res, 'crm:view'); if (!auth) return
  try {
    const quote = quoteRepository.getQuote(req.params.id)
    if (!quote) return res.status(404).json({ error: 'Oferta nu a fost găsită.' })
    return res.json({ links: quoteRepository.listPublicLinks(quote.id) })
  } catch (error) { return apiError(res, error, 'Linkurile publice nu au putut fi încărcate.') }
})

router.post('/crm/quotes/:id/public-link', (req, res) => {
  const auth = requireCrm(req, res, 'crm:quote_send'); if (!auth) return
  try {
    const quote = quoteRepository.getQuote(req.params.id)
    if (!quote) return res.status(404).json({ error: 'Oferta nu a fost găsită.' })
    if (!['approved', 'sent'].includes(String(quote.status))) return res.status(409).json({ error: 'Linkul public poate fi creat numai pentru o ofertă aprobată sau trimisă.' })
    const token = createPublicToken()
    const expiresAt = publicLinkExpiry(req.body?.expires_in_days)
    const link = quoteRepository.createPublicLink(quote.id, quote.revision_number, tokenHash(token), expiresAt, actorId(auth.user))
    auditWrite(auth, 'crm:quote_public_link_created', { quoteId: quote.id, revision: quote.revision_number, linkId: link.id, expires_at: link.expires_at })
    return res.status(201).json(publicLinkResponse(req, auth.db, token, link))
  } catch (error) { return apiError(res, error, 'Linkul public nu a putut fi creat.') }
})

router.post('/crm/quotes/:id/public-links/:linkId/revoke', (req, res) => {
  const auth = requireCrm(req, res, 'crm:quote_send'); if (!auth) return
  try {
    const quote = quoteRepository.getQuote(req.params.id)
    if (!quote) return res.status(404).json({ error: 'Oferta nu a fost găsită.' })
    const result = quoteRepository.revokePublicLink(quote.id, req.params.linkId, actorId(auth.user))
    if (!result?.changed) return res.status(404).json({ error: 'Linkul activ nu a fost găsit.' })
    auditWrite(auth, 'crm:quote_public_link_revoked', { quoteId: quote.id, revision: quote.revision_number, linkId: Number(req.params.linkId) })
    return res.json({ ok: true })
  } catch (error) { return apiError(res, error, 'Linkul public nu a putut fi revocat.') }
})

router.post('/crm/quotes/:id/generate-document', (req, res) => {
  const auth = requireCrm(req, res, 'crm:quote_create'); if (!auth) return
  try {
    const quote = quoteRepository.getQuote(req.params.id)
    if (!quote) return res.status(404).json({ error: 'Oferta nu a fost găsită.' })
    const document = persistQuoteDocument(quote, auth.db.settings?.company || auth.db.settings || {})
    quoteRepository.setDocumentPath(quote.id, document.documentPath, actorId(auth.user))
    auditWrite(auth, 'crm:quote_document_generated', { quoteId: quote.id, revision: quote.revision_number, document_kind: 'html_print_ready', document_path: document.documentPath })
    return res.json({ quote_id: quote.id, revision: quote.revision_number, html: document.html, document_path: document.documentPath, print_ready: true })
  } catch (error) { return apiError(res, error, 'Documentul ofertei nu a putut fi generat.') }
})

router.get('/crm/quotes/:id/document', (req, res) => {
  const auth = requireCrm(req, res, 'crm:view'); if (!auth) return
  try {
    const quote = quoteRepository.getQuote(req.params.id)
    if (!quote) return res.status(404).json({ error: 'Oferta nu a fost găsită.' })
    let html = readQuoteDocument(quote.document_path)
    if (!html) {
      const document = persistQuoteDocument(quote, auth.db.settings?.company || auth.db.settings || {})
      quoteRepository.setDocumentPath(quote.id, document.documentPath, actorId(auth.user))
      html = document.html
      auditWrite(auth, 'crm:quote_document_generated', { quoteId: quote.id, revision: quote.revision_number, document_kind: 'html_print_ready', document_path: document.documentPath, generated_on_read: true })
    }
    res.type('html').send(html)
  } catch (error) { return apiError(res, error, 'Documentul ofertei nu a putut fi deschis.') }
})

router.post('/crm/quotes/:id/submit-approval', (req, res) => {
  const auth = requireCrm(req, res, 'crm:quote_create'); if (!auth) return
  try { const quote = quoteRepository.getQuote(req.params.id); if (!quote) return res.status(404).json({ error: 'Oferta nu a fost găsită.' }); if (quote.status !== 'draft') return res.status(409).json({ error: 'Doar ofertele draft pot fi trimise spre aprobare.' }); if (!quote.lines?.length) return res.status(422).json({ error: 'Oferta are nevoie de cel puțin o poziție.' }); const result = quoteRepository.changeStatus(quote.id, 'pending_approval', actorId(auth.user)); auditWrite(auth, 'crm:quote_submitted_approval', { quoteId: quote.id }); return res.json({ quote: result }) } catch (error) { return apiError(res, error, 'Oferta nu a putut fi trimisă spre aprobare.') }
})

router.post('/crm/quotes/:id/approve', (req, res) => {
  const auth = requireCrm(req, res, 'crm:quote_approve'); if (!auth) return
  try { const quote = quoteRepository.getQuote(req.params.id); if (!quote) return res.status(404).json({ error: 'Oferta nu a fost găsită.' }); if (quote.status !== 'pending_approval') return res.status(409).json({ error: 'Doar ofertele în aprobare pot fi aprobate.' }); const result = quoteRepository.changeStatus(quote.id, 'approved', actorId(auth.user), { approved: true, lock: true }); auditWrite(auth, 'crm:quote_approved', { quoteId: quote.id }); return res.json({ quote: result }) } catch (error) { return apiError(res, error, 'Oferta nu a putut fi aprobată.') }
})

router.post('/crm/quotes/:id/reject', (req, res) => {
  const auth = requireCrm(req, res, 'crm:quote_approve'); if (!auth) return
  try { const quote = quoteRepository.getQuote(req.params.id); if (!quote) return res.status(404).json({ error: 'Oferta nu a fost găsită.' }); if (quote.status !== 'pending_approval') return res.status(409).json({ error: 'Doar ofertele în aprobare pot fi respinse.' }); const reason = compactText(req.body?.reason, 500); const result = quoteRepository.changeStatus(quote.id, 'rejected_internal', actorId(auth.user)); auditWrite(auth, 'crm:quote_rejected_internal', { quoteId: quote.id, revision: quote.revision_number, reason }); return res.json({ quote: result }) } catch (error) { return apiError(res, error, 'Oferta nu a putut fi respinsă.') }
})

router.post('/crm/quotes/:id/cancel', (req, res) => {
  const auth = requireCrm(req, res, 'crm:quote_create'); if (!auth) return
  try { const reason = compactText(req.body?.reason, 500); if (!reason) return res.status(422).json({ error: 'Motivul anulării este obligatoriu.' }); const result = quoteRepository.cancelQuote(req.params.id, reason, actorId(auth.user)); if (!result?.changed) return res.status(404).json({ error: 'Oferta nu a fost găsită.' }); auditWrite(auth, 'crm:quote_cancelled', { quoteId: req.params.id, reason }); return res.json({ ok: true }) } catch (error) { return apiError(res, error, 'Oferta nu a putut fi anulată.') }
})

// Sprint 5 păstrează comanda în CRM şi copiază numai snapshot-ul ofertei
// acceptate. Stocul, aprovizionarea şi facturarea vor folosi porturi distincte.
router.get('/crm/customer-orders', (req, res) => {
  const auth = requireCrm(req, res, 'crm:order_manage'); if (!auth) return
  try { return res.json({ orders: orderRepository.listOrders(req.query || {}) }) } catch (error) { return apiError(res, error, 'Comenzile clienților nu au putut fi încărcate.') }
})

router.get('/crm/customer-orders/:id', (req, res) => {
  const auth = requireCrm(req, res, 'crm:order_manage'); if (!auth) return
  try {
    const order = orderRepository.getOrder(req.params.id)
    if (!order) return res.status(404).json({ error: 'Comanda client nu a fost găsită.' })
    return res.json({ order })
  } catch (error) { return apiError(res, error, 'Comanda client nu a putut fi încărcată.') }
})

router.post('/crm/quotes/:id/customer-order', (req, res) => {
  const auth = requireCrm(req, res, 'crm:order_manage'); if (!auth) return
  try {
    const quote = quoteRepository.getQuote(req.params.id)
    if (!quote) return res.status(404).json({ error: 'Oferta nu a fost găsită.' })
    if (quote.status !== 'accepted') return res.status(409).json({ error: 'Comanda client poate fi creată numai dintr-o ofertă acceptată.' })
    const order = orderRepository.createFromAcceptedQuote(quote.id, actorId(auth.user))
    if (!order) throw new Error('Comanda client nu a fost creată.')
    if (!order.already_created) auditWrite(auth, 'crm:customer_order_created', { orderId: order.id, order_number: order.order_number, quoteId: quote.id, revision: quote.revision_number, decisionId: order.source_decision_id })
    return res.status(order.already_created ? 200 : 201).json({ order, idempotent: Boolean(order.already_created) })
  } catch (error) { return apiError(res, error, 'Comanda client nu a putut fi creată.') }
})

router.post('/crm/customer-orders/:id/cancel', (req, res) => {
  const auth = requireCrm(req, res, 'crm:order_manage'); if (!auth) return
  try {
    const reason = compactText(req.body?.reason, 500)
    if (!reason) return res.status(422).json({ error: 'Motivul anulării este obligatoriu.' })
    const order = orderRepository.getOrder(req.params.id)
    if (!order) return res.status(404).json({ error: 'Comanda client nu a fost găsită.' })
    const result = orderRepository.cancelOrder(order.id, reason, actorId(auth.user))
    if (!result?.changed) return res.status(409).json({ error: 'Comanda client era deja anulată.' })
    auditWrite(auth, 'crm:customer_order_cancelled', { orderId: order.id, order_number: order.order_number, quoteId: order.source_quote_id, revision: order.source_quote_revision, reason })
    return res.json({ ok: true })
  } catch (error) { return apiError(res, error, 'Comanda client nu a putut fi anulată.') }
})

// Sprint 6: verificarea este un snapshot informativ. Nu scade și nu rezervă
// automat stocul; alegerea de rezervare rămâne în regulile Gestiunii.
router.get('/crm/customer-orders/:id/inventory-check', (req, res) => {
  const auth = requireCrm(req, res, 'crm:inventory_check'); if (!auth) return
  try {
    const order = orderRepository.getOrder(req.params.id)
    if (!order) return res.status(404).json({ error: 'Comanda client nu a fost găsită.' })
    return res.json({ check: inventoryCheckRepository.latestCheck(order.id) })
  } catch (error) { return apiError(res, error, 'Verificarea stocului nu a putut fi încărcată.') }
})

router.post('/crm/customer-orders/:id/inventory-check', (req, res) => {
  const auth = requireCrm(req, res, 'crm:inventory_check'); if (!auth) return
  try {
    const order = orderRepository.getOrder(req.params.id)
    if (!order) return res.status(404).json({ error: 'Comanda client nu a fost găsită.' })
    if (order.status !== 'confirmed') return res.status(409).json({ error: 'Stocul se verifică numai pentru o comandă client confirmată.' })
    const result = inventoryPort.invoke({ order, db: auth.db })
    const check = inventoryCheckRepository.recordCheck(order.id, result, actorId(auth.user))
    auditWrite(auth, 'crm:customer_order_inventory_checked', { orderId: order.id, order_number: order.order_number, quoteId: order.source_quote_id, revision: order.source_quote_revision, inventoryCheckId: check.id, status: result.check_status, shortages: result.summary.shortage_lines, unmapped: result.summary.unmapped_lines, reservation: 'none' })
    return res.status(201).json({ check })
  } catch (error) { return apiError(res, error, 'Stocul nu a putut fi verificat.') }
})

router.post('/crm/customer-orders/:id/procurement-requirements', (req, res) => {
  const auth = requireCrm(req, res, 'crm:procurement_request'); if (!auth) return
  try {
    const order = orderRepository.getOrder(req.params.id)
    if (!order) return res.status(404).json({ error: 'Comanda client nu a fost găsită.' })
    const inventoryCheck = inventoryCheckRepository.latestCheck(order.id)
    if (!inventoryCheck?.result) return res.status(409).json({ error: 'Rulează mai întâi verificarea stocului pentru această comandă.' })
    if (!inventoryCheck.result.procurement_candidates?.length) return res.status(422).json({ error: 'Nu există deficit mapat pentru care să poată fi creat un necesar.' })
    const result = procurementPort.invoke({ db: auth.db, user: auth.user, order, inventoryCheck })
    auditWrite(auth, 'crm:customer_order_procurement_requested', { orderId: order.id, order_number: order.order_number, quoteId: order.source_quote_id, revision: order.source_quote_revision, inventoryCheckId: inventoryCheck.id, requirementIds: result.requirements.map(item => item.id), created: result.created || 0, idempotent: result.already_created })
    return res.status(result.already_created ? 200 : 201).json({ ...result, inventory_check_id: inventoryCheck.id })
  } catch (error) { return apiError(res, error, 'Necesarul de aprovizionare nu a putut fi creat.') }
})

// Sprint 7: proforma este document comercial; factura este doar draft în
// Contabilitate. Nici validarea, nici e-Factura nu pornesc din CRM.
router.get('/crm/customer-orders/:id/billing-documents', (req, res) => {
  const auth = requireCrm(req, res, 'crm:billing_request'); if (!auth) return
  try {
    const order = orderRepository.getOrder(req.params.id)
    if (!order) return res.status(404).json({ error: 'Comanda client nu a fost găsită.' })
    return res.json({ documents: billingDocumentRepository.listForOrder(order.id) })
  } catch (error) { return apiError(res, error, 'Documentele de facturare nu au putut fi încărcate.') }
})

router.get('/crm/billing/clients', (req, res) => {
  const auth = requireCrm(req, res, 'crm:billing_request'); if (!auth) return
  const clients = (auth.db.accounting?.thirdParties || [])
    .filter(item => item.activ !== false && ['client', 'ambele'].includes(String(item.tip || '')))
    .map(item => ({ id: item.id, denumire: item.denumire, cui: item.cui || '', cod: item.cod || '' }))
    .sort((left, right) => String(left.denumire).localeCompare(String(right.denumire), 'ro'))
  return res.json({ clients })
})

// Legarea terțului contabil ține de pregătirea facturării comenzii, nu de
// administrarea generală a prospectului. Contabilitatea nu primește astfel
// dreptul de a modifica celelalte date comerciale CRM.
router.patch('/crm/customer-orders/:id/accounting-third-party', (req, res) => {
  const auth = requireCrm(req, res, 'crm:billing_request'); if (!auth) return
  try {
    const order = orderRepository.getOrder(req.params.id)
    if (!order) return res.status(404).json({ error: 'Comanda client nu a fost găsită.' })
    const requestedId = req.body?.accounting_third_party_id
    const thirdPartyId = requestedId === '' || requestedId == null ? null : Number(requestedId)
    if (requestedId !== '' && requestedId != null && (!Number.isInteger(thirdPartyId) || thirdPartyId <= 0)) return res.status(422).json({ error: 'Terțul contabil selectat nu este valid.' })
    const thirdParty = thirdPartyId == null ? null : (auth.db.accounting?.thirdParties || []).find(item => Number(item.id) === thirdPartyId && item.activ !== false && ['client', 'ambele'].includes(String(item.tip || '')))
    if (thirdPartyId != null && !thirdParty) return res.status(422).json({ error: 'Terțul contabil selectat nu este disponibil pentru facturare.' })
    const account = repository.updateAccount(order.account_id, { accounting_third_party_id: thirdPartyId }, actorId(auth.user))
    if (!account) return res.status(404).json({ error: 'Clientul CRM al comenzii nu a fost găsit.' })
    auditWrite(auth, 'crm:customer_order_accounting_party_linked', { orderId: order.id, order_number: order.order_number, accountId: order.account_id, accounting_third_party_id: thirdPartyId, accounting_third_party_name: thirdParty?.denumire || null })
    return res.json({ account_id: account.id, accounting_third_party_id: account.accounting_third_party_id || null })
  } catch (error) { return apiError(res, error, 'Terțul contabil nu a putut fi legat de comandă.') }
})

router.post('/crm/billing/oblio/test', async (req, res) => {
  const auth = requireCrm(req, res, 'crm:settings'); if (!auth) return
  try {
    const result = await testOblioConnection(auth.db.settings || {})
    auditWrite(auth, 'crm:oblio_connection_tested', { provider: 'oblio', ok: true })
    return res.json(result)
  } catch (error) { return apiError(res, error, 'Conexiunea Oblio nu a putut fi verificată.') }
})

router.post('/crm/customer-orders/:id/proforma', (req, res) => {
  const auth = requireCrm(req, res, 'crm:billing_request'); if (!auth) return
  try {
    const order = orderRepository.getOrder(req.params.id)
    if (!order) return res.status(404).json({ error: 'Comanda client nu a fost găsită.' })
    if (order.status !== 'confirmed') return res.status(409).json({ error: 'Proforma se poate crea numai pentru o comandă client confirmată.' })
    const result = billingPort.createProforma({ order, actor: actorId(auth.user) })
    auditWrite(auth, 'crm:customer_order_proforma_created', { orderId: order.id, order_number: order.order_number, quoteId: order.source_quote_id, revision: order.source_quote_revision, billingDocumentId: result.document.id, idempotent: result.idempotent })
    return res.status(result.idempotent ? 200 : 201).json(result)
  } catch (error) { return apiError(res, error, 'Proforma nu a putut fi creată.') }
})

router.post('/crm/customer-orders/:id/invoice-draft', (req, res) => {
  const auth = requireCrm(req, res, 'crm:billing_request'); if (!auth) return
  try {
    const order = orderRepository.getOrder(req.params.id)
    if (!order) return res.status(404).json({ error: 'Comanda client nu a fost găsită.' })
    if (order.status !== 'confirmed') return res.status(409).json({ error: 'Factura draft se poate crea numai pentru o comandă client confirmată.' })
    const result = billingPort.createInvoiceDraft({ db: auth.db, user: auth.user, order, actor: actorId(auth.user) })
    auditWrite(auth, 'crm:customer_order_invoice_draft_created', { orderId: order.id, order_number: order.order_number, quoteId: order.source_quote_id, revision: order.source_quote_revision, billingDocumentId: result.document.id, accountingInvoiceUuid: result.invoice?.uuid || result.document.response?.invoice?.uuid || null, idempotent: result.idempotent })
    return res.status(result.idempotent ? 200 : 201).json(result)
  } catch (error) { return apiError(res, error, 'Factura draft nu a putut fi creată.') }
})

router.post('/crm/customer-orders/:id/oblio/invoice', async (req, res) => {
  const auth = requireCrm(req, res, 'crm:billing_request'); if (!auth) return
  try {
    if (req.body?.confirmed !== true) return res.status(422).json({ error: 'Confirmă emiterea facturii reale în Oblio.' })
    const order = orderRepository.getOrder(req.params.id)
    if (!order || order.status !== 'confirmed') return res.status(409).json({ error: 'Factura Oblio se emite numai dintr-o comandă client confirmată.' })
    const result = await emitOblioInvoice({ db: auth.db, order, actor: actorId(auth.user) })
    auditWrite(auth, 'crm:oblio_invoice_issued', { orderId: order.id, billingDocumentId: result.document.id, providerDocumentId: result.document.provider_document_id, idempotent: result.idempotent })
    return res.status(result.idempotent ? 200 : 201).json(result)
  } catch (error) { return apiError(res, error, 'Factura nu a putut fi emisă în Oblio.') }
})

router.post('/crm/customer-orders/:id/oblio/proforma', async (req, res) => {
  const auth = requireCrm(req, res, 'crm:billing_request')
  if (!auth) return
  try {
    if (req.body?.confirmed !== true) return res.status(422).json({ error: 'Confirmă emiterea proformei Oblio.' })
    const order = orderRepository.getOrder(req.params.id)
    if (!order) return res.status(404).json({ error: 'Comanda client nu a fost găsită.' })
    const result = await emitOblioProforma({ db: auth.db, order, actor: actorId(auth.user) })
    auditWrite(auth, 'crm:oblio_proforma_issued', { orderId: order.id, billingDocumentId: result.document.id, providerDocumentId: result.document.provider_document_id, idempotent: result.idempotent })
    return res.status(result.idempotent ? 200 : 201).json(result)
  } catch (error) { return apiError(res, error, 'Proforma Oblio nu a putut fi emisă.') }
})

router.post('/crm/quotes/:id/send', async (req, res) => {
  const auth = requireCrm(req, res, 'crm:quote_send'); if (!auth) return
  try {
    const quote = quoteRepository.getQuote(req.params.id)
    if (!quote) return res.status(404).json({ error: 'Oferta nu a fost găsită.' })
    if (quote.status !== 'approved') return res.status(409).json({ error: 'Se trimit numai oferte aprobate.' })
    const to = compactText(req.body?.to || quote.contact_email || quote.account_email, 254)
    if (!isValidEmail(to) || !to) return res.status(422).json({ error: 'Este necesar emailul valid al destinatarului.' })
    const subject = compactText(req.body?.subject || `Oferta ${quote.quote_number} / Rev. ${quote.revision_number}`, 300)
    let body = compactText(req.body?.body || `<p>Bună ziua,</p><p>Vă transmitem oferta ${quote.quote_number}.</p>`, 10000)
    let publicLink = null
    if (req.body?.include_public_link === true) {
      const token = createPublicToken()
      const expiresAt = publicLinkExpiry(req.body?.public_link_expires_in_days)
      publicLink = quoteRepository.createPublicLink(quote.id, quote.revision_number, tokenHash(token), expiresAt, actorId(auth.user))
      const publicUrl = publicLinkResponse(req, auth.db, token, publicLink).url
      body = `${body}<p><a href="${publicUrl}">Deschide oferta în siguranță</a></p>`
    }
    const document = persistQuoteDocument(quote, auth.db.settings?.company || auth.db.settings || {})
    quoteRepository.setDocumentPath(quote.id, document.documentPath, actorId(auth.user))
    const attachments = [{ filename: document.fileName, content: document.html, contentType: 'text/html' }]
    try {
      await sendEmail({ to, cc: compactText(req.body?.cc, 500) || undefined, bcc: compactText(req.body?.bcc, 500) || undefined, subject, body, attachments }, auth.db)
    } catch (error) {
      if (publicLink) quoteRepository.revokePublicLink(quote.id, publicLink.id, actorId(auth.user))
      throw error
    }
    const result = quoteRepository.changeStatus(quote.id, 'sent', actorId(auth.user), { sent: true, lock: true })
    const email = recordOutboundEmail(auth.db, { to, cc: req.body?.cc, bcc: req.body?.bcc, subject, body, category: 'general', source_type: 'crm_quote', source_id: quote.id, source_label: `${quote.quote_number} / Rev. ${quote.revision_number}`, source_url: `/crm/oferte/${quote.id}`, attachments, created_by: actorId(auth.user) })
    repository.createActivity(normalizeActivityPayload({ account_id: quote.account_id, contact_id: quote.contact_id, activity_type: 'email', occurred_at: new Date().toISOString(), subject: `Ofertă trimisă: ${quote.quote_number}`, notes: subject, email_reference: String(email.id) }), actorId(auth.user))
    auditWrite(auth, 'crm:quote_sent', { quoteId: quote.id, revision: quote.revision_number, to, emailId: email.id, document_path: document.documentPath, publicLinkId: publicLink?.id || null })
    return res.json({ quote: result, email: { id: email.id, source_url: email.source_url } })
  } catch (error) { return apiError(res, error, 'Oferta nu a putut fi trimisă.') }
})

module.exports = router
