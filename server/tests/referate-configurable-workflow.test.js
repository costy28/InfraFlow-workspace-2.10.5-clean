const fs = require('fs')
const path = require('path')
const test = require('node:test')
const assert = require('node:assert/strict')

const routes = fs.readFileSync(path.join(__dirname, '../modules/referate/routes.js'), 'utf8')
const engine = fs.readFileSync(path.join(__dirname, '../modules/documents/engine.js'), 'utf8')
const page = fs.readFileSync(path.join(__dirname, '../../client/src/pages/modules/ReferatePage.jsx'), 'utf8')
const settings = fs.readFileSync(path.join(__dirname, '../../client/src/pages/SetariPage.jsx'), 'utf8')
const inventoryRoutes = fs.readFileSync(path.join(__dirname, '../modules/inventory/routes.js'), 'utf8')

test('referatele noi captureaza circuitul configurat al organizatiei', () => {
  assert.match(routes, /buildWorkflowSnapshot/)
  assert.match(routes, /referat\.workflow_snapshot = workflowSnapshotForReferat/)
  assert.match(routes, /referat\.workflow_step_index = -1/)
  assert.match(engine, /buildWorkflowSnapshot,/)
})

test('circuitul configurat este executat din snapshot, nu din setarea modificabila', () => {
  assert.match(routes, /referat\.workflow_snapshot\?\.steps\?\.length/)
  assert.match(routes, /configuredStep\(referat\)/)
  assert.match(routes, /Nu ești responsabilul pasului curent din circuit/)
  assert.match(routes, /createOrder\(auth\.db, auth\.user, referat\)/)
})

test('circuitul vechi ramane compatibil pentru referatele existente', () => {
  assert.match(routes, /const FLOW = \[/)
  assert.match(routes, /const STEP_PERMISSIONS = \{/)
  assert.match(routes, /Object\.hasOwn\(STEP_PERMISSIONS, referat\.status\)/)
})

test('interfata arata pasul configurat si ascunde decizia utilizatorilor neautorizati', () => {
  assert.match(page, /current_workflow_step\?\.name/)
  assert.match(page, /selected\.can_advance/)
  assert.match(page, /Pasul curent așteaptă responsabilul configurat de organizație/)
  assert.match(page, /receiveOpen && canReceive/)
})

test('editorul central contine fluxul referat administrabil', () => {
  assert.match(settings, /id: 'referat'/)
  assert.match(settings, /document_type: 'referat'/)
  assert.match(settings, /Fiecare organizație își setează propriul circuit/)
})

test('creatorul de referat poate citi optiunile minimale de materiale', () => {
  const materialOptionsRoutes = inventoryRoutes.match(/material-options[\s\S]{0,1000}/g) || []
  assert.equal(materialOptionsRoutes.length >= 2, true)
  materialOptionsRoutes.forEach((route) => assert.match(route, /referate:create/))
})
