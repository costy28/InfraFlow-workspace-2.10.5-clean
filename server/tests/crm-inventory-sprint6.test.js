const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const { checkAvailability } = require('../modules/crm/ports/inventory')
const { createRequirementsFromCrmOrder } = require('../modules/procurement/crm-port')
const routes = fs.readFileSync(path.join(root, 'server/modules/crm/routes.js'), 'utf8')
const quotePage = fs.readFileSync(path.join(root, 'client/src/pages/modules/CrmQuotesPage.jsx'), 'utf8')
const ports = fs.readFileSync(path.join(root, 'server/modules/crm/ports/index.js'), 'utf8')

function order(lines) { return { id: 44, order_number: 'CO-2026-0044', source_quote_id: 22, source_quote_revision: 1, lines } }
function materialLine({ reference = 'MAT-1', description = 'Piatra', quantity = 5, unit = 't' } = {}) {
  return { id: 1, line_no: 1, item_code: reference, description, quantity, unit, line_snapshot: JSON.stringify({ item_type: 'material', item_reference: reference, description, unit }) }
}

test('verificarea de stoc este read-only și raportează disponibilitatea sau deficitul', () => {
  const db = { materials: [{ id: 'material-1', code: 'MAT-1', name: 'Piatra', unit: 't', stock: 3 }] }
  const result = checkAvailability({ order: order([materialLine()]), db })
  assert.equal(result.check_status, 'shortage')
  assert.equal(result.reservation, 'none')
  assert.equal(result.lines[0].available_quantity, 3)
  assert.equal(result.lines[0].shortage_quantity, 2)
  assert.equal(db.materials[0].stock, 3)
})

test('materialele nemapate sunt semnalate, nu asociate aproximativ', () => {
  const result = checkAvailability({ order: order([materialLine({ reference: 'LIPSĂ', description: 'Alt material' })]), db: { materials: [{ id: 'material-1', code: 'MAT-1', name: 'Piatra', stock: 99 }] } })
  assert.equal(result.check_status, 'attention_required')
  assert.equal(result.lines[0].status, 'unmapped')
  assert.equal(result.procurement_candidates.length, 0)
})

test('deficitul creează un necesar existent în Achiziții și este idempotent', () => {
  const db = { materials: [{ id: 'material-1', code: 'MAT-1', name: 'Piatra', unit: 't', stock: 3 }], departmentRequests: [] }
  const checked = checkAvailability({ order: order([materialLine()]), db })
  const inventoryCheck = { id: 7, result: checked }
  const first = createRequirementsFromCrmOrder({ db, user: { id: 'admin', name: 'Admin' }, order: order([materialLine()]), inventoryCheck })
  const repeated = createRequirementsFromCrmOrder({ db, user: { id: 'admin', name: 'Admin' }, order: order([materialLine()]), inventoryCheck })
  assert.equal(first.created, 1)
  assert.equal(db.departmentRequests[0].source_type, 'crm_customer_order')
  assert.equal(db.departmentRequests[0].amount, 2)
  assert.equal(repeated.already_created, true)
  assert.equal(db.departmentRequests.length, 1)
})

test('Sprintul 6 are porturi explicite, permisiuni, audit și UI fără comandă automată la furnizor', () => {
  assert.match(ports, /inventory.*implemented: true/s)
  assert.match(ports, /procurement.*implemented: true/s)
  assert.match(routes, /\/crm\/customer-orders\/:id\/inventory-check/)
  assert.match(routes, /crm:inventory_check/)
  assert.match(routes, /crm:customer_order_inventory_checked/)
  assert.match(routes, /\/crm\/customer-orders\/:id\/procurement-requirements/)
  assert.match(routes, /crm:customer_order_procurement_requested/)
  assert.match(quotePage, /Verifică stocul/)
  assert.match(quotePage, /Creează necesar în Achiziții/)
  assert.match(quotePage, /nu rezervă și nu modifică stocul/)
})
