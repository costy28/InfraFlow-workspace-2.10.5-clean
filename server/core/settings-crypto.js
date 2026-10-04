const crypto = require('crypto')

let _warnedKey = false
let _warnedLegacyFallback = false
const LEGACY_DEFAULT_APP_KEY = 'infraflow-default-key-32chars!!'

function hasConfiguredAppKey(appKey = process.env.APP_KEY) {
  return Boolean(appKey && String(appKey).trim() && String(appKey) !== LEGACY_DEFAULT_APP_KEY)
}

function isEncryptedSettingSecret(value) {
  return /^[a-f0-9]{32}:[a-f0-9]+$/i.test(String(value || ''))
}

function settingSecretKey(appKey = process.env.APP_KEY) {
  if (!appKey && !_warnedKey) {
    console.warn('[SECURITY] APP_KEY env var lipsă — se folosește cheia implicită. Setează APP_KEY în producție!')
    _warnedKey = true
  }
  const raw = Buffer.from(appKey || LEGACY_DEFAULT_APP_KEY, 'utf8')
  // Padding la exact 32 bytes — AES-256-CBC necesită cheie de 32 bytes
  return Buffer.concat([raw, Buffer.alloc(32)]).subarray(0, 32)
}

function encryptSettingSecretWithKey(value, appKey) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', settingSecretKey(appKey), iv)
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

function decryptSettingSecretWithKey(value, appKey) {
  if (!value || !String(value).includes(':')) return String(value || '')
  const [ivHex, encryptedHex] = String(value).split(':')
  const decipher = crypto.createDecipheriv('aes-256-cbc', settingSecretKey(appKey), Buffer.from(ivHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8')
}

function encryptSettingSecret(value) {
  return encryptSettingSecretWithKey(value, process.env.APP_KEY)
}

function decryptSettingSecret(value) {
  try {
    return decryptSettingSecretWithKey(value, process.env.APP_KEY)
  } catch (error) {
    if (!hasConfiguredAppKey() || !isEncryptedSettingSecret(value)) throw error
    try {
      const decrypted = decryptSettingSecretWithKey(value, LEGACY_DEFAULT_APP_KEY)
      if (!_warnedLegacyFallback) {
        console.warn('[SECURITY] Au fost găsite secrete criptate cu cheia veche implicită. Rulează migrarea controlată APP_KEY.')
        _warnedLegacyFallback = true
      }
      return decrypted
    } catch {
      throw error
    }
  }
}

module.exports = {
  LEGACY_DEFAULT_APP_KEY,
  hasConfiguredAppKey,
  isEncryptedSettingSecret,
  settingSecretKey,
  encryptSettingSecretWithKey,
  decryptSettingSecretWithKey,
  encryptSettingSecret,
  decryptSettingSecret,
}
