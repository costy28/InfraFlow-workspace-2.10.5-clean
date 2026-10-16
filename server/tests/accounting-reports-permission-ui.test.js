const fs = require('fs')
const path = require('path')
const test = require('node:test')
const assert = require('node:assert/strict')

function page(name) {
  return fs.readFileSync(path.join(__dirname, `../../client/src/pages/accounting/${name}.jsx`), 'utf8')
}

test('rapoartele financiare separa administrarea maparilor de consultare', () => {
  const source = page('SituatiiFinanciare')
  assert.match(source, /canManage = canAccess\(user, 'accounting:manage'\)/)
  assert.match(source, /canManage \? \{ label: 'Adauga mapare'/)
  assert.match(source, /canManage \? <DropdownMenu label="Actiuni"/)
})

test('registrul jurnal separa postarea de raportare', () => {
  const source = page('RegistruJurnal')
  assert.match(source, /canPost = canAccess\(user, 'accounting:post'\)/)
  assert.match(source, /canReport = canAccess\(user, 'accounting:reports'\)/)
  assert.match(source, /canPost \? \{ label: 'Nota manuala noua'/)
  assert.match(source, /canReport \? \{ label: 'Export Excel'/)
})

test('declaratiile diverse si auditul fiscal ascund mutatiile fara drept de postare', () => {
  const declarations = page('DeclaratiiDiverse')
  const audit = page('AuditFiscal')
  assert.match(declarations, /canPost = canAccess\(user, 'accounting:post'\)/)
  assert.match(declarations, /\{canPost \? <form/)
  assert.match(audit, /canPost = canAccess\(user, 'accounting:post'\)/)
  assert.match(audit, /canPost \? \{ label: busy \? 'Se proceseaza\.\.\.' : 'Ruleaza acceptanta'/)
})

test('centrul fiscal separa postarea, administrarea schemelor si inchiderea TVA', () => {
  const source = page('TVADeclaratii')
  assert.match(source, /canPost = canAccess\(user, 'accounting:post'\)/)
  assert.match(source, /canManage = canAccess\(user, 'accounting:manage'\)/)
  assert.match(source, /canClose = canAccess\(user, 'accounting:close'\)/)
  assert.match(source, /if \(declarationCode && canPost\)/)
  assert.match(source, /canManage \? <>/)
  assert.match(source, /canClose && canCheckVat/)
})
