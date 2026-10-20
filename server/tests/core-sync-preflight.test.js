const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { analyzeCoreSync } = require('../../scripts/lib/core-sync-preflight')
const company = '11111111-1111-4111-8111-111111111111'
const department = '22222222-2222-4222-8222-222222222222'
const user = '33333333-3333-4333-8333-333333333333'
const hash = `scrypt:${'a'.repeat(32)}:${'b'.repeat(128)}`
function fixture() {
  return { source: { departments: [{ id: department, name: 'SECRET_DEPT', moduleKey: 'production', active: true }], users: [{ id: user, username: 'private_reader', name: 'SECRET_NAME', email: 'secret@example.invalid', role: 'viewer', departmentId: department, active: true, passwordHash: hash }] },
    target: { companies: [{ id: company }], roles: [{ role_key: 'viewer' }], modules: [{ module_key: 'production' }],
      departments: [{ id: department, company_id: company, name: 'SECRET_DEPT', module_key: 'production', active: true }],
      users: [{ id: user, company_id: company, department_id: department, username: 'private_reader', display_name: 'SECRET_NAME', role_key: 'viewer', active: true }] } }
}
const report = f => analyzeCoreSync(f.source, f.target, { companyId: company })
const codes = result => result.issues.map(issue => issue.code)
test('identități compatibile: raport numai de citire, fără autorizare pentru import', () => {
  const result = report(fixture())
  assert.equal(result.totals.blockers, 0); assert.equal(result.status, 'review_required')
  assert.equal(result.writeAuthorized, false); assert.equal(result.globalRelationalReadiness, false)
  assert.equal(result.counts.users.identitiesPresentInBoth, 1)
})
test('ID-uri legacy, roluri multiple și societate neprecizată nu sunt ghicite', () => {
  const f = fixture(); f.source.users[0].id = 'u-reader'; f.source.users[0].roles = ['viewer','manager']
  const result = analyzeCoreSync(f.source, f.target)
  for (const code of ['uuid_mapping_required','single_role_mapping_required','explicit_company_uuid_required']) assert.ok(codes(result).includes(code))
})
test('referințe și nomenclatoare necunoscute blochează analiza', () => {
  const f = fixture(); f.source.users[0].departmentId = '44444444-4444-4444-8444-444444444444'; f.source.users[0].role = 'custom'; f.source.departments[0].moduleKey = 'legacy-module'
  const result = report(f)
  for (const code of ['department_reference_missing','role_missing_in_target','module_mapping_required']) assert.ok(codes(result).includes(code))
})
test('duplicatele GUID și coliziunile uzuale de username sunt detectate', () => {
  const f = fixture(); f.source.users[0].id = 'abcdefab-cdef-4abc-8def-abcdefabcdef'; f.target.users[0].id = f.source.users[0].id
  f.source.users.push({ ...f.source.users[0], id: f.source.users[0].id.toUpperCase(), username: 'PRIVATE_READER' })
  assert.ok(codes(report(f)).includes('duplicate_id')); assert.ok(codes(report(f)).includes('duplicate_username'))
})
test('conflictele țintei nu devin suprascrieri și rândurile suplimentare sunt păstrate', () => {
  const f = fixture(); f.target.users[0].company_id = department
  f.target.departments.push({ ...f.target.departments[0], id: '55555555-5555-4555-8555-555555555555' })
  f.source.users.push({ ...f.source.users[0], id: '66666666-6666-4666-8666-666666666666' })
  const result = report(f)
  for (const code of ['target_company_conflict','target_username_collision','target_only_rows_preserved']) assert.ok(codes(result).includes(code))
  assert.equal(result.writeAuthorized, false)
})
test('aliasuri contradictorii, stări ambigue și parole legacy cer verificare', () => {
  const f = fixture(); f.source.users[0].department_id = company; f.source.users[0].active = 'false'; f.source.users[0].password = 'SECRET_PLAINTEXT'; delete f.source.users[0].passwordHash
  for (const code of ['conflicting_aliases','active_state_mapping_required','legacy_plaintext_password_present','compatible_password_hash_required']) assert.ok(codes(report(f)).includes(code))
})
test('departamentul păstrat numai ca nume nu este pierdut prin mapare implicită la NULL', () => {
  const f = fixture(); delete f.source.users[0].departmentId; f.source.users[0].department = 'SECRET_LEGACY_DEPARTMENT'
  const result = report(f)
  assert.ok(codes(result).includes('department_name_mapping_required'))
  assert.ok(!JSON.stringify(result).includes('SECRET_LEGACY_DEPARTMENT'))
})
test('raportul nu modifică intrările și nu publică date personale sau secrete', () => {
  const f = fixture(), before = JSON.stringify(f)
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) } }
  freeze(f)
  const output = JSON.stringify(report(f))
  assert.equal(JSON.stringify(f), before)
  for (const secret of ['SECRET_NAME','SECRET_DEPT','secret@example.invalid','private_reader',hash,user,company]) assert.ok(!output.includes(secret))
})
test('intrări incomplete și colecții paralele nu sunt tratate ca bază goală validă', () => {
  assert.ok(analyzeCoreSync(null, null).totals.blockers > 0)
  const f = fixture(); f.source.core = { users: [{ id: user }] }; assert.ok(codes(report(f)).includes('parallel_core_collection_requires_review'))
  f.source.users = Array.from({ length: 150 }, () => null)
  const result = report(f); assert.equal(result.issues.length, 100); assert.equal(result.issuesTruncated, true); assert.equal(result.counts.users.source, 150)
})
test('CLI refuză --apply și nu expune fragmente JSON invalide', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'infraflow-core-preflight-'))
  const input = path.join(directory, 'source.json'); fs.writeFileSync(input, '{SECRET_BAD_JSON')
  const script = path.resolve(__dirname, '../../scripts/diagnose-core-sync.js')
  for (const argv of [['--apply'],['--source',input,'--target',input]]) {
    const child = spawnSync(process.execPath, [script, ...argv], { encoding: 'utf8', windowsHide: true })
    assert.equal(child.status, 2); assert.ok(!child.stderr.includes('SECRET_BAD_JSON')); assert.equal(fs.readFileSync(input,'utf8'),'{SECRET_BAD_JSON')
  }
})
