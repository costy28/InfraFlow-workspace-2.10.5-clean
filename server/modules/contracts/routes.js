const { Router } = require('express')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const xlsx = require('xlsx')
const { requireAuth } = require('../../core/auth')
const { requireAnyPermission } = require('../../core/permissions')
const { writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')

const router = Router()
const ROOT = path.resolve(__dirname, '../../..')
const CONTRACT_STORAGE_DIR = path.join(ROOT, 'storage', 'contracts')
const CONTRACT_UPLOAD_BYTES = 20 * 1024 * 1024
const CONTRACT_ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.webp'])
const contractUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: CONTRACT_UPLOAD_BYTES } })

const VIEW_PERMISSIONS = [
  'legal:contracts',
  'procurement:view',
  'accounting:view',
  'controlling:view',
  'system:view'
]

const MANAGE_PERMISSIONS = [
  'legal:manage',
  'procurement_orders:create',
  'accounting:manage',
  'controlling:budget_manage',
  'system:admin'
]

function sendJson(res, status, data) {
  res.status(status).json(data)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatPrintDate(value) {
  if (!value) return '-'
  const raw = String(value).slice(0, 10)
  const [year, month, day] = raw.split('-')
  if (!year || !month || !day) return escapeHtml(raw)
  return `${day}.${month}.${year}`
}

function formatPrintMoney(value, currency = 'RON') {
  const amount = Number(value || 0)
  return `${amount.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${escapeHtml(currency || 'RON')}`
}

function printBadge(value, tone = 'gray') {
  return `<span class="badge ${escapeHtml(tone)}">${escapeHtml(value || '-')}</span>`
}

function ensureContractsDb(db) {
  if (!db.contractManagement || typeof db.contractManagement !== 'object') {
    db.contractManagement = {}
  }
  const cm = db.contractManagement
  cm.contracts = Array.isArray(cm.contracts) ? cm.contracts : []
  cm.consumptions = Array.isArray(cm.consumptions) ? cm.consumptions : []
  cm.alerts = Array.isArray(cm.alerts) ? cm.alerts : []
  cm.tasks = Array.isArray(cm.tasks) ? cm.tasks : []
  cm.attachments = Array.isArray(cm.attachments) ? cm.attachments : []
  cm.addenda = Array.isArray(cm.addenda) ? cm.addenda : []
  return cm
}

function ensureTicketsDb(db) {
  db.tickets = db.tickets || {}
  db.tickets.tickets = Array.isArray(db.tickets.tickets) ? db.tickets.tickets : []
  db.tickets.comments = Array.isArray(db.tickets.comments) ? db.tickets.comments : []
  db.tickets.attachments = Array.isArray(db.tickets.attachments) ? db.tickets.attachments : []
  db.tickets.escalations = Array.isArray(db.tickets.escalations) ? db.tickets.escalations : []
  return db.tickets
}

function nextNumericId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1
}

function nowIso() {
  return new Date().toISOString()
}

function todayIso() {
  return nowIso().slice(0, 10)
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
}

function safeFileName(value) {
  const name = path.basename(String(value || 'document').replace(/\\/g, '/'))
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'document'
}

function ensureContractStorageDir() {
  fs.mkdirSync(CONTRACT_STORAGE_DIR, { recursive: true })
}

function createContractAttachmentFromUpload(db, contract, file, body = {}, user = {}, defaults = {}) {
  const cm = ensureContractsDb(db)
  if (!file?.buffer) return { error: 'Fișierul este obligatoriu.' }
  const ext = path.extname(file.originalname || '').toLowerCase()
  if (!CONTRACT_ALLOWED_EXT.has(ext)) return { error: 'Sunt acceptate doar PDF, DOC/DOCX, XLS/XLSX și imagini.' }
  const safeName = safeFileName(file.originalname || `contract${ext}`)
  const storedName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`
  ensureContractStorageDir()
  fs.writeFileSync(path.join(CONTRACT_STORAGE_DIR, storedName), file.buffer)

  const attachment = {
    id: defaults.id || id('ctr-file'),
    uuid: crypto.randomUUID(),
    contract_id: contract.id,
    file_path: `storage/contracts/${storedName}`,
    file_name: safeName,
    original_name: file.originalname || safeName,
    file_size: file.size || file.buffer.length,
    mime_type: file.mimetype || 'application/octet-stream',
    categorie: String(body?.categorie || body?.category || defaults.categorie || 'contract').trim() || 'contract',
    descriere: String(body?.descriere || body?.description || defaults.descriere || '').trim(),
    linked_entity_type: defaults.linked_entity_type || body?.linked_entity_type || body?.linkedEntityType || null,
    linked_entity_id: defaults.linked_entity_id || body?.linked_entity_id || body?.linkedEntityId || null,
    sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
    uploaded_by: user.id,
    uploaded_by_name: user.name || user.username,
    uploaded_at: nowIso(),
    created_at: nowIso()
  }
  cm.attachments.push(attachment)
  return { attachment }
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function round(value) {
  return Math.round(numberValue(value) * 100) / 100
}

function dateDaysUntil(value) {
  if (!value) return null
  const time = new Date(`${String(value).slice(0, 10)}T00:00:00`).getTime()
  if (!Number.isFinite(time)) return null
  const today = new Date(`${todayIso()}T00:00:00`).getTime()
  return Math.ceil((time - today) / 86400000)
}

function normalizeStatus(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (['draft', 'activ', 'suspendat', 'inchis', 'anulat'].includes(raw)) return raw
  return 'activ'
}

function normalizeType(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (['achizitie', 'vanzare', 'servicii', 'lucrari', 'cadru', 'altul'].includes(raw)) return raw
  return 'achizitie'
}

function normalizeContractInput(body, previous = {}) {
  const valoareContract = round(body.valoare_contract ?? body.valoareContract ?? body.value ?? previous.valoare_contract)
  const pragAvertizare = numberValue(body.prag_avertizare ?? body.pragAvertizare ?? previous.prag_avertizare, 80)
  const pragCritic = numberValue(body.prag_critic ?? body.pragCritic ?? previous.prag_critic, 90)
  const pragDepasire = numberValue(body.prag_depasire ?? body.pragDepasire ?? previous.prag_depasire, 100)
  return {
    numar: String(body.numar ?? body.nr_contract ?? body.number ?? previous.numar ?? '').trim(),
    titlu: String(body.titlu ?? body.title ?? previous.titlu ?? '').trim(),
    tip: normalizeType(body.tip ?? body.type ?? previous.tip),
    status: normalizeStatus(body.status ?? previous.status),
    partener: String(body.partener ?? body.partner ?? body.furnizor ?? body.client ?? previous.partener ?? '').trim(),
    partener_tip: String(body.partener_tip ?? body.partnerType ?? previous.partener_tip ?? '').trim() || null,
    valoare_contract: valoareContract,
    moneda: String(body.moneda ?? body.currency ?? previous.moneda ?? 'RON').trim().toUpperCase() || 'RON',
    data_semnare: String(body.data_semnare ?? body.signedDate ?? previous.data_semnare ?? '').slice(0, 10) || null,
    data_start: String(body.data_start ?? body.startDate ?? previous.data_start ?? '').slice(0, 10) || null,
    data_sfarsit: String(body.data_sfarsit ?? body.endDate ?? previous.data_sfarsit ?? '').slice(0, 10) || null,
    responsabil_id: body.responsabil_id ?? body.manager_id ?? body.responsibleId ?? previous.responsabil_id ?? null,
    responsabil_nume: String(body.responsabil_nume ?? body.manager ?? body.responsibleName ?? previous.responsabil_nume ?? '').trim(),
    departament_id: body.departament_id ?? body.departmentId ?? previous.departament_id ?? null,
    centru_cost_id: body.centru_cost_id ?? body.costCenterId ?? previous.centru_cost_id ?? null,
    cpv_cod: String(body.cpv_cod ?? body.cpv ?? previous.cpv_cod ?? '').trim(),
    cpv_denumire: String(body.cpv_denumire ?? body.cpvName ?? previous.cpv_denumire ?? '').trim(),
    paap_id: body.paap_id ?? body.paapId ?? previous.paap_id ?? null,
    prag_avertizare: Math.max(1, Math.min(100, pragAvertizare)),
    prag_critic: Math.max(1, Math.min(100, pragCritic)),
    prag_depasire: Math.max(1, pragDepasire),
    observatii: String(body.observatii ?? body.notes ?? previous.observatii ?? '').trim()
  }
}

function validateContractPayload(payload) {
  if (!payload.titlu) return 'Titlul contractului este obligatoriu.'
  if (!payload.numar) return 'Numarul contractului este obligatoriu.'
  if (payload.valoare_contract <= 0) return 'Valoarea contractului trebuie sa fie mai mare decat zero.'
  if (payload.data_start && payload.data_sfarsit && payload.data_start > payload.data_sfarsit) {
    return 'Data de inceput nu poate fi dupa data de sfarsit.'
  }
  return null
}

function normalizeAddendumType(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (['majorare', 'diminuare', 'prelungire', 'responsabil', 'conditii', 'altul'].includes(raw)) return raw
  return 'altul'
}

function normalizeAddendumInput(body, contract) {
  const tip = normalizeAddendumType(body.tip ?? body.type)
  const rawDelta = round(body.valoare_delta ?? body.valueDelta ?? body.delta ?? 0)
  const valoareDelta = tip === 'diminuare' ? -Math.abs(rawDelta) : tip === 'majorare' ? Math.abs(rawDelta) : rawDelta
  return {
    contract_id: contract.id,
    numar: String(body.numar ?? body.nr_act ?? body.number ?? '').trim(),
    data_semnare: String(body.data_semnare ?? body.signedDate ?? todayIso()).slice(0, 10) || todayIso(),
    tip,
    descriere: String(body.descriere ?? body.description ?? '').trim(),
    valoare_delta: valoareDelta,
    data_sfarsit_noua: String(body.data_sfarsit_noua ?? body.newEndDate ?? '').slice(0, 10) || null,
    responsabil_nume_nou: String(body.responsabil_nume_nou ?? body.newResponsibleName ?? '').trim(),
    atasament_id: body.atasament_id ?? body.attachmentId ?? null
  }
}

function validateAddendumPayload(payload, contract) {
  if (!payload.numar) return 'Numarul actului aditional este obligatoriu.'
  if (!payload.data_semnare) return 'Data semnarii actului aditional este obligatorie.'
  if (payload.data_sfarsit_noua && contract.data_start && payload.data_sfarsit_noua < contract.data_start) {
    return 'Noul termen nu poate fi inainte de data de inceput a contractului.'
  }
  return null
}

function normalizeConsumptionInput(contract, body) {
  const valoare = round(body.valoare ?? body.amount ?? body.total)
  return {
    contract_id: contract.id,
    data: String(body.data ?? body.date ?? todayIso()).slice(0, 10),
    sursa: String(body.sursa ?? body.source ?? 'manual').trim() || 'manual',
    sursa_id: body.sursa_id ?? body.sourceId ?? null,
    document_nr: String(body.document_nr ?? body.documentNo ?? body.nr_document ?? '').trim(),
    descriere: String(body.descriere ?? body.description ?? body.note ?? '').trim(),
    valoare,
    moneda: String(body.moneda ?? body.currency ?? contract.moneda ?? 'RON').trim().toUpperCase() || 'RON',
    cpv_cod: String(body.cpv_cod ?? body.cpv ?? contract.cpv_cod ?? '').trim()
  }
}

function validateConsumptionPayload(payload) {
  if (payload.valoare <= 0) return 'Valoarea consumului trebuie sa fie mai mare decat zero.'
  if (!payload.data) return 'Data consumului este obligatorie.'
  return null
}

function existingInvoiceConsumptions(db, contract) {
  const invoices = [
    ...(db.accounting?.invoicesIn || []),
    ...(db.accounting?.invoicesOut || []),
    ...(db.accountingInvoicesIn || []),
    ...(db.accountingInvoicesOut || []),
    ...(db.anafInvoices || []),
    ...(db.invoices || [])
  ]
  return invoices
    .filter(invoice => !invoice.cancelledAt && !invoice.cancelled_at)
    .filter(invoice => !['anulat', 'stornat', 'cancelled', 'canceled'].includes(String(invoice.status || '').toLowerCase()))
    .filter(invoice => String(invoice.contract_id || invoice.contractId || '') === String(contract.id))
    .map(invoice => ({
      id: `invoice-${invoice.id || invoice.uuid || crypto.createHash('sha1').update(JSON.stringify(invoice)).digest('hex').slice(0, 12)}`,
      contract_id: contract.id,
      data: String(invoice.data || invoice.date || invoice.issueDate || invoice.created_at || todayIso()).slice(0, 10),
      sursa: 'factura',
      sursa_id: invoice.id || invoice.uuid || null,
      document_nr: String(invoice.nr_document || invoice.nr || invoice.numar || invoice.number || invoice.documentNo || '').trim(),
      descriere: String(invoice.furnizor || invoice.client || invoice.partner || invoice.titlu || 'Factura legata de contract').trim(),
      valoare: round(invoice.total || invoice.valoare || invoice.amount || invoice.total_cu_tva || invoice.totalCuTva || 0),
      moneda: String(invoice.moneda || invoice.currency || contract.moneda || 'RON').trim().toUpperCase(),
      cpv_cod: String(invoice.cpv_cod || invoice.cpv || contract.cpv_cod || '').trim(),
      generated: true
    }))
    .filter(item => item.valoare > 0)
}

function sourceDocumentId(document) {
  return document.id || document.uuid || document.nr_nir || document.nr || document.numar || document.number || null
}

function sourceDocumentNumber(document) {
  return String(document.nr_document || document.nr || document.numar || document.number || document.documentNo || document.nr_nir || document.nrNir || document.document || document.orderNo || '').trim()
}

function sourceDocumentDate(document) {
  return String(document.data || document.date || document.issueDate || document.created_at || document.createdAt || todayIso()).slice(0, 10)
}

function sourceDocumentTotal(document) {
  if (document.total != null) return round(document.total)
  if (document.valoare != null) return round(document.valoare)
  if (document.amount != null) return round(document.amount)
  if (document.total_cu_tva != null) return round(document.total_cu_tva)
  if (document.totalCuTva != null) return round(document.totalCuTva)
  if (Array.isArray(document.lines)) {
    return round(document.lines.reduce((sum, line) => sum + numberValue(line.total ?? line.valoare_totala ?? line.valoare ?? line.cantitate_receptionata * line.pret_unitar), 0))
  }
  if (Array.isArray(document.linii)) {
    return round(document.linii.reduce((sum, line) => sum + numberValue(line.total ?? line.valoare_totala ?? line.valoare ?? line.cantitate_receptionata * line.pret_unitar), 0))
  }
  return 0
}

function existingReceiptConsumptions(db, contract) {
  const linkedInvoices = [
    ...(db.accounting?.invoicesIn || []),
    ...(db.accounting?.invoicesOut || []),
    ...(db.accountingInvoicesIn || []),
    ...(db.accountingInvoicesOut || [])
  ].filter(invoice => String(invoice.contract_id || invoice.contractId || '') === String(contract.id))
  const receipts = [
    ...(db.procurementReceipts || []),
    ...(db.gestiune?.nir || []),
    ...(db.inventory?.receipts || [])
  ]
  return receipts
    .filter(receipt => !receipt.cancelledAt && !receipt.cancelled_at && !receipt.canceled && !receipt.deleted)
    .filter(receipt => String(receipt.contract_id || receipt.contractId || '') === String(contract.id))
    .filter(receipt => !linkedInvoices.some(invoice =>
      String(invoice.id || '') === String(receipt.accounting_invoice_id || '') ||
      String(invoice.uuid || '') === String(receipt.accounting_invoice_uuid || '') ||
      (Array.isArray(invoice.source_receipt_ids) && invoice.source_receipt_ids.some(id => String(id) === String(sourceDocumentId(receipt))))
    ))
    .map(receipt => ({
      id: `receipt-${sourceDocumentId(receipt) || crypto.createHash('sha1').update(JSON.stringify(receipt)).digest('hex').slice(0, 12)}`,
      contract_id: contract.id,
      data: sourceDocumentDate(receipt),
      sursa: 'nir',
      sursa_id: sourceDocumentId(receipt),
      document_nr: sourceDocumentNumber(receipt),
      descriere: String(receipt.supplier || receipt.furnizor || receipt.partner || receipt.materialName || 'NIR legat de contract').trim(),
      valoare: sourceDocumentTotal(receipt),
      moneda: String(receipt.moneda || receipt.currency || contract.moneda || 'RON').trim().toUpperCase(),
      cpv_cod: String(receipt.cpv_cod || receipt.cpv || contract.cpv_cod || '').trim(),
      generated: true
    }))
    .filter(item => item.valoare > 0)
}

function contractConsumptions(db, contract) {
  const cm = ensureContractsDb(db)
  const manual = cm.consumptions
    .filter(item => !item.cancelled_at && !item.cancelledAt)
    .filter(item => String(item.contract_id || item.contractId) === String(contract.id))
  return [...manual, ...existingInvoiceConsumptions(db, contract), ...existingReceiptConsumptions(db, contract)]
}

function linkedSourceRecord(type, label, document, extra = {}) {
  return {
    type,
    type_label: label,
    id: sourceDocumentId(document),
    document_nr: sourceDocumentNumber(document),
    data: sourceDocumentDate(document),
    partener: sourceDocumentPartner(document),
    descriere: String(document.titlu || document.obiect || document.materialName || document.descriere || document.note || '').trim(),
    valoare: sourceDocumentTotal(document),
    moneda: String(document.moneda || document.currency || 'RON').trim().toUpperCase(),
    status: document.status || '',
    ...extra
  }
}

function contractSourceDocuments(db, contract) {
  const contractId = String(contract.id)
  const referate = (db.referate || [])
    .filter(item => !item.cancelled_at && !item.cancelledAt)
    .filter(item => String(item.contract_id || item.contractId || '') === contractId)
    .map(item => linkedSourceRecord('referat', 'Referat', item, {
      document_nr: `${item.serie || 'REF'}/${item.numar || sourceDocumentId(item) || '-'}`,
      data: String(item.data_intocmire || item.created_at || todayIso()).slice(0, 10),
      partener: item.furnizor_manual || '',
      descriere: item.observatii || '',
      valoare: round(item.valoare_referat || 0),
      source_order_id: item.comanda_id || null
    }))

  const orders = (db.procurementOrders || [])
    .filter(item => !item.cancelled_at && !item.cancelledAt && !item.deleted)
    .filter(item => String(item.contract_id || item.contractId || '') === contractId)
    .map(item => linkedSourceRecord('comanda', 'Comandă achiziții', item, {
      partener: item.supplier || item.furnizor || '',
      descriere: item.materialName || item.note || '',
      valoare: round(item.value || item.valoare || 0),
      source_referat_id: item.sourceReferatId || null
    }))

  const receipts = [
    ...(db.procurementReceipts || []),
    ...(db.gestiune?.nir || []),
    ...(db.inventory?.receipts || [])
  ]
    .filter(item => !item.cancelled_at && !item.cancelledAt && !item.canceled && !item.deleted)
    .filter(item => String(item.contract_id || item.contractId || '') === contractId)
    .map(item => linkedSourceRecord('nir', 'NIR / recepție', item, {
      partener: item.supplier || item.furnizor || '',
      descriere: item.materialName || item.observatii || '',
      valoare: sourceDocumentTotal(item),
      source_order_id: item.orderId || item.orderUuid || null
    }))

  const invoices = [
    ...(db.accounting?.invoicesIn || []),
    ...(db.accounting?.invoicesOut || []),
    ...(db.accountingInvoicesIn || []),
    ...(db.accountingInvoicesOut || []),
    ...(db.anafInvoices || []),
    ...(db.invoices || [])
  ]
    .filter(item => !item.cancelled_at && !item.cancelledAt)
    .filter(item => !['anulat', 'stornat', 'cancelled', 'canceled'].includes(String(item.status || '').toLowerCase()))
    .filter(item => String(item.contract_id || item.contractId || '') === contractId)
    .map(item => linkedSourceRecord('factura', 'Factură', item, {
      partener: item.furnizor || item.client || item.partner || '',
      descriere: item.explicatie || item.titlu || '',
      valoare: sourceDocumentTotal(item)
    }))

  const groups = [
    { type: 'referate', label: 'Referate', count: referate.length, items: referate },
    { type: 'comenzi', label: 'Comenzi achiziții', count: orders.length, items: orders },
    { type: 'nir', label: 'NIR / recepții', count: receipts.length, items: receipts },
    { type: 'facturi', label: 'Facturi', count: invoices.length, items: invoices }
  ]

  return {
    groups,
    timeline: [...referate, ...orders, ...receipts, ...invoices]
      .sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))),
    counts: groups.reduce((acc, group) => {
      acc[group.type] = group.count
      return acc
    }, {})
  }
}

function contractSummary(db, contract) {
  const consumptions = contractConsumptions(db, contract)
  const consumat = round(consumptions.reduce((sum, item) => sum + numberValue(item.valoare || item.amount), 0))
  const valoare = round(contract.valoare_contract || contract.valoareContract || contract.value)
  const procent = valoare > 0 ? round((consumat / valoare) * 100) : 0
  const ramas = round(valoare - consumat)
  const zileRamase = dateDaysUntil(contract.data_sfarsit || contract.endDate)
  const alerts = []

  if (valoare > 0 && procent >= numberValue(contract.prag_depasire, 100)) {
    alerts.push({ level: 'danger', code: 'value_exceeded', message: 'Contract depasit sau ajuns la limita valorica.', procent })
  } else if (valoare > 0 && procent >= numberValue(contract.prag_critic, 90)) {
    alerts.push({ level: 'warning', code: 'value_critical', message: 'Contract aproape de limita valorica.', procent })
  } else if (valoare > 0 && procent >= numberValue(contract.prag_avertizare, 80)) {
    alerts.push({ level: 'info', code: 'value_warning', message: 'Contract peste pragul de avertizare.', procent })
  }

  if (zileRamase !== null && zileRamase < 0 && contract.status === 'activ') {
    alerts.push({ level: 'danger', code: 'expired', message: 'Contract activ expirat calendaristic.', zile_ramase: zileRamase })
  } else if (zileRamase !== null && zileRamase <= 30 && contract.status === 'activ') {
    alerts.push({ level: 'warning', code: 'expires_soon', message: `Contractul expira in ${Math.max(zileRamase, 0)} zile.`, zile_ramase: zileRamase })
  }

  return {
    valoare_contract: valoare,
    consumat,
    ramas,
    procent,
    zile_ramase: zileRamase,
    consumuri_count: consumptions.length,
    alerts
  }
}

function contractAttachments(db, contract) {
  const cm = ensureContractsDb(db)
  return cm.attachments
    .filter(item => !item.cancelled_at && !item.cancelledAt)
    .filter(item => String(item.contract_id) === String(contract.id))
    .map(item => ({
      id: item.id,
      uuid: item.uuid,
      contract_id: item.contract_id,
      file_name: item.file_name,
      original_name: item.original_name || item.file_name,
      file_size: Number(item.file_size || 0),
      mime_type: item.mime_type || 'application/octet-stream',
      categorie: item.categorie || 'contract',
      descriere: item.descriere || '',
      linked_entity_type: item.linked_entity_type || null,
      linked_entity_id: item.linked_entity_id || null,
      sha256: item.sha256 || '',
      uploaded_by: item.uploaded_by || null,
      uploaded_by_name: item.uploaded_by_name || '',
      uploaded_at: item.uploaded_at || item.created_at || null
    }))
    .sort((a, b) => String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || '')))
}

function contractAddenda(db, contract) {
  const cm = ensureContractsDb(db)
  const attachments = contractAttachments(db, contract)
  return cm.addenda
    .filter(item => !item.cancelled_at && !item.cancelledAt)
    .filter(item => String(item.contract_id) === String(contract.id))
    .map(item => {
      const attachment = attachments.find(file => String(file.id) === String(item.atasament_id))
      return {
        id: item.id,
        uuid: item.uuid,
        contract_id: item.contract_id,
        numar: item.numar,
        data_semnare: item.data_semnare,
        tip: item.tip || 'altul',
        descriere: item.descriere || '',
        valoare_delta: round(item.valoare_delta || 0),
        valoare_contract_inainte: round(item.valoare_contract_inainte || 0),
        valoare_contract_dupa: round(item.valoare_contract_dupa || 0),
        data_sfarsit_inainte: item.data_sfarsit_inainte || null,
        data_sfarsit_dupa: item.data_sfarsit_dupa || null,
        responsabil_nume_inainte: item.responsabil_nume_inainte || '',
        responsabil_nume_dupa: item.responsabil_nume_dupa || '',
        atasament_id: item.atasament_id || null,
        atasament: attachment || null,
        created_by: item.created_by || null,
        created_by_name: item.created_by_name || '',
        created_at: item.created_at || null
      }
    })
    .sort((a, b) => String(b.data_semnare || b.created_at || '').localeCompare(String(a.data_semnare || a.created_at || '')))
}

function decorateContract(db, contract, options = {}) {
  const summary = contractSummary(db, contract)
  const decorated = {
    ...contract,
    summary,
    alerte: summary.alerts,
    procent_consum: summary.procent,
    valoare_consumata: summary.consumat,
    valoare_ramasa: summary.ramas
  }
  if (options.includeConsumptions) decorated.consumuri = contractConsumptions(db, contract)
  if (options.includeSources) decorated.documente_sursa = contractSourceDocuments(db, contract)
  if (options.includeAttachments) decorated.atasamente = contractAttachments(db, contract)
  if (options.includeAddenda) decorated.acte_aditionale = contractAddenda(db, contract)
  if (options.includeCockpit) decorated.cockpit = contractCockpit(db, contract, decorated)
  return decorated
}

function compactText(parts) {
  return parts.map(part => String(part || '').trim()).filter(Boolean).join(' · ')
}

function timelineDate(value, fallback = null) {
  const raw = String(value || fallback || '').trim()
  return raw ? raw.slice(0, 10) : null
}

function contractTimeline(db, contract, decorated, tasks = [], tickets = []) {
  const items = []
  const currency = contract.moneda || 'RON'

  items.push({
    id: `contract-created-${contract.id}`,
    type: 'contract',
    type_label: 'Contract',
    title: `Contract creat: ${contract.numar || contract.id}`,
    subtitle: compactText([contract.titlu, contract.partener]),
    date: timelineDate(contract.created_at || contract.data_semnare || contract.data_start),
    actor: contract.created_by_name || '',
    tone: 'success',
    status: contract.status || 'activ'
  })

  for (const alert of decorated.alerte || []) {
    items.push({
      id: `alert-${alert.code}-${contract.id}`,
      type: 'alert',
      type_label: 'Alertă',
      title: alert.message || 'Alertă contract',
      subtitle: compactText([alert.code, alert.procent ? `${alert.procent}% consum` : '', alert.zile_ramase !== undefined ? `${alert.zile_ramase} zile` : '']),
      date: todayIso(),
      tone: alert.level || 'info',
      status: alert.level || 'info'
    })
  }

  for (const item of decorated.documente_sursa?.timeline || []) {
    items.push({
      id: `source-${item.type}-${item.id || item.document_nr}`,
      type: `source_${item.type || 'document'}`,
      type_label: item.type_label || 'Document sursă',
      title: `${item.type_label || 'Document'} ${item.document_nr || item.id || ''}`.trim(),
      subtitle: compactText([item.partener, item.descriere, item.status]),
      date: timelineDate(item.data),
      tone: item.type === 'factura' ? 'success' : item.type === 'nir' ? 'info' : item.type === 'comanda' ? 'warning' : 'gray',
      amount: round(item.valoare || 0),
      currency: item.moneda || currency,
      document_nr: item.document_nr || item.id || '',
      status: item.status || ''
    })
  }

  for (const item of decorated.consumuri || []) {
    items.push({
      id: `consumption-${item.id || item.sursa_id || item.document_nr}`,
      type: 'consumption',
      type_label: 'Consum',
      title: `Consum ${item.document_nr || item.sursa || 'manual'}`,
      subtitle: compactText([item.descriere, item.generated ? 'generat automat' : 'manual']),
      date: timelineDate(item.data),
      tone: item.generated ? 'info' : 'gray',
      amount: round(item.valoare || 0),
      currency: item.moneda || currency,
      document_nr: item.document_nr || '',
      status: item.sursa || 'manual'
    })
  }

  for (const item of decorated.acte_aditionale || []) {
    items.push({
      id: `addendum-${item.id || item.uuid}`,
      type: 'addendum',
      type_label: 'Act adițional',
      title: `Act adițional ${item.numar || ''}`.trim(),
      subtitle: compactText([item.descriere, item.atasament ? `fișier: ${item.atasament.original_name || item.atasament.file_name}` : '']),
      date: timelineDate(item.data_semnare || item.created_at),
      actor: item.created_by_name || '',
      tone: item.tip === 'majorare' ? 'success' : item.tip === 'diminuare' ? 'warning' : 'info',
      amount: round(item.valoare_delta || 0),
      currency,
      attachment_id: item.atasament_id || null,
      attachment: item.atasament || null,
      status: item.tip || 'altul'
    })
  }

  for (const item of decorated.atasamente || []) {
    items.push({
      id: `attachment-${item.id || item.uuid}`,
      type: 'attachment',
      type_label: 'Atașament',
      title: item.original_name || item.file_name || 'Fișier contract',
      subtitle: compactText([item.categorie, item.descriere]),
      date: timelineDate(item.uploaded_at),
      actor: item.uploaded_by_name || '',
      tone: 'info',
      attachment_id: item.id,
      attachment: item,
      status: item.categorie || 'contract'
    })
  }

  for (const item of tasks || []) {
    items.push({
      id: `task-${item.id || item.uuid}`,
      type: 'task',
      type_label: 'Task',
      title: item.titlu || 'Task contract',
      subtitle: compactText([item.responsabil_nume || 'responsabil nesetat', item.descriere, item.ticket_uuid ? `ticket ${item.ticket_uuid}` : '']),
      date: timelineDate(item.created_at || item.deadline),
      actor: item.created_by_name || '',
      tone: item.overdue ? 'danger' : item.status === 'rezolvat' ? 'success' : 'warning',
      status: item.status || 'deschis'
    })
  }

  for (const item of tickets || []) {
    items.push({
      id: `ticket-${item.id || item.uuid}`,
      type: 'ticket',
      type_label: 'Ticket',
      title: item.titlu || `Ticket ${item.uuid || item.id || ''}`.trim(),
      subtitle: compactText([item.uuid, item.prioritate, item.entitate_tip]),
      date: timelineDate(item.created_at || item.updated_at || item.termen_limita),
      tone: ['rezolvat', 'inchis'].includes(String(item.status || '').toLowerCase()) ? 'success' : 'warning',
      status: item.status || ''
    })
  }

  return items
    .filter(item => item.date || item.title)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.id || '').localeCompare(String(a.id || '')))
    .slice(0, 100)
}

function contractCockpit(db, contract, decoratedContract = null) {
  const cm = ensureContractsDb(db)
  const ticketsDb = ensureTicketsDb(db)
  const decorated = decoratedContract || decorateContract(db, contract, { includeConsumptions: true, includeSources: true })
  const tasks = cm.tasks
    .filter(item => !item.cancelled_at && !item.cancelledAt)
    .filter(item => String(item.contract_id) === String(contract.id))
    .map(item => decorateTask(db, item))
  const tickets = ticketsDb.tickets
    .filter(item => item.entitate_tip === 'contract' && String(item.entitate_id) === String(contract.id) ||
      item.entitate_tip === 'contract_task' && tasks.some(task => String(task.id) === String(item.entitate_id)))
    .map(item => ({
      id: item.id,
      uuid: item.uuid,
      titlu: item.titlu,
      status: item.status,
      prioritate: item.prioritate,
      termen_limita: item.termen_limita,
      entitate_tip: item.entitate_tip,
      entitate_id: item.entitate_id,
      created_at: item.created_at,
      updated_at: item.updated_at
    }))
  const openTaskCount = tasks.filter(item => !['rezolvat', 'inchis', 'anulat'].includes(String(item.status || '').toLowerCase())).length
  const openTicketCount = tickets.filter(item => !['rezolvat', 'inchis', 'respins'].includes(String(item.status || '').toLowerCase())).length
  const timeline = contractTimeline(db, contract, decorated, tasks, tickets)
  return {
    summary: {
      alerts: decorated.alerte?.length || 0,
      tasks_total: tasks.length,
      tasks_open: openTaskCount,
      tickets_total: tickets.length,
      tickets_open: openTicketCount,
      documents_total: decorated.documente_sursa?.timeline?.length || 0,
      attachments_total: decorated.atasamente?.length || 0,
      addenda_total: decorated.acte_aditionale?.length || 0,
      consumptions_total: decorated.consumuri?.length || 0,
      timeline_total: timeline.length,
      consum_percent: decorated.procent_consum || 0,
      days_left: decorated.summary?.zile_ramase ?? null
    },
    tasks,
    tickets,
    alerts: decorated.alerte || [],
    documents: decorated.documente_sursa || { groups: [], timeline: [], counts: {} },
    attachments: decorated.atasamente || [],
    addenda: decorated.acte_aditionale || [],
    timeline
  }
}

function contractPrintHtml(db, contract, user) {
  const decorated = decorateContract(db, contract, { includeConsumptions: true, includeSources: true, includeAttachments: true, includeAddenda: true, includeCockpit: true })
  const summary = decorated.cockpit?.summary || {}
  const consumuri = decorated.consumuri || []
  const documents = decorated.documente_sursa?.timeline || []
  const attachments = decorated.atasamente || []
  const addenda = decorated.acte_aditionale || []
  const tasks = decorated.cockpit?.tasks || []
  const tickets = decorated.cockpit?.tickets || []
  const alerts = decorated.alerte || []
  const generatedAt = new Date().toLocaleString('ro-RO')
  const percent = Math.max(0, Math.min(100, Number(decorated.procent_consum || 0)))

  const consumptionRows = consumuri.length ? consumuri.map(item => `
    <tr>
      <td>${formatPrintDate(item.data)}</td>
      <td>${printBadge(item.sursa || 'manual', item.generated ? 'info' : 'gray')}</td>
      <td>
        <strong>${escapeHtml(item.document_nr || '-')}</strong>
        <div class="muted">${escapeHtml(item.descriere || '')}</div>
      </td>
      <td class="right">${formatPrintMoney(item.valoare, item.moneda || decorated.moneda || 'RON')}</td>
    </tr>
  `).join('') : '<tr><td colspan="4" class="empty">Nu există consumuri înregistrate.</td></tr>'

  const documentRows = documents.length ? documents.map(item => `
    <tr>
      <td>${printBadge(item.type_label || item.type || '-', 'info')}</td>
      <td><strong>${escapeHtml(item.document_nr || item.id || '-')}</strong></td>
      <td>${escapeHtml(item.partener || '-')}</td>
      <td>${formatPrintDate(item.data)}</td>
      <td class="right">${Number(item.valoare || 0) ? formatPrintMoney(item.valoare, item.moneda || decorated.moneda || 'RON') : '-'}</td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="empty">Nu există documente sursă legate.</td></tr>'

  const attachmentRows = attachments.length ? attachments.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.original_name || item.file_name || '-')}</strong><div class="muted">${escapeHtml(item.descriere || '')}</div></td>
      <td>${printBadge(item.categorie || 'contract', 'info')}</td>
      <td class="right">${Number(item.file_size || 0).toLocaleString('ro-RO')} bytes</td>
      <td>${formatPrintDate(item.uploaded_at)}</td>
      <td>${escapeHtml(item.uploaded_by_name || '-')}</td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="empty">Nu există atașamente încărcate.</td></tr>'

  const addendaRows = addenda.length ? addenda.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.numar || '-')}</strong><div class="muted">${escapeHtml(item.descriere || '')}</div></td>
      <td>${printBadge(item.tip || 'altul', item.tip === 'majorare' ? 'success' : item.tip === 'diminuare' ? 'warning' : 'info')}</td>
      <td>${formatPrintDate(item.data_semnare)}</td>
      <td class="right">${Number(item.valoare_delta || 0) ? formatPrintMoney(item.valoare_delta, decorated.moneda || 'RON') : '-'}</td>
      <td>${item.data_sfarsit_dupa ? `${formatPrintDate(item.data_sfarsit_inainte)} → ${formatPrintDate(item.data_sfarsit_dupa)}` : '-'}</td>
      <td>${item.responsabil_nume_dupa ? `${escapeHtml(item.responsabil_nume_inainte || '-')} → ${escapeHtml(item.responsabil_nume_dupa)}` : '-'}</td>
      <td>${escapeHtml(item.atasament?.original_name || item.atasament?.file_name || '-')}</td>
    </tr>
  `).join('') : '<tr><td colspan="7" class="empty">Nu există acte adiționale înregistrate.</td></tr>'

  const taskRows = tasks.length ? tasks.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.titlu || '-')}</strong><div class="muted">${escapeHtml(item.descriere || '')}</div></td>
      <td>${printBadge(item.status || '-', item.status === 'rezolvat' ? 'success' : item.overdue ? 'danger' : 'warning')}</td>
      <td>${escapeHtml(item.responsabil_nume || 'Nesetat')}</td>
      <td>${formatPrintDate(item.deadline)}</td>
      <td>${item.ticket_uuid ? escapeHtml(item.ticket_uuid) : '-'}</td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="empty">Nu există task-uri generate pentru contract.</td></tr>'

  const ticketRows = tickets.length ? tickets.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.titlu || '-')}</strong><div class="muted">${escapeHtml(item.uuid || '')}</div></td>
      <td>${printBadge(item.status || '-', ['rezolvat', 'inchis'].includes(String(item.status || '').toLowerCase()) ? 'success' : 'warning')}</td>
      <td>${escapeHtml(item.prioritate || 'normală')}</td>
      <td>${formatPrintDate(item.termen_limita)}</td>
      <td>${escapeHtml(item.entitate_tip || '-')}</td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="empty">Nu există tichete legate.</td></tr>'

  const alertRows = alerts.length ? alerts.map(item => `
    <tr>
      <td>${printBadge(item.level || 'info', item.level || 'info')}</td>
      <td><strong>${escapeHtml(item.code || '-')}</strong></td>
      <td>${escapeHtml(item.message || '-')}</td>
    </tr>
  `).join('') : '<tr><td colspan="3" class="empty">Nu există alerte active.</td></tr>'

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <title>Fișă contract ${escapeHtml(decorated.numar || decorated.id)}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; color: #0f172a; }
    body { margin: 0; background: #f8fafc; }
    .page { max-width: 1120px; margin: 24px auto; background: white; padding: 32px; border: 1px solid #e2e8f0; border-radius: 18px; }
    .toolbar { display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 16px; }
    button { border: 1px solid #cbd5e1; border-radius: 10px; background: #064e3b; color: white; padding: 10px 14px; font-weight: 700; cursor: pointer; }
    h1 { margin: 0; font-size: 26px; }
    h2 { margin: 28px 0 10px; font-size: 17px; }
    .muted { color: #64748b; font-size: 12px; }
    .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 16px; }
    .meta { text-align: right; font-size: 13px; color: #475569; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 18px; }
    .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; background: #f8fafc; }
    .label { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
    .value { margin-top: 4px; font-size: 16px; font-weight: 700; }
    .progress { height: 10px; background: #e2e8f0; border-radius: 999px; overflow: hidden; margin-top: 10px; }
    .progress > div { height: 100%; background: #059669; width: ${percent}%; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; color: #475569; background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
    th, td { border: 1px solid #e2e8f0; padding: 8px; vertical-align: top; }
    .right { text-align: right; white-space: nowrap; }
    .empty { color: #64748b; text-align: center; padding: 18px; }
    .badge { display: inline-block; border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 700; background: #e2e8f0; color: #334155; }
    .badge.success { background: #dcfce7; color: #166534; }
    .badge.warning { background: #fef3c7; color: #92400e; }
    .badge.danger { background: #fee2e2; color: #991b1b; }
    .badge.info { background: #dbeafe; color: #1e40af; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 40px; }
    .signature { border-top: 1px solid #94a3b8; padding-top: 8px; color: #475569; }
    @media print {
      body { background: white; }
      .page { max-width: none; margin: 0; border: 0; border-radius: 0; padding: 0; }
      .toolbar { display: none; }
      h2 { break-after: avoid; }
      tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="page">
    <div class="toolbar"><button type="button" onclick="window.print()">Tipărește / salvează PDF</button></div>
    <section class="header">
      <div>
        <div class="muted">InfraFlow ERP · Contract Management</div>
        <h1>Fișă contract</h1>
        <p><strong>${escapeHtml(decorated.numar || '-')}</strong> · ${escapeHtml(decorated.titlu || '-')}</p>
      </div>
      <div class="meta">
        Generat la ${escapeHtml(generatedAt)}<br>
        Utilizator: ${escapeHtml(user?.name || user?.username || '-')}<br>
        Status: ${printBadge(decorated.status || '-', decorated.status === 'activ' ? 'success' : 'gray')}
      </div>
    </section>

    <section class="grid">
      <div class="card"><div class="label">Partener</div><div class="value">${escapeHtml(decorated.partener || 'Nesetat')}</div></div>
      <div class="card"><div class="label">Responsabil</div><div class="value">${escapeHtml(decorated.responsabil_nume || 'Nesetat')}</div></div>
      <div class="card"><div class="label">Perioadă</div><div class="value">${formatPrintDate(decorated.data_start)} — ${formatPrintDate(decorated.data_sfarsit)}</div></div>
      <div class="card"><div class="label">Zile rămase</div><div class="value">${summary.days_left ?? '-'}</div></div>
      <div class="card"><div class="label">Valoare contract</div><div class="value">${formatPrintMoney(decorated.valoare_contract, decorated.moneda || 'RON')}</div></div>
      <div class="card"><div class="label">Consum</div><div class="value">${formatPrintMoney(decorated.valoare_consumata, decorated.moneda || 'RON')}</div></div>
      <div class="card"><div class="label">Rămas</div><div class="value">${formatPrintMoney(decorated.valoare_ramasa, decorated.moneda || 'RON')}</div></div>
      <div class="card"><div class="label">Progres</div><div class="value">${percent.toLocaleString('ro-RO')}%</div><div class="progress"><div></div></div></div>
    </section>

    <h2>Control rapid</h2>
    <section class="grid">
      <div class="card"><div class="label">Alerte</div><div class="value">${summary.alerts || 0}</div></div>
      <div class="card"><div class="label">Task-uri deschise</div><div class="value">${summary.tasks_open || 0} / ${summary.tasks_total || 0}</div></div>
      <div class="card"><div class="label">Tichete deschise</div><div class="value">${summary.tickets_open || 0} / ${summary.tickets_total || 0}</div></div>
      <div class="card"><div class="label">Documente sursă</div><div class="value">${summary.documents_total || 0}</div></div>
      <div class="card"><div class="label">Atașamente</div><div class="value">${summary.attachments_total || 0}</div></div>
      <div class="card"><div class="label">Acte adiționale</div><div class="value">${summary.addenda_total || 0}</div></div>
    </section>

    <h2>Date contract</h2>
    <table>
      <tbody>
        <tr><th>Tip</th><td>${escapeHtml(decorated.tip || '-')}</td><th>CPV</th><td>${escapeHtml(decorated.cpv_cod || '-')} ${escapeHtml(decorated.cpv_denumire || '')}</td></tr>
        <tr><th>Data semnare</th><td>${formatPrintDate(decorated.data_semnare)}</td><th>Centru cost</th><td>${escapeHtml(decorated.centru_cost_id || '-')}</td></tr>
        <tr><th>Observații</th><td colspan="3">${escapeHtml(decorated.observatii || '-')}</td></tr>
      </tbody>
    </table>

    <h2>Alerte active</h2>
    <table><thead><tr><th>Nivel</th><th>Cod</th><th>Mesaj</th></tr></thead><tbody>${alertRows}</tbody></table>

    <h2>Consumuri care scad contractul</h2>
    <table><thead><tr><th>Data</th><th>Sursa</th><th>Document</th><th class="right">Valoare</th></tr></thead><tbody>${consumptionRows}</tbody></table>

    <h2>Documente sursă legate</h2>
    <table><thead><tr><th>Tip</th><th>Document</th><th>Partener</th><th>Data</th><th class="right">Valoare</th></tr></thead><tbody>${documentRows}</tbody></table>

    <h2>Acte adiționale</h2>
    <table><thead><tr><th>Act</th><th>Tip</th><th>Data</th><th class="right">Delta valoare</th><th>Termen</th><th>Responsabil</th><th>Fișier</th></tr></thead><tbody>${addendaRows}</tbody></table>

    <h2>Atașamente contract</h2>
    <table><thead><tr><th>Fișier</th><th>Categorie</th><th class="right">Dimensiune</th><th>Încărcat</th><th>Utilizator</th></tr></thead><tbody>${attachmentRows}</tbody></table>

    <h2>Task-uri operaționale</h2>
    <table><thead><tr><th>Task</th><th>Status</th><th>Responsabil</th><th>Termen</th><th>Ticket</th></tr></thead><tbody>${taskRows}</tbody></table>

    <h2>Tichete conectate</h2>
    <table><thead><tr><th>Ticket</th><th>Status</th><th>Prioritate</th><th>Termen</th><th>Sursă</th></tr></thead><tbody>${ticketRows}</tbody></table>

    <section class="signatures">
      <div class="signature">Manager contract</div>
      <div class="signature">Achiziții / Contabilitate</div>
    </section>
  </main>
</body>
</html>`
}

function contractsPortfolioPrintHtml(db, user) {
  const cm = ensureContractsDb(db)
  const report = dashboard(db)
  const contracts = cm.contracts
    .filter(item => !item.cancelled_at && !item.cancelledAt)
    .map(item => decorateContract(db, item))
    .sort((a, b) => Number(b.alerte?.length || 0) - Number(a.alerte?.length || 0) ||
      Number(b.procent_consum || 0) - Number(a.procent_consum || 0) ||
      String(a.data_sfarsit || '9999-12-31').localeCompare(String(b.data_sfarsit || '9999-12-31')))
  const openTasks = contractTasks(db, { status: 'deschis' })
  const generatedAt = new Date().toLocaleString('ro-RO')

  const managerRows = (report.by_manager || []).length ? report.by_manager.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.responsabil_nume || 'Fără responsabil')}</strong></td>
      <td class="right">${Number(item.contracts || 0)}</td>
      <td class="right">${formatPrintMoney(item.total_contractat || 0)}</td>
      <td class="right">${formatPrintMoney(item.total_consumat || 0)}</td>
      <td class="right">${printBadge(item.alerts || 0, Number(item.alerts || 0) ? 'warning' : 'success')}</td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="empty">Nu există manageri/responsabili în portofoliu.</td></tr>'

  const alertRows = (report.alerts || []).length ? report.alerts.map(item => `
    <tr>
      <td>${printBadge(item.level || 'info', item.level || 'info')}</td>
      <td><strong>${escapeHtml(item.contract_numar || '-')}</strong><div class="muted">${escapeHtml(item.contract_titlu || '')}</div></td>
      <td>${escapeHtml(item.responsabil_nume || 'Nesetat')}</td>
      <td>${escapeHtml(item.message || '-')}</td>
    </tr>
  `).join('') : '<tr><td colspan="4" class="empty">Nu există alerte active.</td></tr>'

  const taskRows = openTasks.length ? openTasks.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.contract_numar || '-')}</strong><div class="muted">${escapeHtml(item.contract_titlu || '')}</div></td>
      <td>${escapeHtml(item.titlu || '-')}</td>
      <td>${escapeHtml(item.responsabil_nume || 'Nesetat')}</td>
      <td>${formatPrintDate(item.deadline)}</td>
      <td>${printBadge(item.overdue ? 'restant' : item.status || 'deschis', item.overdue ? 'danger' : 'warning')}</td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="empty">Nu există task-uri deschise.</td></tr>'

  const contractRows = contracts.length ? contracts.map(item => {
    const riskTone = item.alerte?.some(alert => alert.level === 'danger') || Number(item.procent_consum || 0) >= 100
      ? 'danger'
      : item.alerte?.length || Number(item.procent_consum || 0) >= 80 ? 'warning' : 'success'
    return `
      <tr>
        <td><strong>${escapeHtml(item.numar || '-')}</strong><div class="muted">${escapeHtml(item.titlu || '')}</div></td>
        <td>${escapeHtml(item.partener || '-')}</td>
        <td>${escapeHtml(item.responsabil_nume || 'Nesetat')}</td>
        <td class="right">${formatPrintMoney(item.valoare_contract || 0, item.moneda || 'RON')}</td>
        <td class="right">${formatPrintMoney(item.valoare_consumata || 0, item.moneda || 'RON')}</td>
        <td class="right">${Number(item.procent_consum || 0).toLocaleString('ro-RO')}%</td>
        <td>${formatPrintDate(item.data_sfarsit)}</td>
        <td>${printBadge(item.alerte?.length || 0, riskTone)}</td>
      </tr>
    `
  }).join('') : '<tr><td colspan="8" class="empty">Nu există contracte în portofoliu.</td></tr>'

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <title>Raport portofoliu contracte</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; color: #0f172a; }
    body { margin: 0; background: #f8fafc; }
    .page { max-width: 1180px; margin: 24px auto; background: white; padding: 32px; border: 1px solid #e2e8f0; border-radius: 18px; }
    .toolbar { display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 16px; }
    button { border: 1px solid #cbd5e1; border-radius: 10px; background: #064e3b; color: white; padding: 10px 14px; font-weight: 700; cursor: pointer; }
    h1 { margin: 0; font-size: 26px; }
    h2 { margin: 28px 0 10px; font-size: 17px; }
    .muted { color: #64748b; font-size: 12px; }
    .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 16px; }
    .meta { text-align: right; font-size: 13px; color: #475569; }
    .grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-top: 18px; }
    .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; background: #f8fafc; }
    .label { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
    .value { margin-top: 4px; font-size: 16px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; color: #475569; background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
    th, td { border: 1px solid #e2e8f0; padding: 8px; vertical-align: top; }
    .right { text-align: right; white-space: nowrap; }
    .empty { color: #64748b; text-align: center; padding: 18px; }
    .badge { display: inline-block; border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 700; background: #e2e8f0; color: #334155; }
    .badge.success { background: #dcfce7; color: #166534; }
    .badge.warning { background: #fef3c7; color: #92400e; }
    .badge.danger { background: #fee2e2; color: #991b1b; }
    .badge.info { background: #dbeafe; color: #1e40af; }
    @media print {
      body { background: white; }
      .page { max-width: none; margin: 0; border: 0; border-radius: 0; padding: 0; }
      .toolbar { display: none; }
      h2 { break-after: avoid; }
      tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="page">
    <div class="toolbar"><button type="button" onclick="window.print()">Tipărește / salvează PDF</button></div>
    <section class="header">
      <div>
        <div class="muted">InfraFlow ERP · Contract Management</div>
        <h1>Raport portofoliu contracte</h1>
        <p>Imagine executivă pentru valoare contractată, consum, risc, responsabili și acțiuni deschise.</p>
      </div>
      <div class="meta">
        Generat la ${escapeHtml(generatedAt)}<br>
        Utilizator: ${escapeHtml(user?.name || user?.username || '-')}<br>
        Contracte: ${Number(report.contracts_total || 0)}
      </div>
    </section>

    <section class="grid">
      <div class="card"><div class="label">Contracte active</div><div class="value">${Number(report.contracts_active || 0)} / ${Number(report.contracts_total || 0)}</div></div>
      <div class="card"><div class="label">Contractat</div><div class="value">${formatPrintMoney(report.total_contractat || 0)}</div></div>
      <div class="card"><div class="label">Consumat</div><div class="value">${formatPrintMoney(report.total_consumat || 0)}</div></div>
      <div class="card"><div class="label">Rămas</div><div class="value">${formatPrintMoney(report.total_ramas || 0)}</div></div>
      <div class="card"><div class="label">Alerte</div><div class="value">${Number(report.alerts?.length || 0)}</div></div>
      <div class="card"><div class="label">Task-uri deschise</div><div class="value">${Number(report.tasks_open || 0)}</div></div>
    </section>

    <h2>Portofoliu pe manager / responsabil</h2>
    <table><thead><tr><th>Responsabil</th><th class="right">Contracte</th><th class="right">Contractat</th><th class="right">Consumat</th><th class="right">Alerte</th></tr></thead><tbody>${managerRows}</tbody></table>

    <h2>Alerte active</h2>
    <table><thead><tr><th>Nivel</th><th>Contract</th><th>Responsabil</th><th>Mesaj</th></tr></thead><tbody>${alertRows}</tbody></table>

    <h2>Task-uri deschise</h2>
    <table><thead><tr><th>Contract</th><th>Task</th><th>Responsabil</th><th>Termen</th><th>Status</th></tr></thead><tbody>${taskRows}</tbody></table>

    <h2>Contracte urmărite</h2>
    <table><thead><tr><th>Contract</th><th>Partener</th><th>Responsabil</th><th class="right">Valoare</th><th class="right">Consum</th><th class="right">%</th><th>Scadență</th><th>Alerte</th></tr></thead><tbody>${contractRows}</tbody></table>
  </main>
</body>
</html>`
}

function contractsPortfolioWorkbook(db) {
  const cm = ensureContractsDb(db)
  const report = dashboard(db)
  const contracts = cm.contracts
    .filter(item => !item.cancelled_at && !item.cancelledAt)
    .map(item => decorateContract(db, item))
    .sort((a, b) => Number(b.alerte?.length || 0) - Number(a.alerte?.length || 0) ||
      Number(b.procent_consum || 0) - Number(a.procent_consum || 0) ||
      String(a.data_sfarsit || '9999-12-31').localeCompare(String(b.data_sfarsit || '9999-12-31')))
  const openTasks = contractTasks(db, { status: 'deschis' })
  const workbook = xlsx.utils.book_new()

  const summaryRows = [
    ['Raport portofoliu contracte', todayIso()],
    [],
    ['Indicator', 'Valoare'],
    ['Contracte totale', Number(report.contracts_total || 0)],
    ['Contracte active', Number(report.contracts_active || 0)],
    ['Valoare contractată', Number(report.total_contractat || 0)],
    ['Valoare consumată', Number(report.total_consumat || 0)],
    ['Valoare rămasă', Number(report.total_ramas || 0)],
    ['Procent consum global', Number(report.procent_consum_global || 0)],
    ['Alerte active', Number(report.alerts?.length || 0)],
    ['Task-uri deschise', Number(report.tasks_open || 0)],
    ['Task-uri restante', Number(report.tasks_overdue || 0)]
  ]
  const summarySheet = xlsx.utils.aoa_to_sheet(summaryRows)
  summarySheet['!cols'] = [{ wch: 34 }, { wch: 24 }]
  xlsx.utils.book_append_sheet(workbook, summarySheet, 'Sumar')

  const contractRows = [
    ['Nr. contract', 'Titlu', 'Tip', 'Status', 'Partener', 'Responsabil', 'CPV', 'CPV denumire', 'Data start', 'Data sfârșit', 'Monedă', 'Valoare contract', 'Consum', 'Rămas', '% consum', 'Alerte', 'Zile rămase', 'Observații'],
    ...contracts.map(item => [
      item.numar || '',
      item.titlu || '',
      item.tip || '',
      item.status || '',
      item.partener || '',
      item.responsabil_nume || '',
      item.cpv_cod || '',
      item.cpv_denumire || '',
      item.data_start || '',
      item.data_sfarsit || '',
      item.moneda || 'RON',
      Number(item.valoare_contract || 0),
      Number(item.valoare_consumata || 0),
      Number(item.valoare_ramasa || 0),
      Number(item.procent_consum || 0),
      Number(item.alerte?.length || 0),
      item.summary?.zile_ramase ?? '',
      item.observatii || ''
    ])
  ]
  const contractsSheet = xlsx.utils.aoa_to_sheet(contractRows)
  contractsSheet['!cols'] = [
    { wch: 18 }, { wch: 36 }, { wch: 14 }, { wch: 14 }, { wch: 28 }, { wch: 24 },
    { wch: 14 }, { wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 18 },
    { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 40 }
  ]
  xlsx.utils.book_append_sheet(workbook, contractsSheet, 'Contracte')

  const managerRows = [
    ['Responsabil', 'Contracte', 'Valoare contractată', 'Valoare consumată', 'Valoare rămasă', 'Alerte'],
    ...(report.by_manager || []).map(item => [
      item.responsabil_nume || 'Fără responsabil',
      Number(item.contracts || 0),
      Number(item.total_contractat || 0),
      Number(item.total_consumat || 0),
      round(Number(item.total_contractat || 0) - Number(item.total_consumat || 0)),
      Number(item.alerts || 0)
    ])
  ]
  const managersSheet = xlsx.utils.aoa_to_sheet(managerRows)
  managersSheet['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 10 }]
  xlsx.utils.book_append_sheet(workbook, managersSheet, 'Manageri')

  const alertRows = [
    ['Nivel', 'Cod', 'Contract', 'Titlu contract', 'Responsabil', 'Mesaj', 'Procent', 'Zile rămase'],
    ...(report.alerts || []).map(item => [
      item.level || '',
      item.code || '',
      item.contract_numar || '',
      item.contract_titlu || '',
      item.responsabil_nume || '',
      item.message || '',
      item.procent ?? '',
      item.zile_ramase ?? ''
    ])
  ]
  const alertsSheet = xlsx.utils.aoa_to_sheet(alertRows)
  alertsSheet['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 36 }, { wch: 24 }, { wch: 56 }, { wch: 12 }, { wch: 12 }]
  xlsx.utils.book_append_sheet(workbook, alertsSheet, 'Alerte')

  const taskRows = [
    ['Contract', 'Titlu contract', 'Task', 'Status', 'Prioritate', 'Responsabil', 'Deadline', 'Restant', 'Ticket'],
    ...openTasks.map(item => [
      item.contract_numar || '',
      item.contract_titlu || '',
      item.titlu || '',
      item.status || '',
      item.prioritate || '',
      item.responsabil_nume || '',
      item.deadline || '',
      item.overdue ? 'DA' : 'NU',
      item.ticket_uuid || ''
    ])
  ]
  const tasksSheet = xlsx.utils.aoa_to_sheet(taskRows)
  tasksSheet['!cols'] = [{ wch: 18 }, { wch: 36 }, { wch: 44 }, { wch: 14 }, { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 10 }, { wch: 38 }]
  xlsx.utils.book_append_sheet(workbook, tasksSheet, 'Taskuri')

  return workbook
}

function dashboard(db) {
  const cm = ensureContractsDb(db)
  const active = cm.contracts.filter(item => !item.cancelled_at && !item.cancelledAt)
  const decorated = active.map(contract => decorateContract(db, contract))
  const totalContractat = round(decorated.reduce((sum, item) => sum + numberValue(item.summary.valoare_contract), 0))
  const totalConsumat = round(decorated.reduce((sum, item) => sum + numberValue(item.summary.consumat), 0))
  const openTasks = cm.tasks.filter(item => !item.cancelled_at && !item.cancelledAt && !['rezolvat', 'inchis', 'anulat'].includes(String(item.status || '').toLowerCase()))
  const alerts = decorated.flatMap(contract => contract.summary.alerts.map(alert => ({
    ...alert,
    contract_id: contract.id,
    contract_numar: contract.numar,
    contract_titlu: contract.titlu,
    responsabil_id: contract.responsabil_id || null,
    responsabil_nume: contract.responsabil_nume || ''
  })))
  const byManager = decorated.reduce((acc, contract) => {
    const key = contract.responsabil_nume || contract.responsabil_id || 'Fără manager'
    const current = acc[key] || {
      key,
      responsabil_id: contract.responsabil_id || null,
      responsabil_nume: contract.responsabil_nume || 'Fără manager',
      contracts: 0,
      alerts: 0,
      total_contractat: 0,
      total_consumat: 0
    }
    current.contracts += 1
    current.alerts += contract.summary.alerts.length
    current.total_contractat = round(current.total_contractat + numberValue(contract.summary.valoare_contract))
    current.total_consumat = round(current.total_consumat + numberValue(contract.summary.consumat))
    acc[key] = current
    return acc
  }, {})
  return {
    contracts_total: decorated.length,
    contracts_active: decorated.filter(item => item.status === 'activ').length,
    total_contractat: totalContractat,
    total_consumat: totalConsumat,
    total_ramas: round(totalContractat - totalConsumat),
    procent_consum_global: totalContractat > 0 ? round((totalConsumat / totalContractat) * 100) : 0,
    alerts,
    tasks_open: openTasks.length,
    tasks_overdue: openTasks.filter(item => item.deadline && String(item.deadline).slice(0, 10) < todayIso()).length,
    by_manager: Object.values(byManager).sort((a, b) => Number(b.alerts || 0) - Number(a.alerts || 0) || String(a.responsabil_nume).localeCompare(String(b.responsabil_nume))),
    by_status: decorated.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {})
  }
}

function findContractManager(db, contract) {
  const managerId = contract.responsabil_id || contract.manager_id
  if (managerId) {
    const byId = (db.users || []).find(user => String(user.id) === String(managerId))
    if (byId) return byId
  }
  const managerName = String(contract.responsabil_nume || '').trim().toLowerCase()
  if (!managerName) return null
  return (db.users || []).find(user => {
    const names = [user.name, user.nume, user.username, user.email].filter(Boolean).map(value => String(value).trim().toLowerCase())
    return names.some(value => value === managerName || value.includes(managerName) || managerName.includes(value))
  }) || null
}

function createContractReminders(db, user) {
  if (!Array.isArray(db.notifications)) db.notifications = []
  const cm = ensureContractsDb(db)
  const today = todayIso()
  const active = cm.contracts.filter(item => !item.cancelled_at && !item.cancelledAt)
  const created = []
  for (const contract of active) {
    const decorated = decorateContract(db, contract)
    if (!decorated.alerte?.length) continue
    const manager = findContractManager(db, contract)
    for (const alert of decorated.alerte) {
      const reminderKey = `contract:${contract.id}:${alert.code}:${today}`
      const exists = db.notifications.some(item => item.key === reminderKey)
      if (exists) continue
      const notification = {
        id: id('notif'),
        key: reminderKey,
        type: 'contract_alert',
        severity: alert.level === 'danger' ? 'urgent' : alert.level === 'warning' ? 'warning' : 'info',
        title: `Contract ${contract.numar}: ${alert.code}`,
        message: `${alert.message} ${contract.titlu || ''}`.trim(),
        contract_id: contract.id,
        contract_numar: contract.numar,
        contract_titlu: contract.titlu,
        user_id: manager?.id || null,
        user_name: manager?.name || manager?.nume || manager?.username || contract.responsabil_nume || '',
        roles: ['manager', 'procurement', 'accounting', 'legal', 'superadmin', 'admin'],
        createdBy: user.id,
        createdAt: nowIso(),
        read: false
      }
      db.notifications.push(notification)
      created.push(notification)
    }
  }
  return created
}

function taskDeadlineForAlert(alert) {
  if (alert.code === 'expired' || alert.code === 'value_exceeded') return todayIso()
  const days = alert.level === 'danger' ? 1 : alert.level === 'warning' ? 3 : 7
  const deadline = new Date()
  deadline.setDate(deadline.getDate() + days)
  return deadline.toISOString().slice(0, 10)
}

function decorateTask(db, task) {
  const cm = ensureContractsDb(db)
  const ticketsDb = ensureTicketsDb(db)
  const contract = cm.contracts.find(item => String(item.id) === String(task.contract_id))
  const linkedTicket = task.ticket_uuid
    ? ticketsDb.tickets.find(item => String(item.uuid) === String(task.ticket_uuid))
    : ticketsDb.tickets.find(item => item.entitate_tip === 'contract_task' && String(item.entitate_id) === String(task.id))
  const closed = ['rezolvat', 'inchis', 'anulat'].includes(String(task.status || '').toLowerCase())
  const overdue = Boolean(task.deadline && String(task.deadline).slice(0, 10) < todayIso() && !closed)
  return {
    ...task,
    overdue,
    tone: overdue ? 'danger' : closed ? 'success' : task.status === 'in_lucru' ? 'warning' : 'info',
    contract_numar: task.contract_numar || contract?.numar || '',
    contract_titlu: task.contract_titlu || contract?.titlu || '',
    responsabil_nume: task.responsabil_nume || contract?.responsabil_nume || '',
    partener: task.partener || contract?.partener || '',
    ticket_uuid: task.ticket_uuid || linkedTicket?.uuid || null,
    ticket_status: linkedTicket?.status || null
  }
}

function contractTasks(db, filters = {}) {
  const cm = ensureContractsDb(db)
  const status = String(filters.status || 'deschise').trim().toLowerCase()
  const contractId = filters.contract_id || filters.contractId || null
  return cm.tasks
    .filter(item => !item.cancelled_at && !item.cancelledAt)
    .filter(item => {
      const raw = String(item.status || '').toLowerCase()
      if (!status || status === 'toate') return true
      if (status === 'deschise') return !['rezolvat', 'inchis', 'anulat'].includes(raw)
      return raw === status
    })
    .filter(item => !contractId || String(item.contract_id) === String(contractId))
    .map(item => decorateTask(db, item))
    .sort((a, b) => String(a.deadline || '9999-12-31').localeCompare(String(b.deadline || '9999-12-31')) || String(b.created_at || '').localeCompare(String(a.created_at || '')))
}

function createContractTasksFromAlerts(db, user) {
  const cm = ensureContractsDb(db)
  const created = []
  const active = cm.contracts.filter(item => !item.cancelled_at && !item.cancelledAt && String(item.status || 'activ') !== 'anulat')
  for (const contract of active) {
    const decorated = decorateContract(db, contract)
    for (const alert of decorated.alerte || []) {
      const hasOpen = cm.tasks.some(task =>
        !task.cancelled_at && !task.cancelledAt &&
        String(task.contract_id) === String(contract.id) &&
        String(task.alert_code) === String(alert.code) &&
        !['rezolvat', 'inchis', 'anulat'].includes(String(task.status || '').toLowerCase())
      )
      if (hasOpen) continue
      const manager = findContractManager(db, contract)
      const task = {
        id: id('ctr-task'),
        uuid: crypto.randomUUID(),
        contract_id: contract.id,
        contract_numar: contract.numar,
        contract_titlu: contract.titlu,
        alert_code: alert.code,
        alert_level: alert.level,
        titlu: `Verifica ${contract.numar}: ${alert.message}`,
        descriere: `Contract: ${contract.titlu || contract.numar}. ${alert.message}`,
        status: 'deschis',
        prioritate: alert.level === 'danger' ? 'urgent' : alert.level === 'warning' ? 'ridicata' : 'normala',
        deadline: taskDeadlineForAlert(alert),
        responsabil_id: manager?.id || contract.responsabil_id || null,
        responsabil_nume: manager?.name || manager?.nume || manager?.username || contract.responsabil_nume || '',
        created_by: user.id,
        created_by_name: user.name || user.username,
        created_at: nowIso(),
        updated_at: nowIso()
      }
      cm.tasks.push(task)
      created.push(decorateTask(db, task))
    }
  }
  return created
}

function resolveContractTask(db, taskId, user, body = {}) {
  const cm = ensureContractsDb(db)
  const task = cm.tasks.find(item => String(item.id) === String(taskId) && !item.cancelled_at && !item.cancelledAt)
  if (!task) return null
  task.status = 'rezolvat'
  task.resolution_note = String(body.note || body.observatii || body.resolution_note || 'Rezolvat din Contract Management').trim()
  task.resolved_by = user.id
  task.resolved_by_name = user.name || user.username
  task.resolved_at = nowIso()
  task.updated_at = nowIso()
  return decorateTask(db, task)
}

function createTicketForContractTask(db, taskId, user) {
  const cm = ensureContractsDb(db)
  const ticketsDb = ensureTicketsDb(db)
  const task = cm.tasks.find(item => String(item.id) === String(taskId) && !item.cancelled_at && !item.cancelledAt)
  if (!task) return null
  const existing = ticketsDb.tickets.find(item =>
    String(item.uuid || '') === String(task.ticket_uuid || '') ||
    (item.entitate_tip === 'contract_task' && String(item.entitate_id) === String(task.id))
  )
  if (existing) {
    task.ticket_uuid = existing.uuid
    task.ticket_id = existing.id
    task.updated_at = nowIso()
    return { task: decorateTask(db, task), ticket: existing, created: false }
  }
  const ticket = {
    id: nextNumericId(ticketsDb.tickets),
    uuid: crypto.randomUUID(),
    tip: 'sesizare',
    prioritate: task.prioritate === 'urgent' ? 'critica' : task.prioritate === 'ridicata' ? 'urgenta' : 'ridicata',
    status: 'deschis',
    titlu: task.titlu || `Task contract ${task.contract_numar || ''}`.trim(),
    descriere: [
      task.descriere || '',
      task.contract_numar ? `Contract: ${task.contract_numar} — ${task.contract_titlu || ''}` : '',
      task.alert_code ? `Alertă contract: ${task.alert_code}` : '',
      task.deadline ? `Termen task: ${task.deadline}` : ''
    ].filter(Boolean).join('\n'),
    dept_sursa_id: user.departmentId || user.department_id || null,
    dept_responsabil_id: null,
    asignat_la: task.responsabil_id || null,
    creat_de: user.id,
    rezolvat_de: null,
    rezolvat_la: null,
    termen_limita: task.deadline || null,
    entitate_tip: 'contract_task',
    entitate_id: task.id,
    created_at: nowIso(),
    updated_at: nowIso()
  }
  ticketsDb.tickets.push(ticket)
  ticketsDb.comments.push({
    id: nextNumericId(ticketsDb.comments),
    ticket_id: ticket.id,
    user_id: user.id,
    tip: 'actiune',
    continut: `Ticket creat automat din task-ul de contract ${task.contract_numar || task.contract_id}.`,
    vizibil_pentru_autor: true,
    created_at: nowIso()
  })
  task.ticket_uuid = ticket.uuid
  task.ticket_id = ticket.id
  task.status = task.status === 'deschis' ? 'in_lucru' : task.status
  task.updated_at = nowIso()
  return { task: decorateTask(db, task), ticket, created: true }
}

function canView(auth, res) {
  return requireAnyPermission(auth, res, VIEW_PERMISSIONS)
}

function canManage(auth, res) {
  return requireAnyPermission(auth, res, MANAGE_PERMISSIONS)
}

function sourceCollections(db) {
  return [
    { type: 'factura_intrare', label: 'Factură intrare', rows: db.accounting?.invoicesIn || [] },
    { type: 'factura_iesire', label: 'Factură ieșire', rows: db.accounting?.invoicesOut || [] },
    { type: 'factura_anaf', label: 'Factură ANAF', rows: db.anafInvoices || [] },
    { type: 'nir', label: 'NIR / recepție', rows: db.procurementReceipts || [] },
    { type: 'nir_gestiune', label: 'NIR gestiune', rows: db.gestiune?.nir || [] }
  ]
}

function sourceDocumentPartner(document) {
  return String(document.supplier || document.furnizor || document.client || document.partner || document.tert || document.materialName || '').trim()
}

function sourceDocumentLabel(type, document) {
  const nr = sourceDocumentNumber(document) || sourceDocumentId(document) || '-'
  const partner = sourceDocumentPartner(document)
  const total = sourceDocumentTotal(document)
  return `${nr}${partner ? ` · ${partner}` : ''}${total ? ` · ${total.toLocaleString('ro-RO')} RON` : ''}`
}

function linkableSources(db, filters = {}) {
  const type = String(filters.type || '').trim()
  const includeLinked = ['1', 'true', 'yes', 'da'].includes(String(filters.includeLinked || '').trim().toLowerCase())
  return sourceCollections(db)
    .filter(collection => !type || collection.type === type)
    .flatMap(collection => collection.rows
      .filter(document => !document.cancelledAt && !document.cancelled_at && !document.canceled && !document.deleted)
      .filter(document => includeLinked || !document.contract_id && !document.contractId)
      .map(document => ({
        type: collection.type,
        type_label: collection.label,
        id: sourceDocumentId(document),
        label: sourceDocumentLabel(collection.type, document),
        document_nr: sourceDocumentNumber(document),
        data: sourceDocumentDate(document),
        partener: sourceDocumentPartner(document),
        valoare: sourceDocumentTotal(document),
        moneda: String(document.moneda || document.currency || 'RON').trim().toUpperCase(),
        contract_id: document.contract_id || document.contractId || null
      }))
      .filter(item => item.id != null && item.valoare > 0))
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))
}

function findSourceDocument(db, type, sourceId) {
  const collection = sourceCollections(db).find(item => item.type === type)
  if (!collection) return null
  return collection.rows.find(document => String(sourceDocumentId(document)) === String(sourceId))
}

router.get('/contracts/dashboard', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canView(auth, res)) return
  sendJson(res, 200, dashboard(auth.db))
})

router.post('/contracts/reminders', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canManage(auth, res)) return
  const created = createContractReminders(auth.db, auth.user)
  if (created.length) {
    addAudit(auth.db, auth.user, 'contract_reminders_sent', `${created.length} notificari contracte`)
    writeDb(auth.db)
  }
  sendJson(res, 200, { ok: true, reminders_created: created.length, reminders: created })
})

router.get('/contracts/tasks', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canView(auth, res)) return
  sendJson(res, 200, { tasks: contractTasks(auth.db, req.query || {}) })
})

router.post('/contracts/tasks/generate', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canManage(auth, res)) return
  const created = createContractTasksFromAlerts(auth.db, auth.user)
  if (created.length) {
    addAudit(auth.db, auth.user, 'contract_tasks_generated', `${created.length} task-uri contracte`)
    writeDb(auth.db)
  }
  sendJson(res, 200, { ok: true, tasks_created: created.length, tasks: created })
})

router.post('/contracts/tasks/:taskId/resolve', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canManage(auth, res)) return
  const task = resolveContractTask(auth.db, req.params.taskId, auth.user, req.body || {})
  if (!task) return sendJson(res, 404, { error: 'Task-ul de contract nu a fost gasit.' })
  addAudit(auth.db, auth.user, 'contract_task_resolved', `${task.contract_numar} / ${task.alert_code}`)
  writeDb(auth.db)
  sendJson(res, 200, { ok: true, task })
})

router.post('/contracts/tasks/:taskId/ticket', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canManage(auth, res)) return
  const result = createTicketForContractTask(auth.db, req.params.taskId, auth.user)
  if (!result) return sendJson(res, 404, { error: 'Task-ul de contract nu a fost gasit.' })
  addAudit(auth.db, auth.user, result.created ? 'contract_task_ticket_created' : 'contract_task_ticket_reused', `${result.task.contract_numar} / ${result.ticket.uuid}`)
  writeDb(auth.db)
  sendJson(res, result.created ? 201 : 200, { ok: true, ...result })
})

router.get('/contracts', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canView(auth, res)) return
  const cm = ensureContractsDb(auth.db)
  const status = String(req.query.status || '').trim()
  const partner = String(req.query.partner || '').trim().toLowerCase()
  const cpv = String(req.query.cpv || '').trim().toLowerCase()
  const contracts = cm.contracts
    .filter(item => !item.cancelled_at && !item.cancelledAt)
    .filter(item => !status || String(item.status) === status)
    .filter(item => !partner || String(item.partener || '').toLowerCase().includes(partner))
    .filter(item => !cpv || String(item.cpv_cod || '').toLowerCase().includes(cpv))
    .map(item => decorateContract(auth.db, item))
    .sort((a, b) => String(a.data_sfarsit || '9999-12-31').localeCompare(String(b.data_sfarsit || '9999-12-31')))
  sendJson(res, 200, { contracts })
})

router.get('/contracts/linkable-sources', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canView(auth, res)) return
  sendJson(res, 200, { sources: linkableSources(auth.db, req.query || {}) })
})

router.get('/contracts/portfolio/print', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canView(auth, res)) return
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.status(200).send(contractsPortfolioPrintHtml(auth.db, auth.user))
})

router.get('/contracts/portfolio/export.xlsx', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canView(auth, res)) return
  const workbook = contractsPortfolioWorkbook(auth.db)
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="Portofoliu_contracte_${todayIso()}.xlsx"`)
  res.status(200).end(buffer)
})

router.get('/contracts/:id/print', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canView(auth, res)) return
  const cm = ensureContractsDb(auth.db)
  const contract = cm.contracts.find(item => String(item.id) === String(req.params.id) && !item.cancelled_at && !item.cancelledAt)
  if (!contract) return sendJson(res, 404, { error: 'Contract inexistent.' })
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.status(200).send(contractPrintHtml(auth.db, contract, auth.user))
})

router.post('/contracts/:id/addenda', contractUpload.single('file'), (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canManage(auth, res)) return
    const cm = ensureContractsDb(auth.db)
    const contract = cm.contracts.find(item => String(item.id) === String(req.params.id) && !item.cancelled_at && !item.cancelledAt)
    if (!contract) return sendJson(res, 404, { error: 'Contract inexistent.' })
    const payload = normalizeAddendumInput(req.body || {}, contract)
    const error = validateAddendumPayload(payload, contract)
    if (error) return sendJson(res, 422, { error })
    const duplicate = cm.addenda.find(item => !item.cancelled_at && !item.cancelledAt && String(item.contract_id) === String(contract.id) && String(item.numar).toLowerCase() === payload.numar.toLowerCase())
    if (duplicate) return sendJson(res, 409, { error: 'Exista deja un act aditional cu acest numar pe contract.' })

    const beforeValue = round(contract.valoare_contract || 0)
    const beforeEndDate = contract.data_sfarsit || null
    const beforeResponsible = contract.responsabil_nume || ''
    const afterValue = round(beforeValue + round(payload.valoare_delta || 0))
    const afterEndDate = payload.data_sfarsit_noua || beforeEndDate
    const afterResponsible = payload.responsabil_nume_nou || beforeResponsible
    const addendumId = id('ctr-add')

    if (req.file?.buffer) {
      const attachmentResult = createContractAttachmentFromUpload(auth.db, contract, req.file, req.body, auth.user, {
        categorie: 'act aditional',
        descriere: `Act adițional ${payload.numar}`,
        linked_entity_type: 'contract_addendum',
        linked_entity_id: addendumId
      })
      if (attachmentResult.error) return sendJson(res, 422, { error: attachmentResult.error })
      payload.atasament_id = attachmentResult.attachment.id
    }

    const addendum = {
      id: addendumId,
      uuid: crypto.randomUUID(),
      ...payload,
      valoare_contract_inainte: beforeValue,
      valoare_contract_dupa: afterValue,
      data_sfarsit_inainte: beforeEndDate,
      data_sfarsit_dupa: afterEndDate,
      responsabil_nume_inainte: beforeResponsible,
      responsabil_nume_dupa: afterResponsible,
      created_by: auth.user.id,
      created_by_name: auth.user.name || auth.user.username,
      created_at: nowIso()
    }

    if (payload.valoare_delta) contract.valoare_contract = afterValue
    if (payload.data_sfarsit_noua) contract.data_sfarsit = payload.data_sfarsit_noua
    if (payload.responsabil_nume_nou) contract.responsabil_nume = payload.responsabil_nume_nou
    contract.updated_at = nowIso()
    cm.addenda.push(addendum)

    addAudit(auth.db, auth.user, 'contract_addendum_created', `${contract.numar || contract.id}: ${addendum.numar}`)
    if (payload.atasament_id) addAudit(auth.db, auth.user, 'contract_addendum_attachment_uploaded', `${contract.numar || contract.id}: ${addendum.numar}`)
    writeDb(auth.db)
    sendJson(res, 201, { addendum, contract: decorateContract(auth.db, contract, { includeConsumptions: true, includeSources: true, includeAttachments: true, includeAddenda: true, includeCockpit: true }) })
  } catch (error) {
    next(error)
  }
})

router.delete('/contracts/:id/addenda/:addendumId', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canManage(auth, res)) return
  const cm = ensureContractsDb(auth.db)
  const contract = cm.contracts.find(item => String(item.id) === String(req.params.id) && !item.cancelled_at && !item.cancelledAt)
  if (!contract) return sendJson(res, 404, { error: 'Contract inexistent.' })
  const addendum = cm.addenda.find(item => String(item.id) === String(req.params.addendumId) && String(item.contract_id) === String(contract.id) && !item.cancelled_at && !item.cancelledAt)
  if (!addendum) return sendJson(res, 404, { error: 'Actul aditional nu a fost gasit.' })
  addendum.cancelled_at = nowIso()
  addendum.cancelled_by = auth.user.id
  addendum.cancelled_by_name = auth.user.name || auth.user.username
  addendum.cancelled_reason = String(req.body?.reason || req.body?.motiv || 'Anulat din dosarul contractului').trim()
  addAudit(auth.db, auth.user, 'contract_addendum_cancelled', `${contract.numar || contract.id}: ${addendum.numar}`)
  writeDb(auth.db)
  sendJson(res, 200, {
    ok: true,
    note: 'Actul aditional a fost anulat din istoric. Contractul nu este recalculat automat; corectiile de valoare/termen se fac printr-un nou act aditional.',
    contract: decorateContract(auth.db, contract, { includeConsumptions: true, includeSources: true, includeAttachments: true, includeAddenda: true, includeCockpit: true })
  })
})

router.post('/contracts/:id/attachments', contractUpload.single('file'), (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canManage(auth, res)) return
    const cm = ensureContractsDb(auth.db)
    const contract = cm.contracts.find(item => String(item.id) === String(req.params.id) && !item.cancelled_at && !item.cancelledAt)
    if (!contract) return sendJson(res, 404, { error: 'Contract inexistent.' })
    const attachmentResult = createContractAttachmentFromUpload(auth.db, contract, req.file, req.body, auth.user)
    if (attachmentResult.error) return sendJson(res, 422, { error: attachmentResult.error })
    const attachment = attachmentResult.attachment
    addAudit(auth.db, auth.user, 'contract_attachment_uploaded', `${contract.numar || contract.id}: ${attachment.original_name}`)
    writeDb(auth.db)
    sendJson(res, 201, { attachment: contractAttachments(auth.db, contract).find(item => String(item.id) === String(attachment.id)), contract: decorateContract(auth.db, contract, { includeConsumptions: true, includeSources: true, includeAttachments: true, includeAddenda: true, includeCockpit: true }) })
  } catch (error) {
    next(error)
  }
})

router.get('/contracts/:id/attachments/:attachmentId/download', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canView(auth, res)) return
    const cm = ensureContractsDb(auth.db)
    const contract = cm.contracts.find(item => String(item.id) === String(req.params.id) && !item.cancelled_at && !item.cancelledAt)
    if (!contract) return sendJson(res, 404, { error: 'Contract inexistent.' })
    const attachment = cm.attachments.find(item => String(item.id) === String(req.params.attachmentId) && String(item.contract_id) === String(contract.id) && !item.cancelled_at && !item.cancelledAt)
    if (!attachment) return sendJson(res, 404, { error: 'Atașamentul nu a fost găsit.' })
    const diskPath = path.resolve(ROOT, String(attachment.file_path || ''))
    if (!diskPath.startsWith(path.resolve(CONTRACT_STORAGE_DIR)) || !fs.existsSync(diskPath)) return sendJson(res, 404, { error: 'Fișierul nu mai există pe disc.' })
    res.download(diskPath, attachment.original_name || attachment.file_name || path.basename(diskPath))
  } catch (error) {
    next(error)
  }
})

router.delete('/contracts/:id/attachments/:attachmentId', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!canManage(auth, res)) return
    const cm = ensureContractsDb(auth.db)
    const contract = cm.contracts.find(item => String(item.id) === String(req.params.id) && !item.cancelled_at && !item.cancelledAt)
    if (!contract) return sendJson(res, 404, { error: 'Contract inexistent.' })
    const attachment = cm.attachments.find(item => String(item.id) === String(req.params.attachmentId) && String(item.contract_id) === String(contract.id) && !item.cancelled_at && !item.cancelledAt)
    if (!attachment) return sendJson(res, 404, { error: 'Atașamentul nu a fost găsit.' })
    attachment.cancelled_at = nowIso()
    attachment.cancelled_by = auth.user.id
    attachment.cancelled_by_name = auth.user.name || auth.user.username
    attachment.cancelled_reason = String(req.body?.reason || req.body?.motiv || 'Anulat din dosarul contractului').trim()
    addAudit(auth.db, auth.user, 'contract_attachment_cancelled', `${contract.numar || contract.id}: ${attachment.original_name || attachment.file_name}`)
    writeDb(auth.db)
    sendJson(res, 200, { ok: true, contract: decorateContract(auth.db, contract, { includeConsumptions: true, includeSources: true, includeAttachments: true, includeAddenda: true, includeCockpit: true }) })
  } catch (error) {
    next(error)
  }
})

router.get('/contracts/:id', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canView(auth, res)) return
  const cm = ensureContractsDb(auth.db)
  const contract = cm.contracts.find(item => String(item.id) === String(req.params.id) && !item.cancelled_at && !item.cancelledAt)
  if (!contract) return sendJson(res, 404, { error: 'Contract inexistent.' })
  sendJson(res, 200, { contract: decorateContract(auth.db, contract, { includeConsumptions: true, includeSources: true, includeAttachments: true, includeAddenda: true, includeCockpit: true }) })
})

router.post('/contracts', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canManage(auth, res)) return
  const cm = ensureContractsDb(auth.db)
  const payload = normalizeContractInput(req.body || {})
  const error = validateContractPayload(payload)
  if (error) return sendJson(res, 400, { error })
  const duplicate = cm.contracts.find(item => !item.cancelled_at && !item.cancelledAt && String(item.numar).toLowerCase() === payload.numar.toLowerCase())
  if (duplicate) return sendJson(res, 409, { error: 'Exista deja un contract activ cu acest numar.' })
  const contract = {
    id: id('ctr'),
    uuid: crypto.randomUUID(),
    ...payload,
    created_by: auth.user.id,
    created_by_name: auth.user.name || auth.user.username,
    created_at: nowIso(),
    updated_at: nowIso()
  }
  cm.contracts.push(contract)
  addAudit(auth.db, auth.user, 'contract_created', `${contract.numar} / ${contract.titlu}`)
  writeDb(auth.db)
  sendJson(res, 201, { contract: decorateContract(auth.db, contract) })
})

router.patch('/contracts/:id', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canManage(auth, res)) return
  const cm = ensureContractsDb(auth.db)
  const contract = cm.contracts.find(item => String(item.id) === String(req.params.id) && !item.cancelled_at && !item.cancelledAt)
  if (!contract) return sendJson(res, 404, { error: 'Contract inexistent.' })
  const payload = normalizeContractInput(req.body || {}, contract)
  const error = validateContractPayload(payload)
  if (error) return sendJson(res, 400, { error })
  Object.assign(contract, payload, {
    updated_by: auth.user.id,
    updated_at: nowIso()
  })
  addAudit(auth.db, auth.user, 'contract_updated', `${contract.numar} / ${contract.titlu}`)
  writeDb(auth.db)
  sendJson(res, 200, { contract: decorateContract(auth.db, contract, { includeConsumptions: true, includeSources: true }) })
})

router.post('/contracts/:id/consumptions', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canManage(auth, res)) return
  const cm = ensureContractsDb(auth.db)
  const contract = cm.contracts.find(item => String(item.id) === String(req.params.id) && !item.cancelled_at && !item.cancelledAt)
  if (!contract) return sendJson(res, 404, { error: 'Contract inexistent.' })
  const payload = normalizeConsumptionInput(contract, req.body || {})
  const error = validateConsumptionPayload(payload)
  if (error) return sendJson(res, 400, { error })
  const consumption = {
    id: id('ctr-cons'),
    uuid: crypto.randomUUID(),
    ...payload,
    created_by: auth.user.id,
    created_by_name: auth.user.name || auth.user.username,
    created_at: nowIso()
  }
  cm.consumptions.push(consumption)
  addAudit(auth.db, auth.user, 'contract_consumption_added', `${contract.numar} / ${round(consumption.valoare)} ${consumption.moneda}`)
  writeDb(auth.db)
  sendJson(res, 201, { consumption, contract: decorateContract(auth.db, contract, { includeConsumptions: true, includeSources: true }) })
})

router.post('/contracts/:id/link-source', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canManage(auth, res)) return
  const cm = ensureContractsDb(auth.db)
  const contract = cm.contracts.find(item => String(item.id) === String(req.params.id) && !item.cancelled_at && !item.cancelledAt)
  if (!contract) return sendJson(res, 404, { error: 'Contract inexistent.' })
  const type = String(req.body?.source_type || req.body?.type || '').trim()
  const sourceId = req.body?.source_id || req.body?.id
  if (!type || sourceId == null) return sendJson(res, 400, { error: 'Tipul si ID-ul documentului sunt obligatorii.' })
  const document = findSourceDocument(auth.db, type, sourceId)
  if (!document) return sendJson(res, 404, { error: 'Documentul sursa nu a fost gasit.' })
  if ((document.contract_id || document.contractId) && String(document.contract_id || document.contractId) !== String(contract.id)) {
    return sendJson(res, 409, { error: 'Documentul este deja legat de alt contract.' })
  }
  document.contract_id = contract.id
  document.contractId = contract.id
  document.contract_numar = contract.numar
  document.contract_title = contract.titlu
  document.contract_linked_at = nowIso()
  document.contract_linked_by = auth.user.id
  addAudit(auth.db, auth.user, 'contract_source_linked', `${contract.numar} / ${type} / ${sourceDocumentNumber(document) || sourceId}`)
  writeDb(auth.db)
  sendJson(res, 200, {
    ok: true,
    source: {
      type,
      id: sourceDocumentId(document),
      label: sourceDocumentLabel(type, document),
      valoare: sourceDocumentTotal(document)
    },
    contract: decorateContract(auth.db, contract, { includeConsumptions: true, includeSources: true })
  })
})

router.post('/contracts/:id/cancel', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canManage(auth, res)) return
  const cm = ensureContractsDb(auth.db)
  const contract = cm.contracts.find(item => String(item.id) === String(req.params.id) && !item.cancelled_at && !item.cancelledAt)
  if (!contract) return sendJson(res, 404, { error: 'Contract inexistent.' })
  contract.status = 'anulat'
  contract.cancelled_at = nowIso()
  contract.cancelled_by = auth.user.id
  contract.cancelled_reason = String(req.body?.reason || req.body?.motiv || 'Anulat din Contract Management').trim()
  addAudit(auth.db, auth.user, 'contract_cancelled', `${contract.numar} / ${contract.cancelled_reason}`)
  writeDb(auth.db)
  sendJson(res, 200, { ok: true, contract })
})

module.exports = router
