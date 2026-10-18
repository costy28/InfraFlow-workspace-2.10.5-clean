const test = require('node:test')
const assert = require('node:assert/strict')
const sql = require('mssql')

// Contract al driverului implicit instalat, fără conexiuni sau credențiale reale.
// Nu confundăm Trusted Connection cu NTLM explicit (domain/user/password).
test('driverul implicit nu interpretează Trusted Connection ca autentificare Windows integrată', () => {
  for (const value of ['True', 'SSPI']) {
    const parsed = sql.ConnectionPool.parseConnectionString(`Server=localhost;Database=TEST;Integrated Security=${value};TrustServerCertificate=True`)
    assert.equal(Boolean(parsed.user), false)
    assert.equal(Boolean(parsed.authentication), false)
    assert.equal(Boolean(parsed.options?.trustedConnection), false)
  }
})

test('configurația SQL-login este recunoscută de parser, fără a declara conexiunea validată', () => {
  const parsed = sql.ConnectionPool.parseConnectionString('Server=localhost;Database=TEST;User Id=synthetic_user;Password=synthetic_password;Encrypt=true')
  assert.equal(parsed.user, 'synthetic_user')
  assert.equal(parsed.password, 'synthetic_password')
  assert.equal(parsed.options.encrypt, true)
})
