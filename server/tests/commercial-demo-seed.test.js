const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', '..')
const seedScript = fs.readFileSync(path.join(root, 'scripts', 'seed-commercial-demo-mssql.js'), 'utf8')
const guide = fs.readFileSync(path.join(root, 'docs', 'DEMO_COMERCIAL_MSSQL.md'), 'utf8')
const releaseScript = fs.readFileSync(path.join(root, 'scripts', 'windows', 'build-update-zip.ps1'), 'utf8')
const startScript = fs.readFileSync(path.join(root, 'scripts', 'windows', 'start-commercial-demo-mssql.ps1'), 'utf8')
const { isCrmModuleEnabled } = require(path.join(root, 'server', 'modules', 'crm', 'service'))

test('seed-ul comercial este limitat la baze demo MSSQL', () => {
  assert.match(seedScript, /\^INFRAFLOW_DEMO/)
  assert.match(seedScript, /INFRAFLOW_DEMO_DATABASE/)
  assert.match(seedScript, /resetRequested/)
  assert.match(seedScript, /--reset/)
})

test('seed-ul comercial folosește CRM relațional și scenariile comerciale cerute', () => {
  for (const marker of ['crm.createLead', 'quotes.createQuote', 'orders.createFromAcceptedQuote', 'inventoryChecks.recordCheck', 'createRequirementsFromCrmOrder', 'createProforma']) {
    assert.ok(seedScript.includes(marker), `lipsește ${marker}`)
  }
  for (const marker of ['Construct Demo SRL', 'Flux simplu', 'Lipsă stoc', 'Managerial']) assert.ok(guide.includes(marker), `lipsește ${marker}`)
  assert.match(seedScript, /setupCompleted = true/)
})

test('adresa SMTP nu este hard-codată în seed-ul comercial', () => {
  assert.equal(seedScript.includes('demo.infraflow@gmail.com'), false)
  assert.match(guide, /App Password/)
})

test('instrumentele demo comerciale nu intră în update-ul de producție', () => {
  for (const marker of ['seed-commercial-demo-mssql.js', 'seed-commercial-demo-mssql.ps1', 'start-commercial-demo-mssql.ps1', 'DEMO_COMERCIAL_MSSQL.md']) assert.ok(releaseScript.includes(marker), `lipsește excluderea ${marker}`)
})

test('pornirea demo comercială rămâne izolată de instanța operațională', () => {
  assert.match(startScript, /INFRAFLOW_DEMO/)
  assert.match(startScript, /\$Port = 4191/)
  assert.match(startScript, /INFRAFLOW_SCHEDULER_DISABLED/)
})

test('profilul demo comercial activează CRM doar pentru baza demo dedicată', () => {
  const previousDatabase = process.env.DB_DATABASE
  try {
    const db = { settings: { demo_profile: 'commercial-mssql', modules_enabled: ['crm'], license: { modules: ['all'] } } }
    process.env.DB_DATABASE = 'INFRAFLOW_DEMO'
    assert.equal(isCrmModuleEnabled(db, { modules: ['inventory'] }), true)
    process.env.DB_DATABASE = 'INFRAFLOW_PRODUCTIE'
    assert.equal(isCrmModuleEnabled(db, { modules: ['inventory'] }), false)
  } finally {
    if (previousDatabase === undefined) delete process.env.DB_DATABASE
    else process.env.DB_DATABASE = previousDatabase
  }
})

test('erorile de conectare SQL sunt explicate fără output PowerShell intern', () => {
  assert.match(seedScript, /safeErrorMessage/)
  assert.match(seedScript, /Nu am putut autentifica utilizatorul SQL Server/)
  assert.match(seedScript, /CLIXML/)
})
