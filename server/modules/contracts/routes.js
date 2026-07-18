const { Router } = require('express')
const crypto = require('crypto')
const { requireAuth } = require('../../core/auth')
const { requireAnyPermission } = require('../../core/permissions')
const { writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')

const router = Router()

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

function ensureContractsDb(db) {
  if (!db.contractManagement || typeof db.contractManagement !== 'object') {
    db.contractManagement = {}
  }
  const cm = db.contractManagement
  cm.contracts = Array.isArray(cm.contracts) ? cm.contracts : []
  cm.consumptions = Array.isArray(cm.consumptions) ? cm.consumptions : []
  cm.alerts = Array.isArray(cm.alerts) ? cm.alerts : []
  return cm
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
    .filter(invoice => String(invoice.contract_id || invoice.contractId || '') === String(contract.id))
    .map(invoice => ({
      id: `invoice-${invoice.id || invoice.uuid || crypto.createHash('sha1').update(JSON.stringify(invoice)).digest('hex').slice(0, 12)}`,
      contract_id: contract.id,
      data: String(invoice.data || invoice.date || invoice.issueDate || invoice.created_at || todayIso()).slice(0, 10),
      sursa: 'factura',
      sursa_id: invoice.id || invoice.uuid || null,
      document_nr: String(invoice.nr || invoice.numar || invoice.number || invoice.documentNo || '').trim(),
      descriere: String(invoice.furnizor || invoice.client || invoice.partner || invoice.titlu || 'Factura legata de contract').trim(),
      valoare: round(invoice.total || invoice.valoare || invoice.amount || invoice.total_cu_tva || invoice.totalCuTva || 0),
      moneda: String(invoice.moneda || invoice.currency || contract.moneda || 'RON').trim().toUpperCase(),
      cpv_cod: String(invoice.cpv_cod || invoice.cpv || contract.cpv_cod || '').trim(),
      generated: true
    }))
    .filter(item => item.valoare > 0)
}

function contractConsumptions(db, contract) {
  const cm = ensureContractsDb(db)
  const manual = cm.consumptions
    .filter(item => !item.cancelled_at && !item.cancelledAt)
    .filter(item => String(item.contract_id || item.contractId) === String(contract.id))
  return [...manual, ...existingInvoiceConsumptions(db, contract)]
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
    alerts.push({ level: 'danger', code: 'value_exceeded', message: 'Contract depasit sau ajuns la limita valorica.' })
  } else if (valoare > 0 && procent >= numberValue(contract.prag_critic, 90)) {
    alerts.push({ level: 'warning', code: 'value_critical', message: 'Contract aproape de limita valorica.' })
  } else if (valoare > 0 && procent >= numberValue(contract.prag_avertizare, 80)) {
    alerts.push({ level: 'info', code: 'value_warning', message: 'Contract peste pragul de avertizare.' })
  }

  if (zileRamase !== null && zileRamase < 0 && contract.status === 'activ') {
    alerts.push({ level: 'danger', code: 'expired', message: 'Contract activ expirat calendaristic.' })
  } else if (zileRamase !== null && zileRamase <= 30 && contract.status === 'activ') {
    alerts.push({ level: 'warning', code: 'expires_soon', message: `Contractul expira in ${Math.max(zileRamase, 0)} zile.` })
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
  return decorated
}

function dashboard(db) {
  const cm = ensureContractsDb(db)
  const active = cm.contracts.filter(item => !item.cancelled_at && !item.cancelledAt)
  const decorated = active.map(contract => decorateContract(db, contract))
  const totalContractat = round(decorated.reduce((sum, item) => sum + numberValue(item.summary.valoare_contract), 0))
  const totalConsumat = round(decorated.reduce((sum, item) => sum + numberValue(item.summary.consumat), 0))
  const alerts = decorated.flatMap(contract => contract.summary.alerts.map(alert => ({
    ...alert,
    contract_id: contract.id,
    contract_numar: contract.numar,
    contract_titlu: contract.titlu
  })))
  return {
    contracts_total: decorated.length,
    contracts_active: decorated.filter(item => item.status === 'activ').length,
    total_contractat: totalContractat,
    total_consumat: totalConsumat,
    total_ramas: round(totalContractat - totalConsumat),
    procent_consum_global: totalContractat > 0 ? round((totalConsumat / totalContractat) * 100) : 0,
    alerts,
    by_status: decorated.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {})
  }
}

function canView(auth, res) {
  return requireAnyPermission(auth, res, VIEW_PERMISSIONS)
}

function canManage(auth, res) {
  return requireAnyPermission(auth, res, MANAGE_PERMISSIONS)
}

router.get('/contracts/dashboard', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canView(auth, res)) return
  sendJson(res, 200, dashboard(auth.db))
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

router.get('/contracts/:id', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!canView(auth, res)) return
  const cm = ensureContractsDb(auth.db)
  const contract = cm.contracts.find(item => String(item.id) === String(req.params.id) && !item.cancelled_at && !item.cancelledAt)
  if (!contract) return sendJson(res, 404, { error: 'Contract inexistent.' })
  sendJson(res, 200, { contract: decorateContract(auth.db, contract, { includeConsumptions: true }) })
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
  sendJson(res, 200, { contract: decorateContract(auth.db, contract, { includeConsumptions: true }) })
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
  sendJson(res, 201, { consumption, contract: decorateContract(auth.db, contract, { includeConsumptions: true }) })
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
