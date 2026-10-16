const fs = require('fs')
const path = require('path')
const test = require('node:test')
const assert = require('node:assert/strict')

const root = path.join(__dirname, '..', '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

test('catalogul separa consultarea salariilor de administrarea salarizarii', () => {
  const source = read('server/core/permissions.js')
  assert.match(source, /"hr:salary_view"/)
  assert.match(source, /"hr:salary_manage"/)
  assert.match(source, /"hr:salary_manage": "Administreaza salarizarea"/)
})

test('toate mutatiile salariale cer permisiunea dedicata', () => {
  for (const file of [
    'server/modules/hr/payroll-routes.js',
    'server/modules/hr/payroll-advanced-routes.js',
    'server/modules/hr/payroll-obligation-routes.js',
    'server/modules/hr/payroll-payment-routes.js'
  ]) {
    const source = read(file)
    assert.match(source, /requirePermission\(auth, res, "hr:salary_manage"\)/, file)
  }
})

test('interfata salarizarii ascunde operatiile in modul consultare', () => {
  const source = read('client/src/pages/accounting/Salarizare.jsx')
  assert.match(source, /canManageSalary = canAccess\(user, 'hr:salary_manage'\)/)
  assert.match(source, /canManageSalary \? \{ label: run \? 'Regenereaza din pontaj'/)
  assert.match(source, /canManageSalary && run\?\.status === 'draft'/)
  assert.match(source, /Salarizare în mod consultare/)
  assert.match(source, /onRegenerate=\{canManageSalary \? generate : null\}/)
})

test('sursa MSSQL de salarizare accepta denumirea canonica si schema legacy a departamentelor', () => {
  const source = read('server/modules/hr/payroll-data-source.js')
  assert.match(source, /COL_LENGTH\(N'core\.departments', N'name'\)/)
  assert.match(source, /COL_LENGTH\(N'core\.departments', N'denumire'\)/)
  assert.match(source, /QUOTENAME\(@departmentColumn\)/)
})
