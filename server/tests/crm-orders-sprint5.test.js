const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const migration = fs.readFileSync(path.join(root, 'db/migrations/074_crm_customer_orders_sprint_5.sql'), 'utf8')
const repository = fs.readFileSync(path.join(root, 'server/modules/crm/order-repository.js'), 'utf8')
const routes = fs.readFileSync(path.join(root, 'server/modules/crm/routes.js'), 'utf8')
const quotePage = fs.readFileSync(path.join(root, 'client/src/pages/modules/CrmQuotesPage.jsx'), 'utf8')
const db = fs.readFileSync(path.join(root, 'server/core/db.js'), 'utf8')

test('Sprintul 5 păstrează legătura comenzii cu oferta, revizia și decizia de acceptare', () => {
  assert.match(migration, /source_quote_revision/)
  assert.match(migration, /source_decision_id/)
  assert.match(migration, /FK_crm_customer_orders_decision/)
  assert.match(repository, /source_quote_revision/)
  assert.match(repository, /source_decision_id/)
  assert.match(repository, /decision=N'accepted'/)
  assert.match(db, /074_crm_customer_orders_sprint_5\.sql/)
})

test('conversia ofertă acceptată către comandă este atomică și idempotentă', () => {
  assert.match(repository, /BEGIN TRANSACTION/)
  assert.match(repository, /WITH \(UPDLOCK,HOLDLOCK\)/)
  assert.match(repository, /@quoteStatus<>N'accepted'/)
  assert.match(repository, /already_created/)
  assert.match(repository, /INSERT INTO crm\.customer_order_lines/)
  assert.match(repository, /source_snapshot/)
})

test('API-ul CRM cere permisiune dedicată, auditează conversia și nu pornește încă alte module', () => {
  assert.match(routes, /\/crm\/quotes\/:id\/customer-order/)
  assert.match(routes, /requireCrm\(req, res, 'crm:order_manage'\)/)
  assert.match(routes, /crm:customer_order_created/)
  assert.match(routes, /crm:customer_order_cancelled/)
  assert.match(routes, /Stocul, aprovizionarea şi facturarea vor folosi porturi distincte/)
})

test('ecranul ofertei oferă conversia explicită după acceptare și păstrează controlul uman asupra stocului', () => {
  assert.match(quotePage, /quote\.status === 'accepted'/)
  assert.match(quotePage, /Creează comandă client/)
  assert.match(quotePage, /customer-order/)
  assert.match(quotePage, /Verifică stocul/)
  assert.match(quotePage, /Creează necesar în Achiziții/)
  assert.match(quotePage, /nu rezervă și nu modifică stocul/)
})
