const crypto = require('crypto')

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buffer) {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return output
}

function base32Decode(value) {
  const input = String(value || '').toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let current = 0
  const bytes = []
  for (const character of input) {
    const index = BASE32_ALPHABET.indexOf(character)
    if (index < 0) continue
    current = (current << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function createTotpSecret() {
  return base32Encode(crypto.randomBytes(20))
}

function normalizeTotpCode(code) {
  return String(code || '').replace(/[\s-]/g, '')
}

function totpCode(secret, counter, digits = 6) {
  const key = base32Decode(secret)
  if (!key.length) return ''
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter))
  const digest = crypto.createHmac('sha1', key).update(counterBuffer).digest()
  const offset = digest[digest.length - 1] & 15
  const binary = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3]
  return String(binary % (10 ** digits)).padStart(digits, '0')
}

function verifyTotp(secret, code, options = {}) {
  const digits = options.digits || 6
  const normalized = normalizeTotpCode(code)
  if (!new RegExp(`^\\d{${digits}}$`).test(normalized)) return false
  const stepSeconds = options.stepSeconds || 30
  const counter = Math.floor((options.now || Date.now()) / 1000 / stepSeconds)
  const window = Number.isInteger(options.window) ? options.window : 1
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = totpCode(secret, counter + offset, digits)
    if (expected && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) return true
  }
  return false
}

function normalizeRecoveryCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function createRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const value = crypto.randomBytes(5).toString('hex').toUpperCase()
    return `${value.slice(0, 5)}-${value.slice(5)}`
  })
}

function hashRecoveryCode(code) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(normalizeRecoveryCode(code), salt, 32).toString('hex')
  return `scrypt:${salt}:${hash}`
}

function verifyRecoveryCode(storedHash, code) {
  const [algorithm, salt, hash] = String(storedHash || '').split(':')
  if (algorithm !== 'scrypt' || !salt || !hash || !normalizeRecoveryCode(code)) return false
  const candidate = crypto.scryptSync(normalizeRecoveryCode(code), salt, 32).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'))
}

function otpAuthUri({ secret, username, issuer = 'InfraFlow' }) {
  const label = `${issuer}:${username}`
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}

module.exports = {
  createTotpSecret,
  verifyTotp,
  totpCode,
  createRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
  otpAuthUri,
}
