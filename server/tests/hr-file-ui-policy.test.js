const test = require('node:test')
const assert = require('node:assert/strict')
const { canReadEmployeeFile } = require('../modules/hr/file-access')

test('politica UI a categoriilor corespunde politicii serverului', async () => {
  const { canAccessHrFileType } = await import('../../client/src/lib/hr-file-access.mjs')
  const rights = ['hr:personal_sensitive', 'hr:medical_view', 'hr:salary_view']
  for (let mask = 0; mask < 8; mask++) {
    const permissions = rights.filter((_, index) => mask & (1 << index))
    const user = { id: 'reader', role: 'limited' }
    const employee = { id: 2, user_id: 'other' }
    const auth = { user, db: { settings: { customRoles: [{ id: 'limited', permissions }] }, hr: { employees: [employee] } } }
    for (const type of ['contract', 'act_aditional', 'medical', 'identitate', 'ssm', 'diploma', 'altul']) {
      assert.equal(canAccessHrFileType(user, employee, type, p => permissions.includes(p)), canReadEmployeeFile(auth, { employee_id: 2, tip: type }), `${mask}/${type}`)
    }
  }
})

test('documentele proprii rămân accesibile, angajatul absent nu', async () => {
  const { canAccessHrFileType } = await import('../../client/src/lib/hr-file-access.mjs')
  assert.equal(canAccessHrFileType({ id: 3 }, { id: 2, user_id: 3 }, 'medical', () => false), true)
  assert.equal(canAccessHrFileType({ employee_id: 2 }, { id: 2 }, 'contract', () => false), true)
  assert.equal(canAccessHrFileType({ id: 3 }, null, 'contract', () => true), false)
})
