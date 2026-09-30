/**
 * Pregătește o instanță MSSQL DEMO separată pentru prezentarea comercială.
 *
 * Nu rulează implicit și refuză orice bază al cărei nume nu începe cu
 * INFRAFLOW_DEMO. Astfel nu poate suprascrie instalarea locală a unui client.
 *
 * Exemplu:
 *   $env:INFRAFLOW_DEMO_DATABASE='INFRAFLOW_DEMO'
 *   node scripts/seed-commercial-demo-mssql.js
 *   node scripts/seed-commercial-demo-mssql.js --reset
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..')
const DEMO_APP_STATE_FILE = path.join(ROOT, 'data', 'app-db.demo.json')
const targetDatabase = String(process.env.INFRAFLOW_DEMO_DATABASE || '').trim()
const resetRequested = process.argv.includes('--reset')

if (!/^INFRAFLOW_DEMO(?:_[A-Z0-9_]+)?$/i.test(targetDatabase)) {
  throw new Error('Setează INFRAFLOW_DEMO_DATABASE cu un nume sigur, de exemplu INFRAFLOW_DEMO. Scriptul acceptă exclusiv nume care încep cu INFRAFLOW_DEMO.')
}

// Aceste variabile trebuie definite înainte de primul require al driverului DB.
process.env.DB_MODE = 'mssql'
process.env.INFRAFLOW_DB_PROVIDER = 'mssql'
process.env.DB_DATABASE = targetDatabase
// CRM își aplică propriile migrări relaționale 070–074. Nu rulăm toate
// migrările istorice ale ERP-ului pentru o bază demo comercială curată.
process.env.INFRAFLOW_SQL_RELATIONAL = '0'
process.env.INFRAFLOW_DISABLE_APP_STATE_RECOVERY = '1'
// Nu importa nici temporar app-db.json din instalarea de lucru. Seed-ul pornește
// din datele generice și suprascrie exclusiv baza DEMO permisă mai sus.
process.env.INFRAFLOW_DB_FILE = path.join(os.tmpdir(), `infraflow-commercial-demo-bootstrap-${process.pid}.json`)

const { ensureDatabase, readDb, writeDb, runMssqlScalar, mssqlConnectionString } = require('../server/core/db')
const crm = require('../server/modules/crm/repository')
const quotes = require('../server/modules/crm/quote-repository')
const orders = require('../server/modules/crm/order-repository')
const inventoryChecks = require('../server/modules/crm/inventory-check-repository')
const { normalizeQuote } = require('../server/modules/crm/quote-service')
const { tokenHash } = require('../server/modules/crm/public-service')
const { checkAvailability } = require('../server/modules/crm/ports/inventory')
const { createRequirementsFromCrmOrder } = require('../server/modules/procurement/crm-port')
const { createProforma } = require('../server/modules/crm/ports/billing')
const { addAudit } = require('../server/core/audit')

const ACTORS = Object.freeze({
  admin: 'USR-001',
  sales: 'USR-DEMO-SALES',
  approval: 'USR-DEMO-APPROVAL',
  procurement: 'USR-DEMO-PROCUREMENT',
  accounting: 'USR-DEMO-ACCOUNTING'
})

function createDatabaseIfMissing() {
  const safeName = targetDatabase.replace(/]/g, ']]')
  const literalName = targetDatabase.replace(/'/g, "''")
  runMssqlScalar(`IF DB_ID(N'${literalName}') IS NULL CREATE DATABASE [${safeName}]; SELECT DB_NAME();`, {
    connectionString: mssqlConnectionString('master'),
    timeoutMs: 300000
  })
}

function loadDemoAdministrator() {
  const source = JSON.parse(fs.readFileSync(DEMO_APP_STATE_FILE, 'utf8'))
  const admin = (source.users || []).find(user => user.username === 'admin')
  if (!admin?.passwordHash) throw new Error('Nu am găsit contul administrator în datele demo de referință.')
  return admin
}

function demoRoles() {
  return [
    { id: 'demo-sales', name: 'Vânzări demo', description: 'Califică solicitări și construiește oferte comerciale.', tip: 'demo', permissions: ['dashboard:view', 'crm:view', 'crm:lead_create', 'crm:lead_manage', 'crm:quote_create', 'crm:quote_send', 'crm:reports'] },
    { id: 'demo-approval', name: 'Aprobare demo', description: 'Aprobă ofertele comerciale înainte de transmitere.', tip: 'demo', permissions: ['dashboard:view', 'crm:view', 'crm:quote_approve', 'crm:reports', 'audit:view'] },
    { id: 'demo-procurement', name: 'Achiziții demo', description: 'Verifică deficitul și primește necesarul din comenzile clienților.', tip: 'demo', permissions: ['dashboard:view', 'crm:view', 'crm:order_manage', 'crm:inventory_check', 'crm:procurement_request', 'procurement_orders:view', 'procurement_orders:create', 'department_requests:view'] },
    { id: 'demo-accounting', name: 'Contabilitate demo', description: 'Creează proforme și facturi draft din comenzile confirmate.', tip: 'demo', permissions: ['dashboard:view', 'crm:view', 'crm:billing_request', 'crm:reports', 'accounting_report:view', 'ledger:view'] }
  ]
}

function addDemoUsers(db) {
  const passwordHash = db.users?.find(user => user.username === 'admin')?.passwordHash
  const users = [
    { id: ACTORS.sales, username: 'vanzari.demo', name: 'Bianca Dumitru', role: 'demo-sales', departmentId: '', email: 'vanzari@infraflow-demo.ro' },
    { id: ACTORS.approval, username: 'aprobare.demo', name: 'Radu Iliescu', role: 'demo-approval', departmentId: '', email: 'aprobare@infraflow-demo.ro' },
    { id: ACTORS.procurement, username: 'achizitii.demo', name: 'Oana Petrescu', role: 'demo-procurement', departmentId: '', email: 'achizitii@infraflow-demo.ro' },
    { id: ACTORS.accounting, username: 'contabilitate.demo', name: 'Laura Pop', role: 'demo-accounting', departmentId: '', email: 'contabilitate@infraflow-demo.ro' }
  ]
  db.users = (db.users || []).filter(user => !users.some(candidate => candidate.id === user.id))
  db.users.push(...users.map(user => ({ ...user, passwordHash, active: true, createdAt: new Date().toISOString(), demoHint: 'Cont de demonstrație. Parola este aceeași cu celelalte conturi demo.' })))
}

function prepareAppState() {
  // Păstrăm app_state mic. Copierea integrală a unei instalații demo într-un
  // câmp JSON MSSQL poate bloca seed-ul, iar scenariile comerciale au nevoie
  // numai de identitate, catalogul demonstrativ și CRM-ul relațional de mai jos.
  const db = readDb()
  const admin = loadDemoAdministrator()
  db.users = (db.users || []).filter(user => user.username !== 'admin')
  db.users.push({ ...admin, active: true })
  db.settings = db.settings || {}
  // Lista explicită este păstrată și în resetările repetate; CRM trebuie să
  // fie demonstrabil imediat după pornirea instanței separate.
  db.settings.modules_enabled = ['crm', 'accounting']
  db.settings.demo_mode = true
  db.settings.demo_profile = 'commercial-mssql'
  db.settings.demo_seeded_at = new Date().toISOString()
  db.settings.setupCompleted = true
  db.settings.companyName = 'Construct Demo SRL'
  db.settings.publicUrl = ''
  db.settings.license = { plan: 'internal', modules: ['all'], maxUsers: 50, maxDevices: 50, clientName: 'Construct Demo SRL', source: 'demo-seed' }
  db.settings.customRoles = [...(db.settings.customRoles || []).filter(role => !String(role.id || '').startsWith('demo-')), ...demoRoles()]
  db.company = { ...(db.company || {}), name: 'Construct Demo SRL', email: 'demo@infraflow-demo.ro', license_type: 'demo', demo_mode: true }
  const materials = [
    { id: 'MAT-001', code: 'MAT-001', name: 'Bitum 50/70', unit: 'tone', stock: 12, category: 'Materiale asfaltice', active: true },
    { id: 'MAT-003', code: 'MAT-003', name: 'Criblura 4-8mm', unit: 'tone', stock: 5, category: 'Agregate', active: true },
    { id: 'MAT-005', code: 'MAT-005', name: 'Nisip sortat 0-4mm', unit: 'tone', stock: 48, category: 'Agregate', active: true },
    { id: 'MAT-006', code: 'MAT-006', name: 'Emulsie bituminoasă', unit: 'kg', stock: 850, category: 'Materiale asfaltice', active: true },
    { id: 'MAT-007', code: 'MAT-007', name: 'Geotextil 200 g/mp', unit: 'mp', stock: 1200, category: 'Geosintetice', active: true },
    { id: 'MAT-008', code: 'MAT-008', name: 'Bordură prefabricată', unit: 'buc', stock: 320, category: 'Prefabricate', active: true }
  ]
  const suppliers = [
    { id: 'SUP-DEMO-001', name: 'Agregate Moldova SRL', email: 'ofertare@agregate-moldova.example', phone: '0233 710 100', active: true },
    { id: 'SUP-DEMO-002', name: 'Bitum Nord-Est SRL', email: 'vanzari@bitum-nord-est.example', phone: '0233 710 200', active: true }
  ]
  db.materials = materials
  db.suppliers = suppliers
  db.gestiune = { ...(db.gestiune || {}), materials, suppliers }
  db.inventory = { ...(db.inventory || {}), materials }
  db.departmentRequests = (db.departmentRequests || []).filter(item => item.source_type !== 'crm_customer_order')
  addDemoUsers(db)
  return db
}

function clearCrmDemoData() {
  runMssqlScalar(`
    DELETE FROM crm.billing_documents;
    DELETE FROM crm.inventory_checks;
    DELETE FROM crm.customer_order_lines;
    DELETE FROM crm.customer_orders;
    DELETE FROM crm.quote_decisions;
    DELETE FROM crm.quote_public_links;
    DELETE FROM crm.quote_lines;
    DELETE FROM crm.quotes;
    DELETE FROM crm.activities;
    DELETE FROM crm.leads;
    DELETE FROM crm.contacts;
    DELETE FROM crm.accounts;
    SELECT 1;
  `, { timeoutMs: 120000 })
}

function futureDate(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function createQuote(data, actor) {
  const payload = normalizeQuote(data)
  const id = quotes.createQuote(payload, actor)
  const quote = quotes.getQuote(id)
  if (!quote) throw new Error('Oferta demo nu a putut fi citită după creare.')
  return quote
}

function seedCommercialScenarios(db) {
  const sales = { id: ACTORS.sales, name: 'Bianca Dumitru', role: 'demo-sales' }
  const procurementUser = { id: ACTORS.procurement, name: 'Oana Petrescu', role: 'demo-procurement' }
  const alpha = crm.createAccount({ name: 'Nord Construct Grup SRL', lifecycle_status: 'prospect', tax_id: 'RO40123456', email: 'contact@nord-construct.example', phone: '0233 700 100', city: 'Piatra-Neamț', country_code: 'RO', industry: 'Construcții', owner_user_id: ACTORS.sales, notes: 'Prospect fictiv pentru scenariul ofertă → acceptare.' }, ACTORS.sales)
  const alphaContact = crm.createContact({ account_id: alpha.id, display_name: 'Andrei Munteanu', job_title: 'Director operațional', email: 'andrei.munteanu@nord-construct.example', phone: '0722 100 100', is_primary: true }, ACTORS.sales)
  const beta = crm.createAccount({ name: 'Delta Drumuri SRL', lifecycle_status: 'client', tax_id: 'RO40876543', email: 'office@delta-drumuri.example', phone: '0233 700 200', city: 'Roman', country_code: 'RO', industry: 'Infrastructură', owner_user_id: ACTORS.sales, notes: 'Client fictiv pentru scenariul cu deficit de stoc.' }, ACTORS.sales)
  const betaContact = crm.createContact({ account_id: beta.id, display_name: 'Diana Pavel', job_title: 'Manager achiziții', email: 'diana.pavel@delta-drumuri.example', phone: '0722 200 200', is_primary: true }, ACTORS.sales)
  const gamma = crm.createAccount({ name: 'Atlas Servicii SRL', lifecycle_status: 'prospect', tax_id: 'RO40998877', email: 'contact@atlas-servicii.example', phone: '0233 700 300', city: 'Târgu Neamț', country_code: 'RO', industry: 'Servicii', owner_user_id: ACTORS.sales, notes: 'Prospect fictiv disponibil pentru demonstrația de lead.' }, ACTORS.sales)
  const gammaContact = crm.createContact({ account_id: gamma.id, display_name: 'Carmen Iacob', job_title: 'Administrator', email: 'carmen.iacob@atlas-servicii.example', phone: '0722 300 300', is_primary: true }, ACTORS.sales)
  console.log('  - clienți/prospecți creați')

  const lead = crm.createLead({ source: 'web', source_reference: 'FORMULAR-DEMO-001', title: 'Solicitare ofertă: amenajare acces sediu', description: 'Clientul dorește o propunere pentru materiale și montaj, cu termen de execuție în luna curentă.', status: 'new', qualification_status: 'pending', account_id: gamma.id, contact_id: gammaContact.id, assigned_to: ACTORS.sales, estimated_value: 18500, currency: 'RON', expected_close_date: futureDate(14), notes: 'Scenariu 1: lead nou, pregătit pentru calificare în demonstrație.' }, ACTORS.sales)
  crm.createActivity({ activity_type: 'note', occurred_at: new Date().toISOString(), lead_id: lead.id, account_id: gamma.id, contact_id: gammaContact.id, subject: 'Solicitare recepționată', notes: 'Datele sunt fictive. Următorul pas: calificare și ofertare.', outcome: 'În așteptare' }, ACTORS.sales)
  console.log('  - lead nou creat')

  const draftQuote = createQuote({ title: 'Pachet servicii întreținere trimestrială', account_id: alpha.id, contact_id: alphaContact.id, responsible_user_id: ACTORS.sales, currency: 'RON', issue_date: futureDate(0), valid_until: futureDate(14), payment_terms: 'Plată la 15 zile de la factură.', delivery_terms: 'Conform programării agreate cu clientul.', notes_client: 'Oferta este creată pentru demonstrație și poate fi editată.', lines: [
    { item_type: 'service', description: 'Inspecție și evaluare inițială', quantity: 1, unit: 'serviciu', unit_price: 850, tax_percent: 21 },
    { item_type: 'service', description: 'Intervenție întreținere', quantity: 8, unit: 'oră', unit_price: 185, tax_percent: 21 }
  ] }, ACTORS.sales)
  console.log('  - ofertă draft creată')

  const approvalQuote = createQuote({ title: 'Ofertă lucrări curente — în așteptare aprobare', account_id: alpha.id, contact_id: alphaContact.id, responsible_user_id: ACTORS.sales, currency: 'RON', issue_date: futureDate(0), valid_until: futureDate(10), payment_terms: 'Plată la 30 zile.', delivery_terms: 'Execuție în maximum 10 zile lucrătoare.', notes_client: 'Scenariu 1: oferta poate fi aprobată și trimisă prin link securizat.', lines: [
    { item_type: 'service', description: 'Serviciu pregătire lucrare', quantity: 1, unit: 'serviciu', unit_price: 2200, tax_percent: 21 },
    { item_type: 'service', description: 'Execuție lucrare', quantity: 1, unit: 'serviciu', unit_price: 6800, tax_percent: 21 }
  ] }, ACTORS.sales)
  quotes.changeStatus(approvalQuote.id, 'pending_approval', ACTORS.sales, { lock: true })
  console.log('  - ofertă în aprobare creată')

  const shortageQuote = createQuote({ title: 'Materiale pentru intervenție urgentă', account_id: beta.id, contact_id: betaContact.id, responsible_user_id: ACTORS.sales, currency: 'RON', issue_date: futureDate(0), valid_until: futureDate(7), payment_terms: 'Plată la 15 zile.', delivery_terms: 'Livrare în două tranșe, conform disponibilității.', notes_client: 'Scenariu 2: ofertă acceptată cu deficit demonstrativ de stoc.', lines: [
    { item_type: 'material', item_reference: 'MAT-001', description: 'Bitum 50/70', quantity: 20, unit: 'tone', unit_price: 2650, tax_percent: 21 },
    { item_type: 'material', item_reference: 'MAT-003', description: 'Criblura 4-8mm', quantity: 30, unit: 'tone', unit_price: 190, tax_percent: 21 },
    { item_type: 'service', description: 'Transport și manipulare', quantity: 1, unit: 'serviciu', unit_price: 1450, tax_percent: 21 }
  ] }, ACTORS.sales)
  quotes.changeStatus(shortageQuote.id, 'approved', ACTORS.approval, { approved: true, lock: true })
  console.log('  - ofertă pentru deficit creată și aprobată')
  const demoToken = crypto.randomBytes(32).toString('base64url')
  const link = quotes.createPublicLink(shortageQuote.id, shortageQuote.revision_number, tokenHash(demoToken), `${futureDate(14)}T23:59:59.000Z`, ACTORS.sales)
  quotes.recordPublicDecision(link.id, 'accepted', { decided_by_name: 'Diana Pavel', decided_by_email: betaContact.email, comment: 'Acceptare demonstrativă; urmează verificarea stocului.', evidence_hash: crypto.createHash('sha256').update(`demo:${shortageQuote.id}`).digest('hex'), request_fingerprint: crypto.createHash('sha256').update('commercial-demo').digest('hex') })
  const order = orders.createFromAcceptedQuote(shortageQuote.id, ACTORS.sales)
  console.log('  - acceptare publică și comandă client create')
  const fullOrder = orders.getOrder(order.id)
  const inventoryResult = checkAvailability({ order: fullOrder, db })
  const inventoryCheck = inventoryChecks.recordCheck(fullOrder.id, inventoryResult, ACTORS.procurement)
  const procurement = createRequirementsFromCrmOrder({ db, user: procurementUser, order: fullOrder, inventoryCheck })
  console.log('  - verificare stoc și necesar de aprovizionare create')
  writeDb(db)
  const proforma = createProforma({ order: fullOrder, actor: ACTORS.accounting })
  console.log('  - proformă creată')

  addAudit(db, sales, 'demo:commercial_seeded', { profile: 'Construct Demo SRL', scenarios: 3, leadId: lead.id, draftQuoteId: draftQuote.id, approvalQuoteId: approvalQuote.id, shortageQuoteId: shortageQuote.id, orderId: fullOrder.id, inventoryCheckId: inventoryCheck.id, procurementRequirementIds: procurement.requirements.map(item => item.id), proformaId: proforma.document.id })
  writeDb(db)
  return { lead, draftQuote, approvalQuote, shortageQuote, order: fullOrder, inventoryCheck, procurement, proforma, demoToken }
}

function hasCommercialDemoMarker() {
  try { return readDb()?.settings?.demo_profile === 'commercial-mssql' } catch { return false }
}

function main() {
  console.log('1/5 Verific baza demo separată...')
  createDatabaseIfMissing()
  console.log('2/5 Aplic schema CRM și migrările necesare...')
  ensureDatabase()
  if (hasCommercialDemoMarker() && !resetRequested) {
    throw new Error('Baza demo este deja pregătită. Rulează cu --reset numai dacă vrei să refaci exclusiv datele fictive ale bazei demo.')
  }
  if (resetRequested) {
    console.log('3/5 Curăț scenariile CRM demo anterioare...')
    clearCrmDemoData()
  } else {
    console.log('3/5 Pregătesc scenariile CRM demo...')
  }
  const db = prepareAppState()
  console.log('4/5 Salvez catalogul și utilizatorii demo...')
  writeDb(db)
  console.log('5/5 Creez lead-uri, oferte, comandă, stoc și proformă...')
  const result = seedCommercialScenarios(db)
  console.log('=== InfraFlow demo comercial MSSQL pregătit ===')
  console.log(`Baza: ${targetDatabase}`)
  console.log('Organizație: Construct Demo SRL')
  console.log('Utilizatori suplimentari: vanzari.demo, aprobare.demo, achizitii.demo, contabilitate.demo')
  console.log('Parola: aceeași parolă demo existentă (nu este schimbată de acest script).')
  console.log(`Lead nou: ${result.lead.id}`)
  console.log(`Ofertă draft: ${result.draftQuote.quote_number}`)
  console.log(`Ofertă în aprobare: ${result.approvalQuote.quote_number}`)
  console.log(`Comandă cu deficit: ${result.order.order_number}`)
  console.log(`Necesar(e) creat(e): ${result.procurement.requirements.length}`)
  console.log(`Proformă: ${result.proforma.document.provider_document_id}`)
  console.log('SMTP nu este configurat de script. Configurează-l local în Setări cu contul demo, fără a salva parola în cod.')
}

function safeErrorMessage(error) {
  const raw = String(error?.message || error || '')
  const lowered = raw.toLowerCase()
  if (lowered.includes('login failed')) return 'Nu am putut autentifica utilizatorul SQL Server. Rulează scriptul în runtime-ul serverului demo sau configurează local credențialele SQL; parola nu se introduce în script.'
  if (lowered.includes('server was not found') || lowered.includes('not accessible') || lowered.includes('error locating server')) return 'SQL Server nu este accesibil. Verifică serviciul SQL Server și configurația locală de conectare pentru instanța demo.'
  return raw.replace(/#< CLIXML[\s\S]*/i, '').replace(/_x000D_|_x000A_/g, ' ').replace(/\s+/g, ' ').trim() || 'Nu am putut pregăti baza demo.'
}

try { main() } catch (error) { console.error(`EROARE demo comercial: ${safeErrorMessage(error)}`); process.exitCode = 1 }
