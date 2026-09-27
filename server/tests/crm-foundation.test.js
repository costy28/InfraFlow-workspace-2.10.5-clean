const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { splitSqlBatches } = require('../core/migrations')
const { CRM_REQUIRED_TABLES, licenseAllowsCrm, isCrmModuleEnabled, schemaStatus, buildCrmHealth, assertSoftCancellation } = require('../modules/crm/service')
const { integrationPorts, unavailablePort } = require('../modules/crm/ports')
const { BillingProvider } = require('../modules/crm/providers/billing-provider')
const { permissionGroups, allPermissions, rolePermissionCatalog } = require('../core/permissions')

const migrationPath = path.resolve(__dirname, '../../db/migrations/070_crm_sales_automation_foundation.sql')
const migration = fs.readFileSync(migrationPath, 'utf8')

test('migrarea CRM creează exclusiv fundația relațională necesară', () => {
  assert.ok(splitSqlBatches(migration).length > 10)
  assert.match(migration, /CREATE SCHEMA crm/i)
  CRM_REQUIRED_TABLES.forEach(table => assert.match(migration, new RegExp(`CREATE TABLE crm\\.${table}`, 'i')))
  assert.match(migration, /FK_crm_contacts_account/i)
  assert.match(migration, /FK_crm_quote_lines_quote/i)
  assert.match(migration, /FK_crm_customer_orders_quote/i)
  assert.match(migration, /UX_crm_customer_orders_source_quote/i)
})

test('toate entitățile CRM păstrează UUID și anulare logică', () => {
  CRM_REQUIRED_TABLES.forEach(table => {
    const expression = new RegExp(`CREATE TABLE crm\\.${table}([\\s\\S]*?)(?:\\nEND\\nGO)`, 'i')
    const tableSql = migration.match(expression)?.[1] || ''
    assert.match(tableSql, /uuid UNIQUEIDENTIFIER NOT NULL/i, table)
    assert.match(tableSql, /cancelled_at DATETIME2 NULL/i, table)
    assert.match(tableSql, /cancelled_by NVARCHAR\(80\) NULL/i, table)
    assert.match(tableSql, /cancelled_reason NVARCHAR\(500\) NULL/i, table)
  })
  assert.deepEqual(assertSoftCancellation({ cancelled_at: null, cancelled_by: null, cancelled_reason: null }), {
    has_cancelled_at: true,
    has_cancelled_by: true,
    has_cancelled_reason: true
  })
})

test('CRM nu copiază date în modul JSON și raportează explicit cerința MSSQL', () => {
  const status = schemaStatus({ dbMode: 'json' })
  assert.equal(status.supported, false)
  assert.equal(status.ready, false)
  assert.equal(status.missing_tables.length, CRM_REQUIRED_TABLES.length)
  assert.match(status.reason, /nu este creată o copie paralelă/i)
})

test('modulul CRM respectă licența și activarea organizației', () => {
  assert.equal(licenseAllowsCrm({ modules: ['crm'] }), true)
  assert.equal(licenseAllowsCrm({ modules: ['sales_automation'] }), true)
  assert.equal(licenseAllowsCrm({ modules: ['hr'] }), false)
  assert.equal(isCrmModuleEnabled({ settings: { modules_enabled: ['crm'] } }, { modules: ['crm'] }), true)
  assert.equal(isCrmModuleEnabled({ settings: { modules_enabled: ['hr'] } }, { modules: ['crm'] }), false)
  const health = buildCrmHealth({ db: { settings: { modules_enabled: ['crm'] } }, license: { modules: ['crm'] }, dbMode: 'mssql', relationalStatus: { tables: CRM_REQUIRED_TABLES.map(table => `crm.${table}`) } })
  assert.equal(health.operational, true)
  assert.equal(health.schema.ready, true)
})

test('catalogul de permisiuni CRM este granular și nu atribuie roluri comerciale implicit', () => {
  const required = ['crm:view', 'crm:lead_create', 'crm:lead_manage', 'crm:quote_create', 'crm:quote_approve', 'crm:quote_send', 'crm:order_manage', 'crm:inventory_check', 'crm:procurement_request', 'crm:billing_request', 'crm:reports', 'crm:settings']
  assert.deepEqual(permissionGroups.crm, required)
  required.forEach(permission => assert.ok(allPermissions.includes(permission)))
  assert.ok(rolePermissionCatalog().some(group => group.id === 'crm'))
})

test('porturile și providerul de facturare sunt stubs controlate în Sprintul 1', () => {
  assert.deepEqual(Object.keys(integrationPorts).sort(), ['accounting', 'billing', 'documents', 'inventory', 'procurement', 'tasks', 'workflow'])
  assert.throws(() => unavailablePort('inventory').invoke(), error => error.code === 'CRM_PORT_NOT_IMPLEMENTED')
  const provider = new BillingProvider()
  ;['validateConnection', 'createProforma', 'createInvoice', 'getDocumentStatus'].forEach(operation => {
    const result = provider[operation]({})
    assert.equal(result.ok, false)
    assert.equal(result.code, 'CRM_BILLING_PROVIDER_NOT_CONFIGURED')
  })
})
