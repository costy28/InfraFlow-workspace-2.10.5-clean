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
const router = Router()

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

// ─── CIF Lookup ───────────────────────────────────────────────────────────────

router.get('/anaf/lookup/:cif', async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
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
    const { partners } = ensureAnafDb(auth.db)
    sendJson(res, 200, { partners })
  } catch (err) { next(err) }
})

router.post('/anaf/partners/lookup', async (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
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
    writeDb(auth.db)
    sendJson(res, 200, data)
  } catch (err) {
    if (err.status) return sendJson(res, err.status, { error: err.message })
    next(err)
  }
})

// ─── Facturi e-Factura ────────────────────────────────────────────────────────

router.get('/anaf/invoices', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
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
      linii: Array.isArray(body.linii) ? body.linii.map((l, i) => {
        const cotaTvaDefault = Number(auth.db.settings?.cota_tva_standard ?? 19)
        const cotaTVA = Number(l.cotaTVA ?? cotaTvaDefault)
        const cantitate = Number(l.cantitate || 1)
        const pretUnitar = Number(l.pretUnitar || 0)
        return {
          nr: i + 1,
          descriere: l.descriere || '',
          cantitate,
          unitateMasura: l.unitateMasura || 'BUC',
          pretUnitar,
          cotaTVA,
          valoareFaraTVA: Number((cantitate * pretUnitar).toFixed(2)),
          valoareTVA: Number((cantitate * pretUnitar * cotaTVA / 100).toFixed(2)),
        }
      }) : [],
      moneda: body.moneda || 'RON',
      mentiuni: body.mentiuni || '',
      created_by: auth.user.id,
      created_at: nowIso(),
    }
    // Totaluri
    invoice.totalFaraTVA = Number(invoice.linii.reduce((s, l) => s + l.valoareFaraTVA, 0).toFixed(2))
    invoice.totalTVA = Number(invoice.linii.reduce((s, l) => s + l.valoareTVA, 0).toFixed(2))
    invoice.totalCuTVA = Number((invoice.totalFaraTVA + invoice.totalTVA).toFixed(2))

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
    const anaf = ensureAnafDb(auth.db)
    const invoice = anaf.invoices.find(i => String(i.id) === String(req.params.id))
    if (!invoice) return sendJson(res, 404, { error: 'Factură inexistentă.' })
    const allowed = ['status', 'mentiuni', 'data_scadenta', 'linii']
    for (const key of allowed) {
      if (req.body[key] !== undefined) invoice[key] = req.body[key]
    }
    if (req.body.linii) {
      invoice.totalFaraTVA = Number(invoice.linii.reduce((s, l) => s + Number(l.valoareFaraTVA || 0), 0).toFixed(2))
      invoice.totalTVA = Number(invoice.linii.reduce((s, l) => s + Number(l.valoareTVA || 0), 0).toFixed(2))
      invoice.totalCuTVA = Number((invoice.totalFaraTVA + invoice.totalTVA).toFixed(2))
    }
    invoice.updated_at = nowIso()
    writeDb(auth.db)
    sendJson(res, 200, { invoice })
  } catch (err) { next(err) }
})

// ─── Generare XML UBL 2.1 (CIUS-RO) ─────────────────────────────────────────

router.get('/anaf/invoices/:id/xml', (req, res, next) => {
  try {
    const auth = requireAuth(req, res)
    if (!auth) return
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
