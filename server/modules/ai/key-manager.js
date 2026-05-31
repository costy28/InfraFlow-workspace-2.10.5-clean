const crypto = require('crypto')

function encryptionKey() {
  const source = Buffer.from(
    process.env.APP_KEY || 'infraflow-default-key-32chars!!',
    'utf8'
  )
  return Buffer.concat([source, Buffer.alloc(32)]).slice(0, 32)
}

function encryptApiKey(apiKey) {
  // AES-256-CBC cu APP_KEY din .env
  const key = encryptionKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([
    cipher.update(apiKey, 'utf8'),
    cipher.final()
  ])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

function decryptApiKey(encryptedKey) {
  const [ivHex, encHex] = encryptedKey.split(':')
  const key = encryptionKey()
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final()
  ]).toString('utf8')
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
