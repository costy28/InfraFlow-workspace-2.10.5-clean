const test = require('node:test')
const assert = require('node:assert/strict')
const {
  encryptSettingSecret,
  decryptSettingSecret,
  encryptSettingSecretWithKey,
  decryptSettingSecretWithKey,
} = require('../core/settings-crypto')
const { encryptApiKey, decryptApiKey } = require('../modules/ai/key-manager')
const { planAppKeyRotation } = require('../core/app-key-rotation')

test('secretele pot fi recriptate controlat fără a expune valoarea', () => {
  const legacyKey = 'legacy-app-key-pentru-test-cu-minim-32-caractere'
  const newKey = 'new-app-key-pentru-test-cu-minim-32-caractereeee'
  const secret = 'secret-de-test-care-nu-se-afiseaza'
  const legacyCiphertext = encryptSettingSecretWithKey(secret, legacyKey)

  assert.equal(decryptSettingSecretWithKey(legacyCiphertext, legacyKey), secret)
  assert.throws(() => decryptSettingSecretWithKey(legacyCiphertext, newKey))

  const rotatedCiphertext = encryptSettingSecretWithKey(
    decryptSettingSecretWithKey(legacyCiphertext, legacyKey),
    newKey,
  )
  assert.equal(decryptSettingSecretWithKey(rotatedCiphertext, newKey), secret)
  assert.notEqual(rotatedCiphertext, legacyCiphertext)
})

test('AI și setările folosesc același format compatibil de criptare', () => {
  const previousAppKey = process.env.APP_KEY
  process.env.APP_KEY = 'app-key-unificat-pentru-test-cu-minim-32-caractere'
  try {
    const apiCiphertext = encryptApiKey('ai-secret-test')
    const settingCiphertext = encryptSettingSecret('setting-secret-test')

    assert.equal(decryptSettingSecret(apiCiphertext), 'ai-secret-test')
    assert.equal(decryptApiKey(settingCiphertext), 'setting-secret-test')
  } finally {
    if (previousAppKey === undefined) delete process.env.APP_KEY
    else process.env.APP_KEY = previousAppKey
  }
})

test('migrarea atinge numai câmpurile secrete cunoscute și lasă datele necriptate intacte', () => {
  const oldKey = 'legacy-app-key-pentru-rotire-cu-minim-32-caractere'
  const newKey = 'new-app-key-pentru-rotire-cu-minim-32-caractereeee'
  const db = {
    settings: {
      smtp_password_encrypted: encryptSettingSecretWithKey('smtp-secret', oldKey),
      whatsapp_business: { access_token: encryptSettingSecretWithKey('wa-secret', oldKey) },
      company_name: 'Firma de test',
    },
    anaf: { spv: { refresh_token_enc: encryptSettingSecretWithKey('refresh-secret', oldKey) } },
    users: [{ id: 'u1', twoFactorSecretEncrypted: encryptSettingSecretWithKey('totp-secret', oldKey) }],
  }

  const plan = planAppKeyRotation(db, { oldKey, newKey })
  assert.equal(plan.rotated.length, 4)
  assert.equal(plan.nextDb.settings.company_name, 'Firma de test')
  assert.equal(decryptSettingSecretWithKey(plan.nextDb.settings.smtp_password_encrypted, newKey), 'smtp-secret')
  assert.equal(decryptSettingSecretWithKey(plan.nextDb.users[0].twoFactorSecretEncrypted, newKey), 'totp-secret')
  assert.equal(decryptSettingSecretWithKey(db.settings.smtp_password_encrypted, oldKey), 'smtp-secret')
})
