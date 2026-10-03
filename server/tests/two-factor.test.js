const test = require('node:test')
const assert = require('node:assert/strict')
const {
  totpCode,
  verifyTotp,
  createRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
} = require('../core/two-factor')

test('TOTP respectă vectorul RFC 6238 pentru SHA-1', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
  assert.equal(totpCode(secret, 1, 8), '94287082')
  assert.equal(verifyTotp(secret, '94287082', { now: 59_000, digits: 8, window: 0 }), true)
  assert.equal(verifyTotp(secret, '94287081', { now: 59_000, digits: 8, window: 0 }), false)
})

test('codurile de recuperare se verifică normalizat fără stocarea valorii clare', () => {
  const [code] = createRecoveryCodes(1)
  const stored = hashRecoveryCode(code)
  assert.match(stored, /^scrypt:/)
  assert.equal(stored.includes(code), false)
  assert.equal(verifyRecoveryCode(stored, code.toLowerCase().replace('-', '')), true)
  assert.equal(verifyRecoveryCode(stored, 'AAAAA-BBBBB'), false)
})
