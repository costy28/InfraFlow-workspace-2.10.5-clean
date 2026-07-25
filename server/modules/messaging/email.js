const nodemailer = require('nodemailer')
const { readDb } = require('../../core/db')
const { decryptSettingSecret } = require('../../core/settings-crypto')

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
  let smtpPassword = ''
  try {
    smtpPassword = decryptSettingSecret(settings.smtp_password_encrypted)
  } catch {
    throw new Error('Parola SMTP salvata nu poate fi citita. Reintrodu parola in Setari > Integrari > Email notificari si salveaza configurarea.')
  }
  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port: settings.smtp_port,
    secure: settings.smtp_port === 465,
    auth: {
      user: settings.smtp_user,
      pass: smtpPassword
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
