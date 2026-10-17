const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '../modules/documents/routes.js'), 'utf8')
const body = source.slice(source.indexOf('function canViewDocument('), source.indexOf('function documentByUuid('))
const canView = vm.runInNewContext(`${body}; canViewDocument`, {
  userHasPermission: (db, user, permission) => user.permissions.includes(permission),
  ensureDocumentsDb: db => db.documents,
})
const document = { id: 7, creat_de: 'owner', dept_initiatoare: 'd2' }
function auth(permissions = []) {
  return { user: { id: 'reader', departmentId: 'd1', permissions }, db: { documents: { circuitSteps: [], documentShares: [] } } }
}

test('document străin: dreptul propriu și partajarea nu conferă acces global', () => {
  assert.equal(canView(auth(['documents:view_own', 'documents:share']), document), false)
  assert.equal(canView(auth(['documents:view_all']), document), true)
  assert.equal(canView(auth(['documents:view_own']), { ...document, creat_de: 'reader' }), true)
})
test('context relațional: numai pasul sau partajarea documentului cerut acordă acces', () => {
  const actor = auth()
  assert.equal(canView(actor, document, { steps: [{ document_id: 7, user_responsabil: 'reader' }] }), true)
  assert.equal(canView(actor, document, { steps: [{ document_id: 8, user_responsabil: 'reader' }] }), false)
  assert.equal(canView(actor, document, { shares: [{ document_id: 7, shared_with_dept: 'd1' }] }), true)
})
test('partajarea expirată sau invalidă nu mai acordă acces', () => {
  for (const expires_at of ['2000-01-01T00:00:00Z', 'invalid']) {
    const shares = [{ document_id: 7, shared_with_user: 'reader', expires_at }]
    assert.equal(canView(auth(), document, { shares }), false)
    const actor = auth(); actor.db.documents.documentShares = shares
    assert.equal(canView(actor, document), false)
  }
})
test('departamentul absent nu corespunde unei partajări fără destinatar', () => {
  const actor = auth(); delete actor.user.departmentId
  assert.equal(canView(actor, document, { shares: [{ document_id: 7 }] }), false)
})
