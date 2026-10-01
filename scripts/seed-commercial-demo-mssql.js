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
    { id: 'demo-procurement', name: 'Achiziții demo', description: 'Verifică deficitul și primește necesarul din comenzile clienților.', tip: 'demo', permissions: ['dashboard:view', 'crm:view', 'crm:order_manage', 'crm:inventory_check', 'crm:procurement_request', 'procurement_orders:view', 'procurement_orders:create', 'department_requests:view', 'planning:view'] },
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
  const sourceAdmin = loadDemoAdministrator()
  // Resetul reface exclusiv datele fictive. Administratorul poate avea deja
  // o parolă proprie, pe care seed-ul nu are voie să o înlocuiască.
  const existingAdmin = (db.users || []).find(user => user.username === 'admin')
  const admin = {
    ...sourceAdmin,
    passwordHash: existingAdmin?.passwordHash || sourceAdmin.passwordHash,
    active: existingAdmin?.active !== false
  }
  db.users = (db.users || []).filter(user => user.username !== 'admin')
  db.users.push({ ...admin, active: true })
  db.settings = db.settings || {}
  // Demo-ul comercial arată toate modulele. Limitările de date și resetarea
  // protejează demonstrația; licența nu trebuie să blocheze explorarea.
  db.settings.modules_enabled = [
    'fleet', 'technical', 'procurement', 'contract_management', 'crm', 'hr',
    'controlling', 'accounting', 'sanitation', 'traffic_safety', 'environment',
    'snow_removal', 'documents', 'messaging', 'tickets', 'field', 'legal',
    'archive', 'secretariat', 'ai'
  ]
  db.settings.demo_mode = true
  db.settings.demo_profile = 'commercial-mssql'
  db.settings.demo_seeded_at = new Date().toISOString()
  db.settings.setupCompleted = true
  db.settings.companyName = 'Construct Demo SRL'
  db.settings.publicUrl = ''
  db.settings.license = { plan: 'internal', modules: ['all'], maxUsers: 50, maxDevices: 50, clientName: 'Construct Demo SRL', source: 'demo-seed' }
  db.settings.customRoles = [...(db.settings.customRoles || []).filter(role => !String(role.id || '').startsWith('demo-')), ...demoRoles()]
  db.company = { ...(db.company || {}), name: 'Construct Demo SRL', email: 'demo@infraflow-demo.ro', license_type: 'demo', demo_mode: true }
  db.departments = [
    { id: 'DEPT-DEMO-SALES', cod: 'vanzari', denumire: 'Vânzări', name: 'Vânzări', moduleKey: 'crm', active: true },
    { id: 'DEPT-DEMO-PROC', cod: 'achizitii', denumire: 'Achiziții', name: 'Achiziții', moduleKey: 'achizitii', active: true },
    { id: 'DEPT-DEMO-OPS', cod: 'operational', denumire: 'Operațional', name: 'Operațional', moduleKey: 'tehnic', active: true },
    { id: 'DEPT-DEMO-ACCOUNTING', cod: 'contabilitate', denumire: 'Contabilitate', name: 'Contabilitate', moduleKey: 'contabilitate', active: true }
  ]
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
  db.hr = {
    ...(db.hr || {}),
    employees: [
      { id: 'EMP-DEMO-001', nume: 'Marin', prenume: 'Ionuț', functie: 'Șef echipă', department_id: 'DEPT-DEMO-OPS', department: 'operational', activ: true, data_angajare: '2023-03-01', email: 'ionut.marin@construct-demo.example', telefon: '0722 410 101' },
      { id: 'EMP-DEMO-002', nume: 'Popescu', prenume: 'Elena', functie: 'Operator utilaj', department_id: 'DEPT-DEMO-OPS', department: 'operational', activ: true, data_angajare: '2024-05-15', email: 'elena.popescu@construct-demo.example', telefon: '0722 410 102' },
      { id: 'EMP-DEMO-003', nume: 'Rusu', prenume: 'Mihai', functie: 'Gestionar', department_id: 'dept-gestiune', department: 'gestiune', activ: true, data_angajare: '2022-09-01', email: 'mihai.rusu@construct-demo.example', telefon: '0722 410 103' }
    ],
    contracts: [
      { id: 'HR-CIM-DEMO-001', employee_id: 'EMP-DEMO-001', status: 'activ', data_start: '2023-03-01', functie: 'Șef echipă' },
      { id: 'HR-CIM-DEMO-002', employee_id: 'EMP-DEMO-002', status: 'activ', data_start: '2024-05-15', functie: 'Operator utilaj' }
    ]
  }
  db.fleetAssets = [
    { id: 'ASSET-DEMO-001', cod: 'UTIL-001', tip_asset: 'utilaj', marca: 'JCB', model: '3CX', name: 'Buldoexcavator JCB 3CX', nr_inventar: 'INV-DEMO-001', active: true, fuel_type: 'diesel', tank_capacity: 160, department_id: 'DEPT-DEMO-OPS' },
    { id: 'ASSET-DEMO-002', cod: 'AUTO-001', tip_asset: 'autovehicul', marca: 'Ford', model: 'Transit', name: 'Autoutilitară intervenție', nr_inmatriculare: 'NT 01 DEM', active: true, fuel_type: 'diesel', tank_capacity: 70, department_id: 'DEPT-DEMO-OPS' }
  ]
  db.fleet = { ...(db.fleet || {}), assets: db.fleetAssets, assetDrivers: [{ id: 'DRV-DEMO-001', asset_id: 'ASSET-DEMO-002', employee_id: 'EMP-DEMO-001', activ: true, data_start: '2025-01-01' }] }
  db.fleetAssetDrivers = db.fleet.assetDrivers
  db.recipes = [{ id: 'REC-DEMO-001', name: 'Rețetă mixtură demonstrativă', version: 1, active: true, percentages: { 'MAT-001': 5, 'MAT-003': 45, 'MAT-005': 50 }, createdBy: ACTORS.procurement, createdAt: new Date().toISOString() }]
  db.productionPlans = [{ id: 'PLAN-DEMO-001', recipeId: 'REC-DEMO-001', date: futureDate(2), quantity: 18, jobName: 'Amenajare acces Construct Demo', status: 'planned', createdBy: ACTORS.procurement, createdAt: new Date().toISOString() }]
  db.projects = [{ id: 'PROJECT-DEMO-001', code: 'PRJ-DEMO-001', name: 'Amenajare acces sediu Nord Construct', clientName: 'Nord Construct Grup SRL', type: 'lucrari', status: 'active', location: 'Piatra-Neamț', createdAt: new Date().toISOString() }]
  db.costCenters = [{ id: 'CC-DEMO-001', code: 'CC-OPER-01', name: 'Operațional - intervenții', active: true, managerId: ACTORS.procurement }]
  db.technicalClients = [{ id: 'TECH-CLIENT-001', name: 'Nord Construct Grup SRL', cif: 'RO40123456', active: true }]
  db.technicalWorkLogs = [{ id: 'TECH-LOG-001', date: futureDate(0), clientId: 'TECH-CLIENT-001', projectId: 'PROJECT-DEMO-001', title: 'Evaluare tehnică acces sediu', status: 'open', responsibleId: ACTORS.procurement, createdAt: new Date().toISOString() }]
  db.contractManagement = {
    ...(db.contractManagement || {}),
    contracts: [{ id: 'CTR-DEMO-001', uuid: crypto.randomUUID(), numar: 'CTR-DEMO-2026-001', titlu: 'Aprovizionare materiale intervenții', tip: 'achizitie', status: 'activ', partener: 'Agregate Moldova SRL', partener_tip: 'furnizor', valoare_contract: 85000, moneda: 'RON', data_semnare: futureDate(-20), data_start: futureDate(-20), data_sfarsit: futureDate(180), responsabil_id: ACTORS.procurement, responsabil_nume: 'Oana Petrescu', departament_id: 'DEPT-DEMO-PROC', centru_cost_id: 'CC-DEMO-001', prag_avertizare: 80, prag_critic: 90, prag_depasire: 100, observatii: 'Contract fictiv pentru demonstrație.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
    consumptions: [{ id: 'CTR-CONS-DEMO-001', contract_id: 'CTR-DEMO-001', value: 24000, date: futureDate(-2), source_type: 'procurement', source_id: 'REQ-DEMO-001', created_at: new Date().toISOString() }],
    alerts: []
  }
  db.taskManagement = {
    ...(db.taskManagement || {}),
    tasks: [
      { id: 'TASK-DEMO-001', title: 'Califică solicitarea Atlas Servicii', description: 'Verifică datele solicitării și stabilește următorul pas comercial.', status: 'open', priority: 'high', due_date: futureDate(1), created_by: ACTORS.sales, assigned_to: ACTORS.sales, source_type: 'crm_lead', source_id: 'demo', source_label: 'Lead demonstrativ', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 'TASK-DEMO-002', title: 'Verifică necesarul de Bitum 50/70', description: 'Analizează deficitul rezultat din comanda clientului și propune aprovizionarea.', status: 'in_progress', priority: 'high', due_date: futureDate(2), created_by: ACTORS.procurement, assigned_to: ACTORS.procurement, source_type: 'procurement', source_id: 'REQ-DEMO-001', source_label: 'Necesar aprovizionare demo', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    ], comments: [], attachments: [], templates: []
  }
  db.messaging = { ...(db.messaging || {}), channels: [{ id: 'CHANNEL-DEMO-001', name: 'Operațional demo', description: 'Canal fictiv pentru coordonarea scenariului demonstrativ.', active: true, created_at: new Date().toISOString() }], messages: [] }
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
