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

test('cursa poate lega numai o comandă client CRM confirmată', () => {
  assert.match(routes, /const crmOrderRepository = require\('\.\.\/crm\/order-repository'\)/)
  assert.match(routes, /function resolveConfirmedCrmOrder/)
  assert.match(routes, /order\.status !== 'confirmed'/)
  assert.match(routes, /crm_comanda_numar/)
  assert.match(routes, /crm_orders_available/)
})

test('pregătirea din stoc este verificată și confirmată manual, fără scădere automată', () => {
  assert.match(routes, /function buildStockPreparation/)
  assert.match(routes, /stock-preparation\/check/)
  assert.match(routes, /stock-preparation\/confirm/)
  assert.match(routes, /Pregătirea nu poate fi confirmată cât timp există poziții neidentificate sau stoc insuficient/)
  assert.match(routes, /Stocul nu a fost modificat automat/)
  assert.doesNotMatch(routes, /material\.stock\s*=/)
})

test('RO e-Transport rămâne evidență manuală până la configurarea autorizată', () => {
  assert.match(routes, /ETRANSPORT_STATUSES/)
  assert.match(routes, /router\.post\('\/logistics\/trips\/:id\/etransport'/)
  assert.match(routes, /declarat_manual/)
  assert.match(routes, /Introdu UIT-ul primit înainte de a marca declarația ca înregistrată manual/)
  assert.match(routes, /sursa: 'evidenta_manuala'/)
  assert.doesNotMatch(routes, /api\.anaf\.ro/)
})

test('legătura GPS este un adaptor neutru fără apeluri live', () => {
  assert.match(routes, /GPS_ADAPTER_STATUSES/)
  assert.match(routes, /router\.post\('\/logistics\/trips\/:id\/gps-adapter'/)
  assert.match(routes, /Nu s-au citit date live/)
  assert.match(routes, /nu contactează niciun furnizor/)
  assert.doesNotMatch(routes, /urmariregps\.ro/)
})
