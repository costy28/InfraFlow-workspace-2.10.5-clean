const { encryptSettingSecret, decryptSettingSecret } = require('../../core/settings-crypto')

function encryptApiKey(apiKey) {
  return encryptSettingSecret(apiKey)
}

function decryptApiKey(encryptedKey) {
  return decryptSettingSecret(encryptedKey)
}

function isAiEnabled(db) {
  // db = obiectul settings din readDb()
  const settings = db?.settings || {}
  return settings.ai_enabled === 1 &&
         !!settings.ai_api_key_encrypted
}

function getApiKey(db) {
  if (!isAiEnabled(db)) return null
  try {
    return decryptApiKey(db.settings.ai_api_key_encrypted)
  } catch {
    return null
  }
}

module.exports = { encryptApiKey, decryptApiKey,
                   isAiEnabled, getApiKey }
