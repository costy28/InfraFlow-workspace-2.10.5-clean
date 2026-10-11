const test = require('node:test')
const assert = require('node:assert/strict')
const { canReadEmployeeFile } = require('../modules/hr/file-access')
function auth(permissions) {
  return { user: { id: 'u1', role: 'limited' }, db: { settings: { customRoles: [{ id: 'limited', permissions }] }, hr: { employees: [{ id: 1, user_id: 'u1' }, { id: 2, user_id: 'u2' }] } } }
}
test('vizualizarea HR nu acordă acces la fișierele colegului', () => {
  for (const tip of ['contract', 'medical', 'altul']) assert.equal(canReadEmployeeFile(auth(['hr:view']), { employee_id: 2, tip }), false)
})
test('documentele proprii rămân accesibile', () => {
  assert.equal(canReadEmployeeFile(auth(['hr:view']), { employee_id: 1, tip: 'contract' }), true)
})
test('drepturile salariale și medicale sunt separate pe tipul documentului', () => {
  const a = auth(['hr:view', 'hr:personal_sensitive', 'hr:salary_view'])
  assert.equal(canReadEmployeeFile(a, { employee_id: 2, tip: 'contract' }), true)
  assert.equal(canReadEmployeeFile(a, { employee_id: 2, tip: 'medical' }), false)
  assert.equal(canReadEmployeeFile(a, { employee_id: 2, tip: 'altul' }), false)
})
