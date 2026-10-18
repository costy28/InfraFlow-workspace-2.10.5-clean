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
test('parametrii SQL de departament sunt UUID nullable, fără conversie implicită a șirului gol', () => {
  assert.equal((source.match(/DECLARE @deptId uniqueidentifier = TRY_CONVERT\(uniqueidentifier, JSON_VALUE\(@p, '\$\.deptId'\)\);/g) || []).length, 3)
  assert.ok(!source.includes('DECLARE @deptId nvarchar'))
  assert.ok(!source.includes("NULLIF(@deptId, N'')"))
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

test('propunerile de legături în ramura relațională folosesc documentele SQL și accesul pe entitate', () => {
  const start = source.indexOf('router.emailLinkDocuments =')
  const snippet = source.slice(start, source.indexOf('module.exports = router', start))
  const rows = [
    { id: 1, creat_de: 'reader', steps: [], shares: [] },
    { id: 2, creat_de: 'other', steps: [], shares: [] },
    { id: 3, creat_de: 'other', steps: [{ document_id: 3, user_responsabil: 'reader' }], shares: [] },
  ]
  let queries = 0
  const helper = vm.runInNewContext(`${snippet}; router.emailLinkDocuments`, {
    router: {}, isMssqlMode: () => true,
    hasDocumentPermission: (actor, permission) => actor.user.permissions.includes(permission),
    mssqlArray: () => { queries++; return rows }, canViewDocument: canView,
  })
  assert.deepEqual(Array.from(helper(auth(['documents:view_own'])), row => row.id), [1, 3])
  assert.equal(queries, 1)
  assert.equal(helper(auth()).length, 0)
  assert.equal(queries, 1)
})
