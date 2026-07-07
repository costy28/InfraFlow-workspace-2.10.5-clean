/**
 * Modul ANAF — InfraFlow
 * - Lookup date firmă după CIF (API ANAF opendata)
 * - Gestionare facturi e-Factura (CIUS-RO / RO SPV)
 * - Generare XML UBL 2.1 pentru upload SPV
 */
const { Router } = require('express')
const { requireAuth } = require('../../core/auth')
const { requirePermission } = require('../../core/permissions')
const { readDb, writeDb } = require('../../core/db')
const { addAudit } = require('../../core/audit')
const https = require('https')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const multer = require('multer')
const router = Router()
const responseUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
const spvClient = require('./spv-client')

function sendJson(res, status, data) {
  res.status(status).json(data)
}

function nowIso() {
  return new Date().toISOString()
}

function localDate(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function nextId(arr) {
  return (arr.reduce((m, x) => Math.max(m, Number(x.id || 0)), 0) + 1)
}

function postJsonAnaf(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const parsed = new URL(url)
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }
    const req = https.request(options, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch { resolve(data) }
      })
    })
    req.on('error', reject)
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('ANAF API timeout')) })
    req.write(payload)
    req.end()
  })
}

function normalizeRomanianCif(value) {
  return String(value || '').toUpperCase().replace(/^RO/, '').replace(/\D+/g, '').slice(0, 13)
}

async function lookupAnaf(cifValue) {
  const cif = normalizeRomanianCif(cifValue)
  if (!cif || cif.length < 2) throw Object.assign(new Error('CIF/CUI invalid.'), { status: 400 })
  const payload = await postJsonAnaf(
    'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva',
    [{ cui: Number(cif), data: localDate() }]
  )
  const found = Array.isArray(payload?.found) ? payload.found[0] : null
  if (!found) {
    const msg = Array.isArray(payload?.notFound) && payload.notFound[0]?.message
      ? payload.notFound[0].message
      : 'ANAF nu a găsit date pentru CIF-ul introdus.'
    throw Object.assign(new Error(msg), { status: 404 })
  }
  const g = found.date_generale || found.dateGenerale || found
  const vat = found.inregistrare_scop_Tva || found.inregistrare_scop_tva || {}
  return {
    cif: normalizeRomanianCif(g.cui || cif),
    denumire: String(g.denumire || '').trim(),
    nrRegCom: String(g.nrRegCom || g.nr_reg_com || '').trim(),
    adresa: String(g.adresa || '').trim(),
    telefon: String(g.telefon || '').trim(),
    stare: String(g.stare_inregistrare || '').trim(),
    platitorTVA: Boolean(vat.scpTVA),
    dataInregistrareTVA: vat.dataInregistrarii || null,
    codTara: 'RO',
  }
}

function ensureAnafDb(db) {
  db.anaf = db.anaf || {}
  db.anaf.invoices = Array.isArray(db.anaf.invoices) ? db.anaf.invoices : []
  db.anaf.partners = Array.isArray(db.anaf.partners) ? db.anaf.partners : []
  return db.anaf
}

function syncAccountingInvoiceStatus(db, invoice) {
  if (!invoice?.accounting_invoice_uuid) return null
  const accountingInvoices = db.accounting?.invoicesOut || db.accounting?.invoices_out || []
  const accountingInvoice = accountingInvoices.find(item => item.uuid === invoice.accounting_invoice_uuid)
  if (!accountingInvoice) return null
  accountingInvoice.efactura_id = invoice.id
  accountingInvoice.efactura_status = invoice.status
  accountingInvoice.efactura_status_updated_at = invoice.updated_at || nowIso()
  return accountingInvoice
}

function implicitVat(db) {
  return Number(db.settings?.tva_implicit ?? db.settings?.cota_tva_standard ?? 21)
}

function normalizeInvoiceLines(db, lines) {
  const defaultVat = implicitVat(db)
  return (Array.isArray(lines) ? lines : []).map((line, index) => {
    const cotaTVA = Number(line.cotaTVA ?? defaultVat)
    const cantitate = Number(line.cantitate || 1)
    const pretUnitar = Number(line.pretUnitar || 0)
    return {
      nr: index + 1,
      descriere: String(line.descriere || '').trim(),
      cantitate,
      unitateMasura: String(line.unitateMasura || 'BUC').trim(),
      pretUnitar,
      cotaTVA,
      valoareFaraTVA: Number((cantitate * pretUnitar).toFixed(2)),
      valoareTVA: Number((cantitate * pretUnitar * cotaTVA / 100).toFixed(2)),
    }
  })
}

function recalculateInvoice(invoice) {
  invoice.totalFaraTVA = Number(invoice.linii.reduce((sum, line) => sum + line.valoareFaraTVA, 0).toFixed(2))
  invoice.totalTVA = Number(invoice.linii.reduce((sum, line) => sum + line.valoareTVA, 0).toFixed(2))
  invoice.totalCuTVA = Number((invoice.totalFaraTVA + invoice.totalTVA).toFixed(2))
}

function validateEInvoice(invoice, db = {}) {
  const errors = []
  if (!String(invoice.numar_factura || '').trim()) errors.push('Numarul facturii este obligatoriu.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(invoice.data_factura || ''))) errors.push('Data facturii este invalida.')
  if (!String(invoice.emitent?.denumire || '').trim()) errors.push('Denumirea emitentului lipseste.')
  if (normalizeRomanianCif(invoice.emitent?.cif).length < 2) errors.push('CIF-ul emitentului lipseste sau este invalid.')
  if (!String(invoice.partener?.denumire || '').trim()) errors.push('Denumirea partenerului lipseste.')
  if (normalizeRomanianCif(invoice.partener?.cif).length < 2) errors.push('CIF-ul partenerului lipseste sau este invalid.')
  if (!Array.isArray(invoice.linii) || !invoice.linii.length) errors.push('Factura trebuie sa contina cel putin o linie.')
  ;(invoice.linii || []).forEach((line, index) => {
    if (!String(line.descriere || '').trim()) errors.push(`Linia ${index + 1}: descrierea este obligatorie.`)
    if (!(Number(line.cantitate) > 0)) errors.push(`Linia ${index + 1}: cantitatea trebuie sa fie pozitiva.`)
    if (!(Number(line.pretUnitar) >= 0)) errors.push(`Linia ${index + 1}: pretul unitar este invalid.`)
    if (!Number.isFinite(Number(line.cotaTVA)) || Number(line.cotaTVA) < 0) errors.push(`Linia ${index + 1}: cota TVA este invalida.`)
  })
  const base = Number((invoice.linii || []).reduce((sum, line) => sum + Number(line.valoareFaraTVA || 0), 0).toFixed(2))
  const vat = Number((invoice.linii || []).reduce((sum, line) => sum + Number(line.valoareTVA || 0), 0).toFixed(2))
  if (Math.abs(base - Number(invoice.totalFaraTVA || 0)) > 0.01) errors.push('Totalul fara TVA nu corespunde liniilor.')
  if (Math.abs(vat - Number(invoice.totalTVA || 0)) > 0.01) errors.push('Totalul TVA nu corespunde liniilor.')
  if (invoice.accounting_invoice_uuid) {
    const source = (db.accounting?.invoicesOut || []).find(item => item.uuid === invoice.accounting_invoice_uuid)
    if (!source) errors.push('Factura contabila sursa nu mai exista.')
    else {
      if (Math.abs(Number(source.total || 0) - Number(invoice.totalCuTVA || 0)) > 0.01) errors.push('Totalul difera de factura contabila sursa.')
      if (Math.abs(Number(source.tva || 0) - Number(invoice.totalTVA || 0)) > 0.01) errors.push('TVA-ul difera de factura contabila sursa.')
    }
  }
  return errors
}

function archiveInvoiceXml(invoice) {
  const xml = generateUblXml(invoice)
  const period = String(invoice.data_factura || localDate()).slice(0, 7)
  const directory = path.join(process.cwd(), 'storage', 'anaf', 'efactura-out', period)
  fs.mkdirSync(directory, { recursive: true })
  const safeNumber = String(invoice.numar_factura || invoice.id).replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = path.join(directory, `${safeNumber}-${invoice.id}.xml`)
  fs.writeFileSync(filePath, xml, 'utf8')
  invoice.xml_path = filePath
  invoice.xml_sha256 = crypto.createHash('sha256').update(xml).digest('hex')
  invoice.xml_archived_at = nowIso()
  return xml
}

function assertStatusTransition(from, to, admin) {
  if (from === to) return
  const allowed = {
    draft: ['validata'],
    validata: ['trimisa_spv', ...(admin ? ['draft'] : [])],
    trimisa_spv: ['acceptata', 'respinsa'],
    respinsa: [...(admin ? ['draft'] : [])],
    acceptata: []
  }
  if (!(allowed[from] || []).includes(to)) throw Object.assign(new Error(`Tranzitia ${from} -> ${to} nu este permisa.`), { status: 409 })
}

function isAdmin(user) {
  return ['admin', 'superadmin'].includes(user?.role)
}

// ─── CIF Lookup ───────────────────────────────────────────────────────────────

router.get('/anaf/lookup/:cif', async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'anaf:view')) return
    const data = await lookupAnaf(req.params.cif)
    sendJson(res, 200, data)
  } catch (err) {
    if (err.status) return sendJson(res, err.status, { error: err.message })
    next(err)
  }
})

// ─── Parteneri (cache ANAF) ───────────────────────────────────────────────────

router.get('/anaf/partners', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'anaf:view')) return
    const { partners } = ensureAnafDb(auth.db)
    sendJson(res, 200, { partners })
  } catch (err) { next(err) }
})

router.post('/anaf/partners/lookup', async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'anaf:manage')) return
    const cif = normalizeRomanianCif(req.body?.cif)
    if (!cif) return sendJson(res, 400, { error: 'CIF obligatoriu.' })
    const data = await lookupAnaf(cif)
    // Salvare în cache parteneri
    const anaf = ensureAnafDb(auth.db)
    const existing = anaf.partners.find(p => p.cif === data.cif)
    if (existing) {
      Object.assign(existing, data, { updated_at: nowIso() })
    } else {
      anaf.partners.push({ id: nextId(anaf.partners), ...data, created_at: nowIso() })
    }
    addAudit(auth.db, auth.user, 'anaf_partener_actualizat', `${data.cif} / ${data.denumire}`)
    writeDb(auth.db)
    sendJson(res, 200, data)
  } catch (err) {
    if (err.status) return sendJson(res, err.status, { error: err.message })
    next(err)
  }
})

// ─── Facturi e-Factura ────────────────────────────────────────────────────────

router.get('/anaf/settings', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!requirePermission(auth, res, 'anaf:view')) return
  sendJson(res, 200, { tva_implicit: implicitVat(auth.db) })
})

router.get('/anaf/spv/diagnostic', (req, res) => {
  const auth = requireAuth(req, res)
  if (!auth || !requirePermission(auth, res, 'anaf:view')) return
  sendJson(res, 200, spvClient.publicConfig(auth.db))
})

router.put('/anaf/spv/config', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'anaf:manage')) return
    const config = spvClient.saveConfig(auth.db, req.body || {})
    addAudit(auth.db, auth.user, 'anaf_spv_config', config.client_id || 'neconfigurat')
    writeDb(auth.db)
    sendJson(res, 200, config)
  } catch (err) { next(err) }
})

router.post('/anaf/spv/authorization-url', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'anaf:manage')) return
    const result = spvClient.authorizationUrl(auth.db)
    writeDb(auth.db)
    sendJson(res, 200, result)
  } catch (err) { next(err) }
})

router.post('/anaf/spv/exchange-code', async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'anaf:manage')) return
    const config = await spvClient.exchangeCode(auth.db, String(req.body?.code || ''), String(req.body?.state || ''))
    addAudit(auth.db, auth.user, 'anaf_spv_authorized', config.client_id)
    writeDb(auth.db)
    sendJson(res, 200, config)
  } catch (err) { next(err) }
})

router.post('/anaf/spv/refresh', async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth || !requirePermission(auth, res, 'anaf:manage')) return
    const config = await spvClient.refresh(auth.db)
    writeDb(auth.db)
    sendJson(res, 200, config)
  } catch (err) { next(err) }
})

router.get('/anaf/invoices', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'anaf:view')) return
    const anaf = ensureAnafDb(auth.db)
    const { status, year } = req.query
    let list = [...anaf.invoices]
    if (status) list = list.filter(i => i.status === status)
    if (year) list = list.filter(i => String(i.data_factura || '').startsWith(year))
    list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    sendJson(res, 200, { invoices: list, total: list.length })
  } catch (err) { next(err) }
})

router.post('/anaf/invoices', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'anaf:manage')) return
    const body = req.body || {}
    if (!body.partenerCif && !body.partenerDenumire) return sendJson(res, 400, { error: 'CIF sau denumire partener obligatoriu.' })
    if (!body.data_factura) return sendJson(res, 400, { error: 'Data facturii obligatorie.' })
    const anaf = ensureAnafDb(auth.db)
    const year = new Date(body.data_factura).getFullYear()
    const invoiceNo = body.numar_factura || `IF-${year}-${String(nextId(anaf.invoices)).padStart(4, '0')}`
    const invoice = {
      id: nextId(anaf.invoices),
      numar_factura: invoiceNo,
      data_factura: body.data_factura,
      data_scadenta: body.data_scadenta || body.data_factura,
      tip: body.tip || 'emisa', // emisa / primita
      status: 'draft', // draft / validata / trimisa_spv / acceptata / respinsa
      // Emitent (firma noastră)
      emitent: {
        cif: body.emitentCif || auth.db.settings?.general?.cif || '',
        denumire: body.emitentDenumire || auth.db.settings?.general?.companyName || 'InfraFlow',
        adresa: body.emitentAdresa || auth.db.settings?.general?.address || '',
        iban: body.emitentIban || '',
        banca: body.emitentBanca || '',
      },
      // Partener (client/furnizor)
      partener: {
        cif: normalizeRomanianCif(body.partenerCif || ''),
        denumire: body.partenerDenumire || '',
        adresa: body.partenerAdresa || '',
      },
      // Linii factură
      linii: normalizeInvoiceLines(auth.db, body.linii),
      moneda: body.moneda || 'RON',
      mentiuni: body.mentiuni || '',
      created_by: auth.user.id,
      created_at: nowIso(),
    }
    // Totaluri
    recalculateInvoice(invoice)

    anaf.invoices.push(invoice)
    addAudit(auth.db, auth.user, 'anaf_factura_creata', `${invoiceNo} / ${body.partenerDenumire || body.partenerCif}`)
    writeDb(auth.db)
    sendJson(res, 201, { invoice })
  } catch (err) { next(err) }
})

router.patch('/anaf/invoices/:id', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'anaf:manage')) return
    const anaf = ensureAnafDb(auth.db)
    const invoice = anaf.invoices.find(i => String(i.id) === String(req.params.id))
    if (!invoice) return sendJson(res, 404, { error: 'Factură inexistentă.' })
    const body = req.body || {}
    const contentFields = ['numar_factura', 'data_factura', 'data_scadenta', 'tip', 'partenerCif', 'partenerDenumire', 'partenerAdresa', 'emitentIban', 'emitentBanca', 'moneda', 'mentiuni', 'linii']
    const editsContent = contentFields.some(key => body[key] !== undefined)
    if (editsContent && invoice.status !== 'draft' && !(invoice.status === 'validata' && isAdmin(auth.user))) {
      return sendJson(res, 409, { error: 'Doar facturile draft pot fi editate. Factura validată poate fi editată doar de Admin.' })
    }
    const previousStatus = invoice.status
    const requestedStatus = body.status
    if (requestedStatus !== undefined) {
      const allowedStatuses = ['draft', 'validata', 'trimisa_spv', 'acceptata', 'respinsa']
      if (!allowedStatuses.includes(requestedStatus)) return sendJson(res, 422, { error: 'Status e-Factura invalid.' })
      assertStatusTransition(previousStatus, requestedStatus, isAdmin(auth.user))
    }
    if (body.numar_factura !== undefined) invoice.numar_factura = String(body.numar_factura || '').trim()
    if (body.data_factura !== undefined) invoice.data_factura = body.data_factura
    if (body.data_scadenta !== undefined) invoice.data_scadenta = body.data_scadenta
    if (body.tip !== undefined) invoice.tip = body.tip
    if (body.moneda !== undefined) invoice.moneda = body.moneda
    if (body.mentiuni !== undefined) invoice.mentiuni = body.mentiuni
    if (body.partenerCif !== undefined || body.partenerDenumire !== undefined || body.partenerAdresa !== undefined) {
      invoice.partener = {
        cif: normalizeRomanianCif(body.partenerCif ?? invoice.partener?.cif),
        denumire: body.partenerDenumire ?? invoice.partener?.denumire ?? '',
        adresa: body.partenerAdresa ?? invoice.partener?.adresa ?? '',
      }
    }
    if (body.emitentIban !== undefined || body.emitentBanca !== undefined) {
      invoice.emitent = {
        ...(invoice.emitent || {}),
        iban: body.emitentIban ?? invoice.emitent?.iban ?? '',
        banca: body.emitentBanca ?? invoice.emitent?.banca ?? '',
      }
    }
    if (body.linii !== undefined) {
      invoice.linii = normalizeInvoiceLines(auth.db, body.linii)
      recalculateInvoice(invoice)
    }
    if (requestedStatus === 'validata') {
      const errors = validateEInvoice(invoice, auth.db)
      if (errors.length) return sendJson(res, 422, { error: 'Factura nu poate fi validata.', errors })
      archiveInvoiceXml(invoice)
    }
    if (requestedStatus !== undefined) invoice.status = requestedStatus
    invoice.updated_at = nowIso()
    syncAccountingInvoiceStatus(auth.db, invoice)
    addAudit(auth.db, auth.user, editsContent ? 'anaf_factura_editata' : 'anaf_factura_status', `${invoice.numar_factura} / ${invoice.status}`)
    writeDb(auth.db)
    sendJson(res, 200, { invoice })
  } catch (err) { next(err) }
})

router.post('/anaf/invoices/:id/response', responseUpload.single('file'), (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'anaf:manage')) return
    const anaf = ensureAnafDb(auth.db)
    const invoice = anaf.invoices.find(i => String(i.id) === String(req.params.id))
    if (!invoice) return sendJson(res, 404, { error: 'Factura inexistenta.' })
    const status = String(req.body?.status || '')
    if (!['acceptata', 'respinsa'].includes(status)) return sendJson(res, 422, { error: 'Rezultatul SPV trebuie sa fie acceptata sau respinsa.' })
    if (!['trimisa_spv', status].includes(invoice.status)) return sendJson(res, 409, { error: 'Marcheaza mai intai factura ca trimisa in SPV.' })
    if (!req.file) return sendJson(res, 400, { error: 'Ataseaza recipisa sau raspunsul primit din SPV.' })
    const extension = path.extname(req.file.originalname || '').toLowerCase()
    if (!['.pdf', '.xml', '.zip', '.txt'].includes(extension)) return sendJson(res, 422, { error: 'Sunt acceptate doar fisiere PDF, XML, ZIP sau TXT.' })
    const period = String(invoice.data_factura || localDate()).slice(0, 7)
    const directory = path.join(process.cwd(), 'storage', 'anaf', 'efactura-responses', period)
    fs.mkdirSync(directory, { recursive: true })
    const fileName = `${invoice.id}-${Date.now()}${extension}`
    const filePath = path.join(directory, fileName)
    fs.writeFileSync(filePath, req.file.buffer)
    invoice.status = status
    invoice.response_path = filePath
    invoice.response_original_name = req.file.originalname
    invoice.response_sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex')
    invoice.response_receipt_no = String(req.body?.receipt_no || '').trim()
    invoice.response_message = String(req.body?.message || '').trim()
    invoice.response_at = nowIso()
    invoice.updated_at = invoice.response_at
    syncAccountingInvoiceStatus(auth.db, invoice)
    addAudit(auth.db, auth.user, 'anaf_factura_raspuns_spv', `${invoice.numar_factura} / ${status} / ${invoice.response_receipt_no || '-'}`)
    writeDb(auth.db)
    sendJson(res, 200, { invoice })
  } catch (err) { next(err) }
})

router.get('/anaf/invoices/:id/response', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'anaf:view')) return
    const invoice = ensureAnafDb(auth.db).invoices.find(i => String(i.id) === String(req.params.id))
    if (!invoice?.response_path || !fs.existsSync(invoice.response_path)) return sendJson(res, 404, { error: 'Raspunsul SPV nu a fost gasit.' })
    res.download(invoice.response_path, invoice.response_original_name || path.basename(invoice.response_path))
  } catch (err) { next(err) }
})

// ─── Generare XML UBL 2.1 (CIUS-RO) ─────────────────────────────────────────

router.get('/anaf/invoices/:id/xml', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
    if (!requirePermission(auth, res, 'anaf:view')) return
    const anaf = ensureAnafDb(auth.db)
    const invoice = anaf.invoices.find(i => String(i.id) === String(req.params.id))
    if (!invoice) return sendJson(res, 404, { error: 'Factură inexistentă.' })
    const xml = generateUblXml(invoice)
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="factura-${invoice.numar_factura}.xml"`)
    res.send(xml)
  } catch (err) { next(err) }
})

function xmlEscape(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function generateUblXml(inv) {
  const lines = (inv.linii || []).map((l, i) => `
    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${xmlEscape(l.unitateMasura || 'C62')}">${l.cantitate}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${xmlEscape(inv.moneda || 'RON')}">${l.valoareFaraTVA}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Description>${xmlEscape(l.descriere)}</cbc:Description>
        <cac:ClassifiedTaxCategory>
          <cbc:ID>S</cbc:ID>
          <cbc:Percent>${l.cotaTVA}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${xmlEscape(inv.moneda || 'RON')}">${l.pretUnitar}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`).join('')

  // TVA summary pe cote
  const vatGroups = {}
  ;(inv.linii || []).forEach(l => {
    const cota = String(l.cotaTVA ?? inv.cotaTvaDefault ?? 19)
    if (!vatGroups[cota]) vatGroups[cota] = { base: 0, vat: 0 }
    vatGroups[cota].base += Number(l.valoareFaraTVA || 0)
    vatGroups[cota].vat += Number(l.valoareTVA || 0)
  })
  const taxTotals = Object.entries(vatGroups).map(([cota, vals]) => `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${xmlEscape(inv.moneda || 'RON')}">${vals.base.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${xmlEscape(inv.moneda || 'RON')}">${vals.vat.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${cota}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1</cbc:CustomizationID>
  <cbc:ID>${xmlEscape(inv.numar_factura)}</cbc:ID>
  <cbc:IssueDate>${inv.data_factura}</cbc:IssueDate>
  <cbc:DueDate>${inv.data_scadenta || inv.data_factura}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${xmlEscape(inv.moneda || 'RON')}</cbc:DocumentCurrencyCode>
  ${inv.mentiuni ? `<cbc:Note>${xmlEscape(inv.mentiuni)}</cbc:Note>` : ''}

  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${xmlEscape(inv.emitent?.denumire)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cac:Country><cbc:IdentificationCode>RO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>RO${xmlEscape(inv.emitent?.cif)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xmlEscape(inv.emitent?.denumire)}</cbc:RegistrationName>
        <cbc:CompanyID>RO${xmlEscape(inv.emitent?.cif)}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${xmlEscape(inv.partener?.denumire)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cac:Country><cbc:IdentificationCode>RO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>RO${xmlEscape(inv.partener?.cif)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xmlEscape(inv.partener?.denumire)}</cbc:RegistrationName>
        <cbc:CompanyID>RO${xmlEscape(inv.partener?.cif)}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>

  ${inv.emitent?.iban ? `
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${xmlEscape(inv.emitent.iban)}</cbc:ID>
      ${inv.emitent.banca ? `<cbc:Name>${xmlEscape(inv.emitent.banca)}</cbc:Name>` : ''}
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>` : ''}

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${xmlEscape(inv.moneda || 'RON')}">${(inv.totalTVA || 0).toFixed(2)}</cbc:TaxAmount>
    ${taxTotals}
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${xmlEscape(inv.moneda || 'RON')}">${(inv.totalFaraTVA || 0).toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${xmlEscape(inv.moneda || 'RON')}">${(inv.totalFaraTVA || 0).toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${xmlEscape(inv.moneda || 'RON')}">${(inv.totalCuTVA || 0).toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${xmlEscape(inv.moneda || 'RON')}">${(inv.totalCuTVA || 0).toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${lines}
</Invoice>`
}

// Export public pentru lookup din Setup Wizard (fără autentificare)
module.exports = router
module.exports.lookupAnafPublic = lookupAnaf
module.exports.syncAccountingInvoiceStatus = syncAccountingInvoiceStatus
module.exports.validateEInvoice = validateEInvoice
module.exports.assertStatusTransition = assertStatusTransition
