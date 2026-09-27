const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const {
  normalizeLeadPayload, normalizeAccountPayload, normalizeContactPayload, normalizeActivityPayload
} = require('../modules/crm/service')

const root = path.resolve(__dirname, '../..')
const routes = fs.readFileSync(path.join(root, 'server/modules/crm/routes.js'), 'utf8')
const repository = fs.readFileSync(path.join(root, 'server/modules/crm/repository.js'), 'utf8')
const taskRoutes = fs.readFileSync(path.join(root, 'server/modules/tasks/routes.js'), 'utf8')
const migration = fs.readFileSync(path.join(root, 'db/migrations/071_crm_sales_automation_sprint_2.sql'), 'utf8')

test('lead-ul validează câmpurile comerciale obligatorii și motivul de pierdere', () => {
  const lead = normalizeLeadPayload({ title: 'Solicitare mentenanță', source: 'web', status: 'new', estimated_value: '1200.50' })
  assert.equal(lead.title, 'Solicitare mentenanță')
  assert.equal(lead.estimated_value, 1200.5)
  assert.throws(() => normalizeLeadPayload({ title: 'X', source: 'altceva' }), /Sursa lead-ului este invalidă/)
  assert.throws(() => normalizeLeadPayload({ title: 'X', source: 'manual', status: 'lost' }), /Motivul pierderii este obligatoriu/)
  assert.deepEqual(normalizeLeadPayload({ status: 'contacted', assigned_to: '' }, { partial: true }), { status: 'contacted', assigned_to: null })
})

test('prospectele, contactele și activitățile sunt validate înainte de MSSQL', () => {
  assert.equal(normalizeAccountPayload({ name: 'Exemplu SRL', accounting_party_id: 10 }).accounting_third_party_id, 10)
  assert.throws(() => normalizeAccountPayload({ name: 'Exemplu', email: 'fără-email' }), /Emailul account-ului este invalid/)
  assert.equal(normalizeContactPayload({ prenume: 'Ana', nume: 'Pop' }).display_name, 'Ana Pop')
  assert.throws(() => normalizeActivityPayload({ activity_type: 'call', subject: 'Apel', lead_id: 'x' }), /Lead-ul selectat este invalid/)
  assert.equal(normalizeActivityPayload({ activity_type: 'meeting', subject: 'Demo' }).activity_type, 'meeting')
  assert.ok(normalizeActivityPayload({ activity_type: 'follow_up_result', subject: 'Follow-up' }).occurred_at)
})

test('Sprintul 2 folosește ruta Task Management existentă pentru follow-up', () => {
  assert.match(taskRoutes, /value: 'crm_lead'/)
  assert.match(taskRoutes, /function createLinkedTask/)
  assert.match(routes, /taskRouter\.createLinkedTask/)
  assert.match(routes, /source_type: 'crm_lead'/)
  assert.match(routes, /crm:follow_up_created/)
  assert.match(routes, /repository\.createActivity\(normalizeActivityPayload\(/)
})

test('erorile interne CRM sunt păstrate în jurnalul serverului, nu expuse în interfață', () => {
  assert.match(routes, /console\.error\(`\[CRM\] \$\{fallback\}`/)
  assert.match(routes, /return res\.status\(500\)\.json\(\{ error: fallback \}\)/)
})

test('API CRM are rutele, permisiunile și auditul cerute', () => {
  ;['/crm/leads', '/crm/accounts', '/crm/contacts', '/crm/activities', '/crm/health', '/follow-up', '/convert', '/cancel'].forEach(route => assert.match(routes, new RegExp(route.replace(/[/:]/g, match => `\\${match}`))))
  ;['crm:view', 'crm:lead_create', 'crm:lead_manage'].forEach(permission => assert.match(routes, new RegExp(permission.replace(':', '\\:'))))
  ;['crm:lead_created', 'crm:lead_updated', 'crm:lead_status_changed', 'crm:lead_assignee_changed', 'crm:lead_converted', 'crm:lead_cancelled', 'crm:activity_created'].forEach(action => assert.match(routes, new RegExp(action.replace(':', '\\:'))))
  assert.match(routes, /CRM_RELATIONAL_SCHEMA_UNAVAILABLE/)
  assert.match(routes, /leadAudit/)
})

test('paginile CRM extrag identificatorul corect din rutele wildcard', () => {
  const leadPage = fs.readFileSync(path.join(root, 'client/src/pages/modules/CrmPage.jsx'), 'utf8')
  const quotePage = fs.readFileSync(path.join(root, 'client/src/pages/modules/CrmQuotesPage.jsx'), 'utf8')
  assert.match(leadPage, /routeParams\['\*'\].*match\(\/\^leads\\\/\(\[\^\/\]\+\)\$\//)
  assert.match(quotePage, /wildcardPath/)
  assert.ok(quotePage.includes("/^\\d+$/.test(wildcardPath)"))
})

test('conversia Lead în prospect este tranzacțională și fără terț contabil automat', () => {
  assert.match(repository, /BEGIN TRANSACTION/)
  assert.match(repository, /COMMIT TRANSACTION/)
  assert.match(repository, /lifecycle_status.*prospect/i)
  assert.doesNotMatch(repository.match(/function convertLead[\s\S]*?\n}\n\nfunction markPayload/)?.[0] || '', /accounting_third_party_id/i)
})

test('migrarea Sprint 2 completează istoricul și indicii fără rescrierea fundației', () => {
  ;['description', 'qualification_status', 'lost_reason', 'notes', 'mobile', 'subject', 'outcome', 'IX_crm_leads_followup', 'IX_crm_activities_lead_history'].forEach(token => assert.match(migration, new RegExp(token)))
  assert.doesNotMatch(migration, /CREATE TABLE crm\./i)
})
