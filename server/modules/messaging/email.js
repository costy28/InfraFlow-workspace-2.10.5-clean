const crypto = require('crypto')
const nodemailer = require('nodemailer')
const { readDb } = require('../../core/db')

function settingSecretKey() {
  return Buffer.from(process.env.APP_KEY || 'infraflow-default-key-32chars!!', 'utf8').subarray(0, 32)
}

function decryptSettingSecret(value) {
  if (!value || !String(value).includes(':')) return String(value || '')
  const [ivHex, encryptedHex] = String(value).split(':')
  const decipher = crypto.createDecipheriv('aes-256-cbc', settingSecretKey(), Buffer.from(ivHex, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final()
  ]).toString('utf8')
}

function getEmailSettings(db = readDb()) {
  const settings = db?.settings || {}
  return {
    smtp_host: settings.smtp_host || settings.smtpHost || '',
    smtp_port: Number(settings.smtp_port || settings.smtpPort || 587),
    smtp_user: settings.smtp_user || settings.smtpUser || '',
    smtp_password_encrypted: settings.smtp_password_encrypted || settings.smtpPasswordEncrypted || '',
    smtp_name: settings.smtp_name || settings.smtpName || settings.companyName || 'InfraFlow'
  }
}

async function sendEmail({ to, cc, bcc, subject, body, attachments }, dbInput) {
  const settings = getEmailSettings(dbInput)
  if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_password_encrypted) {
    throw new Error('Configurarea SMTP este incompleta.')
  }
  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port: settings.smtp_port,
    secure: settings.smtp_port === 465,
    auth: {
      user: settings.smtp_user,
      pass: decryptSettingSecret(settings.smtp_password_encrypted)
    }
  })
  await transporter.sendMail({
    from: `"${settings.smtp_name}" <${settings.smtp_user}>`,
    to,
    cc,
    bcc,
    subject,
    html: body,
    attachments
  })
}

module.exports = { sendEmail, getEmailSettings }
