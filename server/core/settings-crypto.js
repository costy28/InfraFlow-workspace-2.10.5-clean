const crypto = require('crypto')

let _warnedKey = false
function settingSecretKey() {
  if (!process.env.APP_KEY && !_warnedKey) {
    console.warn('[SECURITY] APP_KEY env var lipsă — se folosește cheia implicită. Setează APP_KEY în producție!')
    _warnedKey = true
  }
  const raw = Buffer.from(process.env.APP_KEY || 'infraflow-default-key-32chars!!', 'utf8')
  // Padding la exact 32 bytes — AES-256-CBC necesită cheie de 32 bytes
  return Buffer.concat([raw, Buffer.alloc(32)]).subarray(0, 32)
}

function encryptSettingSecret(value) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', settingSecretKey(), iv)
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

function decryptSettingSecret(value) {
  if (!value || !String(value).includes(':')) return String(value || '')
  const [ivHex, encryptedHex] = String(value).split(':')
  const decipher = crypto.createDecipheriv('aes-256-cbc', settingSecretKey(), Buffer.from(ivHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8')
}

module.exports = {
  encryptSettingSecret,
  decryptSettingSecret,
}
