const CRM_MODULE_KEY = 'crm'
const LEAD_SOURCES = ['web', 'email', 'manual', 'phone', 'import', 'api', 'referral']
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost']
const QUALIFICATION_STATUSES = ['pending', 'qualified', 'unqualified']
const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note', 'follow_up_result']
const CRM_REQUIRED_TABLES = [
  'leads', 'accounts', 'contacts', 'activities', 'quotes', 'quote_lines',
  'quote_public_links', 'quote_decisions', 'customer_orders',
  'customer_order_lines', 'inventory_checks', 'billing_documents', 'integration_events'
]

function normalizedModuleKeys(license = {}) {
  return [...(Array.isArray(license.module) ? license.module : []), ...(Array.isArray(license.modules) ? license.modules : []), ...(Array.isArray(license.addons) ? license.addons : [])]
    .map(value => String(value || '').trim().toLowerCase())
    .filter(Boolean)
}

function licenseAllowsCrm(license = {}) {
  const modules = normalizedModuleKeys(license)
  return !modules.length || modules.includes('all') || modules.includes('full') || modules.some(key => ['crm', 'sales', 'sales_automation'].includes(key))
}

function isCrmModuleEnabled(db = {}, license = {}) {
  if (!licenseAllowsCrm(license)) return false
  const configured = db?.settings?.modules_enabled
  if (!Array.isArray(configured) || !configured.length) return true
  return configured.map(value => String(value || '').trim().toLowerCase()).includes(CRM_MODULE_KEY)
}

function schemaStatus({ dbMode = 'json', relationalStatus = null, tables = [] } = {}) {
  const normalizedMode = String(dbMode || 'json').trim().toLowerCase()
  if (!['mssql', 'sqlserver'].includes(normalizedMode)) {
    return { supported: false, ready: false, reason: 'CRM necesită MSSQL relațional; nu este creată o copie paralelă în DB_MODE=json.', missing_tables: CRM_REQUIRED_TABLES.map(table => `crm.${table}`) }
  }
  const available = new Set((tables.length ? tables : relationalStatus?.tables || []).map(value => String(value || '').toLowerCase()))
  const missing = CRM_REQUIRED_TABLES.filter(table => !available.has(`crm.${table}`) && !available.has(table))
  return { supported: true, ready: !missing.length, reason: missing.length ? 'Migrarea CRM nu este aplicată complet.' : '', missing_tables: missing.map(table => `crm.${table}`) }
}

function buildCrmHealth({ db = {}, license = {}, dbMode = 'json', relationalStatus = null } = {}) {
  const moduleEnabled = isCrmModuleEnabled(db, license)
  const schema = schemaStatus({ dbMode, relationalStatus })
  return {
    module: CRM_MODULE_KEY,
    module_enabled: moduleEnabled,
    database_mode: String(dbMode || 'json').toLowerCase(),
    schema,
    operational: moduleEnabled && schema.ready,
    next_step: !moduleEnabled ? 'Activează modulul CRM din Setări → Module.' : (!schema.ready ? 'Aplică/repornește actualizarea pentru a rula migrarea CRM.' : 'Fundația CRM este pregătită pentru următorul sprint.')
  }
}

function assertSoftCancellation(entity = {}) {
  return {
    has_cancelled_at: Object.prototype.hasOwnProperty.call(entity, 'cancelled_at'),
    has_cancelled_by: Object.prototype.hasOwnProperty.call(entity, 'cancelled_by'),
    has_cancelled_reason: Object.prototype.hasOwnProperty.call(entity, 'cancelled_reason')
  }
}

function compactText(value, max = 500) {
  return String(value == null ? '' : value).trim().slice(0, max)
}

function optionalText(value, max = 500) {
  const text = compactText(value, max)
  return text || null
}

function isValidEmail(value) {
  const text = compactText(value, 254)
  return !text || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
}

function toOptionalMoney(value) {
  if (value === '' || value == null) return null
  const normalized = Number(String(value).replace(',', '.'))
  return Number.isFinite(normalized) && normalized >= 0 ? Math.round(normalized * 100) / 100 : NaN
}

function validDate(value) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(String(value))
}

function normalizeLeadPayload(body = {}, { partial = false } = {}) {
  const payload = {}
  const source = body.source != null ? compactText(body.source, 40).toLowerCase() : undefined
  const status = body.status != null ? compactText(body.status, 40).toLowerCase() : undefined
  const qualification = body.qualification_status != null ? compactText(body.qualification_status, 40).toLowerCase() : undefined
  const subject = body.subject ?? body.title
  if (!partial || subject != null) {
    const title = compactText(subject, 300)
    if (!title) throw Object.assign(new Error('Titlul lead-ului este obligatoriu.'), { status: 422 })
    payload.title = title
  }
  if (!partial || source != null) {
    if (!LEAD_SOURCES.includes(source || 'manual')) throw Object.assign(new Error('Sursa lead-ului este invalidă.'), { status: 422 })
    payload.source = source || 'manual'
  }
  if (!partial || status != null) {
    if (!LEAD_STATUSES.includes(status || 'new')) throw Object.assign(new Error('Statusul lead-ului este invalid.'), { status: 422 })
    payload.status = status || 'new'
  }
  if (!partial || qualification != null) {
    if (!QUALIFICATION_STATUSES.includes(qualification || 'pending')) throw Object.assign(new Error('Starea de calificare este invalidă.'), { status: 422 })
    payload.qualification_status = qualification || 'pending'
  }
  if (payload.status === 'lost' || status === 'lost') {
    const reason = optionalText(body.lost_reason, 500)
    if (!reason) throw Object.assign(new Error('Motivul pierderii este obligatoriu când lead-ul este pierdut.'), { status: 422 })
    payload.lost_reason = reason
  } else if (body.lost_reason != null) payload.lost_reason = optionalText(body.lost_reason, 500)
  if (body.description != null) payload.description = optionalText(body.description, 4000)
  if (body.message != null && body.description == null) payload.description = optionalText(body.message, 4000)
  if (body.source_reference != null) payload.source_reference = optionalText(body.source_reference, 200)
  if (body.account_id != null) payload.account_id = body.account_id === '' ? null : Number(body.account_id)
  if (body.contact_id != null) payload.contact_id = body.contact_id === '' ? null : Number(body.contact_id)
  if (body.assigned_to != null || body.responsible_user_id != null) payload.assigned_to = optionalText(body.assigned_to ?? body.responsible_user_id, 80)
  if (body.estimated_value != null) {
    const value = toOptionalMoney(body.estimated_value)
    if (Number.isNaN(value)) throw Object.assign(new Error('Valoarea estimată trebuie să fie un număr pozitiv.'), { status: 422 })
    payload.estimated_value = value
  }
  if (body.notes != null) payload.notes = optionalText(body.notes, 4000)
  if (body.expected_close_date != null) {
    if (!validDate(body.expected_close_date)) throw Object.assign(new Error('Data estimată de închidere este invalidă.'), { status: 422 })
    payload.expected_close_date = optionalText(body.expected_close_date, 10)
  }
  return payload
}

function normalizeAccountPayload(body = {}, { partial = false } = {}) {
  const payload = {}
  const name = body.name ?? body.denumire
  if (!partial || name != null) {
    const normalized = compactText(name, 300)
    if (!normalized) throw Object.assign(new Error('Denumirea prospectului/clientului este obligatorie.'), { status: 422 })
    payload.name = normalized
  }
  const type = body.type ?? body.lifecycle_status
  if (!partial || type != null) {
    const normalized = compactText(type || 'prospect', 30).toLowerCase()
    if (!['prospect', 'customer'].includes(normalized)) throw Object.assign(new Error('Tipul account-ului este invalid.'), { status: 422 })
    payload.lifecycle_status = normalized
  }
  for (const key of ['tax_id', 'email', 'phone', 'website', 'address', 'city', 'country_code', 'industry', 'notes', 'owner_user_id', 'accounting_third_party_id']) {
    if (body[key] == null) continue
    payload[key] = key === 'accounting_third_party_id' ? (body[key] === '' ? null : Number(body[key])) : optionalText(body[key], key === 'notes' ? 4000 : 500)
  }
  if (body.accounting_party_id != null && body.accounting_third_party_id == null) {
    payload.accounting_third_party_id = body.accounting_party_id === '' ? null : Number(body.accounting_party_id)
  }
  if (body.status != null && type == null) {
    const normalized = compactText(body.status, 30).toLowerCase()
    if (!['prospect', 'customer'].includes(normalized)) throw Object.assign(new Error('Statusul account-ului este invalid.'), { status: 422 })
    payload.lifecycle_status = normalized
  }
  if (payload.email != null && !isValidEmail(payload.email)) throw Object.assign(new Error('Emailul account-ului este invalid.'), { status: 422 })
  if (payload.accounting_third_party_id != null && (!Number.isInteger(payload.accounting_third_party_id) || payload.accounting_third_party_id < 1)) throw Object.assign(new Error('Terțul contabil selectat este invalid.'), { status: 422 })
  return payload
}

function normalizeContactPayload(body = {}, { partial = false } = {}) {
  const payload = {}
  const firstName = body.first_name ?? body.prenume
  const lastName = body.last_name ?? body.nume
  const displayName = body.display_name ?? body.name ?? [firstName, lastName].filter(Boolean).join(' ')
  if (!partial || displayName) {
    const normalized = compactText(displayName, 320)
    if (!normalized) throw Object.assign(new Error('Numele contactului este obligatoriu.'), { status: 422 })
    payload.display_name = normalized
  }
  if (firstName != null) payload.first_name = optionalText(firstName, 160)
  if (lastName != null) payload.last_name = optionalText(lastName, 160)
  for (const key of ['account_id', 'job_title', 'email', 'phone', 'mobile', 'notes', 'status', 'is_primary']) {
    if (body[key] == null) continue
    payload[key] = key === 'account_id' ? (body[key] === '' ? null : Number(body[key])) : key === 'is_primary' ? Boolean(body[key]) : optionalText(body[key], key === 'notes' ? 4000 : 500)
  }
  if (payload.email != null && !isValidEmail(payload.email)) throw Object.assign(new Error('Emailul contactului este invalid.'), { status: 422 })
  if (payload.account_id != null && (!Number.isInteger(payload.account_id) || payload.account_id < 1)) throw Object.assign(new Error('Prospectul/clientul selectat este invalid.'), { status: 422 })
  if (payload.status != null && !['active', 'inactive'].includes(payload.status.toLowerCase())) throw Object.assign(new Error('Statusul contactului este invalid.'), { status: 422 })
  return payload
}

function normalizeActivityPayload(body = {}) {
  const activity_type = compactText(body.activity_type, 40).toLowerCase()
  if (!ACTIVITY_TYPES.includes(activity_type)) throw Object.assign(new Error('Tipul activității este invalid.'), { status: 422 })
  const subject = compactText(body.subject, 300)
  if (!subject) throw Object.assign(new Error('Subiectul activității este obligatoriu.'), { status: 422 })
  const occurredAt = optionalText(body.occurred_at, 40)
  if (occurredAt && Number.isNaN(Date.parse(occurredAt))) throw Object.assign(new Error('Data activității este invalidă.'), { status: 422 })
  const numericId = (value, label) => {
    if (value === '' || value == null) return null
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) throw Object.assign(new Error(`${label} selectat este invalid.`), { status: 422 })
    return parsed
  }
  return {
    activity_type,
    subject,
    notes: optionalText(body.notes, 4000),
    outcome: optionalText(body.outcome, 500),
    occurred_at: occurredAt || new Date().toISOString(),
    lead_id: numericId(body.lead_id, 'Lead-ul'),
    account_id: numericId(body.account_id, 'Prospectul/clientul'),
    contact_id: numericId(body.contact_id, 'Contactul'),
    task_reference: optionalText(body.task_reference, 120),
    email_reference: optionalText(body.email_reference, 120),
    document_reference: optionalText(body.document_reference, 120)
  }
}

module.exports = { CRM_MODULE_KEY, CRM_REQUIRED_TABLES, LEAD_SOURCES, LEAD_STATUSES, QUALIFICATION_STATUSES, ACTIVITY_TYPES, normalizedModuleKeys, licenseAllowsCrm, isCrmModuleEnabled, schemaStatus, buildCrmHealth, assertSoftCancellation, compactText, isValidEmail, normalizeLeadPayload, normalizeAccountPayload, normalizeContactPayload, normalizeActivityPayload }
