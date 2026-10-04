const {
  LEGACY_DEFAULT_APP_KEY,
  hasConfiguredAppKey,
  isEncryptedSettingSecret,
  encryptSettingSecretWithKey,
  decryptSettingSecretWithKey,
} = require('./settings-crypto')

const SETTING_SECRET_PATHS = [
  ['settings', 'gps_api_key'],
  ['settings', 'gps_username'],
  ['settings', 'gps_password'],
  ['settings', 'smtp_password_encrypted'],
  ['settings', 'smtpPasswordEncrypted'],
  ['settings', 'imap_password_encrypted'],
  ['settings', 'imapPasswordEncrypted'],
  ['settings', 'oblio_client_secret_encrypted'],
  ['settings', 'ai_api_key_encrypted'],
  ['settings', 'whatsapp_business', 'verify_token'],
  ['settings', 'whatsapp_business', 'app_secret'],
  ['settings', 'whatsapp_business', 'access_token'],
  ['anaf', 'spv', 'client_secret_enc'],
  ['anaf', 'spv', 'access_token_enc'],
  ['anaf', 'spv', 'refresh_token_enc'],
]

function getPath(object, path) {
  return path.reduce((value, key) => value && typeof value === 'object' ? value[key] : undefined, object)
}

function setPath(object, path, value) {
  let target = object
  for (const key of path.slice(0, -1)) target = target[key]
  target[path[path.length - 1]] = value
}

function displayPath(path) {
  return path.join('.')
}

function cloneDb(db) {
  return JSON.parse(JSON.stringify(db || {}))
}

function validateNewAppKey(value) {
  if (!hasConfiguredAppKey(value) || String(value).trim().length < 32) {
    throw new Error('Noua APP_KEY trebuie să fie unică și să aibă minimum 32 de caractere.')
  }
}

function planAppKeyRotation(db, { oldKey = LEGACY_DEFAULT_APP_KEY, newKey } = {}) {
  validateNewAppKey(newKey)
  if (String(oldKey) === String(newKey)) throw new Error('Cheia veche și cheia nouă nu pot fi identice.')

  const nextDb = cloneDb(db)
  const rotated = []
  const skipped = []
  const candidates = SETTING_SECRET_PATHS.map(path => ({ path, value: getPath(nextDb, path) }))
  for (const user of Array.isArray(nextDb.users) ? nextDb.users : []) {
    candidates.push({ path: ['users', String(user.id || 'fără-id'), 'twoFactorSecretEncrypted'], value: user.twoFactorSecretEncrypted, user })
  }

  for (const candidate of candidates) {
    const value = candidate.value
    if (!value) continue
    const label = displayPath(candidate.path)
    if (!isEncryptedSettingSecret(value)) {
      skipped.push({ path: label, reason: 'format_necriptat_sau_necunoscut' })
      continue
    }
    let plaintext
    try {
      plaintext = decryptSettingSecretWithKey(value, oldKey)
    } catch {
      throw new Error(`Secretul ${label} nu poate fi decriptat cu cheia veche indicată. Nu s-a aplicat nicio migrare.`)
    }
    const encrypted = encryptSettingSecretWithKey(plaintext, newKey)
    if (candidate.user) candidate.user.twoFactorSecretEncrypted = encrypted
    else setPath(nextDb, candidate.path, encrypted)
    rotated.push(label)
  }

  return { nextDb, rotated, skipped }
}

module.exports = {
  SETTING_SECRET_PATHS,
  planAppKeyRotation,
  validateNewAppKey,
}
