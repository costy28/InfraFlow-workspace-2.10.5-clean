const test = require('node:test')
const assert = require('node:assert/strict')
const { employeeWritePermissions } = require('../modules/hr/data-policy')

test('payload-ul formularului exclude exact câmpurile interzise pe server', async () => {
  const { employeeWritePayload, canWriteEmployeeField } = await import('../../client/src/lib/hr-employee-write.mjs')
  const rights = ['hr:personal_sensitive', 'hr:medical_view', 'hr:salary_view', 'users:manage']
  const fields = ['nume', 'cnp', 'adresa', 'iban', 'act_identitate_numar', 'data_nasterii', 'photo_url', 'casa_sanatate', 'apt_medical_expira', 'adeverinta_medicala', 'salariu_baza', 'cost_ora', 'user_id']
  for (let mask = 0; mask < 16; mask++) {
    const has = p => Boolean(mask & (1 << rights.indexOf(p)))
    const body = Object.fromEntries(fields.map(field => [field, null]))
    const result = employeeWritePayload(body, has)
    assert.ok(employeeWritePermissions(result).every(has))
    assert.equal(Object.keys(body).length, fields.length)
    for (const field of fields) assert.equal(canWriteEmployeeField(field, has), employeeWritePermissions({ [field]: null }).every(has))
  }
})
