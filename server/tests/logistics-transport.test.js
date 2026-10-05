const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const routes = fs.readFileSync(path.join(root, 'modules/logistics/routes.js'), 'utf8')

test('logistica păstrează tipurile neutre de documente și nu activează e-Transport automat', () => {
  assert.match(routes, /'aviz', 'cmr', 'bon_transport', 'pod'/)
  assert.match(routes, /Nu există transmitere automată către RO e-Transport sau ANAF/)
  assert.match(routes, /obligațiile fiscale și declarative se verifică separat/)
})

test('documentul de transport are legături opționale la comandă și contract', () => {
  assert.match(routes, /comanda_id/)
  assert.match(routes, /contract_id/)
  assert.match(routes, /router\.get\('\/logistics\/context'/)
  assert.match(routes, /procurementOrders/)
  assert.match(routes, /contractManagement\?\.contracts/)
})

test('anularea este controlată și păstrează documentul în istoric', () => {
  assert.match(routes, /router\.post\('\/logistics\/documents\/:id\/cancel'/)
  assert.match(routes, /document\.status = 'anulat'/)
  assert.match(routes, /logistics_document_cancelled/)
})

test('cursa este obiectul central și poate avea documente de transport legate', () => {
  assert.match(routes, /db\.logistics\.trips/)
  assert.match(routes, /router\.get\('\/logistics\/trips'/)
  assert.match(routes, /router\.post\('\/logistics\/trips'/)
  assert.match(routes, /cursa_id/)
  assert.match(routes, /logistics_trip_created/)
  assert.match(routes, /logistics_trip_cancelled/)
})

test('cursa folosește alocări opționale din flotă și HR, fără integrare externă', () => {
  assert.match(routes, /fleetAssets/)
  assert.match(routes, /hr\?\.employees/)
  assert.match(routes, /Nu există transmitere automată către RO e-Transport sau ANAF/)
})

test('livrarea confirmată și dovezile sunt atașate controlat la cursă', () => {
  assert.match(routes, /router\.post\('\/logistics\/trips\/:id\/delivery-confirmation'/)
  assert.match(routes, /logisticsUpload\.single\('file'\)/)
  assert.match(routes, /LOGISTICS_ALLOWED_EXT/)
  assert.match(routes, /LOGISTICS_STORAGE_DIR/)
  assert.match(routes, /logistics_trip_delivery_confirmed/)
  assert.match(routes, /logistics_trip_attachment_uploaded/)
  assert.match(routes, /res\.download/)
})

test('planificarea avertizează asupra suprapunerilor și păstrează costuri manuale', () => {
  assert.match(routes, /router\.post\('\/logistics\/trips\/planning-check'/)
  assert.match(routes, /buildPlanningCheck/)
  assert.match(routes, /conflict_vehicul/)
  assert.match(routes, /conflict_sofer/)
  assert.match(routes, /cost_estimat/)
  assert.match(routes, /cost_real/)
})

test('execuția manuală păstrează plecarea și sosirea efective, cu audit', () => {
  assert.match(routes, /router\.post\('\/logistics\/trips\/:id\/execution\/start'/)
  assert.match(routes, /router\.post\('\/logistics\/trips\/:id\/execution\/arrival'/)
  assert.match(routes, /plecare_efectiva/)
  assert.match(routes, /sosire_efectiva/)
  assert.match(routes, /logistics_trip_execution_started/)
  assert.match(routes, /logistics_trip_execution_arrived/)
  assert.match(routes, /sosita/)
  assert.match(routes, /Folosește acțiunea Plecare/)
  assert.match(routes, /Folosește acțiunea Sosire/)
})

test('monitorizarea semnalează numai întârzieri și confirmări lipsă din datele locale', () => {
  assert.match(routes, /buildOperationalMonitoring/)
  assert.match(routes, /plecare_intarziata/)
  assert.match(routes, /sosire_intarziata/)
  assert.match(routes, /livrare_neconfirmata/)
  assert.match(routes, /pending_delivery_confirmation/)
})

test('raportul logistic păstrează costurile separate pe monedă și permite export Excel', () => {
  assert.match(routes, /function buildOperationalReport\(db, filters = \{\}\)/)
  assert.match(routes, /costuri: Object\.values\(costs\)/)
  assert.match(routes, /function sendOperationalReportWorkbook/)
  assert.match(routes, /router\.get\('\/logistics\/reports\/operational'/)
  assert.match(routes, /format.*xlsx/)
})
